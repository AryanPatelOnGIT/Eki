import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTestMaps } from './qa/merge-test-maps.mjs';

test('combining evidence levels preserves links while rejecting family duplicates and conflicting semantics', () => {
  const first = { caseId: 'GNSS01', scope: 'unit contract', sourcePaths: ['parser.ts'],
    tests: [{ path: 'parser.test.ts', name: 'valid payload', level: 'L1', semantics: 'closed payload' }] };
  const second = { caseId: 'GNSS01', scope: 'emulator persistence', sourcePaths: ['parser.ts', 'ingest.ts'],
    tests: [{ path: 'ingest.test.ts', name: 'persist', level: 'L2', semantics: 'actual persistence' }] };
  const combined = mergeTestMaps([first], [second], [first]);
  assert.equal(combined.length, 1); assert.equal(combined[0].tests.length, 2);
  assert.deepEqual(combined[0].sourcePaths, ['parser.ts', 'ingest.ts']);
  assert.equal(first.tests.length, 1);
  assert.throws(() => mergeTestMaps([first, first]), /Duplicate case/);
  assert.throws(() => mergeTestMaps([first], [{ ...first, tests: [{ ...first.tests[0], semantics: 'invented' }] }]), /Conflicting/);
});
