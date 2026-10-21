import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repositoryRoot } from './qa/acceptance-catalog.mjs';
const { load } = createRequire(resolve(repositoryRoot, 'backend/package.json'))('js-yaml');

test('aggregated report artifacts share the fixed qa root instead of nesting reports alongside debug logs', () => {
  const workflow = load(readFileSync(resolve(repositoryRoot, '.github/workflows/ci.yml'), 'utf8'));
  const uploads = Object.values(workflow.jobs).flatMap(job => job.steps).filter(step => step.uses?.startsWith('actions/upload-artifact@'));
  for (const [name, path] of [['emulator-acceptance-evidence', 'artifacts/qa/emulator-*'],
    ['browser-acceptance-evidence', 'artifacts/qa/browser-*'], ['api-authorization-evidence', 'artifacts/qa/api-*'],
    ['native-firmware-evidence', 'artifacts/qa/native-*']]) {
    assert.equal(uploads.find(step => step.with.name === name)?.with.path, path,
      `${name} must extract its report directly into the shared QA directory`);
  }
});
