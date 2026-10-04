# Issue #246 priority software verification — 5 October 2026

Current merge and acceptance status belongs to [issue #246](https://github.com/notnamansinha/Eki/issues/246).
This record covers the requested R01–R11 and R25 continuation. Each part has its
own PR and exact-head CI before merging into `testing`. Update this record with
each part's actual implementation and evidence; an entry does not certify deployment.

| Part | Implementation and local verification |
|---|---|
| R01 | CORS/preflight precedes generous IP ingress; verified UID owns independent reads and mutations. GET/HEAD polling does not spend writes. Route/Places quotas use verified UID, and scoped device/probe exemptions retain their authorization. Actual HTTP admission tests cover shared IPs, forged credentials, CORS on ingress rejection, polling, device methods and non-admin health denial. All 636 backend cases passed; 7 emulator-only cases run separately in CI. All 59 script cases, 61-operation OpenAPI coverage, backend lint and TypeScript pass. The actual ride-session mount harness verifies 35 reads followed by all 30 writes and rejection of write 31, for three resource paths. |

The previous six selected parts and their evidence remain in
[the 4 October record](ISSUE_246_SELECTED_PARTS_2026_10_04.md).
API policy changes are reflected in `backend/API.md`, its generated mirror,
`backend/openapi.json`, the HTTP contract and low-level design.

Stationary baseline: COM3 was read without flash, reboot or serial writes.
Twenty GNSS/telemetry samples from the previously installed firmware received
HTTP 202. Private raw captures remain ignored; this is baseline connectivity
evidence, not acceptance of newly built firmware or moving behavior.
[Issue #245](https://github.com/notnamansinha/Eki/issues/245) retains moving,
physical fault, secure-board and rollout gates. R25 bench evidence must name
the actual installed build before it can certify that implementation.
