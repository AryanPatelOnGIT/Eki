# Disposable HTTP authorization sweep

Last updated: 2026-10-12 16:00 IST (UTC+05:30).

`npm run qa:api` runs the actual compiled backend against disposable demo
Auth/Firestore/RTDB emulators. This is L2 HTTP integration, with no browser UI,
real OAuth, provider or App Check attestation claim. It is separate from L3
component/browser acceptance.

The sweep derives methods and paths from the current OpenAPI document, whose
registrations are independently reconciled with source by `verify:openapi`.
At implementation, 71 operations include two public probes, 69 protected
operations and 41 admin-only operations. New documented protected/admin
operations automatically enter their corresponding negative partitions.

Four named Node tests cover:

1. Every protected operation without credentials: exact 401 JSON.
2. Every protected operation with a malformed bearer credential: exact 401 JSON.
3. Every admin-only operation with a genuine locally issued passenger ID token:
   exact 403 JSON; middleware and token validation are not mocked as passing.
4. Actual minimal public liveness/readiness JSON and `no-store`, plus configured
   and disallowed-origin OPTIONS responses without credential reflection.

Each partition starts a fresh owned backend process. This preserves the real
rate-limit policy while preventing earlier negative requests from consuming a
later partition's quota. A PID witness refuses reuse of another server. Node
socket/DNS guards require literal loopback transport before SDK imports; the
fixture provider adapter cannot contact real providers. The test-only control
listener is separate from production Express routes.

Denied requests must preserve the selected application collections, Auth
account claims and `activeBuses` snapshot. The selected collections include
sessions, routes, fleet, users, feedback, devices/diagnostics, active locks,
privacy and route/fleet operation journals. Worker leases, metrics and every
possible future collection are not included in that assertion. Synthetic
provider-call counts must remain zero. Tokens, request headers and private
snapshots are not written to the operation observation artifact.

The collector retains JSON and JUnit test identities, sanitized request/status
observations, backend logs and Markdown with exact source SHA, dirty state and
timestamps. Missing identities, a nonzero runner, failed drain or incomplete
four-test execution cannot become green. Current-source aggregation maps only
the limited H02/H03/H11/H12/H13/H18 sub-oracles and leaves full acceptance open.

## Reproduce

Use a clean Linux checkout, Node 24, locked dependencies and Java 21. The
configuration preflight rejects genuine Firebase/provider credentials.

```sh
npm ci
npm run qa:api
```

Results are under `artifacts/qa/api-*`. The backend is built before the demo
emulator launcher starts. Windows emulator transport limitations remain
explicitly blocked if setup cannot execute.

## Remaining authorization work

Expiry/revocation, valid-but-wrong Device secrets, assigned/unassigned operators,
resource ownership, App Check attestation, full error/log/OTLP redaction,
query/body/parser partitions, private-cache behavior and proxy/HEAD/tunnel
semantics are not closed by this sweep. Other focused tests may cover parts of
those behaviors; they need reviewed source-attributed mappings and current
execution evidence. These are software/provider tasks, not live-motion gates.
