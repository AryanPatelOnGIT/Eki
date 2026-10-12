# Eki deterministic acceptance infrastructure

Last updated: 2026-10-12 17:00 IST (UTC+05:30).

The infrastructure imports all 399 feature/matrix/experiment definitions and
inventories current source. Bounded emulator and actual-component browser suites
record partial software evidence with explicit provider and physical limits;
they do not certify the 351-case ledger. A source regression also prevents invalid
operator assignments from partially changing records before rejection. Routine
commands use Node and locked dependencies, with no LLM calls or live provider
requests. Default-branch schedules, deployments and field acceptance remain
separate owner gates.

The [witnessed field package](FIELD_ACCEPTANCE.md) supplies the unexecuted
motion/bench/provider matrix and capture form linked to #300/#245/#246.

## Run locally

`npm run qa:gnss` executes the [deterministic GNSS/property harness](GNSS_PROPERTIES.md)
with separate L1 evidence, bounded seeds and replay paths. Its exact links are
combined with the L2/L3 links without treating any level as whole-case acceptance.
The [HTTP authorization sweep](HTTP_AUTHORIZATION.md) adds a separate L2
published-operation negative matrix. [Native firmware evidence](NATIVE_EVIDENCE.md)
records exact host-policy assertions. [Reviewed unit sub-oracles](REVIEWED_UNIT_EVIDENCE.md)
record selected backend/frontend pure, mocked and React/jsdom checks. After all six instrumented
families run on one clean commit, `npm run qa:report` builds the
[current-source execution ledger](EXECUTION_EVIDENCE.md). Stale/dirty or incomplete
observations cannot satisfy that report's required harness scopes.

```sh
npm ci --ignore-scripts
npm run qa:test
npm run qa:check
npm run qa:catalog
```

`artifacts/qa/qa-report.json` and `qa-report.md` are ignored generated outputs.
The JSON records HEAD **and working-tree dirty state**, full-document byte counts,
SHA-256, line counts, source-attributed cases/oracles, historical ledger notes,
current source inventory and outstanding gates. A dirty report cannot establish
an exact-commit acceptance result. Run again after committing for review evidence.
`qa:check` checks the configuration boundary and catalog without writing output.
The existing root test command also includes the new regression tests.

For a committed PR, `EKI_QA_BASE_SHA=<full base SHA> npm run qa:budget` fails if
changed authority/session/telemetry/live-position/privacy/rules source has no
exact reviewed `sourcePaths` mapping and corresponding changed test file.
The PR workflow supplies an immutable base SHA and fetches history. The gate
checks traceability and test changes, not whether assertions are sufficient;
reviewers must inspect semantics. Historical unmapped cases alone do not fail.

The reader consumes the entire historical plan to EOF, including all appendices;
each line is scanned and full file hashes/byte counts are recorded. Section 5's
351 exact case IDs, C01-C22/H01-H18, eight AB protocols and twenty GNSS profiles
are reconciled. The strategy's SIM-01 through SIM-20 are retained as a separate
unmapped denominator. Original table oracles, supplemental tables and preceding override/boundary prose are
preserved. Historical appendix claims are not imported as current execution.
This is a full **programmatic scan**, not a claim of manual semantic review of
every historical PR/comment or rendered browser state.

## Evidence contract

- 351 feature cases, 40 universal matrix entries and eight experiment protocols
  are separate denominators. Missing/duplicate/unknown IDs are hard errors.
- Source census uses tracked current files: Next page routes, the existing
  mounted Express extractor, JSX controls/event boundaries, import dependencies,
  candidate database calls, literal tests, firmware environments/native sources.
- Static control sites may render repeatedly. Non-JSX interactions, generated
  DOM and visible state/keyboard census need browser execution in later slices.
- Declared tests are not runtime-expanded test counts. Describe titles are
  context only. Database call candidates need review to identify actual writes.
