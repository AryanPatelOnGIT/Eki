# HTTP contract and compatibility checks

The machine-readable contract is [`backend/openapi.json`](../../backend/openapi.json),
in OpenAPI 3.1.1 JSON format. [`backend/API.md`](../../backend/API.md) remains the
human-oriented guide. The contract includes #197 compatibility, #193
ride-session resources and #194 operation resources: 39 original method/path handlers, six compatible v2 aliases, eight ride-session resources and six operation resources, for
59 operations. It does not claim those aliases are already deployed. Reconcile
against the target branch after #197 merges. Endpoint renaming alone does not
improve latency; measure only changes in response shape, caching, or transport.

Run from the repository root:

```sh
npm run verify:openapi
npm test
```

The production verification workflow runs the contract check explicitly, and
`npm test` runs it too. The checker parses TypeScript registrations in
`backend/src/server.ts`, follows imported default/named routers and their
mount prefixes, and compares method/path pairs in both directions. It never
boots the server, starts workers, or reads Firebase. New routes, stale spec
entries, duplicate registrations, broken references, missing path parameters,
and missing policy metadata fail the gate. Dynamic paths/mounts, mountless
middleware chains, `router.route()` and `router.all()` fail until the inventory
supports them explicitly. Automatic
Express HEAD handling and CORS OPTIONS responses are middleware behavior,
not separately registered business operations. TRACE/CONNECT are rejected
with 405; unknown routes have Express's default 404 behavior.

OpenAPI structural validation uses Swagger Parser; response and payload
conformance uses Ajv's JSON Schema 2020 validator. The parser remains on 12.x
because the repository pins the 4.x js-yaml API; 13.x requires a different
js-yaml API. The pinned yaml patch is updated to 4.3.2. Validation resolves only
internal references and has no network dependency. JSON Schema expresses
shape/range constraints; database eligibility, normalized string limits,
relative timestamps, stop order, and cross-field/version checks remain in
handlers and are documented in operation descriptions.

Each operation declares `security` and these `x-` extensions:

| Extension | Meaning |
|---|---|
| `x-auth-class` | Public, Firebase user, admin, passenger, assigned operator, or session member policy beyond token validity |
| `x-body-limit-bytes` | Maximum raw JSON bytes parsed, not the normalized object size |
| `x-rate-limit` | Global, mount-level, dedicated and durable budgets actually applied |
| `x-cache-policy` | Actual response headers and private server cache behavior |
| `x-timeout-policy` | Receipt/upstream/client deadlines; no invented whole-handler SLA |
| `x-retry-policy` | Retryable failures and reconciliation guidance |
| `x-idempotency` | Actual replay key or convergent behavior, including repeated side effects |
| `x-compatibility-alias-of` | Replacement operation for a supported legacy URL |

Bearer security identifies a Firebase ID token; it does not imply admin rights.
Device security is a header API key whose complete value is
`Authorization: Device <secret>`. Device credentials are never bearer tokens.
Responses omit credentials and stacks. Typical errors have `error`; route and
Places errors may additionally carry `code`, `phase`, version/outcome details.
Parser and authentication failures can precede handler-specific headers/errors.
On detailed health, 503 can be a readiness snapshot or authentication-busy error.

The server applies strict JSON parsers: 16 KiB generally, telemetry 512 bytes,
diagnostics 1 KiB. Global rate limiting is 200/identity/minute; many mounts also
apply 30/identity/minute even to GETs. `/api/routes` applies the 10/IP/minute
compute budget to geometry reads and deletion too; save-operation reads skip
that budget. Segment planning uses 30/IP/minute. Places has an unsharded
20/IP/minute limiter. Device ingress has separate pre-auth IP pools and an
authenticated telemetry budget. Read the per-operation policies before
designing polling or retries; edge rate protection remains a deployment concern.

HTTP requestTimeout bounds receipt of a request body, not service execution.
Places uses a 5-second whole-response upstream deadline. Google Routes chunks
use 10-second deadlines; route save has a 30-second operation lease and the
browser reconciles unknown outcomes using the same save ID. Current 202 route
responses carry `retryAfterMs`; they do not yet emit `Location` or `Retry-After`.
Fleet audit fingerprints are audit records, not durable HTTP replay guarantees.

## Realtime channels are Firebase SDK subscriptions

