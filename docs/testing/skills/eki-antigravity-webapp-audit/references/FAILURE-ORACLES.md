# Eki failure oracles and reproducibility checks

## Passenger profile avatar

**Expected (for a valid remote picture):** user display name/role correspond to authenticated identity, an actual decoded image renders in a visible circular viewport, no broken image/CSP/404. **Expected (for missing/failed URL):** usable fallback where product spec requires it; broken image is a user-visible defect even if no JavaScript exception appears.

**Observe:** authenticated test user's presence and `photoURL` existence (do not log the URL), img `src` presence, `complete`, `naturalWidth`, `naturalHeight`, bounding box, `getComputedStyle(...).visibility`, request status/content type, CSP console violations, browser with/without third-party resources. Reload, role switch, network offline, corrupted/expired URL. Inspect `AccountTab.tsx` and any profile-shaping logic in `useAuth.ts`/`firebaseAuth.ts`. Differentiate blank source vs load failure vs transparent image vs CSS crop/overlap vs stale cached URL. Fixing only `<img src>` without load fallback may not fix the visible report.

## Admin Places search / Google Maps

**Known path:** `RouteManagementPanel.tsx` `PlacesSearchBox` → 300ms debounce when trimmed query >=3 chars → authenticated `GET /api/places/search?q=...` → `results` list → result click calls `handlePlaceSelect` → new stop with coordinates. Inspect backend route, Google Places API credentials/restrictions/CORS, authentication, error handling and request budgets at current HEAD.

**Success trace:** input typed; request emitted only at threshold; accepted 2xx payload with `results` containing plausible name/lat/lng; button appears; click updates editor stop and map marker; Save/Deploy succeeds and reopening keeps coordinates/label. Distinguish external provider vs stub; a synthetic list is *not* live integration evidence.

**Negative:** 0–2 chars no search; whitespace trim; clear mid-flight; A query → B query with delayed A completion; expired token; missing/invalid Google key, upstream quota/referrer/API disabled, malformed coordinates, rate limit, backend 401/403/503, empty result; click selection while editor changed/closed. Assert accessible errors, no stale prediction, no unhandled exception, no accidental route mutation.

**Map:** Real Google tiles (not just a blank canvas) at representative zoom, markers, drag and map-click intersection with overlays, route geometry and reverse. Screenshots and network/console, actual source of directions geometry. Test resized map after switching tabs.

## Save/delete/admin mutations

**Expected:** user input validated; one intended request; busy indicator and disabled repeat; backend ack; changed data appears after a *fresh read* and another role where applicable; cancel results in no write; 401/403 denies unauthorized user; 409 conflict does not overwrite newer data; unknown network result offers safe reconcile rather than duplicate POST. Do not test destructive confirmation against shared cloud.

Test races: in-flight Save → close → re-open, Save → network interruption → retry, duplicated operation ID with same/different payload, backend saves after stale editor tab, active ride started during route edit, fleet reassigned during ride, admin logout mid-request.

## Passenger live bus, journey, time and state

**Expected:** hardware online status separate from actual active ride. Only properly paired route/bus/session visible as service; no ghost service from device-only fix. Passenger selects one bus and destination, joins once, tracks that same session, retains valid identity across refresh, sees monotonic stop progress, correct forward vs reverse geometry and ETA. When completed/interrupted, tracking state, feedback and history agree; old chat must not appear under new session.

Test cases: null/malformed/stale/future timestamps, GPS outside bounds, reverse after turnaround, multiple buses and session IDs, near-parallel roads, fallback geometry, large coordinate jumps, no GPS, 30+ sec background, RTDB disconnect/flap, same UID in two tabs, app resume. Use emulator replays to assess deterministic code, actual moving GNSS for physical-only acceptance.

## Chat and feedback

**Expected:** messages from passenger/admin are session-scoped, sent text appears once, read history order is coherent, errors not concealed, no private transcript leaked to new session/user, moderation/rejection displayed. Empty/whitespace input no mutation; send button/busy state works on mobile; retry after unknown ack does not duplicate. Feedback eligible only in correct state and tied to correct session/user; error should not claim saved.

## Auth and role protection

Guest cannot see admin data or execute its backend operations even through direct URL/API. OAuth popup and redirect handle errors, role verification readiness, App Check, token expiry, account switch, forced token refresh and back button. Pass must include **server-side authorization evidence** from approved test environment, not just role-hidden buttons.

## Offline, PWA and recovery

Service worker must not leak cached protected responses. Browser app foreground/background, connectivity loss, reload and app update must handle RTDB subscription resume, fresh snapshot, pending send and stale status. Do not mistake synthetic timers for actual mobile OS suspension or browser eviction. Verify color/contrast/focus and map fallback when an asset or provider fails.

## Classification rubric

- `P0` Severe security/privacy exposure or unrecoverable shared-state damage: stop unsafe test, preserve evidence, report promptly.
- `P1` Primary ride/map/auth/admin CRUD cannot work for intended users; data corruption/misassignment.
- `P2` Secondary action, invalid-state handling, mobile broken layout or unreliable recovery.
- `P3` Cosmetic/copy/polish when functional behavior is correct.

Each severity must be justified by impact, not by speculation. Use `BUG-###` IDs tied to ledger, evidence and source references; triage duplicates against GitHub issues.