- `test-map.mjs` contains justified exact named test mappings. Initially H17
  maps only the existing L0 OpenAPI/router reconciliation assertion. Everything
  else is conservatively unmapped, even where existing regressions are present.
  Unmapped does **not** mean the repository has no tests.
- Catalog generation can produce only NOT_RUN or NOT_COVERED. History is
  explicitly separate; PASS cannot be imported by editing a status field.
- Priorities and required levels are conservative proposals pending per-case
  review. They are not silently approved release waivers or physical gates.

## Safety boundary

`qa:safety` checks relevant process configuration without loading `.env` files,
SDKs or opening sockets. Known Firebase/GCP projects must be `demo-eki-qa`;
configured target URLs must use literal `http://127.0.0.1:PORT` or
`http://[::1]:PORT`. DNS names, alternate IPv4 notation, credentials, query/hash
redirect parameters, cloud Firebase and known Maps/model keys are rejected.
Errors print variable names, not values.

The future emulator mode (`npm run qa:safety -- --emulator`) also requires:

| Variable | Required value |
| --- | --- |
| GCLOUD_PROJECT | demo-eki-qa |
| FIRESTORE_EMULATOR_HOST | 127.0.0.1:8085 (or IPv6 loopback) |
| FIREBASE_DATABASE_EMULATOR_HOST | 127.0.0.1:9005 (or IPv6 loopback) |
| FIREBASE_AUTH_EMULATOR_HOST | 127.0.0.1:9095 (or IPv6 loopback) |
| FIREBASE_DATABASE_URL | http://127.0.0.1:9005/ |
| EKI_QA_BASE_URL | Explicit loopback backend root and port |
| EKI_QA_EXTERNAL_PROVIDERS | mock |
| EKI_QA_CONFIRM_DISPOSABLE | 1 |

Configuration acceptance is **not runtime proof of isolation**. This slice does
not enable network replay or alter the existing generator/rules runner. Before
any future mutating harness, verify the actual child process's SDK targets,
disable cloud credential discovery, deny outbound network, probe emulator
identity and provide teardown/kill controls. The
[emulator runner](EMULATOR_ACCEPTANCE.md) now uses demo namespaces, explicit
loopback targets and a scoped Node transport guard; its execution evidence
remains separate from static configuration validation.

`npm run qa:browser` runs actual passenger/admin components with the compiled
backend and disposable Auth/Firestore/RTDB emulators. See
[browser acceptance](BROWSER_ACCEPTANCE.md) for ports, setup, reports and exact
provider/navigation/remaining-software boundaries. It runs thirty Chromium
viewport tests without replacing boarding/chat/profile children with panels.

## Audit and next implementation slices

See [the baseline audit](BASELINE_2026_10_11.md) for diagrams, gaps and risks.
Next: expand reviewed P0 test/source mappings and refine the coverage budget;
deterministic GNSS/property replay; fail-closed demo emulator ingestion/recovery;
complete passenger and admin component/browser flows; scheduled read-only CI;
measured load/mutation; separate field acceptance package.

See [scheduled reliability](SCHEDULED_RELIABILITY.md) for proposed definitions,
measured budgets and local reproduction. No nightly/weekly workflow is installed
on the default branch. Scheduled workflows need
the default branch and separate owner approval in the supplied specification.
The existing PR CI can validate the catalog and publish static artifacts without
production credentials; historical NOT_RUN cases do not make the job fail.

The attached Edge Case Discovery checklist informs negative tests for missing,
malformed, duplicate, state/history, input boundary and external-target cases.
[Kognic's article](https://www.kognic.com/articles/edge-cases-autonomous-driving)
informs combined-fault scenarios.
[Safran's testing article](https://safran-navigation-timing.com/the-importance-of-testing-to-detect-gnss-vulnerabilities-in-intelligent-transportation-systems/)
informs the separate receiver truth/TTFF/sensitivity and RF gates. Future cases
must include plausible gradual drift and correct cold/warm/hot start setup;
HTTP coordinate replay cannot certify physical receiver resilience.
