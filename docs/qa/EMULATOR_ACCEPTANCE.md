# Disposable emulator acceptance

Last updated: 2026-10-11 18:18 IST (UTC+05:30).

Run `npm run test:rules` with Node 24 and Java 21. The existing CLI (15.14.0)
launches Firestore, RTDB and Auth on literal IPv4 loopback ports 8085, 9005
and 9095, hub 4405 and logging 4505. The generated configuration contains
copied rules/indexes and no hosting deployment configuration. Production rule
files are unchanged. Each sequential suite owns a `demo-eki-*` namespace.

Test setup rejects incomplete demo configuration, real credentials and a missing
preloaded transport guard before SDK imports. The child verifies the running
hub targets. A Node socket/DNS guard blocks non-loopback SDK transport; its
unit fault probe catches sockets, TLS, HTTP/2 and DNS before external traffic,
while a real loopback connection succeeds. Tooling downloads are dependency
setup before that guarded child. This is not an OS sandbox for arbitrary native
code/subprocesses; do not reuse it for arbitrary commands.

## Integrated observations

`qaTelemetryChain.integration.test.ts` mounts the actual device router and
bounded JSON parser on an ephemeral loopback HTTP port. Actual scrypt/registry,
payload parser, RTDB transaction, route watcher, trip worker, public projection
and Firestore lifecycle run against real emulator SDK instances. Firebase
initialization is injected; database operations are real. Google computation
throws if called; route geometry and identities are synthetic.

Assertions cover unauthorized/forged/oversized requests without persistent
mutation, valid device presence without fabricated passenger service, observed
response timing headers, duplicates/delayed old samples and durable ride
identity/activation/public projection. Existing rules, worker, recovery, privacy
and read suites also run. The fixture does not exercise every global server
middleware or production bootstrap. Exact L2 links in `emulator-test-map.mjs`
remain PARTIAL acceptance scopes even when assertions pass; browser/provider/
field acceptance is separate.

## Evidence and teardown

Startup initializes `emulator-report.json` as BLOCKED. The child removes stale
evidence and promotes only its execution scope when all observed assertions
pass without skips. JSON/JUnit/Markdown/log evidence includes actual source SHA,
dirty state, counts and running emulator targets; CI retains failed runs too.
The child has a four-minute ceiling and launcher a six-minute deadline.

The chain drains route processing, awaits worker stops, closes HTTP connections,
terminates Firestore and deletes its app. Existing suites retain independently
owned demo namespaces and sequential scheduling; CLI stops emulator processes.
No real accounts or shared cloud data are seeded/deleted.

The local Windows launch on 11 October failed before tests: Java's selector
pipe reported `SocketException: Invalid argument: connect` during
UnixDomainSockets initialization. That attempt is BLOCKED, never PASS or an
excuse to skip tests. Linux CI supplies execution evidence, recorded in the PR
and artifacts. Unit isolation/transport/rules-copy checks and backend lint/build
passed independently. No live-motion, OAuth/App Check/domain, actual Maps,
RF/power/thermal/OTA acceptance is claimed. Field gaps remain in #245/#300.
