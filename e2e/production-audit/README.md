# Production audit validation fixtures

Last updated: 2026-10-26 06:00 IST (UTC+05:30).

Run `npx playwright test --config playwright.production-audit.config.ts` from the
repository root. Port 3123 is reserved for this isolated Vite fixture. Chromium
runs at 360×800, 390×844 and 1280×800, with screenshots and structured measurements
in `artifacts/production-audit/`. CI retains that directory for seven days.

The actual admin dashboard, passenger workspace/map/carousel, route editor and history components
render against synthetic Auth, collection, RTDB, HTTP and Maps boundaries. No
Firebase service account, provider key, real route mutation or physical GNSS is
used. The fixture controls and moving updates exist only in this test entrypoint;
there is no product geofence or authorization bypass.

Checks cover full long-label rendering and route selection, the waiting-data
header, blank stop renames with Enter/blur and a valid retry, existing interruption
reasons and historical fallbacks, the actual empty-search notice backdrop and map
inspection during updates under four-times Chromium CPU throttling. The map check
measures DOM accessibility serialization and screenshots; it does not establish
real Google Maps performance, device battery use or physical display latency.

Contrast is derived from the rendered foreground and composed ancestor
backgrounds, with browser color conversion. It is scoped to this dark fixture,
not a universal assessment of every provider surface or theme.

Additional checks use the production-default 300-second expiry, inject 90.001-,
120- and 200-second-old telemetry, and verify matching delayed warnings plus fresh
recovery without reload. A denied passenger detail subscription shows a distinct
live-data error and clears after a new authoritative delivery.

`resilience.spec.ts` (13 cases per viewport) intercepts place search and route
save/delete HTTP: 4xx/5xx, HTML gateway and malformed bodies, a stale slow
response, offline search, rate limiting, hostile place names, a dropped save that
reconciles with the same `saveId`, a double-activated Update that sends one PUT,
and a failed deletion whose reason is dismissable. Passenger cases cover offline
toggles, 320–1024 px resizes, two tabs, reload and back/forward. These synthetic
callbacks do not certify real Firebase reconnects, permissions or GNSS quality.
