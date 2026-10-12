# Witnessed motion and hardware evidence package

Last updated: 2026-10-12 16:06 IST (UTC+05:30).

Status: **UNEXECUTED — physical field deployment NOT_VERIFIED.** This package
prepares capture and review. It performs no drive, flash, provisioning, RF
transmission, cloud mutation or provider experiment. Current automated software
reports remain separate from witnessed L5 evidence.

The live-motion work is consolidated in [#300](https://github.com/notnamansinha/Eki/issues/300),
a verified subissue of [#245](https://github.com/notnamansinha/Eki/issues/245).
Bench hardware and production ownership/rollout gates remain in #245 and
[#246](https://github.com/notnamansinha/Eki/issues/246). A checkmark in a software
PR or this document does not close those issues.

## Capture identity before a run

Record these facts in a private evidence directory before collecting samples:

| Field | Required observation |
| --- | --- |
| Software | Full backend/frontend source commits, deployed image digest, browser and OS versions, route config/geometry versions |
| Tracker | Flashed image SHA-256 and build profile, board identity pseudonym, receiver MON-VER, antenna/power configuration |
| Session | Pseudonymous bus/device/session identifiers, current assignment and direction, original and replacement ride identities |
| Conditions | UTC start/end, location/environment category, temperature/power where measured, sky/antenna conditions, network phase |
| Witnesses | Named responsible owner, safe vehicle operator and observing tester; driver does not operate the test UI while driving |
| Reference | Independent position/time instrument, calibration/setup, sampling rate and measured uncertainty |
| Clock domains | Device sample/send, backend ingress/response, datastore observation, browser listener/message/paint; synchronization method and offset uncertainty |
| Limits | Named owner-approved accuracy, freshness, ordering, latency and recovery limits before evaluating results |

Missing identity, instruments, approved setup or measured uncertainty is a
BLOCKED gate. A software restart does not establish a GNSS cold start. Record
the actual receiver-state setup required by its installed firmware/manual for
cold, warm and hot acquisition; do not invent UBX commands from memory.

Keep exact private captures for review and publish redacted summaries only.
Exclude bearer/App Check tokens, credentials, boarding codes, passenger identity
and precise personal coordinates from public GitHub logs. Hash private capture
files and reference their controlled location in the result record.

## Motion matrix

| Run | Observation and independent oracle | Evidence required |
| --- | --- | --- |
| Normal forward and reverse | Reference trajectory, ordered/close stops, origin departure, endpoint completion and distinct empty return session | Correlated receiver/device/backend/projection/browser samples and durable original/replacement ride records |
| Endpoint direction and turnaround | Pending/resolved direction, zero and approved nonzero dwell, U-turn/wrong-turn behavior | Actual source constants/configuration plus timestamped direction/stop/dwell observations |
| Plausible drift and ambiguity | Gradual bias, adjacent/parallel-road ambiguity and multipath can remain inside single-step jump limits | Independent along/cross-track errors and raw/accepted/matched traces; no false boarding, progression, completion or direction flip |
| Acquisition and quality recovery | Correct cold/warm/hot setup; first valid and first usable fix distinguished | Receiver-state/setup witness, quality fields, fix age, reference uncertainty and measured time to recovery |
| GNSS plus network loss | Safe representative loss/reconnect phases; unknown acknowledgement distinguished from definite rejection | Queue identity, original sample/send times, retries/drops, credentials/cache and last accepted projection |
| Reboot plus queued replay | Approved spare/device restart with retained samples; original assignment and ride cannot be resurrected incorrectly | Flashed source identity, reset reason, queue/sequence context, stale/duplicate rejection and final authoritative session |
| Backend replica recovery | Owner-approved restart/partition, lease expiry/renewal and delayed writes/results | Exact image/source, leader/lease generation, lock ownership and no duplicate return or replacement-ride overwrite |
| Real mobile suspension/update | Passenger/operator/admin suspend/resume and approved PWA update during an active ride | Actual browser visibility/network/cache state, restored identity/boarding/chat/history and observed marker freshness |

Use safe owner-controlled drives with prearranged observers, bounded duration
and explicit stop/abort responsibilities. Do not deliberately create traffic
hazards, alter live fleet accounts or transmit RF interference. Specialized
receiver vulnerability work belongs in an approved contained bench facility.

## Timing and contention evidence

Issue #300 retains the parent requirement for at least **100 accepted moving
latency samples** and **1,000 moving contention samples**, across normal,
degraded-network and reconnect phases. Rejected/stale/dropped/duplicate samples
must also be counted, not removed to improve percentiles.

For each correlation identity retain:

```text
capture identity; source/image/firmware hashes; session/assignment revision
GNSS sample time; device send time; backend ingress and response time
datastore observation/version; browser listener/message/paint time
raw/accepted/matched position reference; quality and direction/state
network/visibility phase; queue/retry/drop/duplicate outcome
clock-domain offsets and measured uncertainty; evidence file references
```

Compute p50/p95/p99 only from defined comparable boundaries. Report raw counts,
measurement resolution, clock uncertainty and missing observations alongside
each statistic. Do not subtract unsynchronized wall clocks and label the result
transport latency. A virtual timestamp, emulator completion or synthetic marker
animation is not a measured moving-device latency sample.

Compare baseline/candidate cloud usage only across matched, approved observation
windows with equivalent fleet conditions. Synthetic admission-helper counts and
in-memory provider calls are not Firebase/Maps billing observations.

## Bench and provider gates that require their own evidence

| Gate | Preparation and witness |
| --- | --- |
| Power/thermal/watchdog | Dedicated current-limited spare board, correct supply measurements, measured task/reset behavior and retained queue integrity; FW04/FW07/FW17 hardware portions |
| Journal and reset recovery | Actual board/profile/storage layout, safe interrupted-write/reset setup, integrity/fallback and measured useful-checkpoint loss window; FW06–FW10 hardware portions |
| TLS/receiver/network | Correct CA/hostname/clock and receiver firmware/setup; measured connection/fix recovery; FW01/FW02/FW14–FW16 hardware portions |
| OTA and protected fleet | Witnessed spare-board procedure and signing custody; valid/negative image boot evidence and active-ride deferral; FW19–FW22 hardware portions |
| Live OAuth/App Check/Maps | Explicit disposable staging access and owner permission, bounded quotas/cost acknowledgement, actual provider/browser evidence; L4 is outside unattended CI |
| Production rollout | Maintainer review, required checks, environment/retention/security ownership, approved workflow installation and release sign-off |

Native policy/cryptography/parser tests and ESP32 builds provide valuable L0/L1
evidence. They cannot establish actual power, temperature, UART/RF, Wi-Fi,
protected boot/eFuse, mobile radio or provider behavior. Follow the repository's
[witnessed fleet procedure](https://github.com/notnamansinha/Eki/blob/testing/docs/operations/HARDWARE_SECURITY_PROVISIONING.md)
for any future provisioning; this package does not authorize it.

## Unexecuted result form

Copy this form per witnessed run. Leave unknown values unknown; never populate
it with simulated PASS or assumed measurements.

```text
Record status: UNEXECUTED / BLOCKED / FAILED / OBSERVED (choose after the run)
Run identity and scenario:
UTC start/end and observation timezone:
Full source commits, image digest and flashed firmware hash:
Receiver/board/profile/route/session identity:
Responsible owner, operator and observing witness:
Approved setup, duration and stop/abort conditions:
Independent reference, measured uncertainty and calibration:
Clock synchronization method, offsets and uncertainty:
Approved limits and exact applicable source/configuration constants:
Expected versus observed state/side effects at each boundary:
Accepted/rejected/stale/dropped/duplicate sample counts:
Latency/contention sample counts, boundaries and p50/p95/p99:
Recovery duration, final lock/session identity and residual anomalies:
Private capture hashes/locations and redacted summary references:
Untested or blocked partitions:
Named owner review and decision, date and reason:
```

An OBSERVED result means evidence exists for that run. It is not automatically a
whole-case or fleet release PASS. Review failures and uncertainty against the
predefined oracle, retain adverse evidence, and update the corresponding issue
only after the owner reviews it. Automated L1–L3 reports do not ingest this
unexecuted form or promote it to current software acceptance.

## Software work remains separate

The current execution ledger still contains software oracles without reviewed
test mappings and complete adverse-path coverage. Those are engineering work,
not missing physical instruments. Follow `artifacts/qa/execution-report.json`
for the selected commit, including every NOT_RUN/NOT_COVERED case, the 163 static
control candidates and the full API matrix. Do not move a software gap into
#300 merely to declare everything except motion complete.
