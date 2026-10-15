# End-to-end UI control and state matrix

This file is **minimum required coverage**, not an exhaustive fixed selector list. Generate actual controls from HEAD and runtime. For **every distinct visible interactive control**, add ledger rows for each reachable role/state/viewport and exercise its intended effect. If something in this list no longer exists, show a source path and mark `NOT_APPLICABLE` rather than quietly omitting it. If newly added, include it automatically.

## 1. Global/app shell, landing and route access

- First load/hard refresh, direct deep links, page transitions, browser back/forward, stale cache and unknown route. Test accessible route and role redirect without flash of protected content.
- Landing nav, CTA, logo, image/brand anchors, links to passenger/admin/feedback, footer/legal/help if present, mobile menu open/close, keyboard/touch, browser history.
- Loading skeleton/spinner, genuine empty state, dismissible error/alert, retry, responsive scrolling, safe-area/notch, dark theme, browser zoom 200% and large text.
- Guest, just-signed-in, valid passenger, valid admin, unverified auth, expired auth, bad claims, role switching across tabs, logout, popup/redirect blocked, App Check errors and recovery.
- All visible links: correct `href`/target, destination content, denied unauthorized resources, no dead `#` links unless intentional; all buttons: one action + observable result.
- No console errors, uncaught promises, hydration mismatch, broken images, missing fonts/icons, CSP violations, failed critical assets, unexpected horizontal scroll, overlapping click blockers, hidden-panel pointer capture.

## 2. Passenger panel: route discover and tracking

- Home: route carousel, route cards, left/right/navigation dots if present, all route options, pending vs active vs completed and empty, at least 1/2/many buses, same-route multiple vehicles, directions and stop states. Test text overflow and small tap targets.
- Select route: initial selection, alternative route, revisit selection, refresh, stale selected route, route deleted/renamed by admin, old async response arriving after new selection. Verify name, direction, stops and marker association.
- Destination: every select/dropdown open, options, selection, disabled/invalid, closed/reopened, keyboard arrows/Enter/Escape, second-choice/first-choice state and persistence across back and forward.
- Available bus selection: single bus, second bus, duplicate names, bus goes offline/paused, selected bus replaced, boarding choice must target correct bus and session.
- Join/board: sign-in gating, no active session, pending direction, wrong/late stop, valid join, confirmation, duplicate/two-tab join, retry after uncertain network response, errors, reload/recovery and recovered passenger state. Verify backend and UI agree on `sessionId`.
- Tracking: map loads, correct marker/route/stop/direction; tap bus marker, marker details, recenter/follow, pan/zoom, tracking sheet/timeline open/collapse/close/back, estimated arrival display and source, bus heading, last-update and stale/offline/no-GPS indicators. Confirm touch gestures don't prevent navigation.
- Test session lifecycle: pre-departure, in service, stop advancement, near final, completed, interrupted, switched to new session, resumed after phone sleep/network outage. No phantom active bus from device-only GNSS presence; old session must never leak into new chat or history.
- Chat bubble/trigger: hidden/disabled/enabled states, open, compose, send, empty/whitespace/long text, rapid sends, failure toast/retry, message ordering, role labels, session changes, close/backdrop/Escape, keyboard and mobile viewport with open keyboard.
- Post-ride feedback modal: trigger and eligibility, star/rating if implemented, input validation, send, duplicate prevention, cancel/close, success/failure, auth and session identity.
- Back / Routes / Profile navigation on every accessible passenger state; when switching tabs verify no invisible sheet consumes taps or remains in accessibility tree.

## 3. Passenger profile (high priority)

