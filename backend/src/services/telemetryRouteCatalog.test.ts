import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodePolyline } from "../lib/polylineUtils";
import type { TelemetryPayload } from "./telemetryPayload";
const state = vi.hoisted(() => ({ route: {} as Record<string, unknown>, reads: 0, gate: null as Promise<void> | null,
  values: new Map<string, Record<string, unknown>>(), beforeTransaction: null as null | (() => void), compute: vi.fn(), writes: vi.fn(), watcher: null as null | ((snapshot: any) => void), error: null as null | ((error: Error) => void) }));
vi.mock("../lib/firebaseAdmin", () => ({ db: { collection: () => ({ onSnapshot: (next: any, fail: any) => { state.watcher = next; state.error = fail; return () => {}; },
  doc: () => ({ get: async () => { state.reads++; const captured = { ...state.route }; await state.gate; return { exists: Object.keys(captured).length > 0, data: () => captured }; } }) }), runTransaction: state.writes },
  rtdb: { ref: (path: string) => ({ once: async () => ({ val: () => state.values.get(path) ?? null }), transaction: async (update: any) => {
    state.beforeTransaction?.();
    const next = update(state.values.get(path) ?? null); if (next !== undefined) state.values.set(path, next);
    return { committed: next !== undefined, snapshot: { val: () => state.values.get(path) ?? null } };
  }, set: state.writes }) } }));
