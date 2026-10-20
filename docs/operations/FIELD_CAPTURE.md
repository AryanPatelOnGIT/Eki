# Recording a physical GNSS test

Last updated: 2026-10-21 03:19 IST (UTC+05:30).

Prepare the recorder before boarding. Device presence, location delivery and an
armed service are separate checks. A moving location trace without a ride session
can measure delivery but cannot verify stops, boarding, completion or return.

## Before an armed ride test

1. Confirm the intended device/vehicle/route in Admin → Live Ops. In Fleet &
   People, the operator must have the correct vehicle and its route assignment.
2. In **Start service**, select the operator, check the automatically filled
   assigned vehicle, select the route and click **Start service**. Retain the
   success message and session ID. The card must leave **Ride Not Armed** for
   **Direction Pending**, **Awaiting Stop 1** or **In Service**. Do not treat an
   online marker or moving speed alone as a started ride.
3. Direction is inferred from fresh stopped hardware at a configured endpoint;
   do not replace it with invented coordinates or manually force direction.
   At the configured origin, verify the intended direction and service activation.
4. Open the existing authenticated Admin, Passenger and available Driver pages with
   `?telemetryTrace=1`. Keep the tabs open without refresh. Export each tab's
   **Download telemetry trace** before and after the run. Browser background
   suspension can delay animation callbacks; record which view was foreground.
   The local trace download is available to every authenticated role when opted
   in; it exports only data already observed in that tab. It does not fetch
   protected backend health or grant another role's access.
5. Record source revision and working diff, installed-image identity if verified,
   local build/toolchain hashes, receiver identity, antenna/sky conditions and an
   independent reference if available. An ELF/bin hash from the laptop alone is
   not proof of what is flashed. Missing reference data stays unavailable.
6. Verify the current backend/tunnel and cloud observers receive fresh fixes.
   Record a stopped baseline and actual start time. Keep USB, hotspot and laptop
   awake throughout the intended observation window. Name the person responsible
   for physical actions; annotate intentional disconnects and stops.

## Serial recording

Install pySerial in the host's Python environment. Run from the repository root
with the actual serial port and a new output path under ignored `temp/`:

```powershell
python scripts/capture-serial.py --port COM_PORT --duration 1800 --out temp/field-run/serial.log --stop-file temp/field-run/STOP
```

The recorder sets DTR/RTS inactive before opening and sends no device commands.
It saves the legacy timestamped text log, exact bytes at `serial.log.raw.bin`,
and host wall/monotonic chunk offsets/events at `serial.log.events.jsonl`.
Serial disconnects are recorded and retried within the original deadline;
partial lines never join across reconnects. Existing files are never truncated.
Do not rename the recorder script to `serial.py`, which shadows pySerial.
Control-line settings do not guarantee every USB driver/board is reset-immune.

To stop early, create the specified stop file, then wait for capture_end and the
recorder's process to exit. Keep collection and archive stdout/stderr outside the
evidence folder while those processes are active. Do not attach two serial tools
to the same port.

### Record until END

Use `--duration 0` with an explicit `--stop-file` to remove a fixed deadline.
Zero without a stop file, negative durations and nonfinite durations are rejected.
Reconnects retain this mode; they do not create a new deadline. For unattended
worker supervision, the maintained runner is `scripts/supervise-field-capture.py`.
It requires a **new** run folder and a private JSON manifest, for example:

```json
{
  "run": "C:/capture/new-run",
  "cwd": "C:/path/to/Eki",
  "workers": {
    "serial": ["python", "scripts/capture-serial.py", "--port", "COM_PORT", "--duration", "0", "--out", "{segment}/serial.log", "--stop-file", "{stop_file}"]
  }
}
```

```powershell
python scripts/supervise-field-capture.py --config C:/capture/private-manifest.json
# When recording is finished, from another terminal:
New-Item -ItemType File C:/capture/new-run/STOP
```

Replace the paths and port while parked. Each worker is an argument array,
executed without a shell from `cwd`. Add already reviewed cloud, database,
host and browser collectors to the manifest as needed; **this example records
only serial**, and does not start Chrome or the backend. Every command must
observe `{stop_file}` and write its evidence below `{segment}`. Never use this
runner to supervise the application being measured. Existing temporary ride
kits are frozen historical artifacts; this maintained runner does not silently
modify or resume them.