- Guest header displays icon/name/role appropriately; signed-in Google display name and role are correct; no stale user across logout/new login.
- When `user.photoURL` is valid: actual image fetched with 2xx, `naturalWidth > 0`, visible clipping and nonzero dimensions, image not blocked by CSP/remote referrer policy. When missing: deterministic fallback. When invalid/403/404/timed out: no broken-image icon or blank region; test fallback/indication against product requirement and record a defect if expectation not met.
- Google sign-in popup, blocked-popup fallback to full-page redirect, cancellations, repeated click disabled/loading, error and retry states.
- Feedback action: opens actual modal, fill and submit, cancel/close, verifies persistence/acknowledgment and error handling.
- Sign Out: tap, dialog cancel, keyboard dismissal, confirm (test account only), auth clearing, protected UI hides, back button cannot resurrect auth.
- Delete Account: open/cancel/Escape, button loading/disabled, **never confirm in shared/live data**. Confirm only with explicitly authorized throwaway account in disposable environment; verify acknowledgement of `/api/v2/privacy-deletion-requests`, failure, network timeout, duplicate prevention, role permission and actual backend state.
- Profile footer/version, scroll, portrait/landscape, unsupported/incomplete OAuth image URLs and long names.

## 4. Admin global tabs and Live Ops

- Tab bar: Live Ops, Routes, Fleet & People, History, Feedback, Settings; each accessible/clickable, correct `aria-selected`, focus, visible panel and role guard. Keyboard arrows/Home/End. No off-screen tab inaccessible on phone.
- Live Ops map: actual Google map loads, map errors/keys, center/pan/zoom and traffic overlay if present, marker labels/click details/close, stale/offline status, marker synchronization with selected bus.
- Counts and status chips: connected vs active service vs offline/pending, stale status, zero buses/many buses, last update/ETA, correct identity on bus changes. Hardware presence must not imply a ride.
- Start service / stop/end service / confirm-cancel: correct assigned bus/route and direction, validated action, in-flight disabled, no duplicate on fast click, updates passenger view and History as authorized; isolation required.
- Per-bus card/detail drawer: expand/collapse, all details and controls, chat open/send/close, map recenter, retry/refresh, visible below mobile content, correctly bounded scroll and overlays.
- Page error banners: dismiss, retry after connection recovery, no false success.

## 5. Admin route editor, Google Maps and Places (high priority)

- Routes list: load/empty/error/retry, choose existing, Edit/Create, close/cancel unsaved, route selection after sorting/search if present, duplicate names/IDs and no-route state.
- Route metadata: name, ID, generated ID, color swatches, disabled/change state, validation (empty, duplicate, whitespace, long and punctuation), saved persistence.
- **Stop search:** input 0/1/2 chars sends no request; >=3 sends **one debounced request (~300ms)** to `/api/places/search?q=...` under valid admin auth (after allowing enough time). Typing new query cancels stale prior response. Test real Ahmedabad place query, zero results, spinner, valid prediction text/address, each result selectable, resulting coordinate/label, later save/reload. No client-side suggestion display alone counts as provider PASS.
- Place search faults in controlled transport: absent token, 401/403, bad API config/Google key restriction, no API/bad base URL, 404 wrong path, 429 quota, 500/503 upstream, timeout, malformed response and zero-results. Different error states should be useful, dismissible/recoverable and must not accidentally save an invalid stop. Inspect backend response and server logs before assigning cause.
- Pick on Map: activation/deactivation, click correct map coordinate and marker, no unwanted stop when off; drag marker, rename inline, rename-cancel/Enter/Escape/blur, move stop up/down, remove stop/cancel, swap endpoints, duplicate/coincident stops, off-route via/station, long route/close endpoints.
- Route direction: two-direction geometry correctness and independent persistence, reverse direction after swap, route preview and accurate map drawing. Unavailable geometry must be explicit, not fabricated straight-line route.
- Save/Deploy: dirty indicator, errors, no-op, loaded/spinner, ack, update route list, refresh/reopen, rollback on rejected save, stale version 409, unknown outcome after disconnect and idempotent retry; a failed endpoint MUST not be presented as success.
- Delete route: cancel/confirm only in disposable project, active-ride protections, orphaned assignments and passenger projections must remain coherent.
- Map provider: real tiles/markers/geometries/Places in authorized environment, billing/rate-limits with bounded requests; synthetic adapter verdict remains separate.

## 6. Admin Fleet & People

