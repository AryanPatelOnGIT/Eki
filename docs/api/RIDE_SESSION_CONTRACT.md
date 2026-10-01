# Ride-session migration (#193)

Lifecycle decisions recorded before implementation against `b4fa46b`.
The issue's baseline predates manual interruption: this branch's legacy stop
command interrupts an early ride; it does not mark a ride completed.

| Trigger / legacy endpoint | v2 endpoint | Allowed state and transition |
| --- | --- | --- |
| POST shifts/start | POST ride-sessions | Assigned operator, fresh hardware fix and valid route; absent → pending → armed/active when direction resolves. Existing live ride resumes under the bus lock. |
| Hardware direction resolution / departure | Telemetry engine (no HTTP command) | pending → armed/active; armed → active. Direction is derived by the server. |
| Hardware destination arrival | Telemetry engine (no HTTP command) | active → completed; completion and turnaround remain engine-owned. |
| POST shifts/stop | Retain legacy command | pending/armed/active → interrupted; completed is a successful no-op, interrupted retries cleanup, failed conflicts. No v2 completion or stop command is introduced. |
| PATCH shifts/delay | PATCH ride-sessions/:sessionId | Live pre_departure/in_service only; path ID must still match inside RTDB transaction. Firestore projection revision cannot overwrite a newer revision; durable=false reports deferred persistence. |
| POST sessions/:sessionId/boarding-code | POST ride-sessions/:sessionId/boarding-code | Assigned operator/admin; armed/active only; issue once or return existing code. No lifecycle change. |
| POST sessions/:sessionId/join | PUT ride-sessions/:sessionId/passengers/me | Passenger token UID only; armed/active, code, ordered stops, device proximity for first join. Transaction rechecks state and membership. No lifecycle change. |
| POST sessions/:sessionId/messages | POST ride-sessions/:sessionId/messages | Member/operator/admin in armed/active; moderation and durable per-UID rate limit. Same request ID/text replays even after closure; changed text conflicts. |
| DELETE shifts/:sessionId/messages | DELETE ride-sessions/:sessionId/messages | Admin only; existing policy permits deletion during a live ride. Cleanup uses batches of at most 400; concurrent new messages may remain. |
| DELETE shifts/:sessionId/history | DELETE ride-sessions/:sessionId | Admin only; completed/interrupted/failed or already absent. Live states conflict. Recursive session cleanup and bounded projection batches. |
| Existing Firestore session listener | GET ride-sessions/:sessionId | Operator/admin or manifest member; minimal identity/status/direction snapshot, no code, passenger manifest or chat. No lifecycle change. |

All v2 paths are under `/api/v2/`. Legacy routes remain supported. Session and
message reads through Firebase SDK listeners retain their existing rules.
New resource responses use `Cache-Control: no-store`; mutations retain the
global and write limits, 16 KiB parser limit and Firebase authentication.

Creation requires `Idempotency-Key` (16–128 ASCII letters, digits, `_` or `-`).
Keys are scoped to the authenticated UID and bound to the authorized bus,
route and driver. The binding is recorded in the same Firestore transaction
as the bus-lock claim. Reuse for a different assignment conflicts. A retry
keeps its original session even after completion, interruption or deletion;
it never starts the next ride. Clients use a fresh key for a new ride.
Bindings are durable and must not be expired while clients can retry keys.
`Location` identifies the session resource for successful creation/resumption.

There is no latency improvement claim. This migration defines resource
identity, retry semantics and authorization while retaining telemetry-driven
completion and the existing cross-store recovery behavior.
