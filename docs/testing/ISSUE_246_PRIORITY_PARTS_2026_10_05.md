# Issue #246 priority software verification — 5 October 2026

Current merge and acceptance status belongs to [issue #246](https://github.com/notnamansinha/Eki/issues/246).
This record covers the requested R01–R11 and R25 continuation. Each part has its
own PR and exact-head CI before merging into `testing`. Update this record with
each part's actual implementation and evidence; an entry does not certify deployment.

| Part | Implementation and local verification |
|---|---|
| R01 | CORS/preflight precedes generous IP ingress; verified UID owns independent reads and mutations. GET/HEAD polling does not spend writes. Route/Places quotas use verified UID, and scoped device/probe exemptions retain their authorization. Actual HTTP admission tests cover shared IPs, forged credentials, CORS on ingress rejection, polling, device methods and non-admin health denial. All 636 backend cases passed; 7 emulator-only cases run separately in CI. All 59 script cases, 61-operation OpenAPI coverage, backend lint and TypeScript pass. The actual ride-session mount harness verifies 35 reads followed by all 30 writes and rejection of write 31, for three resource paths. |
| R04 | Readiness requires a true RTDB connected snapshot, bounded per-store single-flight probes and monotonic freshness. A timed-out underlying call keeps its slot until settlement; late results never republish success. `/live` stays independent of Firebase and is Docker's restart check; `/health` remains traffic readiness. Ten health regressions pass, including malformed/false snapshots, stalled repeated probes, late success and freshness expiry. All 646 backend cases and 59 script cases pass; OpenAPI now covers 62 operations. Backend lint and TypeScript pass. Three request-auth regressions and the actual admission/admin pipeline confirm one verification per request, fresh checks on later requests, and denial of injected identities/changed tokens. CI container smoke checks degraded readiness, successful liveness and the actual image healthcheck. |

The previous six selected parts and their evidence remain in
[the 4 October record](ISSUE_246_SELECTED_PARTS_2026_10_04.md).
R01 is merged in [PR #254](https://github.com/notnamansinha/Eki/pull/254);
R04 and its request-authentication correction are merged in
[PR #255](https://github.com/notnamansinha/Eki/pull/255).
API policy changes are reflected in `backend/API.md`, its generated mirror,
`backend/openapi.json`, the HTTP contract and low-level design.

R05: device/digest misses share one bounded registry/KDF fill. Sixteen unsettled
fills and 64 waiting callers per digest cap retained work; a 5s monotonic
response deadline keeps the underlying slot occupied until real settlement.
Positive/negative TTLs remain at most 60s/5s from fill start. Invalidation fences
in-flight work across all digests; listener failure clears cached authorization.
Detailed admin health exposes only fill/waiter counts. Targeted verification:
45 cases across the actual credential service and bounded-fill helper, including
20 identical callers, wrong-secret isolation, rotation/reassignment during device
and post-KDF registry reads, failed-fill recovery, positive/negative expiry,
listener failure, overload and timed-out retry amplification. Full local checks:
659 backend cases, all 59 script cases, OpenAPI 62 operations, lint and TypeScript.

Stationary baseline: COM3 was read without flash, reboot or serial writes.
Twenty GNSS/telemetry samples from the previously installed firmware received
HTTP 202. Private raw captures remain ignored; this is baseline connectivity
evidence, not acceptance of newly built firmware or moving behavior.
[Issue #245](https://github.com/notnamansinha/Eki/issues/245) retains moving,
physical fault, secure-board and rollout gates. R25 bench evidence must name
the actual installed build before it can certify that implementation.
