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

The 20 m endpoint geofence is unchanged. No disconnected replay establishes that
a 5 m threshold is reliable for the actual GNSS receiver. Existing quality,
freshness, stopped-state, unique-endpoint and ordered-progress guards remain.

## Verification scope

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
