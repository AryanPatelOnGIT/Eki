# Native firmware execution evidence

Last updated: 2026-10-12 16:31 IST (UTC+05:30).

`npm run qa:native` executes only PlatformIO's `native` host target with pinned
Core 6.2.0. It retains observed JSON/JUnit, logs and scoped Markdown. It performs
no board upload, serial test, flash/OTA, RF test or provisioning.

The current source contains 84 literal Unity `RUN_TEST` sites in nine C++ suites.
The source census excludes ordinary comment/string lookalikes, records source
paths/lines, and calls these static candidates until executed. It does not
evaluate the C++ preprocessor or computed macros. The collector reconciles every
observed name/path against that census, validates suite/count/timestamp evidence
and rejects duplicates, list-only reports, missing cases or non-native execution.

The reviewed map links limited sub-oracles for FW02–FW09, FW11–FW13, FW15,
FW18–FW20. A native pass gives PARTIAL L1 evidence only. The journal uses an
explicit deterministic authenticity stand-in; its native tests do not establish
AES-GCM security or actual flash/power-loss behavior. Real host protocol/crypto
checks and ESP32 builds remain separately exercised by Production verification.

PR CI collects native evidence in its existing firmware job. A bounded
`qa-evidence` job waits for web and firmware, downloads their artifacts and
validates five matching-source families. It publishes a current-source ledger
even when a prerequisite failed; missing/red evidence cannot become green.
Existing workflow identity, image/build/signature tests and deployment semantics
are preserved. The nightly matrix adds a native shard, keeping at most two
concurrent jobs and seven-day retention.

## Reproduce

Use Node 24, Python 3.12 or another supported host Python, locked npm packages
and a working C++ compiler. Dependency acquisition is allowed; no production
credentials are required.

```sh
python -m pip install platformio==6.2.0
npm ci
npm run qa:native
```

The runner has a five-minute child deadline and refuses arbitrary target/port
arguments. PlatformIO telemetry is disabled in its child environment. JSON and
JUnit are under `artifacts/qa/native-*`. Other PlatformIO environments appear as
unselected empty suites in its raw report; they are not counted as executed
native tests or physical passes.

Initial local setup on 12 October 2026 lacked `g++`: all nine native suites
errored during compilation and no assertions passed. After installing the
compiler, all 84 assertions passed in about twelve seconds; the collector's
subsequent run passed in about nine seconds. These changed-checkout observations
established configuration and scope; hosted clean-source artifacts must supply
current-commit acceptance evidence.

An owned temporary threshold change from moving speed 2.5 to 3.5 was caught by
both literal motion-hysteresis tests: 82 passed, two failed, verdict RED. The
original header was restored and all 84 tests passed again. PlatformIO emits a
separate runner-error row after a failing Unity program; the collector retains
that diagnostic separately so it does not erase the actual assertion failures.
No production header change or device execution is included in this PR.

## Boundaries

Actual receiver/UART task ownership, power interruption, RTC retention, storage
layout, watchdog/reset timing, TLS/radio, firmware installation, protected boot
and eFuse behavior require the witnessed package and open #245/#300 gates.
Unmapped FW01/FW10/FW14/FW16/FW17/FW21/FW22 oracles are not silently closed by a
native build. A successful native suite does not establish software release or
physical field deployment readiness.
