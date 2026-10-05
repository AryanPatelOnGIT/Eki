# Read-only passenger geometry and bounded admin repair

Last updated: 2026-10-05 17:01 IST (UTC+05:30).

Authenticated `GET /api/routes/:routeId/geometry` returns stored directional
geometry. It never calls Google, starts a repair or writes Firestore, including
when the caller is an administrator. Missing documents return 404, unusable
coordinates return 422, and legacy/missing/invalid directional geometry returns
409 `GEOMETRY_REPAIR_REQUIRED`. Responses use `Cache-Control: private, no-store`;
geometry fields remain allowlisted and internal route fields are not exposed.

## Cache and independent admission

Each API process retains at most 100 route documents (Firestore's individual
document limit is 1 MiB), including negative results, for sixty monotonic seconds.
Concurrent misses share one read per route. Sixteen distinct raw reads and
thirty-two callers per read are admitted; a three-second response deadline
returns 503 `GEOMETRY_READ_UNAVAILABLE` with `Retry-After: 1`. A timed-out raw read
keeps its slot until actual settlement and cannot populate the cache late.
Observed route watcher edits/deletions, watcher failure/stop and successful local
save/delete invalidate these reads. An invalidated in-flight read returns 503;
retry after it settles. If an event has not reached a replica, freshness is
bounded by the cache deadline; this is not a globally atomic watcher contract.

GET/HEAD use the existing verified-UID read budget (200/minute before replica
sharding). They skip the scarce dedicated route-computation budget; mutations
retain the existing verified-UID ten/minute budget and general thirty/minute
mutation budget. Other administrators on the same IP own independent verified
UID budgets. Existing pre-auth IP admission and edge/fleet requirements remain.

## Repair procedure

1. Authenticate as an authorized administrator and load the current route in
   the existing editor. Preserve its metadata and ordered stops.
2. Save through `PUT /api/v2/routes/:routeId` with edit mode, current
   `expectedVersion` (zero for legacy versionless data) and a stable `saveId`.
   Missing/invalid directional geometry is computed independently in each
   direction; valid matching geometry is reused for metadata-only edits.
3. Reconcile the same save operation when its outcome is unknown. A stale
   version or active ride rejects the save; do not substitute a passenger GET
   or silently overwrite newer route data. A successful save advances the
   configuration/geometry versions as specified by the existing save contract.
4. Read the stored geometry again. Ordinary viewers now see the repaired
   snapshot without another provider request.

The shared admin computation pool admits two raw directional pipelines and
eight waiting pipelines, with a two-second undispatched queue age. Each pipeline
has at most four parallel ordered chunks, so at most eight upstream chunk
requests run in this pool per process. Forward and reverse save computations,
legacy admin previews and durable preview operations all share it. Each chunk
keeps its ten-second upstream abort; neither queue expiry nor an ignored abort
frees a dispatched pipeline before settlement. Saturation/queue expiry returns
503 `ROUTING_CAPACITY_EXHAUSTED` and `Retry-After: 1`. Live off-route rerouting uses
its separate provider path (R35); this pool does not claim a fleet-wide quota.

## Evidence and limits

Baseline tests reproduced passenger and admin GET repairs and sixty document
reads for sixty unchanged requests. Fixed HTTP tests cover twelve enumerated
legacy routes with zero provider calls/writes, cached valid reads, authorized
versioned repair and refreshed reads. A stalled-provider test verifies two raw
pipelines, eight waiting, refusal/expiry and retained permits until settlement.
HTTP limiter tests demonstrate sixty reads cannot consume admin mutation tokens.
Cache tests cover fill/waiter bounds, negative caching, invalidation, monotonic
freshness and eviction. An actual loopback Firestore watcher test verifies
coalesced reads and edit/deletion invalidation without Google.

Provider road correctness, real replica propagation/load, fleet budget tuning
and moving-route latency still require suitable staging/live evidence in #245.
Legacy routes can lack road overlays until the administrator repairs them;
accepted telemetry and the existing client fallback remain available. No route
is automatically migrated, no deployed policy or provider quota is changed,
and no firmware, hardware or production action is performed. R34 stays open.

Passenger geometry reads are cached and read-only; explicit versioned admin saves perform legacy repair through bounded computation. See [geometry read/repair contract](../operations/ROUTE_GEOMETRY_READS.md) for fixed bounds, independent quotas and staging limits.
