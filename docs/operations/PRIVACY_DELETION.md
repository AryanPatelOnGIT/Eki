# Passenger deletion queue and recovery

Last updated: 2026-10-13 IST (UTC+05:30).

`POST /api/v2/privacy-deletion-requests` and the legacy passenger alias derive
UID from the verified token. Current Auth, profile role and driver membership
must exclude privileged accounts. A missing role claim alone does not deny a
passenger. Operator/admin accounts require the existing IT offboarding process.
A request returns `202 {accepted:true}`; this acknowledges registration,
including an existing failed request, and does not certify deletion.

## Passenger experience

In Profile, select **Delete Account** and confirm. The confirmation explains
that feedback, passenger ride entries and messages are retained. Canceling this
confirmation sends no request and does not sign the passenger out.

After a valid server acknowledgement, the app opens **Deletion requested**.
Selecting **OK**, pressing Escape or dismissing the backdrop closes the popup
and signs the passenger out. Invalid acknowledgements and failed requests do
not show the success popup or trigger sign-out. Errors remain available in the
account view after the confirmation closes, allowing a visible error and retry.
Confirmation dialogs render into the document body so the
profile's scrolling and animated containers cannot clip them.

Sign-out does not mean deletion has completed. The worker scans on startup
and every minute while it holds leadership; there is no multi-day waiting
period and no routine administrator approval. An available worker can pick up
a due request on a subsequent scan, but backlog, rate-limit cleanup, lock
contention or dependency failures can extend processing. There is no guaranteed
completion deadline. A disabled/offline worker leaves requests queued; failed
or interrupted processing can require the recovery steps below.

Successful account deletion removes Firebase Auth, the profile, feedback
cooldown, passenger request, message rate limits and the queue record. It
preserves feedback, passenger ride entries and messages unchanged, including
stored names and IDs. Separate retention and administrator history-deletion
flows still apply to those records.

Retained membership is historical data, not continuing chat authorization.
Firestore passenger chat reads also require the backend-owned profile to
exist. Removing that profile therefore denies subsequent reads even when
the client still presents an unexpired token. Operator/admin history access
is unchanged. This adds one profile-existence check only to the passenger
membership branch; unauthenticated and non-member reads remain short-circuited.

Retirement also fences the cached-token API paths: passenger ride-status reads,
boarding updates, chat messages/replays and feedback/replays require an existing
profile. Boarding and feedback use the profile read already needed for their
transaction; passenger chat adds a profile read while privileged chat is unchanged.
Bootstrap checks the deletion request and current Auth before creating a missing
profile. Deleted/disabled Auth returns 401, and an outstanding deletion request
returns 409 without recreating the profile or repairing claims. These checks prevent
retained history or a still-cached token from recreating account-owned controls.

## Admission and resubmission

Admission and admin controls each allow eight raw fills and sixteen waiters per
fill, with a three-second caller deadline. Timed-out dispatched calls retain
capacity until real settlement. Retry an uncertain admission with the same UID.
Creation is transactional. Resubmission preserves the original request time,
lifetime attempts and error history. A failed request returns to pending with a
fresh generation and failure budget; an active processing claim remains untouched.
Current Auth creation time is bound
to the target: a recreated UID requires IT review rather than deleting its new
account automatically.

## Bounded and fair processing

The leader scans one document-ID ordered page of twenty pending requests every
minute. `_reconciliation_cursors/privacy-deletions` stores a lease-fenced cursor;
restart resumes it, and a completed cycle resets it. Backoff records are skipped
without blocking later document IDs. Saturation retains the scan cursor.
One raw deletion executes and at most twenty wait, one per UID, with a two-second
undispatched queue age. Expired queued work remains durable for a future cycle.
No timeout frees an unsettled dependency's execution permit or fleet mutex.

Each execution claims an executor UUID/generation and has a thirty-second
monotonic dispatch budget. Ordinary progress/deletion transactions validate both
the claim and worker lease at commit. Account deletion preserves feedback,
indexed and legacy passenger ride entries, and messages unchanged, including
stored author and passenger details. Their independent retention policies still
apply. It drains only account-owned message rate limits in 200-document pages;
a full page schedules another fair turn. Lifetime attempts count these turns,
and a successful continuation resets consecutive failures.

Transient failures use exponential one-minute backoff with jitter, capped at one
hour. Five consecutive failed executions produce `failed`, which ordinary scans
exclude. Fleet mutex contention postpones work without consuming a failure.
Ineligible/currently privileged or changed-account identities fail immediately.
Error logs omit UIDs, dependency payloads and stack traces; admin monitoring uses
fixed error codes. Profiles/cooldowns/passenger requests and Auth are retired
only after account-owned message rate limits are drained. An already absent Auth
account is an idempotent success. Completed queue records are removed as before.
This flow deletes the account while retaining its feedback, ride entries and messages; it is not a complete personal-data erasure workflow.

## Monitor and recover

1. As an administrator, use `GET /api/v2/privacy-deletion-requests`. Follow
   `nextCursor` until null; each page contains at most twenty whitelisted records.
   Inspect status, attempts/failures, executor/generation, due/deadline times,
   fixed error code and `cleaning`/`auth_deletion_dispatched` phase. The latter is
   conservative: Auth may or may not have received/committed the call.
2. For a `failed` request, diagnose the dependency or account-eligibility problem.
   Deliberate retry uses `POST /api/v2/privacy-deletion-requests/{uid}/recovery`
   with `expectedExecutorId` and `expectedGeneration`. This CAS begins a fresh
   bounded failure cycle, preserving lifetime attempts and error history and
   recording the recovering admin and time. Eligibility is checked again on work.
3. For an expired `processing` request, first stop and independently verify
   termination of its exact executor, then audit uncertain Auth/data effects.
   Recovery additionally requires `executorStopped:true`. An unexpired claim or
   any locally unsettled execution is refused, even with that attestation.
   Expiry alone never authorizes takeover.
4. If `GET /api/v2/fleet-reconciliation-jobs/lock` exposes `privacyRequestId`,
   recover that processing request first, then recover the exact stopped-owner
   lock using the existing fleet lock recovery endpoint. Lock release writes an
   atomic audit including linked privacy status. Never clear a running mutex.
5. Inspect durable status after an uncertain recovery acknowledgement. A changed
   generation rejects a duplicate recovery; passenger resubmission restarts only
   failed work. With no live process holding the mutex, normal queue turns resume.

All fleet API Auth-changing paths and privacy deletion share the same non-expiring
mutex. Eligibility is rechecked inside it before cleanup and Auth dispatch. CLI
role sync, console/other-system changes and account recreation must be quiesced
operationally during deletion: the mutex cannot fence actors outside this API.

## Evidence and acceptance limits

Regressions reproduce overwritten retry history, first-twenty poison starvation
and indefinite retries, and check current/claim-less eligibility, large-rate-limit
fairness, raw stalls, bounded capacity and late-generation fencing. Actual local
Firestore SDK tests exercise cursor mutation, retained manifests/messages/feedback,
1001-record feedback preservation and a disposable executor killed during synthetic Auth.
No live Auth account, hardware, board firmware or production project is touched.

Suitable staging still must verify deployed collection-group indexes, actual
Auth failure/revocation outcomes, supervisor stop attestation, replica/console
quiescence and delayed authenticated writes. Already-dispatched external effects
cannot be recalled. Existing cached or in-flight authenticated writes can arrive
after cleanup; these software checks do not certify universal erasure under
arbitrary concurrent clients, backup erasure or institutional privacy sign-off.
Those remain issue #245 acceptance gates.