These channels are deliberately excluded from OpenAPI `paths`. HTTP remains
the authoritative surface for bounded writes. Authentication, Firebase rules,
and App Check configuration for SDK reads apply independently of HTTP auth.

| SDK channel | Data and audience | Recovery |
|---|---|---|
| RTDB `activeBuses` | Shared authenticated live-bus projection for browser maps; never includes boarding codes/device secrets | SDK reconnect; frontend stale/freshness checks; HTTP bus snapshot is a fallback |
| Firestore `settings/global` | Service configuration and announcements | SDK listener snapshot/reconnect |
| Firestore `routes` | Route configuration allowed by security rules | SDK listener snapshot/reconnect |
| Firestore `ride_sessions/{id}/messages` | Authorized session chat | SDK listener reconnect; writes use idempotent HTTP message creation |
| Firestore ride history and feedback queries | User/admin views constrained by query shape and rules | SDK listener reconnect; writes remain backend-authoritative |

No application-owned SSE/WebSocket/GraphQL/webhook interface is introduced.
Transport decisions and measurements remain #195. Ride-session compatibility
is specified by #193; operation contracts extend #172 under #194.

## Compatibility and rollout

| Supported legacy operation | Compatible v2 operation | Mapping |
|---|---|---|
| `PUT /api/settings` | `PATCH /api/v2/settings/global` | Same nonempty partial settings object; PUT remains a historical partial merge |
| `POST /api/plan` | `GET /api/v2/routes/{routeId}/segments` | `startStopId/endStopId/viaStopId` become query `from/to/via` |
| `GET /api/routes-list` | `GET /api/v2/routes` | Same bounded metadata/stops projection; no geometry |
| `POST /api/devices/{deviceId}/disable` | `PATCH /api/v2/devices/{deviceId}` | v2 accepts only `{ "enabled": false }` |
| `PATCH /api/feedback/{feedbackId}/status` | `PATCH /api/v2/feedback/{feedbackId}` | Same status-only object and server audit |
| `POST /api/privacy/deletion-request` | `POST /api/v2/privacy-deletion-requests` | Token-derived queue entry; v2 accepts absent body or `{}` only |

1. Review/merge #197, deploy the compatible backend first, and smoke-test both
   legacy and v2 paths with their actual role/credential classes.
2. Only after compatible deployment, move browser callers in the #192 follow-up.
   Keep legacy paths throughout the documented compatibility window and rollback.
3. Preserve firmware-called telemetry, diagnostics POST, and firmware GET paths.
   Firmware keeps the current nine-field and previous eight/six-field schemas
   until physical fleet diagnostics confirm rollout. Never remove compatibility
   just because the web frontend migrated.
4. Retirement requires supported-client traffic evidence, fleet inventory,
   announced release notes and owner approval. The #197 policy requires at least
   90 days after frontend migration and 30 consecutive days without supported
   clients using legacy URLs; no calendar removal date is
   scheduled here. Add a separate removal change and update the spec and tests.

## Contract test boundaries

Existing route suites validate real local HTTP responses against the published
schemas for telemetry/diagnostics acknowledgements, OTA descriptors and 204s,
ride boarding and shift lifecycle/delay, route-save replay/processing/conflicts,
settings partial merge, feedback status, route planning and v2 compatibility.
Those suites keep their authorization, validation, race, idempotency and
rate-limit assertions. They use mocked Firebase/upstream services; they do not
prove deployment, real firmware transport, or Google/Firebase latency.

Payload conformance tests compare current/previous firmware shapes and bounded
settings inputs against the actual parsers/handlers. Negative tests demonstrate
that undocumented statuses, malformed responses and route drift fail. Flexible
stored Firestore/RTDB projections permit extra fields where existing records
vary; closed firmware and status/settings request shapes remain strict.

When adding a route, update the spec in the same change, preserve role and
service semantics, provide a schema-backed route test for risky behavior, and
update the human guide when client guidance changes. Avoid introducing a runtime
validator into production just to satisfy this documentation issue.

Ride-session lifecycle, creation-key retention and migration decisions are defined
in [RIDE_SESSION_CONTRACT.md](RIDE_SESSION_CONTRACT.md).

Operation states, budgets, retention and crash recovery are documented in
[OPERATION_RESOURCES.md](OPERATION_RESOURCES.md).
