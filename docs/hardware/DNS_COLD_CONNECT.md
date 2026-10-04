# Bounded telemetry DNS and cold HTTPS connections

Updated: 5 October 2026. Source/build-specific bench evidence is recorded in
[the priority verification record](../testing/ISSUE_246_PRIORITY_PARTS_2026_10_05.md).

The pinned Arduino-ESP32 2.0.17 `WiFi.hostByName` can wait 16 seconds for DNS
ownership and another 15 seconds for completion. That precedes the TLS timeout
and exceeds the publisher's 25-second watchdog. Telemetry and diagnostic HTTPS
now use `hardware/include/bounded_dns_resolver.h` instead of that blocking path.

## Ownership and deadlines

One fixed hostname/ticket slot admits a query through lwIP's nonblocking
`tcpip_try_callback`. Only the TCP/IP thread calls `dns_gethostbyname_addrtype`;
cache hits and literal IPv4 addresses finish there, and asynchronous lookups use
the terminal DNS callback. The existing lwIP cache retains its own TTL policy.
There is no separate application address cache or new resolver task/stack.

Callers sharing that hostname and network epoch join the slot. A different
hostname is rejected while it is occupied. Each caller polls with `delay(1)`
until the original query's one-second monotonic budget expires. Expiry releases
the caller, retaining the owner until the underlying query actually finishes.
Repeated retries cannot create orphaned resolver work. A saturated TCP/IP queue
fails immediately. Late addresses are discarded; a subsequent call may use the
SDK cache through a new ticket. Disconnection and new-IP events invalidate the
network epoch, so an old lookup cannot publish an address into the new epoch.

TLS remains on the publisher/diagnostic owner's task, with the original hostname
passed to the address-plus-hostname `WiFiClientSecure::connect` overload for SNI
and certificate validation. Key preparation follows successful DNS resolution;
the per-task ephemeral-key slots, CA/time validation and HTTP reuse guard remain
in effect. A healthy existing socket bypasses DNS and TLS setup entirely.
Maintenance/OTA clients remain on their separate worker; their library DNS path
is not covered by this publisher fix. Development plain HTTP also uses its
existing transport. Fleet telemetry requires HTTPS.

## Budget and verification limits

| Cold phase | Configured limit |
|---|---:|
| DNS caller wait | 1,000 ms |
| TCP connect | 1,000 ms |
| TLS handshake | 10,000 ms |
| HTTP read/request | 1,500 ms |
| Accepted-body drain | 1,000 ms |
| Publisher watchdog | 25,000 ms |

A compile-time sum checks that these network phase limits leave watchdog
headroom. They are not a measured total deadline: task scheduling, key preparation,
SDK work, writes and flash contention still need actual-board timing. A stalled
TCP/IP thread can keep the single DNS owner unavailable indefinitely, but callers
remain bounded and the capture/publisher loops continue their existing retry and
freshness policy. Do not interpret native scheduling tests as radio acceptance.

Run `platformio test --project-dir hardware -e native`. Eight policy cases cover
sharing, deadlines, bounded ownership, stale callbacks, network epochs, failure,
hostname bounds and millis rollover. Seven additional cases exercise the actual
production resolver with native TCP/IP/radio adapters: cached completion, stalled
DNS and TCP/IP queues, queue rejection, DNS failure, offline admission and
disconnect/reconnect. Firmware CI builds the real SDK adapter in development,
quiet, legacy journal and signed fleet environments.

Record cold/warm `[NetworkTiming]` and `[TelemetryTrace]` distributions against
the installed image hash, plus GNSS/UART, watchdog and reset evidence. Controlled
physical DNS, Wi-Fi and certificate failures and moving behavior belong to
[issue #245](https://github.com/notnamansinha/Eki/issues/245). Use the app-only
[legacy-board procedure](COLD_POWER_RECOVERY.md) when applicable; build success
alone does not authorize changing partition tables or security fuses.
