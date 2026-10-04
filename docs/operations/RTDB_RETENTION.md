# RTDB legacy and geometry retention

Issue [214](https://github.com/notnamansinha/Eki/issues/214). Retention is 180 days.
This extends the existing Firestore sweep; PR 210 remains the dependency for
durable ride-history deletion and its 180-day ride-session default.

## Before enabling legacy retirement

Current repository clients use Firestore profiles/messages. RTDB `users` and
`messages` have no application consumers and default client rules deny access.
Verify independently deployed older clients or integrations before setting
`LEGACY_RTDB_RETIRED=true`. The default is false; geometry cleanup still runs.
This switch declares that the entire legacy trees have been retired. Nested
groups are deleted only when their newest recorded activity is older than
180 days. This conservatively retains older children in a recently active
group; it does not claim message-by-message expiry of unidentified old schemas.

Run from the configured backend directory:

```sh
npm run retention:rtdb -- --dry-run
```

The default is also a dry run. To inventory legacy eligibility without enabling
it permanently, supply `LEGACY_RTDB_RETIRED=true` only to that dry-run process.
The report contains counts, never messages, coordinates or account identities.
Dry runs do not write inventory or delete anything.

After migration verification, review the dry run and use `--apply`, or enable
the existing `RETENTION_SWEEPER_ENABLED=true` scheduled sweep. Development
continues to disable scheduled deletion by default. No live cleanup is run
as part of preparing this change.

## Age, uncertainty and failure recovery

Known creation/activity times accept epoch milliseconds, seconds and ISO date
strings. The newest nested activity protects a legacy group. Equality with
the 180-day cutoff is retained; future timestamps are retained. Undated records
receive a full 180-day observation window, rather than being treated as old.
Any change restarts that window. Excessively nested records fail closed.

The server-only Firestore `_rtdb_retention_inventory` collection stores a hashed
path ID, path, SHA-256 fingerprint and first-seen time. Its fields provide age
provenance and a conditional-delete guard. No duplicate content is stored.
Firestore transactions establish the same observation window across replicas.
An RTDB transaction deletes only the unchanged fingerprint. Failure leaves the
record/inventory available for the next sweep; missing-record inventory is
cleaned on subsequent runs. Sweeps page through keys, outside telemetry requests.

## Geometry lifetime and pointer safety

New immutable geometry has a server `createdAt`. Existing epoch-based version
keys provide an age fallback; unknown keys receive the same quarantine window.
Current `activeBuses` pointers are retained even for offline/completed services.
Old versions, abandoned publications and deleted-fleet geometry expire after
180 days, giving readers/publications substantially more than a one-day grace.
An aged version also receives a full day of observed unreferenced grace before
deletion, including a version that was current until shortly before a sweep.
Inventory fingerprints distinguish current and unreferenced observations, so
a pointer transition starts a new grace window.

The only application publisher allocates a new version and checks inside its
pointer transaction that publication has not stalled for a day. Thus an aged
purge candidate cannot subsequently become a newly published pointer. Client
writes remain denied. Retiring this guard or adding a writer that republishes
historical versions requires revisiting this invariant. An external Admin SDK
writer must follow the same contract; arbitrary administrative writes cannot
be made safe by client security rules.

The sweep does not delete active bus state, assignments, credential versions,
rate-limit windows, current Firestore profiles or live ride ownership.

## Validation

Regression tests cover dry-run immutability, opt-in legacy retirement, exact
cutoff/seconds/ISO/future times, undated quarantine and changed records, current
pointers, deleted fleet/aborted publication grace, conditional-delete races,
partial failure, repeat sweeps/replicas, bounded nesting and stalled publishers.
Read-only inventory on 3 October 2026 scanned eight legacy records: zero were
eligible for deletion, zero were undated, and no geometry records were present.
No live data or inventory was changed.
