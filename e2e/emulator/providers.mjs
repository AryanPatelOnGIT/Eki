const routesUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const placesUrl = 'https://places.googleapis.com/v1/places:searchText';
export const syntheticProviderKey = 'synthetic-emulator-provider-only';

// An in-process HTTP boundary adapter. Recognized provider URLs never reach
// the real fetch implementation; all other outbound URLs are rejected here.
export function createProviderAdapter(localFetch, encodePolyline) {
  const modes = { routes: 'valid', places: 'valid' };
  const calls = [];
  let deniedRequests = 0;
  const acceptedModes = ['valid', 'rate-limit', 'malformed', 'timeout'];
  return {
    reset() { calls.length = 0; deniedRequests = 0; modes.routes = modes.places = 'valid'; },
    setMode(provider, mode) {
      if (!Object.hasOwn(modes, provider) || !acceptedModes.includes(mode)) throw new Error('Unknown synthetic provider mode');
      modes[provider] = mode;
    },
    evidence() { return { modes: { ...modes }, calls: calls.map(call => ({ ...call })), deniedRequests, externalNetworkExecuted: false }; },
    async fetch(input, options = {}) {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const provider = url.href === routesUrl ? 'routes' : url.href === placesUrl ? 'places' : null;
      if (!provider) {
        if (url.hostname !== '127.0.0.1' || !['3116', '8085', '9005', '9095'].includes(url.port)) {
          deniedRequests++; throw new Error('Unexpected outbound fetch in the disposable provider fixture');
        }
        return localFetch(input, options);
      }
      const headers = new Headers(options.headers);
      if (options.method !== 'POST' || headers.get('X-Goog-Api-Key') !== syntheticProviderKey) {
        deniedRequests++; throw new Error('Invalid synthetic provider request contract');
      }
      const body = JSON.parse(options.body);
      const mode = modes[provider];
      calls.push({ provider, mode });
      if (mode === 'timeout') {
        if (!options.signal) throw new Error('Provider request must have an abort deadline');
        await new Promise((_, reject) => {
          if (options.signal.aborted) { reject(options.signal.reason); return; }
          options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        });
      }
      if (mode === 'rate-limit') return new Response('synthetic quota exceeded', { status: 429 });
      if (mode === 'malformed') return Response.json({ routes: [{ polyline: { encodedPolyline: '' } }], places: [] });
      if (provider === 'places') {
        const second = String(body.textQuery).toLowerCase().includes('end');
        return Response.json({ places: [{ displayName: { text: second ? 'Synthetic provider end' : 'Synthetic provider origin' },
          formattedAddress: 'Synthetic place fixture', location: { latitude: second ? 23.0036 : 23, longitude: 72 } }] });
      }
      const points = [body.origin, ...(body.intermediates ?? []), body.destination].map(point => {
        const { latitude: lat, longitude: lng } = point.location.latLng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Invalid synthetic route point');
        return { lat, lng };
      });
      return Response.json({ routes: [{ polyline: { encodedPolyline: encodePolyline(points) }, distanceMeters: 400, duration: '60s' }] });
    },
  };
}
