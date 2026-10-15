# Execution protocol, tooling and safety

## Roles and evidence tiers

Run at least: `guest`, `passenger`, `admin`, `denied/expired` in authorized fixtures. If a role cannot be provisioned, record `BLOCKED` with owner/action needed, not PASS. Name test identities only by generic labels (never personal names or email addresses in shared reports).

| Evidence tier | Meaning | Appropriate claim |
|---|---|---|
| `STATIC` | Code review, AST control census, path inspection | Potential control/defect identified; NOT clicked |
| `UNIT` | Vitest or backend mock API | Contract/logic passing in isolation |
| `SYNTHETIC_BROWSER` | Playwright against in-memory or fake SDK/provider | Real DOM interaction, mocked dependency |
| `EMULATOR_BROWSER` | Browser with isolated real Firebase emulators and test API | Emulated rules/write/read correctness |
| `LIVE_PROVIDER_BROWSER` | Authorized interactive browser using real Google Maps/Places and OAuth; report backend target | Observed actual provider integration for this env |
| `LIVE_CLOUD` | Approved separate staging Firebase/project/backend, controlled test identities | Environment-specific end-to-end integration |
| `PHYSICAL_GNSS` | Actual ESP32/NEO-M8N, real mobile/network, independent truth | Field behavior; cannot be inferred from replay |

A row can have multiple tier-specific results. A `SYNTHETIC_BROWSER` PASS cannot be silently represented as `LIVE_PROVIDER_BROWSER` PASS. Public production is outside default scope.

## Preflight checklist (before any command that writes)

```sh
git status --short
git branch --show-current
git rev-parse HEAD
node --version
npm --version
```

Find existing localhost servers and Firebase settings safely. Inspect scripts and env targets before execution (`firebase.json`, `.firebaserc`, `playwright*.ts`, `scripts/run-rules-emulator.mjs`, network guard). **Never print env files or keys into logs.** Verify local test endpoints and an isolated emulator. If a user worktree is dirty, do not reset, stash or overwrite it without permission. If a server is in use, use a distinct port.

Install Node 24 and Chromium as required by current repo CI. Use `npm ci` only when safe on the branch/worktree; avoid editing lockfiles. Keep traces and artifacts outside repository tracked sources, ideally ignored `artifacts/qa/interaction-audit/`.

## Source-to-runtime coverage

1. Run `scripts/control-census.mjs` against the repo. This outputs candidates with source file/line and clues; compare with current branch.
2. Enumerate actual routes and top-level states by reading Next `page.tsx`, conditional branches, imported panels and existing test cases. Don't rely on README alone.
3. Run interactive browser with trace, screenshot and console/network listeners. Use ARIA role/label and stable test IDs before CSS selectors. Add test IDs only in fix mode and only when necessary. Avoid brittle class selectors.
4. Runtime census example for Playwright (in a local test/script, execute per visible state):

```ts
const visible = page.locator('button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="option"], [contenteditable="true"], [tabindex]:not([tabindex="-1"])');
for (const el of await visible.all()) {
  if (!(await el.isVisible())) continue;
  // Derive name/role; record reachability, preconditions and intended behavior.
  // DO NOT auto-click all nodes: destructive mutations require an isolated fixture.
}
```

5. Recollect after navigation, select, expanded rows, open dialog, editing mode, errors, retry and network transition. The agent must visibly **interact** with every safe reachable control at least once, and document oracles. Static grep/DOM evaluation without a click is not enough.
6. Reconcile `coverage.csv` against (a) static AST candidate inventory, (b) runtime reachable controls and (c) the current official 351-case matrix. Different branch/deployment/roles require different rows. Use stable IDs, not total raw DOM node count, for coverage percentages.

## Safe provider/integration tests

