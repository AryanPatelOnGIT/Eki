# Eki Antigravity Comprehensive Browser Testing Skill

Run this document in Antigravity against PR #323’s current head, or an explicitly chosen Eki checkout. Open and operate the actual browser. This is a playbook, not test evidence. Its included sections form one skill.


---

# Included document: SKILL.md

---
name: eki-antigravity-webapp-audit
description: Use an actual Antigravity browser to comprehensively audit Eki's passenger, admin, authentication, maps, chat and live-bus web application by reconciling source-level interactive controls with actually executed browser journeys. Use when asked to click/test every button, find broken profile photos or Google Places search, verify all UI states, discover bugs, create evidence-backed reports, or retest repairs on the Eki testing branch.
---

# Eki webapp interaction audit

You are a meticulous, adversarial QA engineer using source inspection **and an actual interactive browser**. The aim is **maximum defensible interaction coverage**, never an unsupported claim of finding literally every possible bug.

## Scope and ground truth

- Repository: `https://github.com/notnamansinha/Eki`. When invoked for PR #323, fetch and inspect its current head (it is on AryanPatelOnGIT/Eki, not origin’s ordinary branch refs). Otherwise default to branch `testing`; record exact **HEAD SHA**, local uncommitted changes, app URL, backend URL, test principal/roles, time zone and environment. Never assume `main` has the same UI.
- **Inspect current code before assuming features or selectors.** In the 2026-10-12 `testing` baseline, the Next frontend exposes `/`, `/passenger`, `/admin` and `/feedback`; the admin tabs are **Live Ops, Routes, Fleet & People, History, Feedback, Settings**. The passenger workspace switches among home, tracking and profile. These are leads, not an exhaustive/current route census.
- Read `skills/eki-antigravity-webapp-audit/references/EKI-SOURCE-MAP.md`, then inspect actual `frontend/src/app`, component imports and conditional render branches, plus `backend` contracts. Read `docs/testing/WEBAPP_A_Z_AB_TESTING.md` and its plan, `qa/README.md`, `docs/testing/TEST_STRATEGY.md`, recent non-UI PRs and unresolved issues. **Do not mark historical checklist entries PASS solely because they exist.**
- Before execution read `skills/eki-antigravity-webapp-audit/references/EXECUTION-PROTOCOL.md` and `skills/eki-antigravity-webapp-audit/references/CONTROL-MATRIX.md`. For nuanced test oracles read `skills/eki-antigravity-webapp-audit/references/FAILURE-ORACLES.md`; for practical Playwright patterns see `skills/eki-antigravity-webapp-audit/references/PLAYWRIGHT-RECIPES.md`; for required output use `skills/eki-antigravity-webapp-audit/references/REPORTING.md`.

## Antigravity browser execution

Open the application in Antigravity's actual browser and use its browser interaction tools to inspect and operate the rendered UI. A terminal-only run, screenshots without actions, source reading, or green CI cannot satisfy this request. Record the browser tab URL and inspected accessibility/DOM controls at each state. Use ordinary pointer taps at the visible control centre without force-clicking or removing overlays. Use keyboard separately. Use Playwright only as supplemental deterministic evidence, or as the browser implementation when interactive tooling is unavailable; disclose that distinction. Open the real Next build in addition to component fixtures: fixture UI bypasses routing, production CSP, hosting and provider initialization.

Read [references/PR-323-REGRESSIONS.md](skills/eki-antigravity-webapp-audit/references/PR-323-REGRESSIONS.md) for the current repair oracles and account-deletion contract. Discover every current feature from source and runtime, including controls absent from the starter matrix. Keep the browser visibly open where the environment supports it.

If using this bundled single Markdown document, its `Included document:` sections are the referenced files. If executable census/gate helpers are unavailable, inspect the tracked package in `docs/testing/skills/eki-antigravity-webapp-audit/`; do not claim a helper ran if it did not. Run from the repository root; inspect each helper's documented CLI first (the census helper has no help switch).

## Mandatory execution contract

