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
