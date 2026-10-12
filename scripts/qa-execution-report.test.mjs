import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineExecutionEvidence } from './qa/execution-report.mjs';

const sha = 'a'.repeat(40);
const mapping = { caseId: 'GNSS01', scope: 'closed input', sourcePaths: ['input.ts'],
  tests: [{ path: 'input.test.ts', name: 'valid', level: 'L1', semantics: 'closed input' }] };
const catalog = { sourceCommit: sha, dirty: false, cases: [{ ...mapping, remainingGate: 'Full oracle and field gate remain' }] };
const families = [{ name: 'unit', level: 'L1', verdict: 'GREEN_FOR_UNIT_SCOPE', mappings: [mapping] }];
const report = () => ({ sourceCommit: sha, dirty: false, level: 'L1', physicalMotionExecuted: false, realProvidersExecuted: false,
  startedAt: '2026-10-12T00:00:00Z', finishedAt: '2026-10-12T00:00:01Z', runnerExitCode: 0,
  verdict: 'GREEN_FOR_UNIT_SCOPE', counts: { discovered: 1, passed: 1, failed: 0, blocked: 0 },
  assertions: [{ path: 'input.test.ts', name: 'valid', status: 'PASS' }],
  cases: [{ caseId: 'GNSS01', level: 'L1', scope: 'closed input', status: 'PARTIAL' }] });

test('current exact observations stay partial and never promote software or vehicle acceptance', () => {
  const merged = combineExecutionEvidence(catalog, { unit: report() }, families);
  assert.equal(merged.requiredHarnessExecution, 'PASS'); assert.equal(merged.cases[0].latestExecutionStatus, 'PARTIAL');
  assert.equal(merged.completeFeatureCases, 0); assert.equal(merged.softwareRelease, 'NOT_RELEASE_READY');
  assert.equal(merged.vehicleFieldDeployment, 'NOT_VERIFIED');
});

test('stale dirty missing invented and inconsistent evidence cannot become current passing scope', () => {
  const mutations = [item => { item.sourceCommit = 'b'.repeat(40); }, item => { item.dirty = true; },
    item => { item.assertions[0].name = 'invented'; }, item => { item.cases[0].status = 'PASS'; },
    item => { item.counts.passed = 2; }, item => { item.assertions[0].status = 'FAIL'; },
    item => { item.cases[0].scope = 'invented scope'; }, item => { item.realProvidersExecuted = true; },
    item => { item.cases.push({ ...item.cases[0] }); }];
  for (const mutate of mutations) {
    const value = report(); mutate(value);
    const merged = combineExecutionEvidence(catalog, { unit: value }, families);
    assert.equal(merged.requiredHarnessExecution, 'BLOCKED'); assert.equal(merged.cases[0].latestExecutionStatus, 'NOT_RUN');
  }
  assert.equal(combineExecutionEvidence(catalog, {}, families).requiredHarnessExecution, 'BLOCKED');
});

test('a scoped browser run retains real partial evidence but cannot satisfy the complete browser family', () => {
  const browserMapping = { ...mapping, tests: [{ path: 'e2e/browser.spec.ts', name: 'provider quota', level: 'L3', semantics: 'closed input' }] };
  const browserCatalog = { ...catalog, cases: [{ ...browserMapping, remainingGate: 'full oracle' }] };
  const value = { ...report(), level: 'L3', scope: 'providers', verdict: 'GREEN_FOR_EXECUTED_BROWSER_SCOPE', exitCode: 0,
    counts: { discovered: 2, passed: 2, failed: 0, skipped: 0, flaky: 0 },
    tests: ['mobile', 'desktop'].map(project => ({ path: 'browser.spec.ts', name: 'provider quota', project,
      status: 'expected', results: [{ status: 'passed', retry: 0 }] })),
    cases: [{ caseId: 'GNSS01', level: 'L3', scope: 'closed input', status: 'PARTIAL' }] };
  const browserFamilies = [{ name: 'browser', level: 'L3', verdict: 'GREEN_FOR_EXECUTED_BROWSER_SCOPE', mappings: [browserMapping] }];
  const scoped = combineExecutionEvidence(browserCatalog, { browser: value }, browserFamilies);
  assert.equal(scoped.requiredHarnessExecution, 'BLOCKED'); assert.equal(scoped.cases[0].latestExecutionStatus, 'PARTIAL');
  value.scope = 'all';
  assert.equal(combineExecutionEvidence(browserCatalog, { browser: value }, browserFamilies).requiredHarnessExecution, 'PASS');
  value.tests[1].project = 'mobile';
  assert.equal(combineExecutionEvidence(browserCatalog, { browser: value }, browserFamilies).cases[0].latestExecutionStatus, 'NOT_RUN');
});
