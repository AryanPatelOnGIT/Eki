import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeNative } from './qa/native-evidence.mjs';

test('native evidence rejects listing-only skipped duplicate omitted and non-native observations', () => {
  const path = 'hardware/test/test_policy/test_main.cpp';
  const declared = [{ path, name: 'one' }, { path, name: 'two' }];
  const mappings = [{ caseId: 'FW02', scope: 'native policy', tests: [{ path, name: 'one', level: 'L1' }] }];
  const raw = { testcase_nums: 2, failure_nums: 0, error_nums: 0, skipped_nums: 0, test_suites: [{
    env_name: 'native', test_name: 'test_policy', timestamp: '2026-10-12T00:00:00', duration: 1, testcase_nums: 2,
    test_cases: ['one', 'two'].map(name => ({ name, status: 'PASSED', duration: 0, source: { file: 'test/test_policy/test_main.cpp' } })),
  }, { env_name: 'esp32dev', test_cases: [] }] };
  const result = summarizeNative(raw, '/repo', declared, mappings);
  assert.equal(result.counts.passed, 2); assert.equal(result.cases[0].status, 'PARTIAL');
  for (const mutate of [value => { value.test_suites[0].timestamp = null; },
    value => { value.test_suites[0].test_cases.pop(); }, value => { value.test_suites[0].test_cases[1].name = 'one'; },
    value => { value.test_suites[1].test_cases.push({ name: 'physical' }); },
    value => { value.test_suites[0].test_cases[0].status = 'SKIPPED'; }, value => { value.testcase_nums = 3; }]) {
    const invalid = structuredClone(raw); mutate(invalid); assert.throws(() => summarizeNative(invalid, '/repo', declared, mappings));
  }
  const skipped = structuredClone(raw); skipped.test_suites[0].test_cases[0].status = 'SKIPPED'; skipped.skipped_nums = 1;
  assert.equal(summarizeNative(skipped, '/repo', declared, mappings).cases[0].status, 'BLOCKED');
  const failed = structuredClone(raw); failed.test_suites[0].test_cases[0].status = 'FAILED'; failed.failure_nums = 1;
  failed.test_suites[0].test_cases.push({ name: 'Native runner exit', status: 'ERRORED', source: null });
  failed.test_suites[0].testcase_nums = 3; failed.testcase_nums = 3; failed.error_nums = 1;
  const red = summarizeNative(failed, '/repo', declared, mappings);
  assert.equal(red.counts.failed, 1); assert.equal(red.diagnostics.length, 1); assert.equal(red.cases[0].status, 'FAIL');
});
