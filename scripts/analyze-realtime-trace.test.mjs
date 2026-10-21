import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeRealtimeTraces } from "./analyze-realtime-trace.mjs";

const record = (event, time, fields = {}) => ({ runId: "a", scenario: "normal", event,
  browserMonotonicAtMs: time, ...fields });
const write = fields => record("message_write", 100, { sessionId: "s", messageId: "m", startedAtMs: 10, status: 201, ...fields });
const listener = fields => record("message_listener", 40, { sessionId: "s", messageId: "m", ...fields });

test("correlates a server-backed listener that precedes the HTTP acknowledgement", () => {
  const report = analyzeRealtimeTraces([write(), listener(), write({ status: 200 }), write({ status: 429 })]);
  assert.equal(report.scenarios.normal.messageDeliveryMs.p95, 30);
  assert.equal(report.scenarios.normal.acceptedCreates, 1);
  assert.equal(report.scenarios.normal.retryReplays, 1);
  assert.equal(report.scenarios.normal.confirmedErrorResponses, 1);
});

test("does not correlate different sessions, tabs, old listeners or invalid start times", () => {
  for (const fields of [{ runId: "b" }, { sessionId: "other" }, { browserMonotonicAtMs: 5 }]) {
    assert.equal(analyzeRealtimeTraces([write(), listener(fields)]).scenarios.normal.createsWithoutListener, 1);
  }
  assert.equal(analyzeRealtimeTraces([write({ startedAtMs: 200 }), listener()]).scenarios.normal.createsWithoutListener, 1);
  assert.equal(analyzeRealtimeTraces([write()]).scenarios.normal.messageDeliveryMs.samples, 0);
});

test("ignores initial offline state and counts reconnect intervals once", () => {
  const connected = (time, value) => record("realtime_connection", time, { connected: value });
  const report = analyzeRealtimeTraces([connected(0, false), connected(10, true), connected(20, false),
    connected(30, false), connected(60, true), connected(70, false)]);
  assert.equal(report.scenarios.normal.reconnectMs.p99, 40);
  assert.equal(report.scenarios.normal.reconnectMs.samples, 1);
  assert.equal(report.watchPeaks[0].unfinishedDisconnect, true);
});

test("summarizes uncached payload estimates and logical watch groups separately", () => {
  const report = analyzeRealtimeTraces([
    record("realtime_payload", 1, { source: "messages", bytes: 99, fromCache: true }),
    record("realtime_payload", 2, { source: "messages", bytes: 12 }),
    record("realtime_payload", 3, { source: "messages", bytes: -1 }),
    record("realtime_watch", 4, { source: "active_buses", attached: true }),
    record("realtime_watch", 5, { source: "active_buses", attached: false }),
  ]);
  assert.equal(report.scenarios.normal.payloadBytes.messages.p50, 12);
  assert.equal(report.watchPeaks[0].logicalWatchGroupPeaks.active_buses, 1);
  assert.equal(report.watchPeaks[0].remainingWatchGroups.active_buses, 0);
  assert.equal(report.usage, null);
});

test("accepts prototype-like scenario labels and skips malformed records", () => {
  const report = analyzeRealtimeTraces([null, {}, record("realtime_payload", 1, { scenario: "__proto__", source: "messages", bytes: 2 })]);
  assert.equal(report.scenarios.__proto__.payloadBytes.messages.p50, 2);
});

test("usage must have measured nonnegative values and an evidence-backed ordered window", () => {
  const usage = { windowStart: "2026-10-01T01:00:00Z", windowEnd: "2026-10-01T02:00:00Z",
    evidenceRef: "restricted artifact", rtdbConnectionsPeak: 2, rtdbDownloadedBytes: 100, firestoreDocumentReads: 10 };
  assert.deepEqual(analyzeRealtimeTraces([], usage).usage, usage);
  for (const fields of [{ rtdbDownloadedBytes: -1 }, { evidenceRef: {} }, { windowEnd: usage.windowStart }]) {
    assert.throws(() => analyzeRealtimeTraces([], { ...usage, ...fields }));
  }
});

test("reports unanswered attempts and deduplicates overlapping exports by run/event ID", () => {
  const attempt = record("message_attempt", 10, { sessionId: "s", startedAtMs: 10, eventId: 1 });
  const unanswered = record("message_attempt", 120, { sessionId: "s", startedAtMs: 120, eventId: 3 });
  const response = write({ eventId: 2 });
  const report = analyzeRealtimeTraces([attempt, response, unanswered, attempt, response]);
  assert.equal(report.scenarios.normal.attempts, 2);
  assert.equal(report.scenarios.normal.attemptsWithoutResponse, 1);
  assert.equal(report.scenarios.normal.acceptedCreates, 1);
});
