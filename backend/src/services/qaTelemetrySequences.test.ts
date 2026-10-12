import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/firebaseAdmin", () => ({ db: {}, rtdb: {} }));
import { generateGnssPlan } from "../../../docs/testing/simulations/generate-gnss.mjs";
import { checkSeededProperty } from "../../../scripts/qa/seeded-property.mjs";
import { nextTelemetryValue } from "./deviceTelemetryService";
import { parseTelemetryValue, type TelemetryPayload } from "./telemetryPayload";

const epoch = 1_800_000_000_000;
const assignment = { busId: "synthetic_bus", routeId: "synthetic_route", deviceId: "synthetic_device", assignmentRevision: 3 };
const seed = process.env.EKI_QA_SEED === undefined ? 42 : Number(process.env.EKI_QA_SEED);
const replayPath = process.env.EKI_QA_REPLAY_PATH === undefined ? undefined : Number(process.env.EKI_QA_REPLAY_PATH);
const sample = (timestamp: number, seq: number): TelemetryPayload => ({
  lat: 23, lng: 72, speed: 0, heading: 0, gpsHdop: 1, motionState: "stopped", timestamp, deviceSentAt: timestamp, seq,
});
describe("seeded telemetry state sequences", () => {
  it("matches a separate timestamp sequence model across reordered duplicated and rebooted samples", () => {
    checkSeededProperty({ seed, runs: 400, replayPath,
      generate: (random: () => number) => {
        const events = Array.from({ length: 40 }, (_, i) => ({
          timestamp: epoch + Math.floor(i / 3) * 1000, seq: i % 9 === 0 ? 1 : i + 1,
        }));
        events.push({ ...events[15] }, { ...events[20] });
        for (let i = events.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1)); [events[i], events[j]] = [events[j], events[i]];
        }
        return events;
      },
      shrink: (events: Array<{ timestamp: number; seq: number }>) => [events.slice(0, Math.ceil(events.length / 2))],
      check: (events: Array<{ timestamp: number; seq: number }>) => {
        let expected = { timestamp: epoch - 1, seq: 1 };
        let current: Record<string, unknown> = { ...sample(epoch - 1, 1), sessionId: "retained_session", status: "active", tripState: "in_service", currentStopIndex: 2 };
        for (const event of events) {
          const isNewer = event.timestamp > expected.timestamp ||
            (event.timestamp === expected.timestamp && event.seq > expected.seq);
          const result = nextTelemetryValue(current, assignment, sample(event.timestamp, event.seq), epoch + 50000);
          expect(Boolean(result)).toBe(isNewer);
          if (isNewer) { expected = event; current = result!; }
          expect(current).toMatchObject({ ...expected, sessionId: "retained_session", status: "active", tripState: "in_service", currentStopIndex: 2,
            busId: assignment.busId, routeId: assignment.routeId });
        }
      },
    });
  });
  it("distinguishes raw outliers held anchors and recovery without completing a ride", () => {
    for (const profile of ["teleport", "outage45", "outage120", "outage301", "duplicate", "reorder"]) {
      const plan = generateGnssPlan({ profile, count: 360, seed });
      let current: Record<string, unknown> | null = null;
      let pending = 0; let rejectedOrder = 0; let held = 0;
      for (const event of plan) {
        const now = epoch + event.scheduleOffsetMs;
        const parsed = parseTelemetryValue({ ...event.body, timestamp: epoch + event.sampleOffsetMs, deviceSentAt: epoch + event.sentOffsetMs }, now);
        expect(parsed.ok).toBe(true); if (!parsed.ok) throw new Error(parsed.reason);
        const next = nextTelemetryValue(current, assignment, parsed.value, now);
        if (!next) { rejectedOrder++; continue; }
        current = { ...next, sessionId: "retained_session", status: "active", tripState: "in_service", currentStopIndex: 2 };
        expect(current).toMatchObject({ sessionId: "retained_session", status: "active", tripState: "in_service", currentStopIndex: 2 });
        expect(current.rawLocation).toMatchObject({ sampledAt: parsed.value.timestamp, seq: parsed.value.seq });
        if (current.plausibilityReacquisition) pending++;
        if (current.motionState === "uncertain") {
          held++; expect(current.plausibilityAnchor).not.toMatchObject({ timestamp: parsed.value.timestamp });
        }
      }
      if (profile === "teleport") expect(held).toBe(1);
      if (profile === "outage120") { expect(held).toBe(2); expect(pending).toBe(2); }
      if (["outage45", "outage301"].includes(profile)) expect(held).toBe(0);
      if (["duplicate", "reorder"].includes(profile)) expect(rejectedOrder).toBeGreaterThan(0);
      expect(current?.timestamp).toBe(epoch + 359000);
      expect(current?.motionState).toBe("moving");
    }
  });
  it("does not resurrect a retired device assignment with an old revision", () => {
    const current = { ...sample(epoch, 1), deviceId: assignment.deviceId, retiredAssignmentRevision: 4, sessionId: "retained_session" };
    expect(nextTelemetryValue(current, assignment, sample(epoch + 1000, 2), epoch + 1000)).toBeUndefined();
    expect(current.retiredAssignmentRevision).toBe(4);
    const accepted = nextTelemetryValue(current, { ...assignment, assignmentRevision: 4 }, sample(epoch + 1000, 2), epoch + 1000);
    expect(accepted).toMatchObject({ sessionId: "retained_session", assignmentRevision: 4 });
  });
});
