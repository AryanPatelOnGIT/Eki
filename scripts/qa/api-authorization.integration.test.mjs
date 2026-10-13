import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { openSync, closeSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repositoryRoot } from './acceptance-catalog.mjs';
import { safetyPreflight } from './safety-preflight.mjs';

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

async function withFreshBackend(label, work) {
  const log = openSync(resolve(directory, `api-backend-${label}.log`), 'w');
  const child = spawn(process.execPath, ['--import', './scripts/qa/network-guard.mjs', 'e2e/emulator/backend.mjs'],
    { cwd: repositoryRoot, stdio: ['ignore', log, log], env: { ...process.env, PORT: '3116',
      // Authorization sweeps measure request effects, not independent telemetry
      // startup writes. Browser/worker suites keep background processing enabled.
      WORKER_ENABLED: 'false',
      CORS_ORIGIN: 'http://127.0.0.1:3115', NODE_ENV: 'development', API_APPCHECK_MODE: 'off' } });
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
    child.kill('SIGTERM');
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
      expectedStatus, observedStatus: response.status, authClass: operation.auth });
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
