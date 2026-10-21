// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useTelemetryRenderTrace } from "./useTelemetryRenderTrace";
import { selectLiveBusMarkerPosition } from "@/lib/liveBusMarkerPosition";
import type { ActiveBusEntry } from "@/lib/activeBusEntries";
const trace = vi.hoisted(() => ({ enabled: true, record: vi.fn() }));
vi.mock("@/lib/telemetryTrace", () => ({ telemetryTraceEnabled: () => trace.enabled, recordTelemetryRender: trace.record }));
let frames: Map<number, FrameRequestCallback>;
let frameId = 0;
const entry: ActiveBusEntry = { busId: "synthetic", routeId: "route", sessionId: "ride", direction: "forward", routeDirection: "forward", routeVersion: 1,
  lat: 23, lng: 72, timestamp: 1000, rawLocation: { lat: 23, lng: 72, speed: 10, heading: 0, motionState: "moving", seq: 1, sampledAt: 1000 } };
function flush() { const pending = [...frames.values()]; frames.clear(); act(() => pending.forEach(callback => callback(16))); }
beforeEach(() => {
  frames = new Map(); trace.record.mockReset(); trace.enabled = true;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("reschedules a canceled frame when ancillary fields replace the same sample object", () => {
  const hook = renderHook(({ value }) => useTelemetryRenderTrace(value, "passenger", true), { initialProps: { value: entry } });
  hook.rerender({ value: { ...entry, delayMinutes: 2 } }); flush();
  expect(trace.record).toHaveBeenCalledOnce();
  expect(trace.record.mock.calls[0][0].delayMinutes).toBe(2);
});
it("records arrival only after the displayed position reaches this sample's target", () => {
  const selection = selectLiveBusMarkerPosition(entry);
  const hook = renderHook(({ position }) => useTelemetryRenderTrace(entry, "passenger", true, { selection, position }), { initialProps: { position: { lat: 22, lng: 72 } } });
  flush(); expect(trace.record.mock.calls.map(call => call[3])).toEqual([undefined]);
  hook.rerender({ position: { lat: 23, lng: 72 } }); flush();
  expect(trace.record.mock.calls.map(call => call[3])).toEqual([undefined, "browser_marker_settled"]);
  hook.rerender({ position: { lat: 23, lng: 72 } }); flush(); expect(trace.record).toHaveBeenCalledTimes(2);
});
it.each(["match_pending", "older_snapshot", "context_changed"])("does not acknowledge a held target: %s", reason => {
  const selection = selectLiveBusMarkerPosition(entry);
  if (reason === "match_pending") selection.decision = "match_pending";
  if (reason === "older_snapshot") selection.reason = "older_snapshot";
  if (reason === "context_changed") selection.contextKey = "old-context";
  renderHook(() => useTelemetryRenderTrace(entry, "admin", true, { selection, position: selection.position })); flush();
  expect(trace.record).toHaveBeenCalledOnce(); expect(trace.record.mock.calls[0][2]).toBe("held");
});
it("does not schedule trace work when tracing is disabled", () => {
  trace.enabled = false; renderHook(() => useTelemetryRenderTrace(entry, "admin", true));
  expect(frames.size).toBe(0); expect(trace.record).not.toHaveBeenCalled();
});
