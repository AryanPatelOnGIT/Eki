# Isolated moving-marker simulation

Run `node node_modules/vite/bin/vite.js --config e2e/motion/vite.config.mts`, then
open `http://127.0.0.1:3150/?telemetryTrace=1` and click **Run all 12 scenarios**.
Keep the tab visible; background-tab animation throttling changes results.
Each scenario records visibility and requestAnimationFrame gaps to expose
throttling. A frame-gap p95 near one second cannot support a smoothing-duration
comparison, even if loopback network delivery is fast.
If the OS prefers reduced motion, durations are ignored by the real hook.
The checkbox **Use standard animation in this simulation** can exercise the
normal-animation branch with a fixture-only media-query override. The actual
application and OS preferences are unchanged. Both actual and simulated
preferences are saved in the capture; compare durations only in standard mode.
Allow roughly three minutes. The loopback-only server saves a JSON capture to
ignored `temp/motion-captures`. It accepts same-origin captures up to 2 MB.

The fixture uses the application's actual position-selection, smoothing and
trace hooks. Its SSE producer supplies twelve synthetic moving samples per
scenario. Compare 250 ms and 120 ms smoothing across immediate matching,
500 ms delayed matching, a stalled matcher (the real two-second grace expires),
80 ms bursts, a 3.5 second delivery interruption, and a new ride context.
The interruption simulates a delivery gap; it does not exercise Firebase's
physical connection or the EventSource reconnect protocol.

Arrival means browser state within 5 cm of the selected current target. Held,
older-context and superseded targets must not acknowledge a new fix. Coalesced
sub-meter targets may never produce an arrival because the application skips
sub-pixel motion. Missing arrivals are reported rather than invented.

All coordinates and ride identifiers are fabricated. No Firebase calls, real
bus writes, credentials, Google Maps tiles or board movement are required.
Loopback delivery timing uses the same computer's wall clock, while animation
timing uses browser monotonic time. These measurements do not establish mobile
network latency, physical GNSS accuracy, Google Maps compositor paint timing,
or latency on lower-powered devices. Existing real device/network logs remain
separate from this simulation.
