# Reviewed unit sub-oracles

Last updated: 2026-10-12 16:47 IST (UTC+05:30).

`npm run qa:unit:reviewed` executes ten reviewed backend/frontend unit files and
records exact JSON/JUnit identities, source SHA, dirty state and timestamps. The
current selection has 77 backend and 37 frontend observations. Every assertion
must pass without skip/block; missing files or workspace reports block the scope.
The Node socket/DNS guard is preloaded before SDK imports. Unit dependencies are
pure or mocked; real OAuth/Firebase/provider/browser behavior is not claimed.

Thirty explicit feature mappings cover limited sub-oracles for auth cache and
readiness, boarding code/accuracy/trusted-fix/order, trip reducer/shutdown,
privacy queue recovery, passenger ride identity, directional views/cache,
feedback eligibility and history interaction. Each link was compared with its
source oracle and assertion body; titles alone do not establish applicability.
Parameterized observations are retained in the complete counts, while mappings
use reviewed literal identities. The earlier BOARD07 parameterized MUSE mappings
remain retained and distinct; this scope uses a new explicit clock/binding test
rather than guessing dynamic titles.

New boarding tests establish exact -60000/+10000 millisecond trust boundaries,
bus/route/session binding, offline/terminal refusal, accuracy 0..100 inclusive
and approved eight-character code normalization. They do not weaken production
behavior or replace server-side transactional checks.

The mock Auth verifier tests establish cache/coalescing/expiry/fresh privileged
verification policy, not deployed Firebase revocation propagation. Mock privacy
storage establishes bounded scheduling, recovery generations and refusal of
operator/changed identities, not cloud deletion outcomes. The native-like pure
trip reducer establishes ordered transitions, not worker persistence or field
progression. Pure frontend history/eligibility/cache helpers do not establish
mounted listener cleanup, real PWA/offline behavior or a complete UI control.

The selection joins the current-source ledger as a separate L1 family and the
nightly matrix as a sixth bounded shard. Existing full backend/frontend tests
still run in Production verification; their aggregate historical count is not
silently imported as acceptance for unmapped cases. Successful observations
remain PARTIAL and keep the remaining complete source oracle visible.

## Reproduce

```sh
npm ci
npm run qa:unit:reviewed
```

Node 24 and locked dependencies are required; no Java, browser or credentials
are needed for this narrow selection. Results are under
`artifacts/qa/reviewedUnit-*`. Each workspace child has a two-minute deadline,
one worker and no file parallelism. The combined runner refuses a mismatched
file census or absent assertion evidence.

The first local changed-checkout run on 12 October 2026 passed 114/114 assertions
with zero skips/blocks. That run verifies harness configuration and limited
oracles; a clean hosted commit is needed for current-source acceptance. Software
release and physical field deployment remain unverified.
