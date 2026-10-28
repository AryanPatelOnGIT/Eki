# Failed live reroutes (issue #246 R35)

Last updated: 2026-10-26 00:21 IST (UTC+05:30).

Live rerouting is still driven by fresh accepted telemetry. It does not use
retry timers, replay old positions or block ingestion while routing is pending.

Each active ride stores `rerouteRetry` in its RTDB node: a context fingerprint,
consecutive attempt count (`failures`) and `nextAttemptAt` in server wall-clock
milliseconds. The context covers session, direction, active route version and
route configuration/geometry. RTDB claim transactions reserve the next delay
before provider dispatch. Failed requests extend that delay from completion.
The jitter value is selected outside transaction callbacks, which may replay.

Equal jitter chooses a delay between half and all of the exponential ceiling:
5–10 seconds after the first failure, 10–20 after the second, then 20–40,
40–80, 80–160 and finally 150–300 seconds. Counts saturate at 32 and the
maximum delay is five minutes. Existing telemetry continues to update during
backoff. Persisted retry state survives replica/process restarts.

Successful reroute publication, confident recovery onto the route, and relevant
session/direction/geometry changes clear the per-ride retry state. A queued
request carries its expected session; a replacement session cannot inherit the
request even if its route version happens to match. Request/session/version,
active status and direction guards protect failure and success publication.

A process-wide provider circuit opens after five consecutive failed geometry
operations. The first pause is jittered to 30–60 seconds. A failed recovery
probe doubles the pause up to a five-minute ceiling. Only one probe may run
after the pause; a successful provider response closes the circuit. Late
responses from the previous circuit generation cannot close a newer circuit.
Rejected RTDB claims and invalid itineraries do not count as provider failures;
geometry publication errors do not count either. Already dispatched operations
may finish after the circuit opens. The existing scheduler allows at most two
concurrent reroutes per process.

Circuit state is local to each backend replica and resets on restart. It is a
failure budget, not a global billing quota; a geometry operation may contain
multiple provider calls for long itineraries. Per-ride RTDB backoff is shared
across replicas, but this change does not introduce a distributed provider
circuit.

A `REROUTING` claim whose `lastRerouteAttemptAt` is more than 60 seconds old
(or missing) is treated as lost, for example after a replica restarted between
claim and release. The next accepted fix evaluates adherence as `OFF_ROUTE`, so
a still-deviating ride can claim a new request subject to the persisted backoff
and provider circuit. A late result from the lost request fails its request-ID
guard.

Provider geometry is published only when it decodes to at least two points
and, for a deviation reroute, the triggering fix matches it within the 45 m
route-match distance. Otherwise the request is released as failed under the
persisted backoff (the provider call itself still counts as a success for the
circuit). Without this, a bus on a road the provider does not know was snapped
to distant geometry, immediately confirmed off-route again and, because
publication clears the backoff, re-dispatched a billable request on every fix.

The authenticated route-processing health status exposes provider failures,
rejected admissions, probe state and remaining circuit delay under
`rerouting.provider`. Inspect those counters alongside background rerouting
errors when diagnosing provider outages. A restored provider is probed on the
next eligible telemetry event, subject to both ride backoff and circuit delay.
Changing a ride does not bypass an open provider circuit.

## Validation

Mocked Firebase/provider tests run the actual matcher and reroute scheduler
with one accepted off-route fix per simulated second and maximum jitter.
Against testing `9579cdc`, sixty seconds of provider failures dispatch twelve
geometry operations. The changed implementation dispatches three at 0, 10 and
30 seconds (75% fewer); the next eligible attempt is at 70 seconds. This is a
controlled failure simulation, not a measured production cost estimate.

Tests also cover fleet failure budgets, exponential caps and jitter, restart
persistence, successful publication, recovery, route edits, cancellation of
claims, one recovery probe, and queued/late work crossing session boundaries.
No live provider calls, Firebase mutation, deployment or device flash is
required for these checks.

```sh
cd backend
npx vitest run src/services/rerouteRetry.test.ts src/services/rerouteBackoff.integration.test.ts src/services/telemetryRouteService.test.ts src/lib/liveRouteContext.test.ts
```