vi.mock("../lib/googleMaps", () => ({ computeRouteGeometry: state.compute, LIVE_REROUTE_TIMEOUT_MS: 3500 }));
import { scheduleTelemetryRouteProcessing, drainTelemetryRouteProcessing, invalidateTelemetryRoute, startTelemetryRouteWatcher } from "./telemetryRouteService";
const id = "catalog-route", stops = [{ id: "A", lat: 23, lng: 72 }, { id: "B", lat: 23.1, lng: 72.1 }];
let stop: (() => void) | undefined;
function publish(seq = 1, busId = "bus", at = { lat: 24, lng: 73 }) {
  const fix: TelemetryPayload = { ...at, speed: 0, heading: 0, motionState: "stopped", gpsHdop: 1, seq, timestamp: Date.now(), deviceSentAt: Date.now() };
  state.values.set(`activeBuses/${busId}_${id}`, { busId, routeId: id, direction: null, directionState: "pending", ...fix });
  scheduleTelemetryRouteProcessing({ busId, routeId: id }, fix);
}
function snapshot(type = "added") {
  const captured = { ...state.route }; const doc = { id, data: () => captured }; return { docs: type === "removed" ? [] : [doc], docChanges: () => [{ type, doc }] };
}
beforeEach(() => {
  state.route = { stops, forwardPolyline: encodePolyline(stops), reversePolyline: encodePolyline([...stops].reverse()), geometryVersion: 1 };
  state.reads = 0; state.gate = null; state.beforeTransaction = null; state.values.clear(); state.compute.mockReset(); state.writes.mockReset(); invalidateTelemetryRoute(id);
});
afterEach(async () => { stop?.(); stop = undefined; await drainTelemetryRouteProcessing(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe("versioned live route catalog", () => {
  it("does not reread an unchanged document for sixty unresolved direction fixes", async () => {
    for (let index = 1; index <= 60; index++) { publish(index); await drainTelemetryRouteProcessing(); }
    expect(state.reads).toBe(1); expect(state.compute).not.toHaveBeenCalled();
  });
  it("populates the catalog from the watcher rather than rereading its documents", async () => {
    stop = startTelemetryRouteWatcher(); state.watcher!(snapshot()); publish(); await drainTelemetryRouteProcessing(); expect(state.reads).toBe(0);
    state.route = {}; state.watcher!(snapshot("removed")); publish(2, "bus", stops[0]); await drainTelemetryRouteProcessing();
    expect(state.values.get(`activeBuses/bus_${id}`)?.direction).toBeNull(); expect(state.reads).toBe(0);
  });
  it("coalesces concurrent pending-direction freshness reads", async () => {
    let release!: () => void; state.gate = new Promise<void>(done => { release = done; });
    for (let index = 0; index < 8; index++) publish(1, `bus_${index}`);
    try { await vi.waitFor(() => expect(state.reads).toBeGreaterThan(0)); expect(state.reads).toBe(1); }
    finally { release(); await drainTelemetryRouteProcessing(); }
  });
  it("coalesces expired catalog refreshes using monotonic freshness", async () => {
    publish(); await drainTelemetryRouteProcessing();
    const now = performance.now(); vi.spyOn(performance, "now").mockReturnValue(now + 5 * 60_000 + 1);
    let release!: () => void; state.gate = new Promise<void>(done => { release = done; });
    for (let index = 0; index < 8; index++) publish(2, `bus_${index}`);
    try { await vi.waitFor(() => expect(state.reads).toBe(2)); }
    finally { release(); await drainTelemetryRouteProcessing(); }
    expect(state.reads).toBe(2);
  });
  it("rejects late callbacks from an old watcher after reconnect", async () => {
    vi.useFakeTimers(); stop = startTelemetryRouteWatcher(); const old = state.watcher!; const stale = snapshot(); old(stale);
    state.error!(Error("disconnect")); await vi.advanceTimersByTimeAsync(1000);
    const changed = [{ id: "C", lat: 24, lng: 73 }, { id: "D", lat: 24.1, lng: 73.1 }];
    state.route = { stops: changed, forwardPolyline: encodePolyline(changed), reversePolyline: encodePolyline([...changed].reverse()), geometryVersion: 2 };
    state.watcher!(snapshot()); old(stale); vi.useRealTimers();
    publish(1, "new", changed[0]); await drainTelemetryRouteProcessing();
    expect(state.values.get(`activeBuses/new_${id}`)).toMatchObject({ originStopId: "C", destinationStopId: "D" }); expect(state.reads).toBe(0);
  });
  it("rechecks route generation inside a delayed RTDB transaction callback", async () => {
    stop = startTelemetryRouteWatcher(); state.watcher!(snapshot());
    state.beforeTransaction = () => { state.beforeTransaction = null; state.watcher!(snapshot("removed")); };
    publish(1, "bus", stops[0]); await drainTelemetryRouteProcessing();
    expect(state.values.get(`activeBuses/bus_${id}`)?.direction).toBeNull();
  });
  it("does not launch legacy geometry repairs from telemetry", async () => {
    delete state.route.reversePolyline;
    state.compute.mockResolvedValue({ encodedPolyline: encodePolyline(stops), distanceMeters: 1000, duration: "100s" });
    publish(); await drainTelemetryRouteProcessing(); expect(state.compute).not.toHaveBeenCalled(); expect(state.writes).not.toHaveBeenCalled();
  });
  it("fences an old read after watcher edits and uses the new endpoints immediately", async () => {
    let release!: () => void; state.gate = new Promise<void>(done => { release = done; }); publish(1, "old", stops[0]);
    await vi.waitFor(() => expect(state.reads).toBe(1)); stop = startTelemetryRouteWatcher();
    const changed = [{ id: "C", lat: 24, lng: 73 }, { id: "D", lat: 24.1, lng: 73.1 }];
    state.route = { stops: changed, forwardPolyline: encodePolyline(changed), reversePolyline: encodePolyline([...changed].reverse()), geometryVersion: 2 };
    state.watcher!(snapshot("modified")); release(); await drainTelemetryRouteProcessing();
    expect(state.values.get(`activeBuses/old_${id}`)?.direction).toBeNull();
    state.gate = null; publish(2, "new", changed[0]); await drainTelemetryRouteProcessing();
    expect(state.values.get(`activeBuses/new_${id}`)).toMatchObject({ direction: "forward", originStopId: "C", destinationStopId: "D" }); expect(state.reads).toBe(1);
  });
});
