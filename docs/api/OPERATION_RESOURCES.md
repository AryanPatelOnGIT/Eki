# Operation resources (#194)

Contract decisions before implementation, based on `9a7f109`.

All endpoints below require an admin Firebase token and return `no-store`.
Existing HTTP clients remain supported. No second streaming transport is added.

| Operation | Submission | Status resource | Budget |
| --- | --- | --- | --- |
| Route save | PUT /api/v2/routes/:routeId, existing saveId/body/version | GET /api/v2/routes/:routeId/save-operations/:saveId | At most 8 Google requests (4 chunks per direction), 10 seconds per upstream call, existing 30-second lease. Metadata-only saves reuse geometry and make zero calls. |
| Geometry preview | POST /api/v2/route-geometry-previews, Idempotency-Key + waypoints | GET /api/v2/route-geometry-previews/:operationId | At most 4 parallel Google requests for 100 stops, 10 seconds per call. No automatic upstream retries. |
| Fleet reconciliation | POST /api/v2/fleet-reconciliation-jobs, Idempotency-Key + absent/empty body | GET /api/v2/fleet-reconciliation-jobs/:operationId | Up to 500 drivers, 10 concurrently; stop launching batches after 30 seconds, await outstanding SDK writes before releasing ownership. |
| Live reroute | Existing telemetry worker | Existing operational telemetry/traces | At most 4 chunks for the current position plus 100 remaining stops, 3.5 seconds per upstream call. Preserve #167; no new reroute endpoint or extra Google calls. |

`queued` is reserved for a future durable worker queue. This implementation
claims `processing` before execution; it never promises queued work will run.
`succeeded` holds the replayable result. `failed` holds a fixed, redacted error
and any partial per-record results. Errors never contain upstream response
bodies, credentials, stack traces or Auth UIDs. Fleet records expose driver ID,
outcome and fixed error code to admins.

Preview/fleet submission returns 202 with Location and Retry-After: 1 while
processing, including concurrent retries. A terminal retry returns 200 with
the same stored result/error; changed normalized payload returns 409. Status
reads return 200 snapshots; polling never launches work. Accepted operations
continue if the caller disconnects and are drained on graceful shutdown.

There is no automatic takeover of a preview/fleet operation after a timeout:
an SDK write or billable upstream request can have succeeded without a durable
acknowledgment. A processing snapshot past its execution budget reports
outcomeUnknown, and clients keep polling rather than resubmitting. The fleet
singleton lock also covers legacy reconciliation and the periodic worker.
After a crash, operators must verify the previous executor is stopped before
clearing the internal lock and deliberately submitting a new job. A timeout
alone is insufficient proof that external side effects stopped.

Route-save v2 wraps #172's existing claim/version/active-ride transactions.
Legacy response bodies remain unchanged; 202 responses gain Location and a
retry hint. The v2 status resource exposes normalized operation state and
the stored outcome. Existing route-save lease recovery is retained, so retries
after an ambiguous expired lease can recompute geometry; this contract does
not claim exactly-once billing for such recovery.

Operation records follow OPERATION_LOG_RETENTION_DAYS (default 90 days).
Preview/fleet retention starts at terminal completion; existing route-save
and legacy audit retention starts at creation.
After retention, status returns 404 and replay is no longer guaranteed; clients
must not reuse old keys. Processing preview/fleet records are retained until
terminal; an unresolved fleet lock is never cleared by retention.

Budgets above are limits, not measured latency improvements. Validate preview
Google span count (<=4), geometry-changing save count (<=8), metadata-only
count (0), per-call duration and p50/p95/p99 end-to-end duration in staging;
correlate trace IDs with Google Routes request/usage data. Real traces and
Google usage are required for production acceptance and cannot be replaced by
mocked tests. No live staging or billed Google requests are issued by tests.


The `http.operation.execute` span covers preview/fleet execution through outcome
persistence. `eki.http.operation.duration` records execution latency and
`eki.http.operation.executions` counts actual claims, with bounded kind/outcome
labels. Status polling and replays do not count as executions. Auto-instrumented
Google HTTP spans provide upstream counts and durations.

Staging acceptance targets (to measure, not achieved claims): preview p95 <=12s,
geometry-changing route save p95 <=15s, metadata-only save p95 <=2s, and each
live-reroute Google phase <=3.5s. Record fleet completion p95/p99 and partial
batch outcomes separately; the 30s fleet budget limits new batch launches and
cannot cancel an in-flight Firebase SDK RPC.

Crash recovery runbook: inspect the admin status resource and internal singleton
lock, stop/verify termination of its owning executor, audit per-driver claims,
token revocation and RTDB mirrors, then remove the singleton lock using an
Admin SDK maintenance session. Submit a new key deliberately to reconcile
current state; do not edit or reuse the old operation record. Polling an
unresolved record never resets its ownership or repeats billable work.

The [#167 acceptance record](https://github.com/notnamansinha/Eki/issues/167#issuecomment-5916467888) confirms real-drive latency measurements remain deferred. This change preserves that implementation and does not promote its timeout into a measured latency claim.
