import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeVitest } from './qa/run-gnss.mjs';
const link = { path: 'backend/a.test.ts', name: 'suite > assertion' };
const mapping = [{ caseId: 'GNSS04', scope: 'numeric boundaries only', tests: [link] }];
const report = status => ({ numTotalTests: 1, numPassedTests: status === 'passed' ? 1 : 0,
  numFailedTests: status === 'failed' ? 1 : 0, testResults: [{ name: '/fixture/backend/a.test.ts',
    assertionResults: [{ title: 'assertion', ancestorTitles: ['suite'], status }] }] });
test('passing unit execution yields partial case evidence, never complete acceptance', () => {
  assert.equal(summarizeVitest(report('passed'), '/fixture', mapping).cases[0].status, 'PARTIAL');
  assert.equal(summarizeVitest(report('failed'), '/fixture', mapping).cases[0].status, 'FAIL');
  assert.equal(summarizeVitest(report('pending'), '/fixture', mapping).cases[0].status, 'BLOCKED');
});
test('missing exact test identity stays blocked and inconsistent runner counts fail', () => {
  assert.equal(summarizeVitest(report('passed'), '/fixture', [{ ...mapping[0], tests: [{ ...link, name: 'other' }] }]).cases[0].status, 'BLOCKED');
  assert.throws(() => summarizeVitest({ ...report('passed'), numTotalTests: 2 }, '/fixture'), /Inconsistent/);
  assert.throws(() => summarizeVitest({ numTotalTests: 0, testResults: [] }, '/fixture'), /Inconsistent/);
});