- **Google Maps:** authorization/billing/read API may be chargeable. Use deliberately bounded queries (a few representative queries) in an explicitly authorized test environment. Don't brute-force or stress live provider. Verify actual map tiles/markers and geocoded result coordinates, not just provider SDK initialization. When key/config not available, record `BLOCKED_LIVE_PROVIDER` and still test mocked failures separately.
- **Google OAuth avatar:** use consenting dedicated test identity, redact the `photoURL` and tokens. Verify `img.complete`, `naturalWidth`, visible dimensions and failed image request/CSP. For invalid URL use a test-only profile fixture; do not mutate another user's Auth record.
- **Firebase RTDB/Firestore:** emulator or isolated staging for writes; verify listener teardown, role policies, history projections and no extra writes. Never seed or delete actual deployed testing/production data by default.
- **Maps search backend:** confirm frontend exact URL, token, debounce, response shape; then backend dependency and actual provider response. A 200 with `{results:[]}` for a deliberately obscure query may be expected; a lack of UI suggestions for any query needs controlled cross-check before diagnosis.
- **GNSS:** replay telemetry only through dedicated emulator/mock endpoints; never post faked positions into a live ride. Real RF, thermal, brownout, actual moving bus, TLS and hotspot acceptance require separate supervised field work (#245/#300).
- **Privacy/security:** never create real account-deletion requests or false live emergency messages to test behavior. Do not commit secrets, unredacted user location, images or session cookies.

## E2E instrumentation requirements

- Use a browser tool capable of DOM snapshots, click/typing, screenshots, console + request/response capture. Playwright is preferred for repeatability. If an agent only has source tools and no browser, limit conclusions to `STATIC`/`UNIT`, and clearly report `BLOCKED_BROWSER`.
- For each test record requested URL/route, persona, viewport, scenario, network condition, provider mode and exact run timestamp. Use real assertions: visible UI data, fetched image loaded, API request observed, persisted save after refresh, Firebase snapshot where available.
- Enable trace on failure and screenshot on failure; use video when fixing hard-to-reproduce race. Redact token/auth header, PII, photo URLs, exact location histories, and secret config **before** attaching. Store sanitized network transcript statuses/paths (without search personal data).
- Don't use arbitrary long waits; wait for semantic element or specific network response with a documented timeout. For Places, accommodate its ~300ms debounce and a configured provider network timeout.
- Verify no accidental extra calls/duplicated save after retries; limit provider calls and report counts.
- If a bug exists intermittently, capture attempts/trials and conditions. If it cannot be reproduced, mark `INCONCLUSIVE` and preserve observation, not false PASS.

## Manual browser vs automation

An agent's role is active execution, not just generation of Playwright specs. If tests are written but not run, their status is `NOT_RUN`. After a run, inspect actual report/trace to distinguish skipped, xfail, retry and false oracles. Don't infer working buttons from green unit suite. Use quick static failures to prioritize but always verify user-observed behavior in real rendered UI.

## Suggested test sequence

1. Snapshot source/environment and auth fixtures.
2. Baseline unit/build/lint and existing QA checks (do not block UI execution if one fails; record and continue where safe).
3. Guest and passenger screen sweep including real avatar and full route/join/tracking workflows.
4. Admin tab sweep; prioritize Places search, create/edit/reload, Fleet CRUD, Live Ops service, History/Feedback/Settings.
5. Controlled errors/slow responses/races and reload/multitab.
6. Live provider bounded checks if authorized; separate hardware gates.
7. Coverage reconciliation; reproduce/triage/fix only when asked; retest all neighboring flows.

## Common dangerous false positives and false negatives

- Failed photo because test uses dummy `photoURL` is not evidence that Google OAuth always fails; a real 200 image is a different result.
- Mock Places success proves UI binding, not Google provider or backend config.
- A canceled in-flight Places request can appear as network error in browser tools; don't report it as app failure if cancellation was intentional and stale results were fenced.
- Firebase emulator permits operations differently from deployed project with mismatched rules/App Check; measure each tier.
- A 503 from `/health` can be a dependency issue, not a non-clicking UI button; still report the user-visible failure and environment diagnosis separately.
- Click succeeded but no persisted change after reload: FAIL, even if toast says "Saved".
- A disabled control due to expected state must have its disabled semantics tested; mark non-applicable click, not broken.
- Tests that directly call internal handlers are not evidence that touch targets receive pointer events; actual pointer click/tap is essential.
- A passing desktop screen can hide a clipped mobile-only drawer or keyboard obstruction.

Expected injected errors must be linked to their planned fault row. Distinguish those request/console failures from unexpected runtime errors; do not file a fake-provider quota rejection as a new application defect when the UI and storage recovery oracle passes.