Exited workers retry with a 2–60 second backoff into numbered segments; earlier
files are retained. `supervisor-events.jsonl` records exits, restarts, deferred
status updates and forced termination. `recorder-status.json` is an atomic
snapshot. A Windows sharing violation retries briefly, then leaves the previous
snapshot intact and records `status_publish_deferred`; it never stops otherwise
healthy workers. Readers must check the snapshot timestamp and event log. Other
storage errors remain fatal. A persistent permission error needs operator
attention even when capture continues.

There is no fixed run deadline. STOP prevents further launches and grants workers
90 seconds to exit (`graceSeconds` in the manifest); remaining owned children
are terminated, then killed if necessary, with a failed exit status. Free space
below 1 GiB (`minimumFreeBytes`) requests a distinct failed storage stop. An END
with only gracefully stopped final worker segments exits zero; inspect every
earlier segment for gaps regardless of that final exit code.

Before announcing readiness, verify fresh growth in **every required stream**,
not merely alive PIDs. Verify separate genuine browser roles, app trace exports,
Network HAR and Performance export round trips, backend log persistence and
independent GNSS reference availability. Continue checking recorder freshness
during the run. If exports or reference instruments are absent, record the scope
as incomplete. The [21 October evidence report](../testing/MOVING_GNSS_CAPTURE_2026_10_21.md)
documents why a running supervisor and owner-reported Record clicks did not
establish complete capture.

## Correlation and archive

Retain serial, device HTTP attempts/acknowledgements, cloud raw/public samples,
backend health/diagnostics, browser exports and operator annotations from the
same window. Avoid saving bearer/device credentials or raw request headers.
Precise positions and compiled device-specific firmware remain private.

Analyze each browser role separately to avoid mixing different tab timings:

```powershell
node scripts/analyze-telemetry-trace.mjs --device temp/field-run/serial.log --browser temp/field-run/passenger.json --out temp/field-run/passenger-report.md
node scripts/analyze-telemetry-trace.mjs --device temp/field-run/serial.log --browser temp/field-run/admin.json --out temp/field-run/admin-report.md
```

The analyzer preserves malformed serial fragments and independently parses
complete concatenated records. Samples without a recorded session are counted
explicitly. A React snapshot/marker-target callback is not independently measured
display paint; clock-adjusted intervals carry the four-timestamp uncertainty.
Browser cadence uses all unique listener/render samples in the exports, including
samples missing from serial, measured on each tab's monotonic clock. Overlapping
exports are deduplicated; tabs, routes, sessions and scenario transitions stay
separate. Missing monotonic timestamps cannot establish cadence. Background
suspension or truncated exports can still create apparent browser gaps.

The capture and ingress intervals in the latency table are intervals between
**serial-observed accepted samples**. They do not establish a backend outage:
successful intervening requests can be absent during a USB recording interruption.
Correlate the serial recorder's events sidecar, browser cadence and an independent
cloud stream before assigning an outage to a system stage. Preserve intervals and
missing coverage as evidence; do not describe an unobserved interval as healthy.
Do not turn sequence gaps into packet-loss percentages. A device read timeout
can accompany a backend acceptance; correlate sequence and device-send time
before interpreting unknown acknowledgements.

Stop **all recorders** before archiving into a new file outside the source:

```powershell
python scripts/archive-field-evidence.py --source temp/field-run --out artifacts/field-run.private.zip
```

The tool hashes each original, compresses into a partial archive, checks ZIP CRC
and every archived SHA-256. It refuses to replace existing ZIPs, partial files
or checksum sidecars. If a checksum appears during publication, the command
fails and preserves both the verified ZIP and the existing checksum.
The embedded `SHA256SUMS.json` lists files and explicit exclusions; a sidecar
contains the ZIP digest on successful completion. A failure before publication
retains the partial archive for inspection without marking it verified. Use a
new output name after investigating a conflict; preserve the earlier evidence.
Source files and previous ZIPs are never removed. Failed partial archives are
retained for inspection. If an independent supervisor still owns a log handle,
stop it or explicitly exclude that relative path with `--exclude`; preserve the
omitted log separately and disclose the omission. Do not include the archiver's
own active output log in its source folder. The manifest filename is reserved.

A verified local ZIP is not an off-device backup. Publish a redacted report and
aggregate measurements to issues/PRs, keeping the raw evidence private. The
[19 October moving record](../testing/MOVING_GNSS_CAPTURE_2026_10_19.md) shows
the completed measurement scope and gates this short run did not exercise.