1. **Preflight and safety.** Inspect `git status`, branch/HEAD and service health; preserve all user changes. Work locally or in an isolated worktree. Use a dedicated disposable Firebase emulator/test project and synthetic accounts/test data. Avoid the actual Eki `testing` Firebase project's destructive operations without explicit permission. No real passenger data, secret tokens, Google API keys or precise travel histories in evidence. No production or provider-billed load/fuzzing without approval. Do **not** run delete-account, route deletion, vehicle deletion, end-ride, irreversible feedback changes or cloud writes in a shared environment; mark these BLOCKED and, if possible, exercise on emulators. Reproduction must not create real rides or affect public transit.
2. **Discover every path and interactive state.** Enumerate all Next routes, role gates, navigation and conditional UI states. Run `node docs/testing/skills/eki-antigravity-webapp-audit/scripts/control-census.mjs` (adjust install path) to create a **source-level candidate control inventory**. Supplement it with runtime DOM/accessibility-tree census. Include portals, overlays, nested dialogs, expanded rows, mobile menus, disabled transitions, lazy-loaded components, keyboard-only controls, map markers, drag handles, toasts, feedback forms, retry buttons, and confirmation cancel/close. Code-based enumeration is a starting point, **not proof of interactive coverage**.
3. **Construct a durable ledger before clicking.** One row for each `(page, role, entry state, visible control, action, expected outcome, viewport, environment/provider mode)` combination. Map source file/line, semantic locator, required fixture, actual click/tap/keypress, state/network/database oracle, evidence pointer, outcome and bug ID. Different states create different rows. Record all inaccessible controls explicitly. Never skip a reachable control silently.
4. **Exercise the REAL rendered app** using a browser automation agent, Playwright, or equivalent. Navigate from cold start as guest, passenger and admin (authorized test accounts); at minimum desktop and 390px mobile, plus 360px and intermediate widths on any overflow. On each page enumerate visible interactive elements in the accessibility tree, make each reachable, click/tap each **safe** control, and assert its distinct intended effect (not merely absence of exception). After action check console/page errors, network requests and statuses, DOM state, focus, overlap, persistence after reload/back/forward and backend state where applicable. Interact via keyboard (`Tab`, `Enter`, `Space`, `Escape`, arrows) where expected. Test every create/edit/save/cancel/retry/reset/close path. Keep a running visited-state/visited-action graph and loop until no reachable control or state is unexplored in the authorized scope.
5. **Run both fast deterministic AND relevant real integrations.** Unit/Vitest, TypeScript/build/lint, existing Playwright fixtures, Firebase rules emulator, emulator-backed authenticated journeys, and controlled genuine Google Maps/Places and OAuth browser flows where credentials/provider environment allow. Distinguish **mocked, emulator, browser-with-live-provider, live-cloud, and physical-hardware** evidence. Passing a fake map or seeded JSON response does NOT prove real Google Places search, tile rendering, OAuth picture delivery or real GNSS updates.
6. **Adversarial cases per control.** Valid/invalid/empty/boundary input, slow/down/offline response, 401/403/404/409/429/5xx, stale results, out-of-order response, rapid repeat/double click, reload in flight, authorization switching, session expiry, multi-tab and offline/resume. Do not invent backend failures; inject using a controlled fixture/emulator when necessary. For each condition check visible feedback, no stuck spinners, data correctness, idempotency/no duplicate mutations, and recovery.
7. **Eki must-pass regressions.** (a) Passenger Profile avatar: a real `photoURL` must render a successfully loaded picture, not a broken `<img>` or invisible profile; fallback when missing/broken. (b) Admin Routes “Search for a stop”: type 3+ chars, observe debounced **authenticated** `/api/places/search?q=...`, verify genuine prediction list, click a prediction, assert resulting stop coordinates/labels; also verify real map picking, stop move/reorder/swap/drag, save/reload, conflict/error flows. (c) Every admin tab and submenu, CRUD dialogs, active ride lifecycle, chat, history, feedback and settings must be exercised. (d) Passenger find bus → route/destination selection → boarding/join → active tracking/map/timeline → chat → completion and post-ride feedback; verify refresh, multiple buses/directions, stale data, no service and guest/auth states. See detailed oracles and matrix.
8. **Bug protocol.** Before filing, reproduce at least twice under identical conditions if possible, record exact preconditions and steps, expected vs actual, screenshots/trace (redacted), console, failed request status, affected role/viewport, source location, severity and confidence. A reproduction is not a diagnosis; root cause is a hypothesis until source/log evidence supports it. Classify environmental blocks (missing key, provider restriction, setup) separately from application defects. Link/compare already-open issues and avoid duplicates.
9. **Fix mode is OPTIONAL.** Default `audit-only`. If user authorizes fixes, use a separate branch, minimal fixes and failing-first regression tests, then rerun neighboring state matrix and whole smoke suite; never force-push/merge/deploy. Do not silently alter project config or grant broader Firebase permissions to make a failing test green.
10. **Exit gate.** Produce the complete artifacts in `artifacts/qa/interaction-audit/<date>-<sha>/`: `coverage.csv`, `control-inventory.json`, `journey-inventory.md`, `BUGS.md`, `EXECUTION.md`, `evidence/` and `coverage-summary.json`. Execute the coverage gate. Never claim 100% unless every enumerated, applicable, authorized row has **actual passing evidence** in the designated evidence tier. List `FAIL`, `BLOCKED`, `NOT_RUN`, `INCONCLUSIVE` and synthetic-only results separately. If credentials/browser/actual provider are missing, give the precise remaining gates and still complete static/emulator work.

## Useful commands (verify on current checkout)

```sh
npm ci
npm run qa:check
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:e2e:admin
npm run test:rules
npm run qa:browser
npm run qa:browser:providers
npm run qa:browser:service
```

Commands may require Node 24, Java 21, installed Chromium, backend build, emulators, and non-secret local env configuration. **Do not execute against the live cloud without checking each command's target first.** Existing QA guardrails and configs take precedence. Test result from an older commit must never be upgraded to current-HEAD acceptance.

## Deliverable format

Report the current SHA, branch and env; tested roles/browsers; pass/fail/blocked by **test evidence tier**; highest-severity reproducible defects; complete not-run inventory; exact commands and exit codes; links/paths to screenshots/traces; fixes only if explicitly requested; next steps. A successful test command is not equivalent to an end-to-end live UX check. A clickable button is considered **tested** only when its preconditions, event, intended effect and observable oracle have been checked.


---

# Included document: references/CONTROL-MATRIX.md

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


---

# Included document: references/EKI-SOURCE-MAP.md

# Eki source context and verification pointers

Baseline inspected via the GitHub connection on **2026-10-13**: repository `notnamansinha/Eki`, branch `testing`, commit `454a69631826ba6e371f2b3eca6820dfc91bc774` (2026-10-12). Reinspect HEAD before each audit; names, behavior and files can change.

## Current entrypoints (source-confirmed at baseline)

