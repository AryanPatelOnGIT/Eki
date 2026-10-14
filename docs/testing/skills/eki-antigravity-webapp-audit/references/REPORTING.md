# Reports and coverage contract

Write actual outputs to `artifacts/qa/interaction-audit/YYYY-MM-DD-SHORTSHA/` (or another explicitly designated run path). Do not add evidence to tracked app source. Create directories only in local clone. Keep all evidence privacy-redacted.

## `coverage.csv` schema

Header provided in `assets/coverage-template.csv`. Every row represents an actual actionable, uniquely identified `(component, state, action, role, viewport, environment)` assertion. **No shared row marking "all buttons pass."**

Required values:
- `status`: `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `INCONCLUSIVE`, `NOT_APPLICABLE`.
- `evidence_tier`: `STATIC`, `UNIT`, `SYNTHETIC_BROWSER`, `EMULATOR_BROWSER`, `LIVE_PROVIDER_BROWSER`, `LIVE_CLOUD`, `PHYSICAL_GNSS`.
- `executed`: `true` only for executed **and asserted** tests, `false` for candidates/blocked/untested.
- `oracle_passed`: `true` only if result matched observable expected behavior. A mock-only PASS is tier-specific.
- `evidence_path`: relative path to actual sanitized trace/screenshot/JSON/report, populated for executed rows; do not invent.
- `source_path`, `source_line`, `locator`, `control_name`, `precondition`, `action`, `expected`, `observed`, `role`, `viewport`, `environment`, `bug_id`, `blocker_reason`.

Every PASS requires `executed=true`, `oracle_passed=true` and nonempty `evidence_path` pointing to a **real file**; expected/oracle must be meaningful. FAIL requires executed and evidence. `NOT_APPLICABLE` must explain proof it no longer exists in current source. BLOCKED must explain exact prerequisite and named owner when possible.

## Mandatory `EXECUTION.md` sections

1. HEAD SHA/branch/local changes, timeframe/timezone, Node/browser/device versions, admin/passenger fixture IDs redacted, frontend/backend addresses and evidence tiers.
2. Commands executed, exit codes, suite counts, skipped/flaky/retry, build/lint/audit outcomes. Include `npm run qa:check` and official A–Z catalog reconcile.
3. Pages/roles/screens/components discovered, source and runtime control counts, total required ledger rows.
4. Results by evidence tier and by feature, with `PASS / FAIL / BLOCKED / NOT_RUN / INCONCLUSIVE / NOT_APPLICABLE` counts; **do not blend tiers**.
5. Highest-priority defects with actual reproduction; environmental blockers; available but unused credentials or tool limitations.
6. Outstanding live provider/browser/physical gates (#245/#300) separate from deterministic outcomes; explicit product-decision unknowns.
7. Exact next execution steps for uncovered rows and risk-based release decision. If any applicable essential browser row is blocked/failing, do not call the app production-ready.

## `BUGS.md` template

```md
### BUG-001: [brief observed symptom]
- Severity/impact: P1/P2/P3 with why
- First observed: YYYY-MM-DD HH:mm TZ, SHA, environment tier
- Surface: passenger/admin, page, viewport, role
- Precondition/test fixture: redacted
- Steps: 1. ... 2. ... 3. ...
- Expected: ...
- Actual: ...
- Evidence: screenshot/trace, redacted request URL path and HTTP code, error/log
- Reproduced: 2/2 (or 1/3 etc.)
- Suspected cause: file:line and supporting proof or `unknown`
- Existing issue/PR linkage: exact URL or `none found`
- Workaround/mitigation: ...
- Regression test: filename/case to add in fix mode
- Status: OPEN / FIXED_UNVERIFIED / RETESTED_PASS / INCONCLUSIVE
```

## Additional outputs

- `control-inventory.json`: AST/source census (candidates; not runtime verified).
- `journey-inventory.md`: state graph, URLs, roles, fixture transitions, visible controls and unvisited branches.
- `coverage-summary.json`: tool-generated stats and gate failures from `scripts/coverage-gate.py`.
- `evidence/`: redacted screenshots, traces, browser logs, failure videos, network status excerpts. Avoid full Firebase dumps/location trails.
- `BUGS.md` with all defects. If none found, write "No defects found in the executed scope" plus unresolved test gaps, never "bug-free".

### Final answer example (numbers must be actual)

> Audited `testing` @ `abcdef0`. Executed 172/205 authorized interactions using emulator browser, 22/205 with real provider checks; 8 reproduced defects (2 P1). 13 blocked on OAuth/provider access and 20 not run. Profile avatar fails for an image 403; route search live provider not exercised. All executed test IDs and evidence in `coverage.csv`. **Release not certified**.
