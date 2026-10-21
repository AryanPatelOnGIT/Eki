import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import ProgressReporter from '../e2e/emulator/progress-reporter.mts';

test('incremental browser observations remain incomplete after interruption', () => {
  const tempRoot = resolve(tmpdir());
  const owned = mkdtempSync(join(tempRoot, 'eki-progress-'));
  try {
    const reporter = new ProgressReporter();
    reporter.onBegin({ rootDir: join(owned, 'e2e') }, { allTests: () => [{}, {}] });
    reporter.onTestEnd({ title: 'synthetic observation', location: { file: join(owned, 'e2e/emulator-acceptance.spec.ts') },
      parent: { project: () => ({ name: 'mobile' }) } }, { status: 'passed', duration: 12, retry: 0, errors: [] });
    const observed = () => JSON.parse(readFileSync(join(owned, 'artifacts/qa/browser-progress.json'), 'utf8'));
    assert.equal(observed().expectedExecutions, 2); assert.equal(observed().completed, false);
    assert.deepEqual(observed().tests[0], { name: 'synthetic observation', path: 'e2e/emulator-acceptance.spec.ts',
      project: 'mobile', status: 'passed', durationMs: 12, retry: 0, errors: [] });
    reporter.onEnd({ status: 'interrupted' });
    assert.equal(observed().completed, false); assert.equal(observed().status, 'interrupted');
  } finally {
    assert.equal(dirname(resolve(owned)), tempRoot); assert.ok(owned.startsWith(join(tempRoot, 'eki-progress-')));
    rmSync(owned, { recursive: true, force: true });
  }
});
