import test from 'node:test';
import assert from 'node:assert/strict';
import { removeGeneratedDemoConfig } from './qa/emulator-environment.mjs';
import { safetyPreflight } from './qa/safety-preflight.mjs';

test('only the CLI-generated demo config can be removed before SDK import', () => {
  const config = { projectId: 'demo-eki-qa', storageBucket: 'demo-eki-qa.appspot.com', databaseURL: 'https://demo-eki-qa.firebaseio.com' };
  const env = { GCLOUD_PROJECT: 'demo-eki-qa', FIREBASE_CONFIG: JSON.stringify(config) };
  assert.throws(() => safetyPreflight(env), /FIREBASE_CONFIG/);
  assert.equal(removeGeneratedDemoConfig(env), true);
  assert.equal(env.FIREBASE_CONFIG, undefined);
  assert.equal(safetyPreflight(env).configAccepted, true);
  for (const candidate of [null, {}, { ...config, projectId: 'production' },
    { ...config, databaseURL: 'https://production.firebaseio.com' }, { ...config, private_key: 'synthetic' }]) {
    assert.throws(() => removeGeneratedDemoConfig({ GCLOUD_PROJECT: 'demo-eki-qa', FIREBASE_CONFIG: JSON.stringify(candidate) }));
  }
  assert.throws(() => removeGeneratedDemoConfig({ GCLOUD_PROJECT: 'wrong', FIREBASE_CONFIG: JSON.stringify(config) }));
  assert.throws(() => removeGeneratedDemoConfig({ GCLOUD_PROJECT: 'demo-eki-qa', FIREBASE_CONFIG: 'invalid' }));
});
