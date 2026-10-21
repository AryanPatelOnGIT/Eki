# Bounded worker admission

These limits apply to each backend process. They bound retained work when a
dependency stalls; replica count multiplies the fleet totals.

| Work | Active | Waiting | Waiting per key | Undispatched age |
|---|---:|---:|---:|---:|
| scrypt | 4 | 32 | 1 distinct job | 5 seconds |
| Shared fleet and active-ride writes | 8 | 256 | 32 | 5 seconds |
| Ordered live lifecycle intake | 8 | 256 | 32 | 5 seconds |
| Replaceable route matching | 8 | 256 keys | 1 newest position | 5 seconds |
| Replaceable rerouting | 2 | 64 keys | 1 newest position | 5 seconds |

Each active matcher/rerouter may retain one additional newest follow-up. Replacing
a waiting position refreshes its queue age and caller context. Durable lifecycle
writes use a separate FIFO and are never coalesced as positions. Fair dispatch
rotates ready keys; one hot key cannot consume every turn. The fingerprint LRU
only controls deduplication and does not control execution or queue capacity.

Capacity exhaustion rejects admission. Queue expiry rejects work that has not
started its dependency call. Both release waiting metadata and permit a later
retry. A dispatched job keeps its execution permit and per-key ordering until
the actual promise settles, even if a response deadline or shutdown expires.
Clearing fingerprints does not let a new write race an uncertain older commit.
Async caller contexts, including worker generations, survive queued dispatch.
KDF admission/expiry propagates as the existing retryable device 503 response.

Rejected/expired lifecycle work requests a reread of current authoritative state.
One recovery loop holds at most one 25-item page/read. It scans RTDB key pages,
then durable `bus_locations` document-ID pages. It advances past individual
failures and repeats a full sweep when admission fills or an item fails; a read
failure retries its cursor. It waits for queue headroom before reading. It does
not retain rejected event bodies or launch parallel retry scans.

Live nodes reenter ordered intake. Missing nodes are recovered from durable fleet
state only after checking current RTDB presence and canonical ride/lock ownership.
Presence is checked again inside the bus's ordered write, and the Firestore
transaction rechecks session ownership. A replacement route/driver/lock is not
retired using an older projection. Shutdown stops replay intake and drains its
single unsettled read within the existing engine shutdown budget.

Recovery advances from current state and already committed progress/history. It
cannot reconstruct a physical movement or event timestamp never observed or
committed during overload. Moving-route acceptance remains #245. RTDB/Firestore
cross-store races and already dispatched effects retain the boundaries in
[worker leadership](WORKER_LEADERSHIP.md). Dependency/whole-response deadlines
for ingestion belong to R03; these are admission and queue limits.

Admin-only `GET /api/health` exposes `telemetry.workQueues` for KDF, shared durable
writes, intake and recovery, and `telemetry.routeProcessing` includes rerouting.
Counts cover active/waiting keys, rejection/expiry, peak waiting and configured
budgets; they contain no bus IDs, session IDs or credential digests. Public
readiness/liveness does not expose these details.

Run the synthetic stalled-dependency acceptance after compiling the backend:

```sh
npm run build --workspace=backend
node --expose-gc scripts/benchmark-work-admission.mjs
```

It submits 250,000 jobs to each of the actual KDF, writer and matcher primitives
with their dependencies held, measures retained heap after five equal rounds,
checks execution/waiting ceilings and verifies recovery/FIFO after settlement.
It has no Firebase/provider/network access. This measures the bounded helper
workload, not production fleet throughput or end-to-end latency. Unit/engine
fault tests cover queue expiry, caller contexts, overload replay and ownership;
the emulator suite covers a committed write with a held acknowledgement, queued
expiry and a newer final write against actual Firestore.
