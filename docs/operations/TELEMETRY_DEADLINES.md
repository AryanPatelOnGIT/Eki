# Telemetry execution deadlines

Valid telemetry enters a bounded process-local executor: 8 dispatched pipelines,
32 total waiting requests and 1 waiting request per device. Admission is immediate
or rejected; undispatched queue age is at most 2 seconds. One device has at most
one unsettled dispatched pipeline. Replicas multiply these ceilings.

Each service call starts an 8-second monotonic response budget, including its
queue time. Credentials, authenticated quota and telemetry commit each receive
at most 5 seconds, capped by the remaining response budget. Successful stages
do not reset the response deadline. Node's separate 15-second body-receipt and
70-second header timeouts still apply; the 8-second service budget starts after
validated body parsing, and is not a body/header reception SLA. Wall-clock changes
do not extend execution/response/queue deadlines.

Caller expiry stops undispatched work and further dependency stages. Dispatched
SDK calls cannot safely be recalled. Their actual promises keep the executor
permit and per-device order until settlement. HTTP retries can enter one bounded
waiting slot but cannot launch another pipeline for that device until the old
call settles. Queue expiry removes the waiting payload and its timer/metadata.
Global slots stop a stall across distinct device IDs from accumulating operations.
Queued KDF work rechecks its credential fill/deadline at actual dispatch, so
caller expiry cannot leave stale expensive work waiting to start.
R05 credential fills keep their independent 16 unsettled-fill, 64-caller/digest
and 5-second response bounds; a caller deadline does not release a fill's raw
registry/KDF slot. R02 KDF execution remains 4 active/32 waiting.

Before quota/telemetry dispatch and on every RTDB SDK callback retry, the captured
monotonic deadline is checked, including when the event loop has delayed the
timer callback. An expired callback returns an abort. Every valid telemetry
callback still compares current capture timestamps and sequences, so an older
late callback cannot overwrite a newer sample. Late acknowledgements do not
schedule stale matching/recovery work or return success to an expired caller.
A successfully committed transaction may already have emitted RTDB events; those
remain subject to ordered/fenced lifecycle processing.

A retryable telemetry 503 includes `Retry-After: 1`, `retryAfterMs: 1000` and
`commitState`. `not_dispatched` means this call never dispatched a telemetry
write. `unknown` means a write was dispatched or the handler cannot establish
its outcome. A 503 never proves that the write failed to commit. Preserve the
capture timestamp/sequence when retrying, or send a newer valid fix; do not
roll timestamps backwards or fabricate a success. Duplicate accepted samples
retain HTTP 200; new accepted samples retain HTTP 202. The compatible v2 route
uses the same implementation/contract. Firmware already treats 503 as retryable.

Admin health exposes the anonymous `telemetry.workQueues.ingestion` status.
Public probes, device credentials and payload validation policies are unchanged.
Admission overload, queue expiry and dependency faults all have the documented
503/retry contract. The executor tracks raw settlement independently of HTTP
request objects and does not retain response/socket closures after response.

Regression evidence includes actual ingestion with a committed-but-held
acknowledgement, repeated retries, an expired SDK callback, quota reservation
expiry and queued request expiry; HTTP tests validate both commit states.
Monotonic budget tests cover multiple stages, wall-clock rollback and timer
callbacks delayed past a dependency deadline. Firebase emulator verification
covers real committed state, held acknowledgement, retained slot and a newer
final update. These tests use controlled dependency faults, not production load.
A permanently unresolved SDK call deliberately keeps capacity unavailable;
recovering the process/dependency is an operational action. Staging latency and
replica capacity still require #245 evidence. Moving-route recovery and R34
remain open; no GNSS/ESP32, live tunnel or production deployment is required for
these software checks. Other durable HTTP resources have their own contracts
and recovery work under R07.
