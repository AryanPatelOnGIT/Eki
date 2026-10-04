import { describe, expect, it } from "vitest";
import { assertResponse, assertSchema, spec } from "../test-support/openapi";
import { parseTelemetryValue } from "./services/telemetryPayload";
import { BoundedKeyedExecutor } from "./lib/boundedKeyedExecutor";

const now = 1_800_000_000_000;
const current = {
  deviceSentAt: now, gpsHdop: 1.2, lat: 23, lng: 72, speed: 0,
  heading: 0, motionState: "stopped", seq: 1, timestamp: now,
};
const telemetrySchema = { $ref: "#/components/schemas/TelemetryInput" };

describe("published OpenAPI contract boundaries", () => {
  it("validates the actual anonymous queue status and rejects leaked identifiers", () => {
    const schema = { $ref: "#/components/schemas/ExecutionQueueStatus" };
    const status = new BoundedKeyedExecutor().snapshot();
    expect(() => assertSchema(schema, status)).not.toThrow();
    expect(() => assertSchema(schema, { ...status, sessionId: "private" })).toThrow(/schema mismatch/);
    expect(() => assertSchema(schema, { ...status, pending: -1 })).toThrow(/schema mismatch/);
  });
  it.each([
    current,
    Object.fromEntries(Object.entries(current).filter(([key]) => key !== "gpsHdop")),
    Object.fromEntries(Object.entries(current).filter(([key]) => !["gpsHdop", "seq", "deviceSentAt"].includes(key))),
  ])("accepts the same staged firmware shapes as the real parser", payload => {
    expect(parseTelemetryValue(payload, now).ok).toBe(true);
    expect(() => assertSchema(telemetrySchema, payload)).not.toThrow();
  });

  it.each([
    { ...current, lat: 91 }, { ...current, heading: 360 },
    { ...current, gpsHdop: null }, { ...current, seq: 0 },
    { ...current, seq: 1.5 }, { ...current, routeId: "route_1" },
    { ...current, motionState: "flying" },
  ])("rejects malformed firmware payloads in both contract and parser", payload => {
    expect(parseTelemetryValue(payload, now).ok).toBe(false);
    expect(() => assertSchema(telemetrySchema, payload)).toThrow(/schema mismatch/);
  });

  it("documents time-dependent firmware restrictions separately from static shape", () => {
    const stale = { ...current, timestamp: now - 60_001 };
    expect(() => assertSchema(telemetrySchema, stale)).not.toThrow();
    expect(parseTelemetryValue(stale, now).ok).toBe(false);
    expect(JSON.stringify(spec.components.schemas.TelemetryInput)).toContain("-60s/+10s");
  });

  it.each([{}, { announcementActive: "yes" }, { admin: true }, { announcementText: "a".repeat(501) }])(
    "keeps the settings partial schema closed and bounded", payload => {
      expect(() => assertSchema({ $ref: "#/components/schemas/SettingsPatch" }, payload)).toThrow();
    },
  );

  it("accepts a one-field partial update instead of requiring full replacement", () => {
    expect(() => assertSchema({ $ref: "#/components/schemas/SettingsPatch" }, { announcementActive: false })).not.toThrow();
  });

  it("allows null percentiles and hit rate before any telemetry is received", () => {
    expect(() => assertSchema({ $ref: "#/components/schemas/LatencySummary" }, {
      samples: 0, average: null, p50: null, p95: null, p99: null,
    })).not.toThrow();
  });

  it("rejects undocumented statuses and malformed actual response bodies", async () => {
    await expect(assertResponse("POST", "/api/devices/{deviceId}/telemetry",
      Response.json({ accepted: true }, { status: 201 }))).rejects.toThrow(/Undocumented status/);
    await expect(assertResponse("POST", "/api/devices/{deviceId}/telemetry",
      Response.json({ accepted: true }, { status: 202 }))).rejects.toThrow(/schema mismatch/);
    await expect(assertResponse("PATCH", "/api/v2/settings/global",
      Response.json({ saved: "yes" }))).rejects.toThrow(/schema mismatch/);
  });
});
