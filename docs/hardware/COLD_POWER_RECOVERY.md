# Cold power-loss recovery

Last updated: 2026-10-04 14:20 IST (UTC+05:30).

## Guarantee and limits

The RTC telemetry queue survives supported warm resets. On complete power loss,
the firmware can recover **one latest authenticated flash checkpoint**, preserving
its sequence for idempotent retry. It writes the first captured fix each boot,
then at most once every 10 seconds. Fixes since the last successful checkpoint
can be lost; persistent write failures widen that window. This recovers the
latest live state rather than recording every GNSS fix. Zero-loss capture requires
durable per-fix storage or backup power and a separately validated endurance design.

The scheduling interval is not a hard loss bound: capture cadence and flash
write/erase time also contribute. Publisher notification precedes flash work,
but ESP32 flash operations can pause execution and require board timing checks.

A valid warm RTC queue wins even when it is empty after an acknowledgement. Cold
recovery never resurrects a fix on a warm restart. After clock synchronization,
the existing 55-second freshness limit still drops stale recovered coordinates.
An outage longer than that limit should resume from a fresh fix, not replay an
old location as current. Durable accepted ride/stop history is a separate backend
checkpoint and remains intact across a device or backend restart (PR #210).
The backend's 180-day retention applies to ride history; firmware checkpoints
are a bounded operational journal, not the ride-history database.

## Storage and security

Records are 128 bytes and encrypted/authenticated with mbedTLS AES-256-GCM.
The key is domain-separated HMAC-SHA256 derived from the existing device secret.
Fresh random nonces are generated during capture with the Wi-Fi driver enabled.
The codec refuses writes when the radio entropy source is disabled (including
credential-fault isolation); fixes remain in RTC and the cold-loss window grows
until the radio is enabled and a checkpoint succeeds.
Configuration identity and format are authenticated; changing the device secret
or configuration rejects incompatible records. Development firmware configuration
is not a substitute for fleet Secure Boot and flash encryption.

Use the dedicated `gps_log` data partition. Both secure OTA application addresses
and sizes are unchanged. The development layout repurposes its unused filesystem
region; do not apply this table to another project that actually uses that region.
An older Eki layout may use its reserved `coredump` region only when flash core
dumps are disabled. The adapter refuses that fallback if either supported dump
configuration is enabled. An OTA application does not replace the partition table;
that compatibility fallback avoids requiring repartitioning deployed boards.
Fleet layouts also mark the journal partition encrypted. Do not erase or change
a board's partition table, provision security fuses, or install an ephemeral
verification signing key as part of an acceptance test.

The append-only ring never erases the page containing the last confirmed record
until a successor commits on another page. Authentication rejects partial writes,
corruption and incompatible configuration. Unknown-outcome writes consume a new
slot/generation on retry. Read failures disable journal writes; codec failures
leave existing flash untouched. Missing partitions and write failures are visible
in `[PowerCheckpoint]` logs and retain RTC operation.

At continuous ten-second writes, a 128 KiB journal rotates about 8.4 times per
day (roughly 3,080 erases per sector per year). The development 896 KiB journal
rotates roughly 440 times per year. First-fix writes after frequent restarts add
wear. These are workload estimates, not measured endurance guarantees: confirm
the actual flash chip's rated endurance and duty cycle before fleet deployment.

## Stationary acceptance procedure after installation

### Older development boards with flash crash dumps enabled

The stock Arduino-only `esp32dev` SDK enables flash core dumps. On an older
partition table without `gps_log`, `FlashStorage` therefore refuses its
`coredump` fallback and reports `ready=false`. A successful application build
alone does not establish power-loss recovery on that layout. Never remove the
compile-time dump guard: precompiled IDF libraries could overwrite the journal.

Use `platformio run --project-dir hardware -e esp32dev-journal` for app-only
acceptance on an existing unsecured Eki development board. This environment
rebuilds IDF with flash core dumps disabled, preserves credential handling and
OTA restrictions, and uses a separate development configuration. It never
inherits the fleet Secure Boot or flash-encryption provisioning defaults.
Compile-time guards reject a build that accidentally enables flash dumps or
fleet provisioning. The signed fleet environment retains its existing defaults.

Before installing, read the board's security flags and partition table, back up
and validate its existing app, and back up the reserved coredump partition.
Confirm its original Eki layout has app0 at `0x10000` with size `0x300000` and
coredump at `0x3f0000` with size `0x10000`. For that exact layout, write only the
reviewed `esp32dev-journal/firmware.bin` at `0x10000`, then verify the written
image. Do not use a general PlatformIO upload, write a new bootloader/partition
table, erase NVS or filesystem regions, or change security fuses. A secured or
different-layout board needs its normal reviewed provisioning workflow.

The legacy 64 KiB journal has half the capacity of the 128 KiB fleet journal:
at continuous ten-second writes it rotates about 16.9 times daily, roughly
6,170 erases per sector yearly. This is a development compatibility path, not
a new fleet endurance guarantee. Confirm `ready=true` and successful checkpoint
writes on the actual board before performing the power-cut steps below.

Automated CI builds firmware but does not flash boards or modify fuses.
Native tests discard all volatile/RTC state, inject writes interrupted at every
byte boundary, interrupt an old-page erase, wrap the ring and generation, corrupt
records, change configuration, exhaust failing writes, and check stale/warm recovery.
The native codec is a deterministic authenticity stand-in; those tests verify
journal logic rather than AES or electrical brownout behavior.

After the reviewed firmware is installed through the normal provisioning workflow:

1. Keep the board stationary. Capture serial output and HTTP/browser traces.
   Wait for `[PowerCheckpoint] committed=true`; record sequence and write time.
2. Disconnect **all** board power (USB and any external supply) for about ten
   seconds, then reconnect. Check `ready=true recovered=true` on cold boot.
   A recovered fix retains its sequence; a new fix may supersede it before send.
   Compare accepted history and current stop index before/after, ensuring no
   duplicate stop record and no regression to an earlier stop.
3. Repeat an outage beyond 55 seconds. Confirm the stale checkpoint is dropped
   after clock synchronization and fresh telemetry resumes. Check durable history
   is preserved. Verify the UI marks the interruption and returns to fresh state.
4. Perform an ordinary software reset after the queue has been acknowledged.
   Confirm the empty valid RTC queue is preserved and flash is not replayed.
5. Record `[PowerCheckpoint] committed=false` if it occurs. Do not claim a
   ten-second maximum loss window while writes are failing. Collect worst-case
   checkpoint write time and check GPS UART/drop counters during actual erases.

Electrical power cuts, real flash wear/latency, and GPS/UART continuity during
flash operations require board acceptance. Simulations cannot certify them.

References: [ESP-IDF random generation](https://docs.espressif.com/projects/esp-idf/en/v4.4/esp32/api-reference/system/random.html),
[partition flash encryption](https://docs.espressif.com/projects/esp-idf/en/v5.4/esp32/security/flash-encryption.html).
