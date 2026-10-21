import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { percentileSummary } from "./analyze-telemetry-trace.mjs";

const finite = value => typeof value === "number" && Number.isFinite(value);
const identity = record => JSON.stringify([record.runId, record.sessionId, record.messageId]);

/** Same-tab monotonic intervals only. Cached docs and retry replays are not delivery samples. */
export function analyzeRealtimeTraces(records, usage = null) {
  const scenarios = Object.create(null);
  const groups = new Map();
  const seen = new Set();
  for (const record of records) {
    if (!record || typeof record.runId !== "string" || !finite(record.browserMonotonicAtMs)) continue;
    if (Number.isInteger(record.eventId)) {
      const key = JSON.stringify([record.runId, record.eventId]);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const list = groups.get(record.runId) ?? [];
    list.push(record); groups.set(record.runId, list);
  }
  const scenario = label => {
    label = typeof label === "string" ? label : "unclassified";
    scenarios[label] ??= { messageDeliveryMs: [], reconnectMs: [], payloadBytes: { active_buses: [], messages: [] },
      attempts: 0, attemptsWithoutResponse: 0, acceptedCreates: 0, createsWithoutListener: 0,
      retryReplays: 0, confirmedErrorResponses: 0 };
    return scenarios[label];
  };
  const watchPeaks = [];
  for (const [runId, unsorted] of groups) {
    const sorted = [...unsorted].sort((a, b) => a.browserMonotonicAtMs - b.browserMonotonicAtMs);
    const listeners = new Map();
    const responses = new Set(sorted.filter(record => record.event === "message_write")
      .map(record => JSON.stringify([record.sessionId, record.startedAtMs])));
    for (const record of sorted) if (record.event === "message_listener" && typeof record.messageId === "string") {
      const list = listeners.get(identity(record)) ?? [];
      list.push(record); listeners.set(identity(record), list);
    }
    const active = { active_buses: 0, messages: 0 };
    const peaks = { ...active };
    let everConnected = false;
    let disconnectedAt = null;
    for (const record of sorted) {
      const stats = scenario(record.scenario);
      if (record.event === "message_attempt") {
        stats.attempts++;
        if (!responses.has(JSON.stringify([record.sessionId, record.startedAtMs]))) stats.attemptsWithoutResponse++;
      }
      if (record.event === "message_write") {
        if (record.status === 200) { stats.retryReplays++; continue; }
        if (record.status >= 400) { stats.confirmedErrorResponses++; continue; }
        if (record.status !== 201) continue;
        stats.acceptedCreates++;
        const listener = (listeners.get(identity(record)) ?? []).find(candidate =>
          finite(record.startedAtMs) && record.startedAtMs <= record.browserMonotonicAtMs &&
          candidate.browserMonotonicAtMs >= record.startedAtMs);
        if (!listener) stats.createsWithoutListener++;
        else stats.messageDeliveryMs.push(listener.browserMonotonicAtMs - record.startedAtMs);
      }
      if (record.event === "realtime_payload" && record.fromCache !== true &&
          Object.hasOwn(stats.payloadBytes, record.source) && finite(record.bytes) && record.bytes >= 0) {
        stats.payloadBytes[record.source].push(record.bytes);
      }
      if (record.event === "realtime_watch" && Object.hasOwn(active, record.source)) {
        active[record.source] = Math.max(0, active[record.source] + (record.attached ? 1 : -1));
        peaks[record.source] = Math.max(peaks[record.source], active[record.source]);
      }
      if (record.event === "realtime_connection") {
        if (record.connected === false && everConnected && disconnectedAt === null) disconnectedAt = record.browserMonotonicAtMs;
        if (record.connected === true) {
          if (disconnectedAt !== null) stats.reconnectMs.push(record.browserMonotonicAtMs - disconnectedAt);
          disconnectedAt = null; everConnected = true;
        }
      }
    }
    watchPeaks.push({ runId, logicalWatchGroupPeaks: peaks, remainingWatchGroups: active,
      unfinishedDisconnect: disconnectedAt !== null });
  }
  for (const stats of Object.values(scenarios)) {
    stats.messageDeliveryMs = percentileSummary(stats.messageDeliveryMs);
    stats.reconnectMs = percentileSummary(stats.reconnectMs);
    stats.payloadBytes = Object.fromEntries(Object.entries(stats.payloadBytes).map(([key, values]) => [key, percentileSummary(values)]));
  }
  if (usage !== null) {
    for (const name of ["rtdbConnectionsPeak", "rtdbDownloadedBytes", "firestoreDocumentReads"]) {
      if (!finite(usage[name]) || usage[name] < 0) throw new Error(`Usage requires nonnegative ${name}.`);
    }
    if (typeof usage.evidenceRef !== "string" || !usage.evidenceRef.trim() ||
        typeof usage.windowStart !== "string" || typeof usage.windowEnd !== "string" ||
        !finite(Date.parse(usage.windowStart)) || !finite(Date.parse(usage.windowEnd)) ||
        Date.parse(usage.windowEnd) <= Date.parse(usage.windowStart)) throw new Error("Usage requires evidenceRef and an ordered measurement window.");
  }
  return { version: 1, scenarios, watchPeaks,
    usage: usage === null ? null : { windowStart: usage.windowStart, windowEnd: usage.windowEnd,
      evidenceRef: usage.evidenceRef, rtdbConnectionsPeak: usage.rtdbConnectionsPeak,
      rtdbDownloadedBytes: usage.rtdbDownloadedBytes, firestoreDocumentReads: usage.firestoreDocumentReads },
    qualifications: ["Message latency is HTTP send-start to server-backed listener in the same tab; not backend-commit latency or all recipients.",
      "Reconnect is RTDB connected=false to connected=true; it does not prove a fresh sample or marker was rendered.",
      "Payload bytes estimate application JSON, not Firebase wire traffic, billed bytes or document reads.",
      "Logical watch groups are not physical sockets; actual Firebase usage is unmeasured unless a usage capture is supplied."] };
}

async function main() {
  const browsers = [];
  let output, usage;
  for (let index = 2; index < process.argv.length; index += 2) {
    const option = process.argv[index], value = process.argv[index + 1];
    if (!value) throw new Error(`Missing value for ${option}.`);
    if (option === "--browser") browsers.push(value);
    else if (option === "--out") output = value;
    else if (option === "--usage") usage = value;
    else throw new Error(`Unknown argument ${option}.`);
  }
  if (!browsers.length || !output) throw new Error("Usage: --browser trace.json [--browser second-tab.json] [--usage usage.json] --out report.json");
  const exports = await Promise.all(browsers.map(async path => JSON.parse(await readFile(path, "utf8"))));
  if (exports.some(value => !Array.isArray(value.records))) throw new Error("Browser export must have a records array.");
  const report = analyzeRealtimeTraces(exports.flatMap(value => value.records), usage ? JSON.parse(await readFile(usage, "utf8")) : null);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${output}\n`);
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(error => {
  process.stderr.write(`${error.message}\n`); process.exitCode = 1;
});
