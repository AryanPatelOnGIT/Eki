---
name: eki-antigravity-webapp-audit
description: Use an actual Antigravity browser to comprehensively audit Eki's passenger, admin, authentication, maps, chat and live-bus web application by reconciling source-level interactive controls with actually executed browser journeys. Use when asked to click/test every button, find broken profile photos or Google Places search, verify all UI states, discover bugs, create evidence-backed reports, or retest repairs on the Eki testing branch.
---

# Eki webapp interaction audit

You are a meticulous, adversarial QA engineer using source inspection **and an actual interactive browser**. The aim is **maximum defensible interaction coverage**, never an unsupported claim of finding literally every possible bug.

## Scope and ground truth

- Repository: `https://github.com/notnamansinha/Eki`. When invoked for PR #323, fetch and inspect its current head (it is on AryanPatelOnGIT/Eki, not origin’s ordinary branch refs). Otherwise default to branch `testing`; record exact **HEAD SHA**, local uncommitted changes, app URL, backend URL, test principal/roles, time zone and environment. Never assume `main` has the same UI.
- **Inspect current code before assuming features or selectors.** In the 2026-10-12 `testing` baseline, the Next frontend exposes `/`, `/passenger`, `/admin` and `/feedback`; the admin tabs are **Live Ops, Routes, Fleet & People, History, Feedback, Settings**. The passenger workspace switches among home, tracking and profile. These are leads, not an exhaustive/current route census.
- Read `references/EKI-SOURCE-MAP.md`, then inspect actual `frontend/src/app`, component imports and conditional render branches, plus `backend` contracts. Read `docs/testing/WEBAPP_A_Z_AB_TESTING.md` and its plan, `qa/README.md`, `docs/testing/TEST_STRATEGY.md`, recent non-UI PRs and unresolved issues. **Do not mark historical checklist entries PASS solely because they exist.**
- Before execution read `references/EXECUTION-PROTOCOL.md` and `references/CONTROL-MATRIX.md`. For nuanced test oracles read `references/FAILURE-ORACLES.md`; for practical Playwright patterns see `references/PLAYWRIGHT-RECIPES.md`; for required output use `references/REPORTING.md`.

## Antigravity browser execution

Open the application in Antigravity's actual browser and use its browser interaction tools to inspect and operate the rendered UI. A terminal-only run, screenshots without actions, source reading, or green CI cannot satisfy this request. Record the browser tab URL and inspected accessibility/DOM controls at each state. Use ordinary pointer taps at the visible control centre without force-clicking or removing overlays. Use keyboard separately. Use Playwright only as supplemental deterministic evidence, or as the browser implementation when interactive tooling is unavailable; disclose that distinction. Open the real Next build in addition to component fixtures: fixture UI bypasses routing, production CSP, hosting and provider initialization.

Read [references/PR-323-REGRESSIONS.md](references/PR-323-REGRESSIONS.md) for the current repair oracles and account-deletion contract. Discover every current feature from source and runtime, including controls absent from the starter matrix. Keep the browser visibly open where the environment supports it.

If using this bundled single Markdown document, its `Included document:` sections are the referenced files. If executable census/gate helpers are unavailable, inspect the tracked package in `docs/testing/skills/eki-antigravity-webapp-audit/`; do not claim a helper ran if it did not. Run from the repository root; inspect each helper's documented CLI first (the census helper has no help switch).

## Mandatory execution contract

