# Deterministic GNSS software properties

Last updated: 2026-10-11 18:00 IST (UTC+05:30).

Run `npm run qa:gnss` from the repository root. It uses the existing Vitest
runtime with one worker and a two-minute process ceiling. No emulator, network
replay, real provider, live vehicle or model API is invoked. Its JSON/JUnit/
Markdown/log files are under ignored `artifacts/qa/` and included in PR CI's
seven-day QA artifact. The ordinary backend test suite also runs these tests.

The existing generator is now importable without CLI execution. Its twenty
profile names and offline JSONL format are preserved. A supplied numeric seed
zero is honored; zero count is rejected instead of silently becoming a default.
Custom reverse geometry must be supplied already ordered with `moving`.
The existing opt-in HTTP replay remains a separate, unexecuted path; its
loopback check alone is not backend isolation proof. Do not use it until the
emulator integration slice supplies runtime attestation and network isolation.

## Assertions and evidence limits

- Exact finite latitude/longitude/speed/heading/HDOP/sequence boundaries,
  malformed numeric types, six/eight/nine-field rollout schemas, authority
  fields, case-sensitive motion enum, capture/send clock normalization and
  binary 511/512/513-byte limits including UTF-8.
- All twenty profiles are deterministic and their transport rejects are
  explicitly classified. Teleport is transport-valid but motion-invalid;
  poor HDOP is transport-valid but cannot corroborate early reacquisition.
- Independent equatorial metre offsets check inside/outside travel envelopes;
  antimeridian/pole distance examples avoid sharing the production distance
  function for the expected value. Stationary/moving and short/prolonged gaps
  use distinct contract assertions.
- Four 400-example payload/motion/recovery properties and a 400-walk ordering
  property use fixed seed 42 by default. The ordering oracle is a separate
  lexicographic timestamp/sequence model; shuffled duplicates, reset sequences
  and lifecycle preservation are checked against the production reducer.
- Compound trace walks observe raw versus accepted anchors, pending two-fix
  recovery, final third-fix acceptance, assignment retirement and retained ride
  state. These are L1 reducer observations, not actual database commits.

`qa/gnss-test-map.mjs` contains exact case/assertion links and limited semantics.
`gnss-report.json` uses runner assertion identities and observed statuses to
report **PARTIAL**, FAIL or BLOCKED at case level. A green unit report closes
zero complete feature cases. `qa-report.json` remains a static definition report.
Physical/provider gates are never inferred from either file.

## Reproduce failures

```powershell
$env:EKI_QA_SEED = '42'
$env:EKI_QA_REPLAY_PATH = '5'
npm run qa:gnss
Remove-Item Env:EKI_QA_REPLAY_PATH
Remove-Item Env:EKI_QA_SEED
```

The failure reports seed, generation index (`replayPath`), original and reduced
synthetic input. Replaying regenerates all preceding inputs without checking
them, then checks the same index. Array traces shrink to a smaller prefix;
numeric shrink behavior is independently tested with a deliberately defective
fixture predicate and passing control. The reducer and payload validator are
never edited to inject that fixture fault. Inputs without a shrinker retain
their exact original counterexample; they are not described as minimal.

The first development run failed at seed 42/path 5 because a supposedly valid
recovery generator placed 928 metres of travel inside an 83.15-second 30 km/h
gap. That exceeds the contract envelope. The valid generator now correlates
distance with speed/time; excessive travel remains in the negative suite. This
was a test-fixture defect, not evidence of a production defect.

The runner deletes stale evidence before launch, blocks empty/inconsistent
reports, records actual source SHA and dirty state, and exits nonzero for runner
errors, skips or missing mapped identities. Dirty development runs cannot prove
an exact committed acceptance result. Failure logs contain synthetic fixtures;
no genuine credentials or private drives are used.

## Remaining boundaries

Emulator HTTP ingestion/lifecycle/public projection, browser listeners and
rendered marker/control outcomes still require their own tests. Auth cache,
replica fencing, credential rotation and backend HTTP middleware have additional
existing regressions; the new properties do not claim those complete oracles.
Live-motion truth-reference/drift/compound recovery is tracked as
[sub-issue #300](https://github.com/notnamansinha/Eki/issues/300) of
[#245](https://github.com/notnamansinha/Eki/issues/245). Bench RF, power, thermal,
OTA and controlled OAuth/cloud acceptance retain separate observation gates.
