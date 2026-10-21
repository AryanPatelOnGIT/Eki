import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openSync, closeSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repositoryRoot } from './acceptance-catalog.mjs';
import { safetyPreflight } from './safety-preflight.mjs';
import { createRequire } from 'node:module';
import { observedAuthorizationStatus } from './evidence-inputs.mjs';

safetyPreflight(process.env, { mode: 'emulator' });
if (!globalThis.__ekiQaNetworkGuard?.enabled) throw Error('Preloaded transport guard required');
const contract = JSON.parse(readFileSync(resolve(repositoryRoot, 'backend/openapi.json'), 'utf8'));
const operations = Object.entries(contract.paths).flatMap(([path, item]) => Object.entries(item)
  .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
  .map(([method, operation]) => ({ path, method, auth: operation['x-auth-class'] })));
assert(operations.length > 0 && operations.every(item => typeof item.auth === 'string'));
const protectedOperations = operations.filter(item => item.auth !== 'public');
const directory = resolve(repositoryRoot, 'artifacts/qa'); mkdirSync(directory, { recursive: true });
const observations = [];
const get = async path => {
  const response = await fetch(`http://127.0.0.1:3117${path}`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  assert.equal(response.status, 200, 'Owned QA control must answer'); return response.json();
};
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;

async function signIn(uid) {
  const response = await fetch('http://127.0.0.1:9095/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-only', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.invalid`, password: 'SyntheticOnly123!', returnSecureToken: true }),
    signal: AbortSignal.timeout(5000), redirect: 'error',
  });
  assert.equal(response.status, 200, 'Owned demo identity must sign in');
  const { idToken } = await response.json(); assert.equal(typeof idToken, 'string'); return idToken;
}

async function request(path, { method = 'GET', token, device, body } = {}) {
  return fetch(`http://127.0.0.1:3116${path}`, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : device ? { Authorization: `Device ${device}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000), redirect: 'error' });
}

// This process is already fenced by safetyPreflight and the preloaded transport
// guard. Only the same disposable namespace as the owned server is accessible.
let adminResources;
async function withAdmin(work) {
  if (adminResources) return work(adminResources);
  const require = createRequire(resolve(repositoryRoot, 'backend/package.json'));
  const { initializeApp, deleteApp, applicationDefault } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const { getDatabase } = require('firebase-admin/database');
  const credential = applicationDefault();
  credential.getAccessToken = async () => ({ access_token: 'owner', expires_in: 3600 });
  const app = initializeApp({ projectId: 'demo-eki-qa', databaseURL: 'http://127.0.0.1:9005/?ns=demo-eki-qa-default-rtdb', credential });
  const db = getFirestore(app); db.settings({ host: '127.0.0.1:8085', ssl: false });
  adminResources = { db, realtime: getDatabase(app), require, close: () => deleteApp(app) };
  return work(adminResources);
}

async function databaseRead(path, token, expected) {
  // Keep saved ID tokens in memory; never include credential-bearing URLs in
  // evidence or assertion messages.
  const response = await fetch(`http://127.0.0.1:9005/${path}.json?ns=demo-eki-qa-default-rtdb&auth=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(5000), redirect: 'error' });
  assert.equal(response.status, expected, 'RTDB current-role access');
}

async function firestoreRead(path, token, expected) {
  const response = await fetch(`http://127.0.0.1:8085/v1/projects/demo-eki-qa/databases/(default)/documents/${path}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000), redirect: 'error' });
  assert.equal(response.status, expected, 'Firestore current-role access');
}

async function withFreshBackend(label, work) {
  const log = openSync(resolve(directory, `api-backend-${label}.log`), 'w');
  const child = spawn(process.execPath, ['--import', './scripts/qa/network-guard.mjs', 'e2e/emulator/backend.mjs'],
    { cwd: repositoryRoot, stdio: ['ignore', log, log, 'ipc'], env: { ...process.env, PORT: '3116',
      // Authorization sweeps measure request effects, not independent telemetry
      // startup writes. Browser/worker suites keep background processing enabled.
      WORKER_ENABLED: 'false',
      CORS_ORIGIN: 'http://127.0.0.1:3115', NODE_ENV: 'development' } });
  closeSync(log);
  const exit = new Promise(done => child.once('exit', code => done(code)));
  try {
    const deadline = Date.now() + 30_000; let ready = false;
    while (Date.now() < deadline && child.exitCode === null) {
      try { const state = await get('/evidence'); assert.equal(state.fixtureProcessId, child.pid, 'Never reuse another backend'); ready = true; break; }
      catch { await new Promise(done => setTimeout(done, 250)); }
    }
    assert(ready, 'Owned backend startup failed');
    await work();
    const state = await get('/evidence');
    assert.equal(state.transport.deniedConnections, 0); assert.equal(state.providers.deniedRequests, 0);
    assert.equal(state.providers.externalNetworkExecuted, false);
  } finally {
    // Windows terminates on child.kill(SIGTERM) without running Node handlers.
    // Ask the verified owned fixture to enter the real server shutdown path.
    if (child.connected) child.send({ type: 'eki-qa-shutdown', pid: child.pid }, error => { if (error) child.kill('SIGTERM'); });
    else child.kill('SIGTERM');
    const backstop = setTimeout(() => child.kill('SIGKILL'), 12_000);
    const code = await exit; clearTimeout(backstop);
    assert.equal(code, 0, 'Owned backend must drain without forced termination');
  }
}

async function sweep(label, targets, authorization, expectedStatus) {
  const before = canonical(await get('/authorization-snapshot'));
  for (const operation of targets) {
    const path = operation.path.replace(/\{[^}]+\}/g, 'qa_missing');
    const headers = { ...(authorization ? { Authorization: authorization } : {}), 'Content-Type': 'application/json' };
    const response = await fetch(`http://127.0.0.1:3116${path}`, { method: operation.method.toUpperCase(), headers,
      ...(operation.method === 'get' ? {} : { body: '{}' }), signal: AbortSignal.timeout(5000), redirect: 'error' });
    observations.push({ partition: label, method: operation.method.toUpperCase(), path: operation.path,
      expectedStatus, observedStatus: observedAuthorizationStatus(response.status), authClass: operation.auth });
    writeFileSync(resolve(directory, 'api-operation-observations.json'), JSON.stringify(observations, null, 2) + '\n');
    assert.equal(response.status, expectedStatus, `${label}: ${operation.method.toUpperCase()} ${operation.path}`);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    const body = await response.json();
    assert(body && typeof body === 'object' && !Array.isArray(body));
    assert(!('stack' in body) && !('token' in body) && !('boardingCode' in body));
  }
  assert.deepEqual(canonical(await get('/authorization-snapshot')), before, 'Denied requests must preserve selected application records and Auth claims');
  assert.equal((await get('/evidence')).providers.calls.length, 0, 'Denied requests cannot spend a provider call');
}

await test('missing credentials deny every protected HTTP operation without application or provider effects', { timeout: 90_000 },
  () => withFreshBackend('missing', () => sweep('missing', protectedOperations, null, 401)));

await test('malformed bearer credentials deny every protected HTTP operation without application or provider effects', { timeout: 90_000 },
  () => withFreshBackend('malformed', () => sweep('malformed', protectedOperations, 'Bearer synthetic-invalid-token', 401)));

await test('a real emulator passenger token cannot access any admin-only HTTP operation', { timeout: 90_000 },
  () => withFreshBackend('passenger', async () => {
    const response = await fetch('http://127.0.0.1:9095/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic-only',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'qa_passenger@example.invalid', password: 'SyntheticOnly123!', returnSecureToken: true }),
        signal: AbortSignal.timeout(5000), redirect: 'error' });
    assert.equal(response.status, 200); const { idToken } = await response.json(); assert.equal(typeof idToken, 'string');
    await sweep('passenger', operations.filter(item => item.auth === 'admin'), `Bearer ${idToken}`, 403);
  }));

