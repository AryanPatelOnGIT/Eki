# Realtime transport measurement runbook

Use with the [transport ADR](../design/REALTIME_TRANSPORT_DECISION.md) for #195.
Reuse the [telemetry latency baseline](TELEMETRY_LATENCY_BASELINE.md) for serial
capture, backend health, clock correlation, and sample-to-marker analysis.
This procedure adds chat, payload, watch, and disconnect evidence to that run.

See the [evidence audit](../testing/REALTIME_TRANSPORT_EVIDENCE_AUDIT.md) for
verified existing stationary captures and the remaining field evidence. Those
HTTP timings do not substitute for the browser or same-window usage captures
required below.

## Prepare and capture

1. Record commit, deployed versions, Firebase project/region, browser/device,
   active buses, tab count, network profile, and start/end timestamps. Record
   the intended cost ceiling and any changes to the ADR targets before capture.
2. Open signed-in map and chat tabs with `?telemetryTrace=1` from page load.
   Attach tracing before listeners so watch counts cover the full lifecycle.
   Keep the trace running: clearing after attachment loses watch baselines.
3. In each tab, label every phase before it starts:

   ```javascript
   window.__ekiTelemetryTrace.setScenario("moving_normal")
   // Later: "moving_weak_network", "reconnect", "stopped"
   ```

4. Capture at least 1,000 accepted moving device samples across the normal and
   weak-network phases. Collect at least 100 newly created chat messages per
   profile, paced within deployed rate limits, with a second recipient tab
   open. Keep both tabs signed in; do not bypass authorization or limits.
5. Exercise at least 10 controlled offline/recovery cycles. Note actual
   network-restoration timestamps and first fresh marker paint separately.
   Initial offline bootstrap is not a reconnect. RTDB connection traces do
   not measure Firestore recovery or prove a fresh rendered sample.
6. Repeat with controlled 1/10/50-tab profiles as capacity permits. Keep
   unrelated activity out of the measured Firebase usage window or report its
   contribution explicitly. Archive Firebase console/monitoring captures of
   peak RTDB connections, RTDB downloaded bytes, and Firestore document reads.
   Identify aggregation/delay and whether these are project totals.
7. Download one complete export per tab/run before reaching the 25,000-record
   buffer limit. The buffer drops oldest entries; truncated runs cannot prove
   complete watch counts or correlation coverage. The analyzer deduplicates
   overlapping exports by run/event ID; prefer complete exports for each run.

   ```javascript
   window.__ekiTelemetryTrace.download("realtime-sender.json")
   ```

## Analyze

For sample-to-marker, run `npm run telemetry:analyze` with the serial log and
browser/health exports as documented in the existing baseline. Report each
browser's coverage; do not equate an observer gap or HTTP round trip with
device-to-marker latency. Record clock uncertainty and startup separately.

For the additional measurements:

```powershell
npm run realtime:analyze -- --browser realtime-sender.json --browser realtime-recipient.json --out realtime-report.json
```

The offline analyzer emits per-scenario p50/p95/p99/max and sample counts:

- Chat: HTTP send-start to first server-backed listener of the returned message
  ID in the same run/session/tab, even if delivery precedes the HTTP response.
  HTTP 201 creates count; HTTP 200 idempotent retries are reported separately.
  Cache-only and pending local writes do not supply delivery events. Missing
  listeners and attempts without responses are counted. Inspect unanswered
  attempts as timeouts/incomplete attempts, not successful delivery.
- Recovery: RTDB `connected=false` to `connected=true` intervals after an
  established connection; this includes intentional offline time. Unfinished
  outages are flagged. Use operator notes and telemetry paint records for the
  distinct network-restoration-to-fresh-marker gate.
- Payload: UTF-8 serialized application JSON bytes per callback. Chat estimates
  cover the bounded snapshot, including metadata callbacks; bus estimates
  cover initial data and subsequent child events. They are not comparable
  wire-delta estimates, Firebase billed bytes, or document-read counts.
- Watches: peak logical `active_buses` and `messages` watch groups per tab.
  Three RTDB child subscriptions share one group; other SDK watches are not
  counted. These numbers are not physical socket counts or all Firebase use.

Cross-tab recipient latency requires validated clock alignment and separate
analysis. The same-tab chat report cannot claim delivery to every recipient.
Metadata changes are enabled only in traced chat subscriptions; disclose their
callback overhead. The existing tracing mode also observes server time offset.

Supply independently captured usage using `--usage usage.json`. That file must
contain `windowStart` and `windowEnd` as ordered timestamp strings, a nonempty
`evidenceRef` identifying the restricted capture, and measured nonnegative
numbers for `rtdbConnectionsPeak`, `rtdbDownloadedBytes`, and
`firestoreDocumentReads`. Missing usage produces `usage: null`, never a zero
cost claim. The analyzer makes no Firebase calls and fetches no credentials.

## Review and archive

Keep raw exports, serial logs, health snapshots, usage captures, operator notes,
and reports in the restricted operational evidence archive. Trace exports omit
message content/coordinates/tokens but contain session/message/device identifiers
and timing metadata. Do not commit raw captures; use the approved retention
period. Public reports should contain aggregate results and redacted evidence
references only.

Report counts and p50/p95/p99 separately for each network/load profile, missing
correlations, clock uncertainty, reconnect restoration times, fresh paints,
Firebase usage, cost assumptions, and instrumentation overhead. Compare with
the preregistered ADR gates. Leave unmeasured items explicit, diagnose failed
phases through existing optimization issues, and update the ADR's keep/change
conclusion before marking #195's field measurement work complete.
