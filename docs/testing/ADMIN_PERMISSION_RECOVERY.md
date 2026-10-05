# Local admin permission recovery evidence

Last updated: 2026-10-05 17:46 IST (UTC+05:30).

This record extends #204's earlier verified-readiness fix for a second
administrator using localhost. It documents software recovery, not a witnessed
sign-in on the affected administrator's browser.

## Reproduction and change

The initial focused regression run reproduced five failures: persisted role
claims were not refreshed; an admin role string without the trusted admin bit
could publish admin UI; no explicit shared access refresh existed; App Check
recovery did not force a token refresh; and a retry could start another SDK
acquisition after the caller timed out while the first acquisition remained
unsettled. The corresponding focused run passed after the changes.

Protected fleet/routes collection and driver permission retries now run the
same AuthProvider verification as the verification screen's **Try again**.
Concurrent retries share one promise, close the protected data gate, refresh
App Check and trusted ID claims, and reopen subscriptions only on success.
Old verification generations cannot publish listener callbacks. Transient
non-permission listener failures retain their local reconnect behavior.

Admin publication requires both `role: "admin"` and `admin: true` in trusted
Auth claims. Legacy Firestore admin/driver profiles need matching fresh claims;
remembered browser roles cannot grant those workspaces. SDK token acquisition
has a 10-second response deadline and remains shared until actual settlement.
A stalled raw acquisition cannot be multiplied by retry clicks; a repaired
configuration may require a page/frontend restart.

## Read-only project diagnosis

On 5 October, a bounded read-only profile/Auth lookup found the affected second
administrator enabled, with both trusted admin claims already synchronized.
The local frontend/backend project IDs matched. Firestore App Check was
enforced; the configured local development path used an explicit debug token
with no site key or development opt-out. Deployed fleet and route rules allowed
authenticated reads. Deployed rules differed from current testing.

These observations rule out a missing server-side admin claim as the current
explanation. They do not establish the affected browser's installed source,
token freshness, debug enrollment, or provider/network success. No claims,
Console settings, deployed rules or project data were changed. No credentials,
token values or account identifiers are recorded here.

## Verification and remaining acceptance

- Focused auth/App Check/collection/driver/guard suite: 47 passing cases.
- Actual AuthProvider, App Check wrapper, RoleGuard, collection hook, feedback
  panel and API client: 12 passing mobile/desktop browser cases with synthetic
  SDK transport and HTTP responses. The denied fleet/routes case confirms one
  forced refresh, no extra reads while verification is pending, and recovered
  snapshots after approval.
- Local lint, strict production build (TypeScript, export, service worker, CSP),
  783 backend and 447 frontend cases, 59 script checks, 70-operation OpenAPI,
  UI contracts, 24 actual Firebase emulator cases, 19 mirror checks and
  dependency audit (zero vulnerabilities) pass. Exact PR-head and merged CI
  are recorded in the PR/issues after execution.

To establish account acceptance, restart a current testing frontend with the
matching Firebase project and enrolled local App Check provider/debug token,
then sign in as the affected administrator and open Fleet and Routes. If a
read fails, exercise **Retry** and record the redacted outcome. Backend reachability
is additionally required for feedback/settings writes. See
[configuration](../CONFIGURATION.md#local-app-check-and-auth-setup).

#204 and #245 stay open until their real-browser/environment requirements are
observed. Neither a synthetic browser nor unit tests certify enrollment,
deployment, live GNSS latency or moving-route acceptance. No ESP32/GNSS is
needed for this admin browser acceptance.