await test('public health responses retain minimal no-store JSON and bounded CORS preflight semantics', { timeout: 90_000 },
  () => withFreshBackend('public', async () => {
    const live = await fetch('http://127.0.0.1:3116/live', { signal: AbortSignal.timeout(5000) });
    assert.equal(live.status, 200); assert.equal(live.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await live.json(), { status: 'alive' });
    const health = await fetch('http://127.0.0.1:3116/health', { signal: AbortSignal.timeout(5000) });
    assert([200, 503].includes(health.status)); assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await health.json(), { status: health.status === 200 ? 'ok' : 'degraded' });
    for (const origin of ['http://127.0.0.1:3115', 'https://disallowed.example.invalid']) {
      const response = await fetch('http://127.0.0.1:3116/api/buses', { method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' }, signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('access-control-allow-origin'), origin.startsWith('http://127.') ? origin : null);
      assert.equal(response.headers.get('access-control-allow-credentials'), null);
    }
  }));

await test('mixed-case GET and HEAD preserve real identity and admin checks without App Check', { timeout: 90_000 },
  () => withFreshBackend('case-head', async () => {
    const admin = await signIn('qa_admin'), passenger = await signIn('qa_passenger');
    for (const path of ['/api/places/search?q=SyntheticOrigin', '/API/PLACES/SEARCH?q=SyntheticOrigin']) {
      for (const method of ['GET', 'HEAD']) {
        const before = (await get('/evidence')).providers.calls.length;
        for (const [token, status] of [[undefined, 401], ['synthetic-invalid-token', 401], [passenger, 403]]) {
          const response = await request(path, { method, token }); assert.equal(response.status, status);
          if (method === 'HEAD') assert.equal(await response.text(), '');
        }
        assert.equal((await get('/evidence')).providers.calls.length, before, 'Denied case/HEAD variants cannot spend a provider call');
        const allowed = await request(path, { method, token: admin }); assert.equal(allowed.status, 200);
        if (method === 'HEAD') assert.equal(await allowed.text(), '');
      }
    }
    assert.equal((await get('/evidence')).providers.calls.length, 1, 'Successful variants share the real handler/cache');
  }));

await test('a saved real driver token loses database access through HTTP unassignment replacement and deletion', { timeout: 90_000 },
  () => withFreshBackend('driver-revocation', () => withAdmin(async ({ db }) => {
    const admin = await signIn('qa_admin');
    const save = async (uid, bus = 'qa_bus') => {
      assert.equal((await request('/api/fleet/drivers/qa_driver', { method: 'PUT', token: admin,
        body: { name: 'Synthetic operator', authUid: uid, assignedBusId: bus } })).status, 200);
    };
    await save('qa_other');
    await db.collection('ride_sessions').doc('qa_session/messages/qa_message').set({ text: 'synthetic' });
    const saved = await signIn('qa_other');
    await firestoreRead('ride_sessions/qa_session', saved, 200);
    await firestoreRead('ride_sessions/qa_session/messages/qa_message', saved, 200);
    await save('qa_other', null);
    await firestoreRead('ride_sessions/qa_session', saved, 403);
    await save('qa_other');
    const restored = await signIn('qa_other');
    await firestoreRead('ride_sessions/qa_session', restored, 200);
    await firestoreRead('ride_sessions/qa_session', saved, 403);
    await save('qa_passenger');
    const replacement = await signIn('qa_passenger');
    await firestoreRead('ride_sessions/qa_session', restored, 403);
    await firestoreRead('ride_sessions/qa_session/messages/qa_message', restored, 403);
    await firestoreRead('ride_sessions/qa_session', replacement, 200);
    assert.equal((await request('/api/fleet/drivers/qa_driver', { method: 'DELETE', token: admin })).status, 200);
    await firestoreRead('ride_sessions/qa_session', replacement, 403);
  })));

await test('real Auth CLI demotion and restoration never revive a saved admin token in either database', { timeout: 90_000 },
  () => withFreshBackend('admin-revocation', () => withAdmin(async ({ db, require }) => {
    const { syncRoleClaimsChunk } = require(resolve(repositoryRoot, 'backend/dist/syncRoleClaims.js'));
    const saved = await signIn('qa_admin');
    await firestoreRead('drivers/qa_driver', saved, 200); await databaseRead('publicRouteBuses', saved, 200);
    await db.collection('users').doc('qa_admin').update({ role: 'passenger' });
    assert.deepEqual(await syncRoleClaimsChunk(['qa_admin']), [true]);
    await firestoreRead('drivers/qa_driver', saved, 403); await databaseRead('publicRouteBuses', saved, 401);
    // Model Firebase's real second-resolution cutoff deterministically. A token
    // whose auth_time equals validSince passes verifyIdToken(..., true); current
    // authorization must still reject its old privilege after offboarding.
    const { auth_time: boundary } = JSON.parse(Buffer.from(saved.split('.')[1], 'base64url').toString());
    const cutoff = await fetch('http://127.0.0.1:9095/identitytoolkit.googleapis.com/v1/projects/demo-eki-qa/accounts:update', {
      method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: 'qa_admin', validSince: boundary }), signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    assert.equal(cutoff.status, 200, 'Owned emulator cutoff fixture');
    assert.equal((await require('firebase-admin/auth').getAuth().verifyIdToken(saved, true)).uid, 'qa_admin');
    assert([401, 403].includes((await request('/api/places/search?q=SyntheticRevokedAdmin', { token: saved })).status),
      'A demoted admin token must also lose privileged HTTP access');
    assert.equal((await get('/evidence')).providers.calls.length, 0, 'Demoted admin requests cannot spend provider calls');
    const demoted = await signIn('qa_admin');
    await firestoreRead('drivers/qa_driver', demoted, 403); await databaseRead('publicRouteBuses', demoted, 401);
    await db.collection('users').doc('qa_admin').update({ role: 'admin' });
    assert.deepEqual(await syncRoleClaimsChunk(['qa_admin']), [true]);
    const restored = await signIn('qa_admin');
    await firestoreRead('drivers/qa_driver', restored, 200); await databaseRead('publicRouteBuses', restored, 200);
    await firestoreRead('drivers/qa_driver', saved, 403); await databaseRead('publicRouteBuses', saved, 401);
    assert.equal((await request('/api/places/search?q=SyntheticRestoredAdmin', { token: restored })).status, 200);
  })));

await test('real device verifiers and Firestore transactions enforce OTA reservation ownership and recovery', { timeout: 90_000 },
  () => withFreshBackend('ota-reservation', () => withAdmin(async ({ db, require }) => {
    const { hashDeviceSecret } = require(resolve(repositoryRoot, 'backend/dist/services/deviceTelemetryService.js'));
    const secret = 'synthetic-browser-device-only', foreignSecret = 'synthetic-foreign-device-only', rotatedSecret = 'synthetic-rotated-device-only';
    const lock = db.collection('_active_bus_locks').doc('qa_bus');
    const installation = (device = secret, method = 'POST', path = '/api/devices/qa_device/firmware/installation') =>
      request(path, { method, device, body: method === 'POST' ? { action: 'acquire' } : undefined });
    // The fixture begins with a ride lock; discovery/acquisition must not take it.
    assert.equal((await installation()).status, 409); assert.equal((await lock.get()).data().sessionId, 'qa_session');
    await lock.delete();
    const activeRide = db.collection('active_rides').doc('qa_bus_qa_route');
    await activeRide.set({ sessionId: 'qa_session' });
    assert.equal((await installation()).status, 409, 'An active ride independently blocks acquisition without a bus lock');
    assert.equal((await lock.get()).exists, false);
    await activeRide.delete();
    for (const device of [null, 'short', 'synthetic-wrong-secret']) assert.equal((await installation(device)).status, 401);
    for (const [method, path] of [['PUT', '/api/devices/qa_device/firmware/installation'],
      ['POST', '/api/devices/qa_device/firmware/installation/extra'], ['HEAD', '/api/devices/qa_device/firmware']])
      assert.equal((await installation(secret, method, path)).status, 401, 'Only exact device ingress bypasses browser identity');
    const outcomes = await Promise.all([installation(), installation()]);
    assert.deepEqual(outcomes.map(response => response.status).sort(), [200, 409]);
    assert.equal((await lock.get()).data().deviceId, 'qa_device');
    await db.collection('devices').doc('qa_foreign').set({ enabled: true, busId: 'qa_bus', routeId: 'qa_route', secretHash: await hashDeviceSecret(foreignSecret) });
    assert.equal((await request('/api/devices/qa_foreign/firmware/installation', { method: 'POST', device: foreignSecret, body: { action: 'release' } })).status, 200);
    assert.equal((await lock.get()).data().deviceId, 'qa_device', 'Another authenticated device cannot release the owner lock');
    await db.collection('devices').doc('qa_foreign').delete();
    const admin = await signIn('qa_admin');
    // Exercise the real hash and the production registry invalidation path,
    // including a credential warmed before rotation and an existing lock.
    await db.collection('devices').doc('qa_device').update({ secretHash: await hashDeviceSecret(rotatedSecret) });
    assert.equal((await request('/api/devices/qa_device', { method: 'PUT', token: admin, body: { busId: 'qa_bus', routeId: 'qa_route', enabled: true } })).status, 200);
    assert.equal((await request('/api/devices/qa_device/firmware/installation', { method: 'POST', device: secret, body: { action: 'release' } })).status, 401);
    assert.equal((await request('/api/devices/qa_device/firmware/installation', { method: 'POST', token: admin, body: { action: 'release' } })).status, 401);
    assert.equal((await lock.get()).exists, true);
    assert.equal((await request('/api/devices/qa_device/disable', { method: 'POST', token: admin, body: {} })).status, 200);
    assert.equal((await request('/api/devices/qa_device/firmware/installation', { method: 'POST', device: rotatedSecret, body: { action: 'release' } })).status, 401);
    assert.equal((await lock.get()).exists, true, 'Disabled credentials cannot release an existing reservation');
    assert.equal((await request('/api/devices/qa_device', { method: 'PUT', token: admin, body: { busId: 'qa_bus', routeId: 'qa_route', enabled: true } })).status, 200);
    for (let retry = 0; retry < 2; retry++) assert.equal((await request('/API/DEVICES/qa_device/FIRMWARE/INSTALLATION', { method: 'POST', device: rotatedSecret, body: { action: 'release' } })).status, 200);
    assert.equal((await lock.get()).exists, false);
    await db.collection('devices').doc('qa_unassigned').set({ enabled: true, secretHash: await hashDeviceSecret(foreignSecret) });
    assert.equal((await request('/api/devices/qa_unassigned/firmware/installation', { method: 'POST', device: foreignSecret, body: { action: 'acquire' } })).status, 403);
    assert.equal((await request('/api/devices/QA_DEVICE/firmware/installation', { method: 'POST', device: secret, body: { action: 'acquire' } })).status, 401, 'Device IDs preserve case');
  })));

// Await cleanup explicitly after the sequential top-level tests. A root-level
// after hook can wait for beforeExit, which the SDK's own open sockets prevent.
if (adminResources) {
  await adminResources.db.terminate();
  await adminResources.close();
}
