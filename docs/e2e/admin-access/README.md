# Admin access browser regression checks

Last updated: 2026-10-29 02:26 IST (UTC+05:30).

Run `npx playwright test --config playwright.admin-access.config.ts` from the repository root. Install the matching Chromium with `npx playwright install chromium` if necessary.

These checks render the actual AuthProvider, RoleGuard, collection hook, feedback panel, API client and application CSS at mobile and desktop widths. The Firebase SDK transport (including the direct Firestore feedback reads/writes) and HTTP responses are synthetic adapters; no real credentials, console settings or Firebase data are used. They cover delayed verification, visible role-verification failure with in-place recovery, standalone and embedded feedback loading, denied-read retry, rejected and acknowledged status writes, account switching, and fresh verification of the same account. The metadata scenario injects denied fleet and route reads, requests both retries together, verifies one forced security refresh and no premature subscriptions, then observes recovered snapshots.

They do not attest deployed origins/CORS, deployed Firestore rules, revoked credentials against a real project, live browser quota behavior or hardware acceptance. Those remain #204/#245. Backend unit tests separately execute the actual admin middleware and the legacy feedback HTTP route (no longer called by the web app) against controlled verifier/database dependencies.

The `?resume` scenario additionally runs the actual RTDB resume hook,
active-bus hook and shared fleet store using synthetic SDK transport and
controlled browser time/visibility. A healthy short tab switch retains fleet
data and read/handshake counts; a 31-second suspension produces one delayed
handshake and a fresh snapshot. The complete suite has 42 mobile/desktop cases,
including the 10 in `resilience.spec.ts`: feedback status writes and slow reads
held across sign-out and account switches never reach the next account, a
dropped read recovers through Retry, and offline/online flapping settles on one
fleet. The default `playwright.config.ts` ignores this folder because it targets
the developer server.
Actual network/PWA throttling and measured reconnect storms remain #245.

The `?recovery` scenario rejects trusted verification with a synthetic network
error. It uses browser offline/online events and ten minutes of virtual time
to verify automatic recovery without reload or sign-in. Protected feedback reads
remain absent until a new trusted role result is approved. This runs the actual
AuthProvider/RoleGuard, with synthetic Firebase and an intercepted feedback
Firestore transport;
it does not simulate a real Firebase provider outage.

The `?dashboard` scenario runs the actual DashboardPanel and CSS with a
synthetic map surface and fleet transport. At 390 × 844 and desktop sizes,
Details must remain reachable below the service form, open its dialog and close
back to a visible fleet control. This guards mobile scroll clipping; it does
not certify Google Maps rendering, which was checked separately in live Chrome.