| Surface | Location | Key implementation | Audit entry |
|---|---|---|---|
| Landing | `frontend/src/app/page.tsx` | Landing/sign-in/navigation | Guest, auth, redirects, links |
| Passenger | `frontend/src/app/passenger/page.tsx` | `PassengerWorkspace.tsx` | Home → tracking → profile; route carousel, boarding, maps, chat |
| Passenger profile | `frontend/src/components/passenger/AccountTab.tsx` | `useAuth()` `user.photoURL` direct `<img>` if provided; icon fallback only for **missing** URL | Broken image, remote URL/CSP, auth profile, feedback, logout, delete confirmation |
| Passenger board/join | `frontend/src/components/passenger/PassengerBoardingView.tsx` | Active/session/stop selection | Joined session confirmation, stale bus, multiple buses, refresh |
| Passenger map | `frontend/src/components/maps/PassengerTrackingMap.tsx`, `PassengerMap.tsx`; `RouteTimelineSheet.tsx` | RTDB live state and synthetic vs provider maps | Marker and route/direction/stop, ETA, freshness, open/close |
| Admin | `frontend/src/app/admin/page.tsx` | Six tabs with `role=tab`, ARIA selected, arrow/Home/End navigation | Activate by click + keyboard; verify panels mount/unmount and scroll |
| Live Ops | `frontend/src/components/admin/DashboardPanel.tsx` | Real-time bus details, service controls, maps, chat | Details dialog/drawer, start/end ride on isolated data, retries |
| Routes | `frontend/src/components/admin/RouteManagementPanel.tsx` | `PlacesSearchBox`, editor, Google map picking, route metadata/stop operations | Search, add/rename/reorder/delete stops, drag, direction swap, deploy/persistence |
| Fleet & People | `frontend/src/components/admin/FleetManagementPanel.tsx` | Buses, operators, assignments, delete confirmations | Every add/edit/save/cancel/expand/delete and empty/invalid/error case |
| History | `frontend/src/components/admin/RideHistoryPanel.tsx` | Session details, history API, terminal record deletion | Filters/details/status/empty/loading/delete with isolated data |
| Feedback | `frontend/src/components/admin/FeedbackPanel.tsx`; `frontend/src/app/feedback/page.tsx` | Admin and standalone feedback | Read, status/edit, errors, access |
| Settings | `frontend/src/components/admin/SettingsPanel.tsx` | Overrides, `Save`, switches | Valid/invalid changes, save, persisted reload, no-change state |
| Chat | `frontend/src/components/shared/MessagingPanel.tsx` | Session-bound messages via API | Both roles, send/read/retry/close, session isolation, moderation/permission |
| Shared UI | `frontend/src/components/ui/{AlertModal,ConfirmModal,CustomSelect,InAppSelect}.tsx`, `frontend/src/components/passenger/ui` | Dialogs, dropdowns, sheets, carousel | Menu options, keyboard, focus trap, escape/backdrop, touch |
| Auth | `frontend/src/hooks/useAuth.ts`, `frontend/src/lib/firebaseAuth.ts`, `frontend/src/components/shared/RoleGuard.tsx` | Firebase, role readiness, Google popup/redirect, App Check | Guest/passenger/admin/denied/expiring/auth switch |
| Maps config | `frontend/src/config/maps.ts` | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAP_ID`, Ahmedabad fallback | Map load, tiles, referrer/keys; never print key |
| Places search endpoint | `RouteManagementPanel.tsx` | Authenticated `GET /api/places/search?q=<encoded>` when input length >=3 with **300ms debounce**; API returns `results` array | Genuine provider success, 0 results, 401/403/429/5xx, stale query cancellation |

### Precisely test the two reported examples

**Profile picture:** Source renders `<img src={user.photoURL} alt="Profile">` if the URL is truthy, without an `onError` fallback in the inspected baseline. This does **not** prove a live defect; deliberately test an actual Google photo, a missing URL and a URL that returns 403/404 or is CSP-blocked; inspect rendered size, `img.complete`, `img.naturalWidth`, console and image response. If a URL is present but the load fails, decide expected fallback/product UX, capture a reproducible case and classify it correctly. Do not leak signed image URLs into bug reports.

**Admin stop search:** The UI input is `Search for a stop`. After three or more characters, a 300ms timer begins; a valid Firebase user ID token is sent to `/api/places/search?q=...`. A search spinner and a no-results message exist. Results are clickable buttons. Test UI-to-backend request, auth token availability, upstream provider invocation and response shape separately; selecting a result must update the route stop, not only close suggestions. Map clicking is a distinct flow. Do not assert this is "Google autocomplete" implemented entirely in the browser: the code uses its backend place-search API.

## Existing testing infrastructure (read; do not overwrite blindly)

- `package.json`: `npm run verify`, `npm run qa:check`, `npm run qa:browser`, `npm run qa:browser:providers`, `npm run qa:browser:service`, `npm run test:rules`, `npm run test:e2e`, `npm run test:e2e:admin`, and other GNSS/soak/native checks.
- `playwright.config.ts`: 360×800 mobile and 1280×800 desktop; ignores `admin-access.spec.ts`; base URL normally `localhost:3000`.
- `playwright.admin-access.config.ts`: source components with *synthetic* Firebase/HTTP adapters; 390×844 and desktop.
- `playwright.emulator.config.ts`: emulator-backed acceptance tests and provider-boundary doubles. Dedicated test environment at 127.0.0.1:3115 and 3117.
- `e2e/admin-responsive.spec.ts`, `e2e/admin-access.spec.ts`, `e2e/emulator-acceptance.spec.ts`, `e2e/fixtures/`, `e2e/motion/`.
- `docs/testing/WEBAPP_A_Z_AB_TESTING.md` references **351 feature cases**, C01–C22 control matrix and H01–H18 HTTP matrix and distinguishes observed/untested cases.
- `docs/testing/WEBAPP_A_Z_AB_TESTING_PLAN.md` is retained in the repository and can be very large. Read its full current bytes in the audit workspace; a viewer/export may return empty when it is too large. Do not infer that it has no content.
- `docs/testing/README.md`, `docs/testing/TEST_STRATEGY.md`, `qa/README.md`, `docs/operations/LOCAL_TESTING.md`, `docs/operations/LIVE_DEMO_RUNBOOK.md`.
- Unresolved physical/deployed acceptance is tracked in [#245](https://github.com/notnamansinha/Eki/issues/245); additional gates in [#246](https://github.com/notnamansinha/Eki/issues/246); moving GNSS acceptance in [#300](https://github.com/notnamansinha/Eki/issues/300). Software replay does **not** resolve them.
- `README.md` notes Next.js static-export PWA, Express HTTPS GNSS ingestion, Firebase RTDB live state, Firestore configuration/history, Node **24** in CI and Java **21** for rules tests. Actual settings/env are local and must be checked, never assumed.

## Dynamic inventory rules

1. Get `git rev-parse HEAD` and reconcile docs to HEAD, not to a previously recorded snapshot.
2. Enumerate `frontend/src/app/**/page.tsx`, navigation, roles, all dynamic imports, dialogs, media and browser features; don't limit tests to this table.
3. Inspect backend endpoints, external provider calls, Firebase rules, service worker/offline setup, and tests related to discovered control.
4. Compare against QA acceptance catalog and latest PR/issue statuses. An issue can be *reported* solved while the browser still fails; live reproduction wins, once environment is controlled.


---

# Included document: references/EXECUTION-PROTOCOL.md

# Execution protocol, tooling and safety

## Roles and evidence tiers

Run at least: `guest`, `passenger`, `admin`, `denied/expired` in authorized fixtures. If a role cannot be provisioned, record `BLOCKED` with owner/action needed, not PASS. Name test identities only by generic labels (never personal names or email addresses in shared reports).

| Evidence tier | Meaning | Appropriate claim |
|---|---|---|
| `STATIC` | Code review, AST control census, path inspection | Potential control/defect identified; NOT clicked |
| `UNIT` | Vitest or backend mock API | Contract/logic passing in isolation |
| `SYNTHETIC_BROWSER` | Playwright against in-memory or fake SDK/provider | Real DOM interaction, mocked dependency |
| `EMULATOR_BROWSER` | Browser with isolated real Firebase emulators and test API | Emulated rules/write/read correctness |
| `LIVE_PROVIDER_BROWSER` | Authorized interactive browser using real Google Maps/Places and OAuth; report backend target | Observed actual provider integration for this env |
| `LIVE_CLOUD` | Approved separate staging Firebase/project/backend, controlled test identities | Environment-specific end-to-end integration |
| `PHYSICAL_GNSS` | Actual ESP32/NEO-M8N, real mobile/network, independent truth | Field behavior; cannot be inferred from replay |

A row can have multiple tier-specific results. A `SYNTHETIC_BROWSER` PASS cannot be silently represented as `LIVE_PROVIDER_BROWSER` PASS. Public production is outside default scope.

## Preflight checklist (before any command that writes)

```sh
git status --short
git branch --show-current
git rev-parse HEAD
node --version
npm --version
```

Find existing localhost servers and Firebase settings safely. Inspect scripts and env targets before execution (`firebase.json`, `.firebaserc`, `playwright*.ts`, `scripts/run-rules-emulator.mjs`, network guard). **Never print env files or keys into logs.** Verify local test endpoints and an isolated emulator. If a user worktree is dirty, do not reset, stash or overwrite it without permission. If a server is in use, use a distinct port.

Install Node 24 and Chromium as required by current repo CI. Use `npm ci` only when safe on the branch/worktree; avoid editing lockfiles. Keep traces and artifacts outside repository tracked sources, ideally ignored `artifacts/qa/interaction-audit/`.

## Source-to-runtime coverage

1. Run `scripts/control-census.mjs` against the repo. This outputs candidates with source file/line and clues; compare with current branch.
2. Enumerate actual routes and top-level states by reading Next `page.tsx`, conditional branches, imported panels and existing test cases. Don't rely on README alone.
3. Run interactive browser with trace, screenshot and console/network listeners. Use ARIA role/label and stable test IDs before CSS selectors. Add test IDs only in fix mode and only when necessary. Avoid brittle class selectors.
4. Runtime census example for Playwright (in a local test/script, execute per visible state):

```ts
const visible = page.locator('button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="option"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])');
for (const el of await visible.all()) {
  if (!(await el.isVisible())) continue;
  // Derive name/role; record reachability, preconditions and intended behavior.
  // DO NOT auto-click all nodes: destructive mutations require an isolated fixture.
}
```

5. Recollect after navigation, select, expanded rows, open dialog, editing mode, errors, retry and network transition. The agent must visibly **interact** with every safe reachable control at least once, and document oracles. Static grep/DOM evaluation without a click is not enough.
6. Reconcile `coverage.csv` against (a) static AST candidate inventory, (b) runtime reachable controls and (c) the current official 351-case matrix. Different branch/deployment/roles require different rows. Use stable IDs, not total raw DOM node count, for coverage percentages.

## Safe provider/integration tests

- **Google Maps:** authorization/billing/read API may be chargeable. Use deliberately bounded queries (a few representative queries) in an explicitly authorized test environment. Don't brute-force or stress live provider. Verify actual map tiles/markers and geocoded result coordinates, not just provider SDK initialization. When key/config not available, record `BLOCKED_LIVE_PROVIDER` and still test mocked failures separately.
- **Google OAuth avatar:** use consenting dedicated test identity, redact the `photoURL` and tokens. Verify `img.complete`, `naturalWidth`, visible dimensions and failed image request/CSP. For invalid URL use a test-only profile fixture; do not mutate another user's Auth record.
- **Firebase RTDB/Firestore:** emulator or isolated staging for writes; verify listener teardown, role policies, history projections and no extra writes. Never seed or delete actual deployed testing/production data by default.
- **Maps search backend:** confirm frontend exact URL, token, debounce, response shape; then backend dependency and actual provider response. A 200 with `{results:[]}` for a deliberately obscure query may be expected; a lack of UI suggestions for any query needs controlled cross-check before diagnosis.
- **GNSS:** replay telemetry only through dedicated emulator/mock endpoints; never post faked positions into a live ride. Real RF, thermal, brownout, actual moving bus, TLS and hotspot acceptance require separate supervised field work (#245/#300).
- **Privacy/security:** never create real account-deletion requests or false live emergency messages to test behavior. Do not commit secrets, unredacted user location, images or session cookies.

## E2E instrumentation requirements

- Use a browser tool capable of DOM snapshots, click/typing, screenshots, console + request/response capture. Playwright is preferred for repeatability. If an agent only has source tools and no browser, limit conclusions to `STATIC`/`UNIT`, and clearly report `BLOCKED_BROWSER`.
- For each test record requested URL/route, persona, viewport, scenario, network condition, provider mode and exact run timestamp. Use real assertions: visible UI data, fetched image loaded, API request observed, persisted save after refresh, Firebase snapshot where available.
- Enable trace on failure and screenshot on failure; use video when fixing hard-to-reproduce race. Redact token/auth header, PII, photo URLs, exact location histories, and secret config **before** attaching. Store sanitized network transcript statuses/paths (without search personal data).
- Don't use arbitrary long waits; wait for semantic element or specific network response with a documented timeout. For Places, accommodate its ~300ms debounce and a configured provider network timeout.
- Verify no accidental extra calls/duplicated save after retries; limit provider calls and report counts.
- If a bug exists intermittently, capture attempts/trials and conditions. If it cannot be reproduced, mark `INCONCLUSIVE` and preserve observation, not false PASS.

## Manual browser vs automation

An agent's role is active execution, not just generation of Playwright specs. If tests are written but not run, their status is `NOT_RUN`. After a run, inspect actual report/trace to distinguish skipped, xfail, retry and false oracles. Don't infer working buttons from green unit suite. Use quick static failures to prioritize but always verify user-observed behavior in real rendered UI.

## Suggested test sequence

1. Snapshot source/environment and auth fixtures.
2. Baseline unit/build/lint and existing QA checks (do not block UI execution if one fails; record and continue where safe).
3. Guest and passenger screen sweep including real avatar and full route/join/tracking workflows.
4. Admin tab sweep; prioritize Places search, create/edit/reload, Fleet CRUD, Live Ops service, History/Feedback/Settings.
5. Controlled errors/slow responses/races and reload/multitab.
6. Live provider bounded checks if authorized; separate hardware gates.
7. Coverage reconciliation; reproduce/triage/fix only when asked; retest all neighboring flows.

## Common dangerous false positives and false negatives

- Failed photo because test uses dummy `photoURL` is not evidence that Google OAuth always fails; a real 200 image is a different result.
- Mock Places success proves UI binding, not Google provider or backend config.
- A canceled in-flight Places request can appear as network error in browser tools; don't report it as app failure if cancellation was intentional and stale results were fenced.
- Firebase emulator permits operations differently from deployed project with mismatched rules/App Check; measure each tier.
- A 503 from `/health` can be a dependency issue, not a non-clicking UI button; still report the user-visible failure and environment diagnosis separately.
- Click succeeded but no persisted change after reload: FAIL, even if toast says "Saved".
- A disabled control due to expected state must have its disabled semantics tested; mark non-applicable click, not broken.
- Tests that directly call internal handlers are not evidence that touch targets receive pointer events; actual pointer click/tap is essential.
- A passing desktop screen can hide a clipped mobile-only drawer or keyboard obstruction.

Expected injected errors must be linked to their planned fault row. Distinguish those request/console failures from unexpected runtime errors; do not file a fake-provider quota rejection as a new application defect when the UI and storage recovery oracle passes.


---

# Included document: references/FAILURE-ORACLES.md

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


---

# Included document: references/PLAYWRIGHT-RECIPES.md

# Playwright recipes for real-browser checks

Examples are **templates**; bind them to the current checkout's roles, test URL, session fixtures, repo config and selectors. They are not evidence of tests already executed. Prefer editing/adding tests only in the isolated branch/worktree, after reviewing existing suites. Do not run any sample against a shared cloud with live data.

## Capture console and response failures with scrubbing

```ts
import { test, expect } from '@playwright/test';

