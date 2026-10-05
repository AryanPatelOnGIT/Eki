# Versioned telemetry route catalog

Last updated: 2026-10-05 16:32 IST (UTC+05:30).

Telemetry matching and pending-direction inference use the same read-only route
catalog on every API replica. The existing Firestore watcher publishes decoded
forward/reverse geometry, stops and route/geometry versions directly from its
snapshots. It no longer merely invalidates data and then rereads the document.
Unchanged pending fixes reuse that data rather than forcing a fresh read per fix.

## Freshness and invalidation

The positive/negative catalog and generation tombstones each retain at most 1000
LRU entries. Freshness uses a five-minute monotonic deadline. Missing/expired
entries share one in-flight point read per route, including pending directions.
A fingerprint of configuration/geometry versions, normalized stops and geometry
also invalidates changed data found by a freshness read when an event was missed.
Unique process generations prevent an evicted identity from reviving old work.
In-flight read cleanup compares promise identity before clearing a newer fill.

Observed edits/deletions increment the local generation and immediately publish
the current snapshot or a negative entry. Stop or watcher failure invalidates
existing entries/loads. Reconnect retains the existing 1–30 second backoff and
rejects callbacks from an older subscription; its initial snapshot removes
catalog entries absent from the current collection. Unavailable watchers require
fresh reads. The listener still watches the route collection: this change does
not claim zero snapshot billing or a paginated Firebase watch transport.

Direction/matching/reroute callbacks recheck their local catalog generation.
Durable session-direction transactions additionally read the current route in
their read set and compare its versions/stop signature before writing session
and lock fields. A definitive refusal resets only the same still-provisional,
pre-departure RTDB projection, preserving newer telemetry/session/direction.
An unknown commit exception never triggers that reset: a later fix reconciles
the committed direction and marks its projection synchronized. Already active
rides keep their existing direction; this does not re-infer a moving session.

RTDB callbacks allow an initially empty local SDK cache to retry against the
server value, then apply the usual timestamp/session/version predicates. The
actual emulator reproduced the previous abort-before-server behavior. Reroute
pointer publication rechecks generation after asynchronous sibling storage, so
an observed edit cannot publish the obsolete pointer. A discarded sibling can
remain unreferenced until normal retention; no newer session is overwritten.

## Missing legacy geometry

Loading configured route data never invokes Google or persists legacy geometry repair. Eligible off-route rerouting retains its separate provider path (R35).
A route missing valid forward/reverse geometry is negatively cached and leaves
accepted raw telemetry/lifecycle data intact, with matching/direction unavailable
until authorized administration repairs it. Existing authenticated route save
already computes missing directional geometry. Passenger geometry GET repair is
a separate R13 item; this R12 change does not claim that adapter is read-only.
No provider request that was already dispatched can be recalled.

## Evidence and live limits

Five baseline regressions reproduced sixty document reads for sixty unchanged
unresolved fixes, duplicate concurrent reads, unused watcher data, billable legacy
repair and redundant reads after edits. Fixed regressions also check monotonic
refresh coalescing, old subscription callbacks, transaction retry fences and
route editing during reroute sibling publication.

Actual loopback Firestore/RTDB checks stream a route then process sixty pending
fixes with zero additional explicit route point reads or Google calls, observe
edited/deleted endpoints, and persist the same armed session direction/lock with
current-route transaction checks. Another holds watcher delivery after a real
edit and verifies obsolete durable direction is refused and its provisional
projection reset. A third injects acknowledgement loss after a real direction
commit and verifies recovery without rollback or a second session.

These use synthetic coordinates/provider dependencies, no physical GNSS/ESP32
and no live project. Watcher delivery latency and cross-store publication are
not globally atomic across replicas. Suitable staging still must measure edit/
delete propagation, reconnect/read billing, provider/road correctness, replica
load and moving-route ordering. Those remain #245/R34 acceptance; source and
emulator checks do not certify a moving route or production capacity.
