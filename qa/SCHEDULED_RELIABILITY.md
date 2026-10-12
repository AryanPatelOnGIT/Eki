# Isolated nightly and weekly reliability

Last updated: 2026-10-12 16:03 IST (UTC+05:30).

## Installation and source provenance

The proposed definitions are `.github/workflows/deep-qa.yml` and
`.github/workflows/weekly-reliability.yml`. They are prepared on the owned
`codex/qa-nightly-reliability` branch for a real push-triggered dry run. They are
not installed on `main`, and no schedule is active from this branch. The supplied
master specification requires separate owner approval for default-branch
installation and forbids unattended merges.

After the reviewed QA stack is merged into `testing`, an owner-approved PR can
install these definitions on `main`. Scheduled and manual runs of that trusted
definition resolve `testing` once through the GitHub API, validate its full SHA,
and use that SHA in every checkout. The feature-branch push validation uses its
own full commit. Missing scripts or reports on the selected source fail closed;
the workflow never falls back to a different branch or historical artifacts.

Daily runs are proposed for 20:17 UTC (01:47 IST); weekly runs for Saturday
20:41 UTC (Sunday 02:11 IST). GitHub may delay scheduled runs. These checks do
not monitor live telemetry or trigger deployment. Existing `Production
verification` and deployment approval semantics remain intact.

## Budgets and evidence

| Track | Actual executed scope | Limits |
| --- | --- | --- |
| Nightly GNSS | Fixed seeds 42 and 0 plus SHA/day-derived unsigned seed; 400 examples/property | Three recorded runs; each child 150 seconds |
| Nightly emulator | Actual disposable Auth/Firestore/RTDB rules and backend ingestion/lifecycle/projection | Child campaign 390 seconds |
| Nightly browser | Actual passenger/admin components and backend; synthetic Maps/Places/Routes; Chromium mobile and desktop | One browser worker, zero retries; campaign 480 seconds |
| Nightly HTTP authorization | Missing/malformed credentials on protected operations and a real emulator passenger token on admin-only operations; minimal public probes | Four named L2 tests with fresh backend processes; campaign 390 seconds |
| Weekly mutation | Stryker 10.0.0 and Vitest 4.1.11; only pure `telemetryPayload.ts` mutated | Two workers; ten-minute outer deadline; both reviewed test files required in report |
| Weekly admission | Five separate production-helper processes, each 250,000 submissions against stalled synthetic dependencies; drain, recovery and FIFO | Each process 60 seconds; 1,250,000 submissions total; no fleet/database/provider load |

Each workflow caps matrix concurrency at two, has a distinct overlap group,
uses read-only repository permissions, immutable Action pins, no deployment
environment and seven-day artifacts. Dependency acquisition is allowed; tests
do not call model APIs, paid providers or genuine Firebase projects. Existing
configuration, Node socket/DNS and browser request guards remain required. They
do not claim an OS sandbox.

Nightly artifacts preserve each GNSS seed's JSON/JUnit/log separately. A
campaign aggregate verifies matching clean SHA, workflow run, seed set, exact
assertion identities and case scopes. A partial campaign, red runner, missing
artifact or subset browser run blocks the required harness scope. The resulting
399-case ledger still distinguishes PARTIAL, NOT_RUN and NOT_COVERED; suite
success cannot make complete release acceptance green.

Weekly artifacts retain mutation HTML/JSON, killed/survived/timeout/no-coverage
counts and admission measurements. A weekly green job means its bounded
baseline was observed. It does not close feature, live-provider, physical or
long-duration acceptance.

## Measured local configuration evidence

These measurements used a changed Windows checkout based on `ed76d93`, Node
24.19.0, on 12 October 2026. They established configuration budgets; they are
not clean-current-SHA acceptance records.

- Initial mutation selection ran 14 tests: 266 mutants, 171 killed, 79 survived,
  16 uncovered, zero timeouts; 1 minute 45 seconds. An excluded imported fixture
  caused the GNSS properties to be omitted from related-test discovery.
- Retaining the imported fixtures and explicitly selecting both files ran 30
  tests: 254 killed, 12 survived, zero uncovered/timeouts; 2 minutes 7 seconds,
  95.49%. New independent tests check primitive shape reasons, all motion enum
  values, delayed send clocks and exact zero/511/512/513-byte bodies.
- The remaining closed-schema-prefix survivor prompted an additional test for
  empty objects and missing final timestamps. The other observed survivors
  remove redundant type checks already enforced by `Number.isFinite`,
  `Number.isSafeInteger` or enum membership. They remain visible for review;
  no mutations are suppressed as equivalent by configuration.
- A 90% mutation floor was selected after this measured baseline, with every
  surviving candidate retained. This score is a regression budget for one pure
  module, not a feature completion target.
- Five admission trials completed 1,250,000 synthetic submissions in about
  three minutes under concurrent local mutation work. Individual durations were
  46.2, 35.3, 33.5, 32.3 and 32.4 seconds. The report correctly refused clean-SHA
  acceptance because the checkout was changed. Hosted measurements must be
  read from the corresponding run's artifacts.

Stryker adds locked development-only dependencies. Its `typed-rest-client`
dependency initially brought a vulnerable `qs`; an override selects audited
6.16.0. The required source-map codec update accompanies the new toolchain.
Routine `npm audit` remains mandatory.

## Local reproduction

Use a clean checkout, locked dependencies, Java 21 and Playwright Chromium with
its Linux system libraries. Remove genuine provider/Firebase credentials from
the process environment before running these isolated tests.

```sh
npm ci
npx playwright install --with-deps chromium
npm run qa:nightly
npm run qa:weekly
```

Individual commands are `npm run qa:mutation`, `npm run qa:soak`, or
`node scripts/qa/campaign.mjs gnss|emulator|browser|api` with one literal suite name.
The integration campaigns require a built backend. Reports are under
`artifacts/qa/`; missing prerequisites produce blocked/failed output.

The default browser campaign currently covers Chromium only. Firefox/WebKit,
full Next production PWA integration, wider security matrices and all remaining
source/control oracles still need reviewed executable coverage. Actual motion
truth and compound recovery are tracked in GitHub issue #300 under #245.
