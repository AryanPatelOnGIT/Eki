import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectFirmware } from './qa/source-census.mjs';

test('firmware census excludes comment and string lookalikes and retains literal identities with source lines', () => {
  const code = '// RUN_TEST(fake_comment);\nconst char* label = "RUN_TEST(fake_string);";\n'
    + '/* RUN_TEST(fake_block); */\nRUN_TEST(real_policy);\nRUN_TEST(computed[index]);\n';
  assert.deepEqual(inspectFirmware('hardware/test/test_main.cpp', code), [{ path: 'hardware/test/test_main.cpp',
    line: 4, name: 'real_policy', declaration: 'RUN_TEST', framework: 'Unity native candidate', executionStatus: 'NOT_RUN' }]);
});