test('profile image actually decodes', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', e => browserErrors.push(e.message));
  // Use the authorized passenger test auth state / login fixture, NOT a real personal account.
  await page.goto('/passenger');
  await page.getByRole('button', { name: /profile/i }).click(); // replace with actual selector from HEAD
  const image = page.getByRole('img', { name: 'Profile' });
  await expect(image).toBeVisible();
  const loaded = await image.evaluate((img: HTMLImageElement) => ({
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    width: img.getBoundingClientRect().width,
    height: img.getBoundingClientRect().height,
  }));
  expect(loaded.complete).toBe(true);
  expect(loaded.naturalWidth).toBeGreaterThan(0);
  expect(loaded.naturalHeight).toBeGreaterThan(0);
  expect(loaded.width).toBeGreaterThan(0);
  expect(loaded.height).toBeGreaterThan(0);
  expect(browserErrors).toEqual([]);
});
```

If the authenticated test fixture has no `photoURL`, **do not** treat a missing `<img>` as failure; assert the fallback icon instead and mark real-photo scenario BLOCKED until a test user with a valid authorized photo is available. Broken/expired URLs are a separate negative test.

## Live Places search (bounded, explicitly authorized)

```ts
import { test, expect } from '@playwright/test';

test('admin Places input produces a selectable stop', async ({ page }) => {
  // Configure real, authorized admin auth and a disposable route test project first.
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Routes' }).click();
  // Enter Create/Edit using the real UI control from the current source.
  // Check the final form and name against HEAD, not a hardcoded guessed button.
  const input = page.getByRole('searchbox', { name: 'Search for a stop' });
  let searchRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/api/places/search')) {
      searchRequests += 1;
    }
  });
  await input.fill('Ah'); // fewer than three chars: no search expected
  await page.waitForTimeout(450); // only for documenting the debounce negative case
  expect(searchRequests).toBe(0);
  const query = 'Ahmedabad University';
  const match = page.waitForResponse(r => {
    const url = new URL(r.url());
    return url.pathname.endsWith('/api/places/search') &&
      url.searchParams.get('q') === query && r.request().method() === 'GET';
  }, { timeout: 12_000 });
  await input.fill(query);
  const response = await match;
  expect(response.ok()).toBe(true);
  const json = await response.json();
  expect(Array.isArray(json.results)).toBe(true);
  // Verify at least one *real, provider-backed* prediction for chosen query,
  // and click the exact visible result identified from returned test data.
  // Then check stop coordinates, map marker, Deploy/save and reload.
});
```

**Important:** Real Places search can consume billed Google quota. One deterministic sample query per approved environment is enough for a smoke test; inject the larger negative/race matrix via emulator. A `200` with `[]` may be valid, and is not itself proof of a bug. Review no-search-at-2-chars using a request counter; the wait above alone is not a meaningful assertion.

## Every safely reachable click must include an oracle

```ts
const button = page.getByRole('button', { name: 'Send Feedback' });
await expect(button).toBeVisible();
await button.click();
await expect(page.getByRole('dialog')).toBeVisible();
// The close button becomes a *new separate control* in the ledger.
await page.getByRole('button', { name: /cancel|close/i }).click();
await expect(page.getByRole('dialog')).toHaveCount(0);
```

A smoke loop that blindly performs `page.locator('button').all().click()` is unsafe, misses new overlay controls and proves almost nothing. Build a state graph with each action and independent expected effect. Modal Cancel and Confirm are different branches. Do not `force: true` through obscuring overlays; an intercepted click is precisely a user-visible defect to investigate.

## Assertions beyond HTTP 200

- Verify latest request method/path/status and that no unexpected *extra* write occurs.
- For save: make changes, wait for backend acknowledgement, hard reload, reopen object, assert authoritative persisted value.
- For role: verify unauthorized backend mutation actually returns 401/403, not only that nav link is hidden.
- For maps: provider SDK loaded **and real tiles/geometry/marker visibility**, correct coordinates, no map error.
- For mobile: exact viewport with screenshot, active control bounding rect inside accessible scrollport, pointer interaction not intercepted and no horizontal scroll.
- For error: controlled failure produces specific visible alert, retry works after recovery and transient error clears.
- For session: ensure `sessionId` is stable and messaging/boarding cannot cross old/new rides.

## Example evidence artifact

For each click/save/path, write a compact sanitized JSON record with `sha`, `role`, `viewport`, `page`, `control_id`, `precondition`, `action`, `expected`, `observed`, `provider_tier`, `http_status`, `screenshot_path`, `trace_path`, `timestamp`. Prefer Playwright test report and trace ZIP filenames over attaching raw request headers/cookies. Use the evidence path as `evidence_path` in `coverage.csv` and run the coverage gate.


---

# Included document: references/PR-323-REGRESSIONS.md

# PR #323 and exhaustive interaction completion

The original review target was c5a3c820d87f6c2ddbb64189400d43d75d20df1c. Always fetch the current PR head and record its full SHA plus local diff before retesting. Never relabel results from baseline 454a696 or from another head as current acceptance. The ZIP supplied as Eki-Interaction-Audit-2026-10-13-454a696 is byte-identical to the earlier audit (577 files), so it supplies corroborating artifacts, not a second independent campaign. Read raw action evidence and failure traces; wrapper tests that catch exceptions can pass while individual actions fail.

An existing server at port 3000 may still serve the original `testing` checkout.
Before accepting PR results, prove the served frontend and backend correspond to
the recorded checkout/diff (owned server working directories, matching build
manifest or explicit revision metadata). If the running server cannot be matched,
record that as an unverified environment and start an owned isolated server for
the target revision. Do not silently label an older running app as the PR head.

## Mandatory focused oracles

- **Profile photo:** open the actual passenger Profile, capture the visible photo after genuine sign-in if authorized, and verify `complete && naturalWidth > 0`, nonzero displayed bounds and no occlusion. Test controlled valid, missing, 403, 404, offline and malformed/decode-error images on owned disposable identities. A failed image must disappear and an accessible default profile icon must appear. Change URL after a failure and switch users with the same URL: the new identity/URL must retry. Reload and revisit Profile. Do not copy URLs/tokens into public evidence; a synthetic image is not Google OAuth proof.
- **Board/chat geometry:** at 360×800, 390×844, 768×1024 and 1280×800, expand all boarding inputs while chat is available. Verify `elementFromPoint` at Board centre resolves to Board/its child, then tap normally; assert intended session membership is written exactly once, wrong code and distant position write nothing, corrected retry works, reload restores the same membership. Open/close live chat before and after boarding, send a message and verify stored/delivered text and identity. Test long route/stop labels, zoom/text enlargement, keyboard, safe-area navigation and landscape. A keyboard workaround or forced click does not pass pointer coverage.
- **Stop rename:** open existing route editor, start renaming a stop, modify text, press Escape, then Tab/click elsewhere. The input closes, original label remains, canceled text must not reappear through blur. Save/reload and verify original name/short label/coordinates/order. Reopen rename and verify Enter commits, blur commits once, blank validation remains correct, whole-route Cancel changes no store data. Retest reordering, endpoint swap, removing/readding stops, color, Places prediction selection, map picking and save/conflict/retry.
- **Logout:** test passenger and admin logout paths separately: opening, Cancel, Escape and backdrop dismissal do not log out; explicit confirmation signs out exactly once. Verify actual Auth state, private UI/listeners/cache removal, guest redirect, refresh, Back/Forward, other-tab auth propagation and re-login. Inspect viewport-wide dialog geometry, initial focus, Tab/Shift+Tab containment, scroll lock and focus restoration. Never count a mocked `logout()` call alone as rendered logout acceptance.
- **Delete account:** disposable passenger only. Open confirmation from a scrolled/animated profile and verify it is reachable and covers the viewport. Cancel/Escape/backdrop before acceptance send no request or sign-out. During pending request, action is disabled; repeated clicks create no duplicates. Valid `202 {accepted:true}` shows Deletion requested with only OK; OK, Escape and backdrop each close it and sign out (use fresh identity per destructive case). Failures, missing/false/malformed acknowledgement keep the account signed in, show the error, and permit a safe retry. Verify the worker actually deletes Auth/profile/cooldown/passenger request/rate limits/queue after processing, while preserving feedback, messages and indexed/legacy ride entries including stored names/IDs. Accepted means queued, not completed. Retained membership must not authorize Firestore chat reads after the backend-owned profile is removed, even using the same signed token; admin and assigned operator history access must still work. With a still-cached passenger token after worker retirement, verify ride-status reads, boarding updates, new/replayed messages and new/replayed feedback are rejected without writes or recreated rate limits/cooldowns. Attempt profile bootstrap with deleted/disabled Auth and while a deletion request remains: no profile or claims may be recreated. Verify assigned driver/admin chat remains available without a passenger profile. Test other UID spoofing, guest/operator/admin rejection, unchanged identities, changed creation identity, worker pause/restart, bounded pagination and recovery against the actual disposable store. A shared/cloud deletion is BLOCKED absent specific authorization.

## Sweep completion algorithm

1. Build route/component source candidate census and role/state/viewport ledger before actions. Resolve every conditional branch (service present/absent, joining/joined/completed, online/offline, empty/populated, edit/read, collapsed/expanded, pending/error/success, privileged/denied).
2. In each state enumerate visible enabled and disabled buttons, links, inputs, selects, custom options, tabs, switches, stars, map markers, drag/reorder controls, dialogs, close/back/reset/retry actions and portals. Record source ownership and intended oracle, including icon-only controls.
3. Execute each authorized action through the browser. Populate menus/options one at a time, exercise both outcomes of confirmations on disposable data, and follow newly revealed states. Record disabled controls and the fixture transition that enables them. Restore a known fixture between destructive actions.
4. Capture before/action/after with screenshots or redacted trace, semantic locator, UI/focus geometry, relevant request status and authoritative store state. Persist after every action; do not wait until the end to reconstruct evidence. Maintain a graph of states and transitions and a queue of unexplored controls.
5. When the queue is empty, reload/back/forward and inspect again. Compare source candidates with runtime census and ledger: every candidate has explicit executed/blocked/not-run/inapplicable disposition; every runtime action has evidence. A source mapping or suite PASS is not an executed control PASS.
6. Include every case in `docs/testing/WEBAPP_A_Z_AB_TESTING.md` and its plan: scope mismatches remain PARTIAL/NOT_RUN rather than inheriting a whole-case pass from one action. Read the entire plan without truncated command output; stream/parse chunks if necessary.
7. Repeat on mobile and desktop for each role; use the two additional widths for known geometry repairs and any overflow. For every relevant failure mode use deterministic fixture injection (never overload a real provider): empty/invalid/boundary, 401/403/404/409/429/5xx, delayed/lost/stale response, rapid clicks, reload in flight, expiry, auth switching, offline/resume. Tie conditions to actual contracts; record inapplicable reasons instead of inventing unsupported UI.
8. Produce an explicit remaining queue, not a broad statement that everything was clicked. Stop only when all reachable authorized rows are executed and evidence-backed, or a concrete dependency prevents continuation. Missing credentials/browser/provider access is BLOCKED, time-limited unexecuted work is NOT_RUN. A deadline never converts unexecuted work to PASS.

## Evidence tiers and exit verdict

Keep UNIT/MOCK, SYNTHETIC_BROWSER, EMULATOR_BROWSER, NEXT_EXPORT_BROWSER, LIVE_PROVIDER, LIVE_CLOUD and PHYSICAL_GNSS separate. Existing validators may use a smaller approved vocabulary: preserve that schema and describe finer distinctions in evidence rather than silently adding unknown enums. Only the tier required by each acceptance case can satisfy it. Replay positions do not demonstrate physical GNSS; fixture Maps/Places do not demonstrate real tiles/search or quota policy. Genuine OAuth, provider configuration, deployed App Check/CSP/rules/indexes and hardware remain separate gates until actually exercised.

Run the coverage validator, preserve its exit code and summary. A strict gate must remain red/incomplete when FAIL, BLOCKED, NOT_RUN, INCONCLUSIVE, missing evidence or unaccounted source candidates remain. Report executed coverage and accounted inventory separately. Never say 100%, exhaustive completion or release-ready while required rows or higher-tier gates remain unresolved.

## Required report additions

Record target SHA, working diff hash, artifact hashes, environment/roles/fixtures, tools/browser/version, allowed hosts/provider mode, executed actions and oracles, suite counts and per-action counts separately, bug reproductions and retest outcomes, fixture/setup mistakes and corrected runs, provider/cloud/hardware gaps, and complete unexecuted inventory. Scrub authentication headers, cookies, keys, session tokens, real photo URLs and personal travel data before sharing; inspect trace ZIP contents as well as loose text. Include Antigravity's actual browser evidence distinctly from supplemental automation.


---

# Included document: references/REPORTING.md

# Reports and coverage contract

Write actual outputs to `artifacts/qa/interaction-audit/YYYY-MM-DD-SHORTSHA/` (or another explicitly designated run path). Do not add evidence to tracked app source. Create directories only in local clone. Keep all evidence privacy-redacted.

## `coverage.csv` schema

Header provided in `assets/coverage-template.csv`. Every row represents an actual actionable, uniquely identified `(component, state, action, role, viewport, environment)` assertion. **No shared row marking "all buttons pass."**

Required values:
- `status`: `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `INCONCLUSIVE`, `NOT_APPLICABLE`.
- `evidence_tier`: `STATIC`, `UNIT`, `SYNTHETIC_BROWSER`, `EMULATOR_BROWSER`, `LIVE_PROVIDER_BROWSER`, `LIVE_CLOUD`, `PHYSICAL_GNSS`.
- `executed`: `true` only for executed **and asserted** tests, `false` for candidates/blocked/untested.
- `oracle_passed`: `true` only if result matched observable expected behavior. A mock-only PASS is tier-specific.
- `source_id`: copy the exact `id` from the current census candidate; distinct controls on one source line require separate source IDs. Keep `control_id` unique to the action/state assertion. Strict reconciliation checks source ID and its file/line. Re-run the census after source changes.
- `evidence_path`: for PASS, path to a sanitized per-action JSON record described in `PLAYWRIGHT-RECIPES.md`; for FAIL, path to actual JSON/trace/screenshot/report. Paths are relative to the ledger directory unless absolute.
- `source_path`, `source_line`, `locator`, `control_name`, `precondition`, `action`, `expected`, `observed`, `role`, `viewport`, `environment`, `bug_id`, `blocker_reason`.

