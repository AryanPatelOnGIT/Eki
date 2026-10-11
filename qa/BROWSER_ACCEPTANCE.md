# Actual components with disposable browser integration

Updated: 11 October 2026, 19:29 IST (Asia/Calcutta).

This L3 suite mounts PassengerWorkspace with its actual boarding, profile,
chat and feedback children, actual AuthProvider/hooks/database SDKs, and the
actual compiled backend server, middleware and workers. It also mounts the
actual AdminPage and its six lazy panels. Browser tests inspect HTTP/UI outcomes
and independently read persistent demo records through a separate fixture
control listener. No application route is replaced with a success stub.

## Run

Use a clean disposable checkout with Node 24, Java 21 and the locked npm
dependencies. The frontend/production `.env` files must not be copied here.

```sh
npm ci
npx playwright install --with-deps chromium
npm run qa:check
npm run qa:browser
```

The launcher starts Firestore, RTDB and Auth with pinned Firebase CLI 15.14.0,
validates the running hub, and uses only `demo-eki-qa`. Auth's client endpoints
select the CLI's default project, so the browser, Admin SDK and seeded Auth
accounts deliberately share that exact demo project. Each run owns a fresh
emulator process; it must not share ports or namespaces with another suite.
Reserved ports: browser 3115, backend 3116, fixture control 3117, Firestore
8085, RTDB 9005, Auth 9095, hub 4405 and logging 4505.

The backend fixture installs the actual rules copies, creates synthetic
password accounts and role claims, and initializes the Admin app before
application bootstrap. Its emulator-only owner credential has no private key.
The fixture adapts the server's listening address from wildcard to literal
loopback without changing the application server source. Real environment
files are rejected before bootstrap, metadata discovery is off, and the
backend has the preloaded socket/DNS guard. Browser HTTP and WebSocket routes
deny targets outside the explicitly allowed loopback ports before navigation.
These are scoped transport guards, not an OS sandbox for arbitrary native code.

## Assertions and evidence

Thirteen named cases run once in each Chromium mobile/desktop viewport, one worker,
no retries. They cover successful boarding and reload restoration, wrong-code
and distant-position denial with no membership mutation, lost chat response
after a real commit and idempotent retry/listener delivery, persisted feedback
and local cooldown, profile sign-out confirmation/cancellation, admin settings
and role switch, all six tabs with keyboard focus, vehicle creation/edit cancel/
delete, and route identity/edit cancellation. Additional integrated cases drive
registered synthetic device HTTP fixes through the real workers to completion,
one separate automatic reverse ride, the passenger's real ten-second feedback
timer and persisted ride feedback. Admin history reload/manifest inspection,
cancelled and confirmed terminal deletion, feedback review/resolution, inactive
operator creation/edit cancellation/deletion with real Auth claim demotion,
delay 0→1→0, boarding-code retrieval, interruption and distinct restart are
checked against independent durable records. The browser uses both native
selectOption and custom option clicks according to the actual control.

The operator case first deliberately selects a vehicle with no routes. The
backend now rejects that deterministic assignment with 400 before changing
operator/user records or Auth claims. Previously its late validation returned
500 after persisting a partially assigned operator. Unit regressions cover both
missing and route-less buses while preserving the original operator and old
account authorization; the browser checks rejection, edits the spare vehicle
to give it a valid route, then retries and observes the actual acknowledgement
before inspecting claims. This change does not make cross-store Firebase/Auth
publication atomic or certify deployed multi-replica race recovery.

The synthetic route is approximately 400 m. Sample times span the previous
45 seconds, with two intermediate accepted fixes and a final stopped fix.
The chosen speeds/times satisfy the source's travel envelope; position advances
are not forced into RTDB. These accelerated timestamps exercise lifecycle
semantics, not measured driving latency or a 45-second wall-clock soak. Every
fixture request has a deadline and observes the real worker checkpoint before
the next dependent fix. A reverse ride may already be active at its origin when
observed; both armed and active are valid, and it must remain separately owned
and empty of the original passenger.

`browser-playwright.json`, `browser-junit.xml`, `browser-report.json`,
`browser-report.md`, `browser-run.log` and failure screenshots are written under
ignored `artifacts/qa`. Reports record actual source SHA/dirty state, observed
test results, running emulator targets and browser versions. A visible-control
census is attached after each test; it is a rendered candidate inventory,
not evidence that every inventoried control/action/state was exercised.
Exact limited case links in `browser-test-map.mjs` remain PARTIAL even after
both viewport assertions pass. Empty, skipped, flaky, timed-out or incomplete
results cannot promote the execution scope to green. CI uploads failure
evidence with seven-day retention. Trace recording is off so Auth tokens and
storage state cannot enter a trace artifact; all identities/coordinates are
synthetic. The launcher has a six-minute deadline and test child four minutes.

Each test resets only owned demo records and inspects both browser and backend
transport denials. Playwright closes its contexts and owned web servers;
the backend's actual shutdown handler drains workers and SDK resources, and
the Firebase CLI stops emulator processes. Tests must run serially because
they deliberately share one disposable database.

## Deliberate boundaries and remaining work

Maps rendering uses the existing deterministic SDK adapter; Next dynamic
loading and navigation use fixture adapters. This does not verify Google
roads, map paint performance, production static-export deep links or OAuth
redirects. App Check is explicitly disabled for isolated development here;
the separate existing admin regression covers synthetic enforcement behavior.
Real attestation/provider configuration is a manual gate.

The primary synthetic completion/automatic return chain, inactive operator CRUD,
service interruption/restart and terminal history deletion are now exercised.
Remaining software includes route-save/Places fault scenarios, reassignment and
active-operator mutation denial, broader service/history race partitions, all error/control
partitions, PWA failure modes or other browser engines. Those remain software
work in the master roadmap, not physical-test waivers. Hardware/live-motion
requirements remain under GitHub #245/#300. Local development failures and
setup fixes are retained in logs; exact-commit passing evidence belongs in the
PR/run artifacts after execution, not in this specification.

## Harness fault demonstration

On 11 October, the Linux development run used Node 22.23.2, Java 21.0.12
and Chromium 153.0.8010.12. All twenty executions passed with zero skipped,
flaky or retried tests. This was a dirty development checkout, not immutable
release evidence. A second run deliberately changed the fixture's persisted
boarding code from `ABCD2345` to `ZZZZ2345`, keeping the browser's valid-code
input unchanged, and selected the boarding/reload test in both viewports.
Both executions failed at the missing confirmed On board state; the report
was RED with zero passed and two failed. The fault was removed before commit.
This demonstrates that an incorrect persisted boarding precondition is caught;
it does not claim exhaustive mutation coverage. To reproduce, make those two
temporary changes in a disposable checkout, run the launcher, retain its
failure evidence separately, restore the fixture and run the full suite.

The report classifier separately rejects wrong test files, repeated viewport
observations, missing viewports and retry-only passes. Exact file, title and
one first-attempt result from each mobile/desktop project are required.

The expanded Linux development run subsequently passed all twenty-six
executions with zero failed/skipped/flaky/retried tests in 2.4 minutes. Its
checkout was dirty and records that fact. The completion journey took about
18 seconds per viewport, including the real ten-second feedback delay. The
source bug above was reproduced before its fix; missing/empty-route assignment
now fails without partial state, followed by a successful valid-route retry.
An existing diagnostics-pool unit test also now freezes only Date.now during
its HTTP loop so CPU load cannot turn its admission-isolation oracle into an
accidental window-rollover test. Timers and HTTP remain real; throughput and
elapsed-time recovery are separate checks.
