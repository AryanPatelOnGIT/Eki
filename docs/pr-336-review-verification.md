# PR #336 review follow-up

Reviewed on 18 October 2026 (Asia/Calcutta), against PR head
`3b5bf3b2311ab1f3ab1fd1ac753b0ff6d8642f44`, on local branch
`codex/pr-336-review-fixes`.

The review included [Falak's findings](https://github.com/notnamansinha/Eki/pull/336#issuecomment-6248657151),
her subsequent GPS-radius comment, and all four CodeRabbit inline findings.

## Changes and decisions

| Finding | Resolution |
| --- | --- |
| Unused automatic return holds its lock indefinitely | Preserve overnight readiness for up to 24 hours of inactivity, or the configured abandoned-ride threshold if longer. The existing conditional sweep then interrupts the session and releases only its matching lock/lifecycle. Recent activity and unknown timestamps remain protected. Tests cover the exact boundary, missing presence, replacement locks, and no resurrection after reboot. |
| Route colour picker/preview remains grey | Honour the configured colour when there is no active leg. Keep the full live route grey with only active legs blue. Colour changes invalidate the overlay effect. Real Google SDK tests exercise pink/green selection in the actual editor. |
| Obsolete dwell documentation | Update the five identified documents, including the API mirror, to the 30,000 ms default and minimum 0. Keep terminal-arrival confirmation distinct from turnaround dwell. |
| Completion retirement invents signal-loss history | Require explicit `signalState: lost`, a loss call, or confirmed removal. Engine-generated `deviceState: offline` alone no longer creates an event. Explicit loss and final received-fix retention remain covered. |
| Missing checkpoint identifiers can fail completion | Normalize driver/session identifiers and skip the operational recovery checkpoint when either is invalid. Legacy completion still succeeds without an undefined Firestore write. |
| Direction reset rolls the route revision backward | Retain the valid session revision while clearing direction-derived geometry/matches. A subsequent resolved route advances the revision. A retained counter alone does not cause redundant pending-state writes. |

The arrival follow-up reduces the stop-arrival and initial direction endpoint
circles from 20 m to **10 m**. The backend uses accepted raw GNSS coordinates,
not the snapped/interpolated web map marker or passenger phone geolocation.
Intermediate stops advance to the next expected index on entry or a bounded
between-fix crossing; they do not require a stationary dwell or prove boarding.
The authoritative index drives the passenger timeline and highlighted map leg.
The final stop additionally requires departure, ordered progress, stopped motion,
speed <=2.5 km/h, HDOP 0..4, fresh telemetry and distinct samples spanning the
default 2 s confirmation. Leaving the circle resets terminal evidence.

10 m is an engineering starting point for the installed NEO-M8N, pending field
validation. Its [official data sheet](https://content.u-blox.com/sites/default/files/NEO-M8-FW3_DataSheet_UBX-15031086.pdf)
specifies 2.5 m horizontal accuracy under its stated static CEP50 test conditions;
this is not a worst-case moving-bus error bound. A 5 m circle would leave little
margin for receiver error and stop-pin placement. Software replay proves the
chosen rule, not RF accuracy or the optimal field threshold.

Separate policies remain: 75 m permits parked return readiness only **after**
the previous trip completed within 10 m and the default 30 s dwell elapsed;
departure uses min(150 m, max(10 m, half the first-leg distance)). An automatic
return is armed at index zero and does not depart until that departure guard.

New regressions reject 11 m/15 m and accept 9 m at intermediate stops in both
orders and at either initial endpoint, bound between-fix crossings to 10 m,
reset terminal confirmation on exit, and verify ingestion/history/index handoff.
The emulator browser regression sends authenticated device fixes at 11 m then
9 m and checks the actual passenger timeline switches to the next stop.

## Verification scope

- Arrival follow-up: full `npm test` passed (138 script, 1,226 backend and 650
  frontend tests; 58 emulator-only assertions skipped by that normal command).
  All 52 focused direction/reducer/ingestion lifecycle tests passed, as did
  lint, backend build, frontend/maps TypeScript, exact PR-base `qa:budget`,
  `qa:check` and all 36 QA infrastructure tests.
- The arrival boundary and full completion/return/history browser journeys
  passed at both mobile and desktop: four executions, no retries. Screenshots
  show the actual passenger timeline after authenticated 9 m telemetry. This
  local run filtered to those two journeys; its all-cases report correctly
  stays `BLOCKED` for the unexecuted mappings (wrapper exit 1 despite four
  passing Playwright executions). It is not a full browser acceptance claim.
  Evidence is under `evidence/arrival-10m/` in the local audit directory below.
- Full initial unit/script run: 1,219 backend tests, 650 frontend tests and
  138 script tests passed. The 57 emulator-only tests were skipped by that normal
  backend command, as designed. After the final pending-revision refinement,
  108 affected backend tests passed separately.
- Lint, frontend/backend TypeScript, live-maps harness TypeScript, backend build,
  production Next.js Webpack export, OpenAPI/UI contracts and `qa:check` passed.
  The QA catalog still reports `NOT_RELEASE_READY`: catalog validation is not
  certification of all 351 feature cases.
- Synthetic browser regressions: all 22 mobile/desktop admin access checks and
  both marker-hook checks passed.
- Final real-provider replay: both desktop (1920×1080) and mobile (390×844)
  passed. Authenticated emulator webapp: all 19 scenarios passed at each
  viewport (38 distinct scenario/viewport executions across the partitioned
  runs, without retries in those runs). Together with the synthetic suites,
  this is 64 passing browser scenario executions across distinct evidence tiers.
- All 58 emulator assertions passed across the initial successful file results
  and focused follow-ups, including the new abandoned-return test. The final
  version-refusal/recovery file also passed again after the pending-write refinement.
- Real Google Maps verification uses actual passenger, Live Ops and route-editor
  components, Maps tiles, polylines and advanced markers with simulated bus/auth
  stores and previously cached public route geometry. It asserts both travel
  directions, leg handoff, marker registration/movement, uncertainty recovery,
  rejection of stale revisions, no extra road objects on ordinary fixes and
  live editor colours. It makes no new Routes API requests.
- Authenticated webapp verification uses disposable Firebase Auth, Firestore and
  RTDB with the real app/API components and synthetic Maps/Places boundaries.
  Route colour save/reload, protected service lifecycle, retained history/chat,
  boarding, profile, feedback, settings, fleet and role/navigation checks are
  tracked per viewport in the local execution ledger.

The initial broad emulator run hit the runner deadline; its privacy assertion
passed on a focused rerun. The initial combined authenticated browser run hit
the runner deadline after 14 passing mobile tests and a sign-in click timeout.
Follow-up runs partition the same tests without increasing individual test or
assertion timeouts. These initial outcomes remain in the evidence.

The mobile side-by-side maps replay exposed a fixture-only overlay problem:
the passenger page's fixed sheet intercepted the stacked admin page. A transform
now gives each replay pane its own viewport, including a definite editor height
for its percentage-height map. The stale-revision oracle compares
marker coordinates/identity, avoiding an exact comparison of subpixel DOM
projection rounding. The independent 3 px registration check remains intact.

## Environment and limits

The first hosted run of `31cd343` stopped at `qa:budget` before running web tests:
the new abandoned-return emulator regression was not linked to
`abandonedRideReconciler.ts` in the exact-source QA map. The follow-up maps both
the reconciler and its policy to that existing L2 assertion under `TRIP14`.
The gate is reproduced using PR base
`a523731295d37c9ecaf1a917cebefa4502b34dab`; no acceptance requirement or workflow
condition is relaxed. The downstream evidence failure was caused by the stopped
web job producing no execution artifacts.

The arrival commit's first hosted run exposed a second fixture issue: the
boundary journey passed, but the following completion journey failed in both
viewports. The same synthetic session ID was reset with backdated sample
offsets (20 s/25 s); fast CI could give the next journey an older timestamp
than the engine's last processed fix. Local browser/sign-in overhead masked
that ordering. The test-only telemetry controller now applies one uniform 20 s
replay lag relative to capture time for travelling fixes, keeping their order
across resets while retaining plausible elapsed travel before the live terminal
fix. Immediate fixture reset/reuse is asserted in
the boundary browser regression. Production ordering guards and deadlines
remain unchanged.

Node 24.19.0; Java 21; Chromium via Playwright. The authenticated app runs in a
separate managed checkout without `.env` files. Existing user changes and
credentials in the primary checkout are preserved. A process-local
`JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\nonexistent-eki-nio` works around
this Windows JDK's failing Unix-domain loopback initialization; no machine-wide
Java/network settings or application permissions were changed.

No production Firebase writes, deployment, merge, physical GNSS execution,
real OAuth sign-in or field/lane-accuracy claim is included. Real-provider maps
and emulator-backed webapp results are complementary evidence tiers.

Detailed commands, individual results, initial failures, screenshots, candidate
controls and uncovered cases are retained locally under
`artifacts/qa/interaction-audit/2026-10-18-pr336/`, with supporting logs/results
under `artifacts/pr336-*` and `artifacts/routing-in-app-maps/`.
