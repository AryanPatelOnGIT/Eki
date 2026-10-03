# Passenger preview and operator controls audit — 2026-10-03

This follows the full feature, RTDB field-contract and cold-power audits already included in PR #226. It changes the earlier availability-only card behavior: an online vehicle is inspectable before service starts, even when stationary. It does not create a ride, choose a travel direction, enable boarding/chat or invent an ETA. No live records were deleted, service started, firmware flashed or settings saved during this follow-up.

## Confirmed findings and fixes

| Issue | Problem | Result |
| --- | --- | --- |
| #228 | Available stationary vehicle card disabled; direction-pending ride hid the map | Both open configured-route previews with valid raw GNSS positions. Missing GPS is explicit. Quiet stale availability expires. |
| #229 | Map selection, previous session context and quiet stale ETAs | Filter by selected bus/session, retain device identity as it acquires a session, reset map context on identity/direction changes, expire ETAs without another snapshot. |
| #230 | Successful HTTP response accepted without operation confirmation; uncertain legacy start retries; fabricated card timetable | Validate operation-specific acknowledgements, retain history on failure, use v2 creation with stable retry keys including server failures, block pending starts; show route duration rather than a made-up scheduled clock. |
| #231 | Operator subscription failure indistinguishable from empty personnel; missing keyboard controls | Scoped metadata error/retry, auth/late-callback guards, roving administration tabs and native timeline toggle/Escape/focus/inert content. |
| #232 | Timeline header partly underneath bottom navigation | Sheet clears the full navigation height and safe area. Desktop DOM rectangles confirmed clearance. |

## Coverage and evidence levels

Live checks used the user's testing checkout on port 3000. Patched passenger checks used an isolated fixture on port 3110. These are distinct: the live checkout was not switched to the PR branch. The fixture now runs actual PassengerWorkspace, PassengerMap and RouteTimelineSheet logic with an explicitly labelled synthetic Google Maps SDK adapter. It does not test Google tile rendering, road geometry responses or compositor paint. Boarding, profile, feedback and chat children in that fixture remain placeholders; their actual components have separate interaction regressions.

| Surface | Live browser checks | Patched regression/simulation checks |
| --- | --- | --- |
| Landing/auth and four application pages | Landing sign-in controls; `/`, `/passenger`, `/admin`, `/feedback` respond; authenticated admin/feedback load | Existing auth/domain/role controls and signed-out handling; static export of all pages |
| Passenger home/tracking | Reproduced the disabled available card in the original testing app | Stationary/moving availability, pending/forward/reverse direction, multiple/mixed buses, device-to-session selection, stale/offline/missing/invalid GPS, raw position without stale matching, identity reset, quiet loss and old ETA removal |
| Passenger controls | Original Routes/Profile navigation | Actual Back, Routes, Profile navigation; bus selector, destination selector, recenter, timeline pointer/Enter/Escape/backdrop; hidden panels inert; existing boarding, feedback and messaging suites |
| Live operations | Device/service counts, live details open/Escape and raw telemetry; unarmed chat unavailable; disabled start without assignment | Validated creation replies, same key for uncertain success/server-error retries, pending click guard, strict delay/stop/boarding/message acknowledgements; existing lifecycle/backend tests |
| Routes | Edit, endpoint swap in draft, cancel; delete confirmation/cancel; Google map loads | Existing stop editing/validation/save reconciliation and route deletion protection; no live update/delete submitted |
| Fleet/personnel | Empty vehicle form validation, vehicle/operator edit/cancel, vehicle delete confirmation/cancel | Existing validation, assignment and conflict tests; operator permission/quota/network/auth-readiness retry and principal-change cleanup |
| History | Expand completed history, readable manifest/route log, delete confirmation/cancel | Pending lock/focus, backend errors, invalid acknowledgement keeps record/dialog, active ride cannot be deleted, bounded-query retry |
| Feedback | Admin and dedicated page, type filter empty state and Reset | Type/status/search/reset, JSON status PATCH, authorization failure, strict requested-status acknowledgement; existing feedback form tests |
| Settings | Draft time updates preview; leave without Save | Existing draft/live-snapshot protection, pending lock and failure handling; synthetic settings persistence |
| Keyboard administration | Six tabs accessible by pointer | All six panels, ArrowLeft/Right wrapping, Home/End focus, matching aria-controls and one tab stop |