1. **Preflight and safety.** Inspect `git status`, branch/HEAD and service health; preserve all user changes. Work locally or in an isolated worktree. Use a dedicated disposable Firebase emulator/test project and synthetic accounts/test data. Avoid the actual Eki `testing` Firebase project's destructive operations without explicit permission. No real passenger data, secret tokens, Google API keys or precise travel histories in evidence. No production or provider-billed load/fuzzing without approval. Do **not** run delete-account, route deletion, vehicle deletion, end-ride, irreversible feedback changes or cloud writes in a shared environment; mark these BLOCKED and, if possible, exercise on emulators. Reproduction must not create real rides or affect public transit.
2. **Discover every path and interactive state.** Enumerate all Next routes, role gates, navigation and conditional UI states. Run `node docs/testing/skills/eki-antigravity-webapp-audit/scripts/control-census.mjs` (adjust install path) to create a **source-level candidate control inventory**. Supplement it with runtime DOM/accessibility-tree census. Include portals, overlays, nested dialogs, expanded rows, mobile menus, disabled transitions, lazy-loaded components, keyboard-only controls, map markers, drag handles, toasts, feedback forms, retry buttons, and confirmation cancel/close. Code-based enumeration is a starting point, **not proof of interactive coverage**.
3. **Construct a durable ledger before clicking.** One row for each `(page, role, entry state, visible control, action, expected outcome, viewport, environment/provider mode)` combination. Map source file/line, semantic locator, required fixture, actual click/tap/keypress, state/network/database oracle, evidence pointer, outcome and bug ID. Different states create different rows. Record all inaccessible controls explicitly. Never skip a reachable control silently.
4. **Exercise the REAL rendered app** using a browser automation agent, Playwright, or equivalent. Navigate from cold start as guest, passenger and admin (authorized test accounts); at minimum desktop and 390px mobile, plus 360px and intermediate widths on any overflow. On each page enumerate visible interactive elements in the accessibility tree, make each reachable, click/tap each **safe** control, and assert its distinct intended effect (not merely absence of exception). After action check console/page errors, network requests and statuses, DOM state, focus, overlap, persistence after reload/back/forward and backend state where applicable. Interact via keyboard (`Tab`, `Enter`, `Space`, `Escape`, arrows) where expected. Test every create/edit/save/cancel/retry/reset/close path. Keep a running visited-state/visited-action graph and loop until no reachable control or state is unexplored in the authorized scope.
5. **Run both fast deterministic AND relevant real integrations.** Unit/Vitest, TypeScript/build/lint, existing Playwright fixtures, Firebase rules emulator, emulator-backed authenticated journeys, and controlled genuine Google Maps/Places and OAuth browser flows where credentials/provider environment allow. Distinguish **mocked, emulator, browser-with-live-provider, live-cloud, and physical-hardware** evidence. Passing a fake map or seeded JSON response does NOT prove real Google Places search, tile rendering, OAuth picture delivery or real GNSS updates.
6. **Adversarial cases per control.** Valid/invalid/empty/boundary input, slow/down/offline response, 401/403/404/409/429/5xx, stale results, out-of-order response, rapid repeat/double click, reload in flight, authorization switching, session expiry, multi-tab and offline/resume. Do not invent backend failures; inject using a controlled fixture/emulator when necessary. For each condition check visible feedback, no stuck spinners, data correctness, idempotency/no duplicate mutations, and recovery.
7. **Eki must-pass regressions.** (a) Passenger Profile avatar: a real `photoURL` must render a successfully loaded picture, not a broken `<img>` or invisible profile; fallback when missing/broken. (b) Admin Routes “Search for a stop”: type 3+ chars, observe debounced **authenticated** `/api/places/search?q=...`, verify genuine prediction list, click a prediction, assert resulting stop coordinates/labels; also verify real map picking, stop move/reorder/swap/drag, save/reload, conflict/error flows. (c) Every admin tab and submenu, CRUD dialogs, active ride lifecycle, chat, history, feedback and settings must be exercised. (d) Passenger find bus → route/destination selection → boarding/join → active tracking/map/timeline → chat → completion and post-ride feedback; verify refresh, multiple buses/directions, stale data, no service and guest/auth states. See detailed oracles and matrix.
8. **Bug protocol.** Before filing, reproduce at least twice under identical conditions if possible, record exact preconditions and steps, expected vs actual, screenshots/trace (redacted), console, failed request status, affected role/viewport, source location, severity and confidence. A reproduction is not a diagnosis; root cause is a hypothesis until source/log evidence supports it. Classify environmental blocks (missing key, provider restriction, setup) separately from application defects. Link/compare already-open issues and avoid duplicates.
9. **Fix mode is OPTIONAL.** Default `audit-only`. If user authorizes fixes, use a separate branch, minimal fixes and failing-first regression tests, then rerun neighboring state matrix and whole smoke suite; never force-push/merge/deploy. Do not silently alter project config or grant broader Firebase permissions to make a failing test green.
10. **Exit gate.** Produce the complete artifacts in `artifacts/qa/interaction-audit/<date>-<sha>/`: `coverage.csv`, `control-inventory.json`, `journey-inventory.md`, `BUGS.md`, `EXECUTION.md`, `evidence/` and `coverage-summary.json`. Execute the coverage gate. Never claim 100% unless every enumerated, applicable, authorized row has **actual passing evidence** in the designated evidence tier. List `FAIL`, `BLOCKED`, `NOT_RUN`, `INCONCLUSIVE` and synthetic-only results separately. If credentials/browser/actual provider are missing, give the precise remaining gates and still complete static/emulator work.

## Useful commands (verify on current checkout)

```sh
npm ci
npm run qa:check
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:e2e:admin
npm run test:rules
npm run qa:browser
npm run qa:browser:providers
npm run qa:browser:service
```

Commands may require Node 24, Java 21, installed Chromium, backend build, emulators, and non-secret local env configuration. **Do not execute against the live cloud without checking each command's target first.** Existing QA guardrails and configs take precedence. Test result from an older commit must never be upgraded to current-HEAD acceptance.

## Deliverable format

Report the current SHA, branch and env; tested roles/browsers; pass/fail/blocked by **test evidence tier**; highest-severity reproducible defects; complete not-run inventory; exact commands and exit codes; links/paths to screenshots/traces; fixes only if explicitly requested; next steps. A successful test command is not equivalent to an end-to-end live UX check. A clickable button is considered **tested** only when its preconditions, event, intended effect and observable oracle have been checked.
