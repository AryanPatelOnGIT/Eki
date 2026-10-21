# Contributing to Eki

Last updated: 2026-10-04 14:20 IST (UTC+05:30).

## Create a branch and PR

1. Fetch the target branch and start from its latest commit. Current integration work targets `testing`; `main` is the controlled release branch.
2. Use a focused branch (`codex/<task>` for Codex work; `feat/`, `fix/` or `chore/` for other contributions).
3. Keep changes scoped. Preserve existing uncommitted work; use an isolated worktree when needed.
4. Commit with a clear Conventional Commit message, such as `docs: refresh onboarding` or `fix: guard stale feedback responses`.
5. Open the PR against the intended base (`testing` for integration), describe the user-visible result and list actual validation and remaining limits.
6. Obtain maintainer review and green required checks before merging. UI changes should include appropriate screenshots with sensitive data removed.

Example from a clean checkout:

```powershell
git fetch origin testing
git switch -c codex/my-task origin/testing
npm ci
```

Follow [getting started](../GETTING_STARTED.md) for configuration. Use Node.js 24 to match CI.

## Verify the affected behavior

- Software changes: run `npm run verify` (lint, tests, builds, packaging and dependency audit).
- Auth/admin/browser changes: run `npm run test:e2e:admin`; install Chromium with `npx playwright install chromium` if needed.
- Firebase rules changes: run `npm run test:rules` with Java 21 and the emulator prerequisites.
- Firmware changes: run native PlatformIO tests and the affected build target. Timing, power, GNSS, TLS and radio claims also need recorded physical evidence.
- Documentation-only changes: sync mirrors, run the documentation mirror test and check relative links/commands. Record any broader CI result separately.

The [test strategy](../testing/TEST_STRATEGY.md) states what these checks prove. Report skipped or unavailable checks explicitly. A compile does not establish physical acceptance.

## Maintain documentation and configuration

1. Update the authoritative guide in the same change as its behavior. Use the [documentation index](../index/README.md) to choose the page.
2. Put `Last updated: YYYY-MM-DD HH:mm IST (UTC+05:30).` directly below the title. Use the actual edit time. For historical evidence, keep the original run date, commit, measurements and limitations.
3. Prefer numbered procedures, short bullets and comparison tables. Explain prerequisites before commands and expected outcomes after them.
4. Update the relevant tracked environment template and [configuration reference](../CONFIGURATION.md) when adding/changing variables. Never commit filled `.env`, `secrets.h` or signing material.
5. Edit root/package source documents, then run `npm run docs:sync`. Their `docs/` copies are required by `backend/src/docsMirror.test.ts`; do not edit a generated mirror independently.
6. Remove completed plans or scratch notes after moving useful behavior into maintained guides. Keep distinct acceptance evidence and architectural decisions traceable.

Documentation check from the repository root:

```powershell
npm run docs:sync
npm exec --workspace=backend -- vitest run src/docsMirror.test.ts
git diff --check
```

Use placeholders in examples. Keep service-account JSON, device/Wi-Fi credentials, App Check debug tokens, bearer tokens, signing keys and personal/location evidence out of source control and PR output.

## Firmware contribution rules

- Preserve fail-closed TLS, credential rejection and fleet security gates.
- Document the effect of cadence/threshold changes on writes, freshness and recovery. Do not change policy based solely on a successful build.
- Record commit/build, board profile, conditions and redacted timing/recovery results for hardware claims.
- Use the [witnessed fleet procedure](../operations/HARDWARE_SECURITY_PROVISIONING.md) for protected fleet artifacts and irreversible provisioning.

See [security policy](SECURITY.md) for vulnerability reporting and [code of conduct](CODE_OF_CONDUCT.md) for collaboration expectations.