- Fleet subpanels/toggles and all cards: collapsed/expanded, current presence/state, scroll, focus, badges, sorting/filtering if present.
- Add bus: empty/invalid/duplicate ID and name, valid creation, route selector each option, assignment persistence, cancel/reset/retry, 409/timeouts and rapid double-submit.
- Edit bus: change name/ID if supported, route reassignment while ride active vs idle, switching from A→B and back, compatibility with device binding, error/ack and reload.
- Delete bus: opened/cancelled/confirmed only in isolated disposable data; current active bus cannot silently corrupt live trip or leave orphaned markers.
- Operators/Drivers/People: create/edit/assign, input constraints, duplicate IDs, stale entries, delete confirmations, permission-denied and callback errors. No accidental writes when Cancel pressed.
- Every small dropdown, checkbox, chevron, edit pencil, checkmark, cross, error dismissal, retry and detail control must get its own ledger row.

## 7. History, Feedback, Settings

- History: populated/empty/error/retry, correct route/bus/session/status/timestamp, expand all details, stop timeline, filters/date controls if implemented, download/export if implemented, terminal-only delete and cancel/confirm on emulator; preserve completed and interrupted history.
- Feedback: guest/passenger submission and admin list, loading/empty/error/retry, read details, status change, rejection/no-op/ack/persistence, sorting/filter if present, cross-user isolation.
- Settings: every field, checkbox and switch; initial server values, no-change Save disabled/behavior, edit then undo, valid/invalid values, Save, load/reload, confirmation/error, rapid submit, offline/403/409; ensure passenger configuration changes appear only when intended.

## 8. Cross-cutting states on *every* interactive page

- Waiting: slow request, spinner eventually resolves/timeout; no permanent disabled lock or invisible blocked overlay.
- Errors: offline, backend down, Firebase denied read, App Check failure, OAuth rejection, invalid API/Places map referrer, 429 and Retry-After, 5xx.
- Race: click twice, navigate away mid-request, reopen, change tabs, browser refresh, stale response after newer choice, reauthentication or token refresh, two active tabs.
- Responsive: 360×800, 390×844, 768×1024, 1280×800, 1440×900 as feasible; document exact device simulation vs physical phones. Screen readers/keyboard focus, WCAG labels/contrast, dialogs, search focus and 200% zoom.
- Network/device: offline → online, throttled 3G, browser background and resume, service-worker update and stale cache, low memory, privacy browser mode, disabled geolocation.
- API and state: verify requests are correct, only intended writes occur, status/response/authorization, backend idempotency and persisted data, RTDB reconnect, Firestore stale snapshots, excessive listener duplication/leaks.
- Visual: screenshot reference comparison where available, cropped/hidden/overlapping controls, map overlay height/z-index, wrong icon/copy, hover/focus/active/disabled visual states, long content and browser text scaling.
- Safety: role permissions server-side, no guest/admin mutation leaks, no API tokens or exact passenger geolocation in browser logs or public artifacts, protected history not cached offline.
- Hardware: simulated stationary/moving/recovery scenarios **plus a separate BLOCKED physical GNSS field row** when device/road tests are unavailable. Never silently map simulated pass onto hardware pass.

## 9. Full control sweep algorithm

For each `(role, viewport, page, backend state)`:
1. Load URL fresh; collect accessibility tree and all visible actionable DOM nodes.
2. Visit each tab/card/accordion/modal/menu state; **recollect after each transition** (opening dialogs reveals new controls).
3. For each control, record stable role/name/testid locator and expected behavior, then interact; verify DOM + console + request/DB oracle, take evidence, reset fixture and move on.
4. For branching flows, explore each branch (Save vs Cancel, yes vs no, error vs success, 0 vs 1 vs many results) separately.
5. Include non-button interactions (selects, inputs, links, switches, sliders, drag/drop, Google markers, keyboard shortcuts, PWA install controls).
6. Reconcile static census, runtime census and the repository's existing 351-case checklist. Unmapped or unreachable controls become explicit coverage gaps. No unexplained blank ledger rows.
