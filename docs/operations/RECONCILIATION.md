# Bounded reconciliation and continuation

Last updated: 2026-10-05 13:37 IST (UTC+05:30).

Reconciliation visits the complete candidate set through document-ID pages of
100. Each page owns its records and caches; results and retained query data do
not grow with the backlog. A full page returns its last ID as `nextCursor`;
`null` marks completion. An exactly full final page needs one empty follow-up.
Deleted cursor documents remain valid because continuation uses the ID value.
Concurrent changes can move candidates behind the cursor; the next full cycle
visits them. This is a repeatable scan, not a snapshot of the entire collection.

| Path | Query/memory bound | Concurrent pipelines | Continuation |
| --- | --- | --- | --- |
| Abandoned sessions | 100 nonterminal sessions; targeted live-node reads | 4 sessions; each has bounded lifecycle/lock reads | `_reconciliation_cursors/abandoned-sessions`, hourly cycles |
| Periodic fleet | 100 drivers; page-local bus/mirror caches | 10 Auth pipelines; no new batch after 30 seconds | `_reconciliation_cursors/fleet-authorizations`, 10-minute cycles |
| Fleet job | 100 drivers and at most 100 result records | 10 Auth pipelines; 30-second dispatch budget | Caller follows `result.nextCursor` |
| Bus route validation | 100 active rides/devices per query | One page at a time | All pages checked before saving |
| Bus assignment repair/unassignment | 100 drivers per query | 10 pipelines; audit checkpoints each batch | All pages visited; stopped-executor recovery after a crash |
| Inactive bus-node cleanup | 100 RTDB keys per query | 4 conditional transactions | Ordered key cursor until complete |

The abandoned worker has one unsettled full scan plus one waiting scan with a
five-second queue age. Its page executor permits one active page and three
waiting pages. Periodic fleet scans remain single flight across leadership
changes, including cursor reads/writes. Successful pages checkpoint only after
all dispatched work settles, through a transaction that validates the worker
lease. Failure retains the prior cursor; a crash between effects and checkpoint
can repeat the page. Session/value predicates and current Auth/mirror comparison
make settled retries safe. Expired leaders cannot advance the checkpoint.

Firestore and RTDB are separate stores. Session cleanup rechecks lifecycle
activity, session ownership and locks; recent/unknown activity remains protected.
An RTDB transaction may initially see an empty local cache. A no-op null result
allows server retry; matching/session/activity checks then apply to the actual
record. Inactive bus cleanup compares the entire captured value and bus identity
before removal, preserving a newer lifecycle. The existing cross-store fencing
limitations in [worker leadership](WORKER_LEADERSHIP.md) still apply.

## Following admin fleet pages

1. Submit `POST /api/v2/fleet-reconciliation-jobs` with a new `Idempotency-Key`
   and `{}` for the first page. Poll the returned status resource using the same
   key after transient/unknown admission responses.
2. Inspect the terminal result's bounded records and `nextCursor`. Record
   failures for investigation; a settled record failure does not hide later
   pages. `timeBudgetExceeded:true` means later records were not dispatched.
   Its cursor points to the last settled batch, or `""` if none was dispatched.
3. For a settled outcome with further work, submit a deliberate new key and
   `{ "cursor": "<returned value>" }`. Empty cursor means the first page.
   Continue until `nextCursor:null`. Each key identifies one normalized page;
   changed cursor with an existing key returns 409. Older retained results can
   contain up to 500 records and omit continuation fields; they remain replayable.
4. An unknown operation/stranded lock requires the
   [stopped-executor recovery procedure](../api/OPERATION_RESOURCES.md).
   Do not interpret its cursor as permission to repeat uncertain Auth work.

Legacy `POST /api/fleet/reconcile?cursor=<value>` preserves `{checked,repaired,failed}`
and returns `X-Reconciliation-Complete` and optional `X-Next-Cursor`, exposed by
CORS. Follow the headers through every page. 207 indicates record failure or
an exhausted dispatch budget; `checked` counts records actually visited.

All fleet Auth-changing admin endpoints and the periodic/job reconcilers share
the durable singleton mutex. Legacy/admin mutation admission allows two active
pipelines, eight waiting and a two-second queue age, including audit persistence.
409 with `Retry-After:1` means the mutex is occupied; 503 can mean admission/audit
unavailability. Inspect current state after an unknown mutation result. A raw
SDK read/write keeps its permit and lock until actual settlement, including a
paired-read failure or caller disconnect. There is no expiry-based lock takeover.
Graceful shutdown drains accepted mutations. A permanently hung call requires
operational process termination, external-effect audit and conditional recovery.

Bus mutations record bounded batch/cursor progress in `_fleet_operations`; their
lock exposes `auditOperationId`. Deletion rechecks each driver's current assignment
and the bus lock, then rechecks rides/devices/lock in the parent-delete transaction.
Partial failure can leave repaired/unassigned drivers with the bus still present;
audit that state before deliberately retrying. These APIs do not atomically
commit Firestore, RTDB and Auth, nor prove another replica was stopped.

Software regressions reproduce the old 600 simultaneous session reads, unbounded
601-session result, first-500 driver truncation and missed 301st device conflict.
Actual loopback emulators exercise 203 sessions (201 stale plus protected newer
and unknown lifecycles), 1001 drivers with synthetic Auth, and paginated bus/device
and RTDB cleanup. Live Auth outcomes, indexes, replica load, process supervision
and latency still require suitable staging evidence in #245. No production
deployment, live Auth action or hardware operation is established by these tests.
