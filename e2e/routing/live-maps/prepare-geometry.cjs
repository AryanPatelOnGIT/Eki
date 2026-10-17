// Explicit manual probe: at most two live Google requests; no Firebase imports.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");
const root = path.resolve(__dirname, "../../..");
const outputDirectory = path.join(root, "artifacts/routing-provider");
const envPath = process.argv[2];
assert(envPath, "Pass the local backend .env path; its contents are never printed.");
const configured = require("dotenv").parse(fs.readFileSync(envPath));
assert(configured.GOOGLE_MAPS_API_KEY, "Configured Google Routes key is unavailable.");
process.env.GOOGLE_MAPS_API_KEY = configured.GOOGLE_MAPS_API_KEY;
const source = fs.readFileSync(path.join(root, "frontend/src/lib/predefinedRoutes.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsObject = {};
new Function("exports", compiled)(exportsObject);
const fixture = exportsObject.PREDEFINED_ROUTES.find(route => route.id === "route_au_samras");
assert(fixture && fixture.waypoints.length === 5);
const { computeRouteGeometry } = require(path.join(root, "backend/dist/lib/googleMaps.js"));
const { decodePolyline } = require(path.join(root, "backend/dist/lib/polylineUtils.js"));
const originalFetch = global.fetch;
const requests = [];
global.fetch = async (url, options) => {
  assert.equal(url, "https://routes.googleapis.com/directions/v2:computeRoutes");
  assert.equal(options.method, "POST");
  assert(requests.length < 2, "Live provider request ceiling exceeded.");
  const body = JSON.parse(options.body);
  const request = { ordinal: requests.length + 1, routingPreference: body.routingPreference,
    travelMode: body.travelMode, intermediateCount: body.intermediates.length,
    waypointOptimization: body.optimizeWaypointOrder === true,
    fieldMask: options.headers["X-Goog-FieldMask"], startedAt: new Date().toISOString() };
  requests.push(request);
  const response = await originalFetch(url, options);
  request.status = response.status;
  const data = await response.clone().json().catch(() => ({}));
  request.providerErrorCode = data.error?.status ?? null;
  request.fallbackInfo = data.fallbackInfo ?? null;
  return response;
};
const report = { computedAt: new Date().toISOString(), source: "live-google-routes-v2",
  fixture: fixture.id, fixtureSource: "frontend/src/lib/predefinedRoutes.ts",
  scope: "Public configured fixture; no device, Firebase, or deployed journey changes", requests, directions: [] };
(async () => {
  try {
    for (const direction of ["forward", "reverse"]) {
      const points = (direction === "forward" ? fixture.waypoints : [...fixture.waypoints].reverse())
        .map(([lng, lat]) => ({ lat, lng }));
      const geometry = await computeRouteGeometry(points[0], points.at(-1), points.slice(1, -1));
      const decoded = decodePolyline(geometry.encodedPolyline);
      assert(decoded.length > 2, "Provider returned no usable road geometry.");
      assert(geometry.distanceMeters > 0 && parseFloat(geometry.duration) > 0);
      // Production decoder returns {lat, lng}. Allow provider road-access snapping.
      for (const [actual, expected] of [[decoded[0], points[0]], [decoded.at(-1), points.at(-1)]]) {
        assert(Math.hypot(actual.lat - expected.lat, actual.lng - expected.lng) < 0.003,
          "Provider geometry endpoint exceeds roughly 330m from the requested terminal.");
      }
      report.directions.push({ direction, ...geometry, pointCount: decoded.length,
        firstPoint: decoded[0], lastPoint: decoded.at(-1), requestedStops: points });
    }
    assert.equal(requests.length, 2);
    report.passed = true;
  } catch (error) {
    report.passed = false;
    // Error text is our production wrapper/assertion only, never upstream response bodies.
    report.failure = String(error.message).replaceAll(configured.GOOGLE_MAPS_API_KEY, "[redacted]");
    process.exitCode = 1;
  } finally {
    global.fetch = originalFetch;
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(path.join(outputDirectory, "result.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, directions: report.directions.map(({ encodedPolyline, requestedStops, ...safe }) => safe) }, null, 2));
  }
})();
