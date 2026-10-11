import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBrowserCase } from './qa/browser-evidence.mjs';

test('browser evidence rejects wrong files, duplicate viewports, retries and incomplete observations', () => {
  const mapping = { tests: [{ name: 'board', path: 'e2e/emulator-acceptance.spec.ts' }] };
  const observation = project => ({ name: 'board', path: 'emulator-acceptance.spec.ts', project,
    status: 'expected', results: [{ status: 'passed', retry: 0 }] });
  const pair = [observation('mobile'), observation('desktop')];
  assert.equal(classifyBrowserCase(mapping, pair), 'PARTIAL');
  assert.equal(classifyBrowserCase(mapping, [pair[0], pair[0]]), 'BLOCKED');
  assert.equal(classifyBrowserCase(mapping, [pair[0]]), 'BLOCKED');
  assert.equal(classifyBrowserCase(mapping, pair.map(test => ({ ...test, path: 'another.spec.ts' }))), 'BLOCKED');
  assert.equal(classifyBrowserCase(mapping, pair.map(test => ({ ...test, results: [{ status: 'passed', retry: 1 }] }))), 'BLOCKED');
  assert.equal(classifyBrowserCase(mapping, [...pair, pair[0]]), 'BLOCKED');
  assert.equal(classifyBrowserCase(mapping, [{ ...pair[0], status: 'unexpected' }, pair[1]]), 'FAIL');
});
