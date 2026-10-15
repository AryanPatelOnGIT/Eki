import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = path.join(root, 'docs/testing/skills/eki-antigravity-webapp-audit');
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const headers = readFileSync(path.join(pkg, 'assets/coverage-template.csv'), 'utf8').trim().split(',');
const csv = values => values.map(value => '"' + String(value ?? '').replaceAll('"', '""') + '"').join(',');
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'eki-audit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function runGate(dir, rows, evidence = {}, inventory) {
  const ledger = path.join(dir, 'coverage.csv');
  writeFileSync(ledger, headers.join(',') + '\n' + rows.map(row => Array.isArray(row) ? csv(row) : csv(headers.map(key => row[key]))).join('\n') + '\n');
  for (const [name, contents] of Object.entries(evidence)) writeFileSync(path.join(dir, name), contents);
  const args = [path.join(pkg, 'scripts/coverage-gate.py'), '--coverage', ledger];
  if (inventory) {
    writeFileSync(path.join(dir, 'inventory.json'), JSON.stringify({ candidates: inventory }));
    args.push('--strict', '--inventory', path.join(dir, 'inventory.json'));
  }
  const result = spawnSync(python, args, { encoding: 'utf8' });
  assert.ifError(result.error);
  const summaryFile = path.join(dir, 'coverage-summary.json');
  return { ...result, summary: (() => { try { return JSON.parse(readFileSync(summaryFile, 'utf8')); } catch { return null; } })() };
}
const row = {
  control_id: 'close-dialog', source_id: 'src-one', page: '/admin', component: 'Dialog',
  source_path: 'frontend/src/Dialog.tsx', source_line: '1', role: 'admin', viewport: '390x844',
  environment: 'disposable', evidence_tier: 'EMULATOR_BROWSER', entry_state: 'open',
  control_name: 'Close', locator: 'button[name="Close"]', precondition: 'Dialog open',
  action: 'Click Close', expected: 'Dialog closes', observed: 'Dialog closes', status: 'PASS',
  executed: 'true', oracle_passed: 'true', evidence_path: 'action.json', bug_id: '', blocker_reason: '',
};
const record = {
  sha: 'a'.repeat(40), role: row.role, viewport: row.viewport, page: row.page, control_id: row.control_id,
  precondition: row.precondition, action: row.action, expected: row.expected, observed: row.observed,
  provider_tier: row.evidence_tier, http_status: null, screenshot_path: '', trace_path: '',
  timestamp: '2026-10-15T09:00:00Z',
};
const candidate = { id: 'src-one', source_path: row.source_path, source_line: 1 };

test('census gives same-line controls distinct, repeatable identities', t => {
  const dir = fixture(t);
  mkdirSync(path.join(dir, 'frontend/src'), { recursive: true });
  writeFileSync(path.join(dir, 'frontend/src/Buttons.tsx'), 'export const Buttons = () => <><button onClick={() => {}}>One</button><button onClick={() => {}}>Two</button></>;');
  const args = [path.join(pkg, 'scripts/control-census.mjs'), '--repo', dir, '--out', path.join(dir, 'out')];
  const run = () => {
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(readFileSync(path.join(dir, 'out/control-inventory.json'), 'utf8')).candidates;
  };
  const controls = run();
  assert.equal(controls.length, 2);
  assert.equal(new Set(controls.map(c => c.id)).size, 2);
  assert.deepEqual(run(), controls);
});

test('short CSV row returns malformed exit 2 with a summary', t => {
  const result = runGate(fixture(t), [headers.slice(0, 4).map(key => row[key])]);
  assert.equal(result.status, 2, result.stderr);
  assert.ok(result.summary?.errors.some(error => /incomplete|malformed/i.test(error)));
  assert.doesNotMatch(result.stderr, /Traceback/);
});

test('strict reconciliation cannot cover two same-line candidates with one row', t => {
  const result = runGate(fixture(t), [row], { 'action.json': JSON.stringify(record) }, [candidate, { ...candidate, id: 'src-two' }]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.summary.uncovered_source_count, 1);
  assert.equal(result.summary.uncovered_source_candidates[0].id, 'src-two');
});

test('valid action JSON and exact candidate identity pass', t => {
  const result = runGate(fixture(t), [row], { 'action.json': JSON.stringify(record) }, [candidate]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.summary.errors, []);
});

for (const [name, contents] of [
  ['empty file', ''], ['invalid JSON', 'not JSON'], ['JSON array', '[]'], ['missing fields', '{}'],
  ['wrong control', JSON.stringify({ ...record, control_id: 'another-control' })],
  ['wrong action', JSON.stringify({ ...record, action: 'Click Save' })],
  ['wrong result', JSON.stringify({ ...record, observed: 'Dialog stays open' })],
  ['wrong provider tier', JSON.stringify({ ...record, provider_tier: 'LIVE_CLOUD' })],
  ['blank expected', JSON.stringify({ ...record, expected: ' ' })],
  ['invalid timestamp', JSON.stringify({ ...record, timestamp: 'yesterday' })],
  ['timestamp without timezone', JSON.stringify({ ...record, timestamp: '2026-10-15T09:00:00' })],
  ['abbreviated commit', JSON.stringify({ ...record, sha: 'abcdef0' })],
  ['invalid HTTP status', JSON.stringify({ ...record, http_status: true })],
  ['missing trace file', JSON.stringify({ ...record, trace_path: 'missing.zip' })],
]) {
  test(`PASS rejects ${name} evidence with exit 2`, t => {
    const result = runGate(fixture(t), [row], { 'action.json': contents }, [candidate]);
    assert.equal(result.status, 2, result.stderr);
    assert.ok(result.summary.errors.length);
  });
}

test('strict reconciliation rejects a source ID with another source location', t => {
  const result = runGate(fixture(t), [{ ...row, source_line: '2' }], { 'action.json': JSON.stringify(record) }, [candidate]);
  assert.equal(result.status, 2, result.stderr);
});

test('missing evidence file still fails', t => {
  const result = runGate(fixture(t), [row], {}, [candidate]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /does not exist/);
});

test('strict inventory rejects duplicate candidate identities', t => {
  const result = runGate(fixture(t), [row], { 'action.json': JSON.stringify(record) }, [candidate, candidate]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /duplicate candidate/);
});

test('FAIL and blocked rows remain incomplete, with no runtime passes', t => {
  for (const status of ['FAIL', 'BLOCKED', 'NOT_RUN', 'INCONCLUSIVE']) {
    const result = runGate(fixture(t), [{ ...row, status, executed: status === 'FAIL' ? 'true' : 'false', oracle_passed: 'false', blocker_reason: 'Requires separate live-provider campaign' }], { 'action.json': '{}' }, [candidate]);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.summary.runtime_browser_or_physical_pass_rows, 0);
  }
});
