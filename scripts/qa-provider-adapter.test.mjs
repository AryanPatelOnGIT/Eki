import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProviderAdapter, syntheticProviderKey } from '../e2e/emulator/providers.mjs';

test('synthetic provider interception never forwards provider or unknown outbound requests', async () => {
  let forwarded = 0;
  const adapter = createProviderAdapter(async () => { forwarded++; return Response.json({ local: true }); }, () => 'golden-polyline');
  const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';
  const options = { method: 'POST', headers: { 'X-Goog-Api-Key': syntheticProviderKey },
    body: JSON.stringify({ origin: { location: { latLng: { latitude: 23, longitude: 72 } } },
      destination: { location: { latLng: { latitude: 23.01, longitude: 72 } } } }) };
  assert.equal((await (await adapter.fetch(url, options)).json()).routes[0].polyline.encodedPolyline, 'golden-polyline');
  adapter.setMode('routes', 'rate-limit'); assert.equal((await adapter.fetch(url, options)).status, 429);
  adapter.setMode('routes', 'malformed'); assert.equal((await (await adapter.fetch(url, options)).json()).routes[0].polyline.encodedPolyline, '');
  adapter.setMode('routes', 'timeout');
  const controller = new AbortController();
  const hanging = adapter.fetch(url, { ...options, signal: controller.signal }); controller.abort(); await assert.rejects(hanging);
  await assert.rejects(adapter.fetch('https://example.invalid/'), /Unexpected outbound/);
  await assert.rejects(adapter.fetch(url, { ...options, headers: {} }), /Invalid synthetic/);
  assert.equal(forwarded, 0);
  assert.equal(adapter.evidence().deniedRequests, 2);
  await adapter.fetch('http://127.0.0.1:8085/test'); assert.equal(forwarded, 1);
  assert.throws(() => adapter.setMode('routes', 'unknown'), /Unknown/);
  assert.equal(adapter.evidence().calls.length, 4);
  adapter.reset(); assert.deepEqual(adapter.evidence(), { modes: { routes: 'valid', places: 'valid' }, calls: [], deniedRequests: 0, externalNetworkExecuted: false });
});
