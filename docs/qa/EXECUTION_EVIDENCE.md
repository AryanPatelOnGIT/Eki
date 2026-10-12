# Current-source execution ledger

Last updated: 2026-10-12 15:05 IST (UTC+05:30).

`npm run qa:report` combines the GNSS L1, disposable emulator L2 and actual-component
browser L3 reports with the full source-attributed catalog. It writes JSON and
Markdown under ignored `artifacts/qa/execution-report.*` and GitHub Step Summary.
It is separate from the static catalog, which continues to import definitions
without inventing executed statuses.

Run in a clean disposable Linux checkout with Node 24, Java 21 and Chromium:

```sh
npm ci
npm run qa:gnss
npm run build --workspace=backend
npm run test:rules
npm run qa:browser
npm run qa:report
```

Every required report must belong to the current immutable HEAD and clean working
tree. Wrong SHA, dirty source, missing/unreadable report, invalid counts, missing
observed test identity, unknown case/scope, duplicate observations and a claim
that disagrees with actual results are blocked. A targeted providers/service
browser run records its narrow observations but cannot satisfy the full L3 scope.
The reporter derives case status from exact file/title/level observations; both
browser viewports need one first-attempt pass.

Overlapping requirement IDs retain their L1, L2 and L3 assertion links through a
reviewed mapping union. Duplicate IDs within one family and conflicting semantics
for one identical assertion are rejected. The recently merged BOARD07 regression
and boarding-coordinate fix from current `testing` are retained in this branch.

The ledger distinguishes PARTIAL, FAIL, BLOCKED, NOT_RUN and NOT_COVERED for every
one of the 399 declared requirements. The currently bounded suites can establish
`requiredHarnessExecution: PASS` for their executed scopes. They cannot establish
complete feature acceptance: completeFeatureCases stays zero, softwareRelease
stays NOT_RELEASE_READY and vehicleFieldDeployment stays NOT_VERIFIED. Declared
but unexecuted mappings and uncovered cases remain visible, never silently
excluded or promoted by historical ledger notes.

These commands do not run every existing frontend/backend unit suite or firmware
build. Existing Production verification performs those separately; this ledger
currently imports only the three explicitly instrumented QA families. Further
unit/firmware/control coverage requires exact observed evidence and reviewed
case links. OAuth, real Maps/Places/App Check, hardware and production owner gates
remain separate; motion evidence is tracked in #300 under #245.

The command exits nonzero when required current scopes are unavailable or red.
That verifies report completeness for the bounded harnesses, not whole Eki release
readiness. CI retains the report for seven days even on failure. The workflow
keeps its existing Production verification identity and deployment definitions;
this diagnostic ledger is not a deployment approval or field sign-off.