Final local frontend suite: **354 tests**. Backend suite: **595 tests**, with seven emulator-only tests skipped in ordinary unit runs. Script suite: **52 checks**. Lint, TypeScript and strict production export/SW/CSP validation pass; production dependency audit reports zero findings. PR CI also runs Firebase rules emulators, backend container boot and the unchanged firmware's native/development/signed build gates. CI status must be read for the final pushed commit.

## Network and developer diagnostics

The ngrok inspection snapshot contained 99 completed telemetry requests, all **202 Accepted**, and one request still pending. Agent request duration: p50 **511.71 ms**, p95 **1024.38 ms**, maximum **1425.05 ms**. These durations include upstream handling; they are not device-to-passenger location latency.

Five read-only probes per target returned HTTP 200. Local backend health p50 **2.12 ms**; tunnel health p50 **231.90 ms**. The Windows probe's local development page medians were approximately 2.1 seconds, with feedback maximum 3.49 seconds. These small samples include development compilation, client connection/setup overhead and the probe's environment. They do not establish production throughput or browser paint latency and should not justify changing production smoothing.

Next.js development tools were enabled only with `EKI_DEVTOOLS=true` (default remains hidden). Landing route diagnostics reported static routing/Webpack and no error indicator. Patched landing and synthetic fixture captured no console warnings/errors. The live testing tab captured four transient Firestore `permission-denied` collection warnings during an auth/reload transition; metadata subsequently loaded. Live realtime availability also transitioned through reconnecting/stale states. No quota root cause was inferred from these observations and security rules were not relaxed. Saved logs distinguish this existing live runtime from patched behavior.

The browser control's requested 390×844 override did not produce a verified 390px DOM viewport: measured document width remained 1707px and an image capture showed tiling. The override was reset. **A trustworthy mobile layout acceptance result remains pending**; the desktop clearance result and component keyboard tests must not be presented as mobile proof. A mobile reviewer should open the fixture, choose Device, click its route and verify timeline/navigation clearance, selected stop and Back/Profile at actual phone width.

Chromium Network/Issues panels and a complete HAR were not available through the browser tool; this audit saved captured console logs, Next development diagnostics and independent HTTP/ngrok metadata instead. It cannot certify every possible environment or edge case. Physical power-cut/UART and real moving GPS/mobile-network acceptance remain described in `COLD_POWER_MOTION_AUDIT_2026_10_03.md` and the hardware runbook; this follow-up did not claim to replace them.

## Private logs and reproduction

Ignored evidence: `temp/user-webapp-qa-2026-10-03/` (copied to the primary workspace). It includes sanitized ngrok method/path/status/duration metadata, HTTP probe samples and summary, scoped console captures, fixture state/screenshot, validation/build/audit logs and a SHA-256 manifest. Credentials, auth headers, payloads, user identifiers and precise live coordinates are not published in this report or the issues.

Run the fixture as described in `e2e/fixtures/README.md`. Choose Device for stationary preview, Pending for unresolved direction, Mixed for a service beside an unarmed device, and Multiple for selection after service acquisition. Empty/Completed must not expose an active ride. Select a fresh scenario before quiet-loss experiments; timestamps intentionally expire. Backend mutations are unit/integration tested with synthetic data rather than performed on live history.

Research references informing the interaction review: [user-visible browser assertions](https://playwright.dev/docs/best-practices), [WAI tab keyboard pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), [Next development indicators](https://nextjs.org/docs/pages/api-reference/config/next-config-js/devIndicators), and [ngrok local inspection](https://github.com/ngrok/ngrok-docs/blob/main/share-localhost/inspection.mdx).
