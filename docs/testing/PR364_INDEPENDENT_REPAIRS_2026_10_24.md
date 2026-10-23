# PR #364 independent audit follow-up — 24 October 2026

The supplied `87102ba` audit package is not comprehensive acceptance evidence.
Its ledger retains 174 unexecuted source candidates, several test/source paths
do not exist, the named browser suites sum to 75 rather than 91 cases, and an
admin “recording” contains one error frame. API-operation counts are not test
cases. Raw reports, credentials, screenshots and location data remain outside
tracked source. The independent verification record is local under
`artifacts/qa/verification/2026-10-24-87102ba/`.

## Firebase Hosting reconnect repair

The hosted policy allowed RTDB HTTP/WebSocket connections and scripts at the
configured instance, but did not allow Firebase's long-poll disconnect iframe.
After a WebSocket failure the SDK can use `/.lp` JSONP and redirect to a
Google-owned shard. Blocking the disconnect iframe makes that connection close
again. Allowing the iframe alone is insufficient because subsequent scripts can
also target that shard.

A read-only Chrome comparison used the actual Firebase browser SDK against the
existing instance, with long polling selected explicitly. The original Hosting
policy repeatedly reported connected/disconnected and a blocked Firebase
`frame-src`. Allowing both transport resources kept the connection established
and delivered the expected permission denial for the deliberately unauthenticated
read. No data, tokens or authorization rules were changed. The same comparison
with only the frame permission still cycled.

`scripts/update-csp.mjs` now adds **path-restricted**
`https://*.firebaseio.com/.lp` and `https://*.firebasedatabase.app/.lp` to
`script-src` and `frame-src`. Other Firebase script paths remain excluded by
these additional sources; existing hashes, authentication requirements and
database rules remain in place. The checked-in Hosting policy carries the same
transport requirements. Generator integration tests cover no deployment env,
US instances and regional instances, including preservation of script hashes
and the absence of unrestricted script/frame origins or unsafe inline scripts.

This establishes and repairs a transport-policy defect. It does not assert that
the existing hosted deployment has already changed. A normal PR push does not
deploy Hosting; authenticated hosted delivery must be checked after release.

## Arrival acceptance and complete browser execution

The emulator test and fixture still used the old 10 m contract: 11 m outside and
9 m “inside”. Both viewports failed against the requested 2.5 m production rule.
The fixture, test title, attachment and QA mapping now use **2.6 m outside /
2.4 m inside**. The real authenticated device endpoint, lifecycle worker,
Firestore/RTDB persistence and rendered passenger timeline must agree before
the case passes. The independent 10 m origin-departure safeguard is unchanged.

The five-minute subprocess budget previously interrupted a 40-case serial
mobile/desktop run before its final report. Browser execution now has a finite
six-minute budget inside an eight-minute emulator-launcher budget. The full
corrected suite completed **40/40**, without retries, skips or flaky cases;
its verdict is `GREEN_FOR_EXECUTED_BROWSER_SCOPE`. This includes provider-error
recovery, boarding, chat, completion and distinct return service, feedback and
history, operator/vehicle CRUD, settings, and delay/interruption/restart flows.
Providers remain synthetic; Auth, Firestore and RTDB are local demo emulators.

## Live and physical limits

The connected stationary device produced fresh stopped/online backend receipts;
local admin displayed one device and zero services. An unarmed passenger route
correctly withheld service ETAs. COM3 opened without error but emitted no serial
bytes during a 120-second observation, so no serial-output claim is made.

Stationary hardware cannot establish moving geofence accuracy, ordered passage
under receiver noise, or physical turnaround. Those remain field acceptance
gates. Synthetic browser and emulator passes must not be promoted to moving
GNSS acceptance or all-controls coverage.

## Final validation of the working tree

- Full `npm test`: **159 script, 1,262 backend and 774 frontend cases passed**;
  64 opt-in backend cases were skipped. OpenAPI's 71-operation checker and UI
  source contracts passed; operation counts are separate from test cases.
- Neighboring browser suites: **75 passed** (progress 8, admin access 32,
  passenger warning layouts 6, routing marker 2, production-audit fixture 27).
  Together with the 40 emulator browser cases this is **115 browser executions**,
  with provider tiers kept separate.
- Full lint and strict production build passed. The build verified the configured
  backend CSP contract, real backend readiness and Hosting-origin CORS preflight.
- Fresh Firebase rules execution: **64/64 passed** against the isolated demo
  emulators, with no skipped or blocked cases in that rules scope.
- Actual localhost admin still showed one online stationary device and zero
  services. The CSP comparison used genuine Firebase transport; it did not grant
  an unauthenticated read. Export preview guest hydration passed, but Google
  sign-in on the additional localhost preview port was unsuccessful. Even after
  rebasing the normally same-origin Auth iframe for that preview, it was not
  accepted as authenticated export evidence. No provider settings were changed.
- `qa:check` passed; its broader catalog remains `NOT_RELEASE_READY`. Moving
  physical acceptance and authenticated Hosting retest after deployment remain
  separate release gates.

Local raw results for this follow-up are under the ignored
`artifacts/qa/pr364-repairs/` directory. The PR update contains source/configuration,
regression tests and this scoped account of the results, not the raw audit ZIP.
