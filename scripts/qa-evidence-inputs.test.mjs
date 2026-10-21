import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifiedEmulatorTargets, observedAuthorizationStatus } from './qa/evidence-inputs.mjs';

const expected = { firestore: { host: '127.0.0.1', port: 8085 }, database: { host: '127.0.0.1', port: 9005 }, auth: { host: '127.0.0.1', port: 9095 } };
test('retains only validated fixed emulator topology, never remote extra fields', () => {
  const incoming = structuredClone(expected); incoming.firestore.private = 'network-controlled'; incoming.extra = 'omit-me';
  const result = verifiedEmulatorTargets(incoming);
  assert.deepEqual(result, expected); assert(!JSON.stringify(result).includes('network-controlled'));
  incoming.firestore.host = 'attacker.invalid';
  assert.throws(() => verifiedEmulatorTargets(incoming), /mismatch/);
  assert.throws(() => verifiedEmulatorTargets(null), /mismatch/);
  const wrongPort = structuredClone(expected); wrongPort.auth.port = '9095';
  assert.throws(() => verifiedEmulatorTargets(wrongPort), /mismatch/);
});
test('authorization observations retain only literal denial categories', () => {
  assert.equal(observedAuthorizationStatus(401), 401); assert.equal(observedAuthorizationStatus(403), 403);
  for (const value of [200, 500, '401', 'private-response', null, {}]) assert.equal(observedAuthorizationStatus(value), null);
});
test('browser fixture relies on launcher-installed rules without reading files into HTTP bodies', () => {
  const source = readFileSync(new URL('../e2e/emulator/backend.mjs', import.meta.url), 'utf8');
  assert(!source.includes('readFileSync')); assert(!source.includes(':securityRules'));
  assert(!source.includes('.settings/rules.json'));
  const launcher = readFileSync(new URL('./run-rules-emulator.mjs', import.meta.url), 'utf8');
  assert.match(launcher, /writeEmulatorRuleset\(\)/); assert.match(launcher, /"--config",\s*configPath/);
});