Every PASS requires `executed=true`, `oracle_passed=true` and nonempty `evidence_path` pointing to a **real per-action JSON file**. The gate checks all documented fields, matches control, page, role, viewport, precondition, action, expected, observed and provider tier against the ledger, and validates commit SHA/timestamp formats. `http_status` is null for actions without an HTTP response; screenshot/trace paths are strings (empty when absent), resolved relative to the JSON record. Referenced files must exist. These are structural checks: a human still needs to verify that the evidence supports the observation. FAIL requires executed and evidence. `NOT_APPLICABLE` must explain proof it no longer exists in current source. BLOCKED must explain exact prerequisite and named owner when possible.

## Mandatory `EXECUTION.md` sections

1. HEAD SHA/branch/local changes, timeframe/timezone, Node/browser/device versions, admin/passenger fixture IDs redacted, frontend/backend addresses and evidence tiers.
2. Commands executed, exit codes, suite counts, skipped/flaky/retry, build/lint/audit outcomes. Include `npm run qa:check` and official A–Z catalog reconcile.
3. Pages/roles/screens/components discovered, source and runtime control counts, total required ledger rows.
4. Results by evidence tier and by feature, with `PASS / FAIL / BLOCKED / NOT_RUN / INCONCLUSIVE / NOT_APPLICABLE` counts; **do not blend tiers**.
5. Highest-priority defects with actual reproduction; environmental blockers; available but unused credentials or tool limitations.
6. Outstanding live provider/browser/physical gates (#245/#300) separate from deterministic outcomes; explicit product-decision unknowns.
7. Exact next execution steps for uncovered rows and risk-based release decision. If any applicable essential browser row is blocked/failing, do not call the app production-ready.

## `BUGS.md` template

```md
### BUG-001: [brief observed symptom]
- Severity/impact: P1/P2/P3 with why
- First observed: YYYY-MM-DD HH:mm TZ, SHA, environment tier
- Surface: passenger/admin, page, viewport, role
- Precondition/test fixture: redacted
- Steps: 1. ... 2. ... 3. ...
- Expected: ...
- Actual: ...
- Evidence: screenshot/trace, redacted request URL path and HTTP code, error/log
- Reproduced: 2/2 (or 1/3 etc.)
- Suspected cause: file:line and supporting proof or `unknown`
- Existing issue/PR linkage: exact URL or `none found`
- Workaround/mitigation: ...
- Regression test: filename/case to add in fix mode
- Status: OPEN / FIXED_UNVERIFIED / RETESTED_PASS / INCONCLUSIVE
```

## Additional outputs

- `control-inventory.json`: AST/source census (candidates; not runtime verified).
- `journey-inventory.md`: state graph, URLs, roles, fixture transitions, visible controls and unvisited branches.
- `coverage-summary.json`: tool-generated stats and gate failures from `scripts/coverage-gate.py`.
- `evidence/`: redacted screenshots, traces, browser logs, failure videos, network status excerpts. Avoid full Firebase dumps/location trails.
- `BUGS.md` with all defects. If none found, write "No defects found in the executed scope" plus unresolved test gaps, never "bug-free".

### Final answer example (numbers must be actual)

> Audited `testing` @ `abcdef0`. Executed 172/205 authorized interactions using emulator browser, 22/205 with real provider checks; 8 reproduced defects (2 P1). 13 blocked on OAuth/provider access and 20 not run. Profile avatar fails for an image 403; route search live provider not exercised. All executed test IDs and evidence in `coverage.csv`. **Release not certified**.
