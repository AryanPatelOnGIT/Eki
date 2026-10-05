import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(), nodes: new Map<string, any>(),
  calls: [] as string[],
  before: undefined as ((path: string) => Promise<void>) | undefined,
  after: undefined as ((path: string) => Promise<void>) | undefined,
  holdCrypto: false, cryptoCallbacks: [] as Array<(error: Error | null, value: Buffer) => void>,
}));
vi.mock("node:crypto", async importOriginal => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, scrypt: (...args: any[]) => {
    if (store.holdCrypto) { store.cryptoCallbacks.push(args.at(-1)); return; }
    return Reflect.apply(actual.scrypt, undefined, args);
  } };
});
vi.mock("../lib/firebaseAdmin", () => ({
  db: { collection: (name: string) => ({ doc: (id: string) => ({ get: async () => {
    const data = store.documents.get(`${name}/${id}`);
    return { exists: data !== undefined, data: () => data };
  } }) }) },
  rtdb: { ref: (path: string) => ({ on() {}, off() {}, transaction: async (update: (value: any) => unknown) => {
    store.calls.push(path); await store.before?.(path);
    const value = update(store.nodes.get(path) ?? null);
    if (value !== undefined) store.nodes.set(path, value);
    await store.after?.(path);
    return { committed: value !== undefined, snapshot: { val: () => store.nodes.get(path) ?? null } };
  } }) },
}));
vi.mock("./durableRideRecovery", () => ({ restoreDurableRide: async () => false }));
vi.mock("./telemetryRouteService", () => ({ scheduleTelemetryRouteProcessing: vi.fn() }));
import { authenticateDeviceCredentials, getHttpsTelemetryStatus, hashDeviceSecret, ingestDeviceTelemetry, verifyDeviceSecretHash } from "./deviceTelemetryService";
import { ExecutionDeadlineError, TelemetryExecutionFailure } from "../lib/executionDeadline";
import { scheduleTelemetryRouteProcessing } from "./telemetryRouteService";

function gate() { let release!: () => void; const promise = new Promise<void>(done => { release = done; }); return { promise, release }; }
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
const secret = "deadline-test-secret-with-sufficient-entropy";
let sequence = 0; let id: string; let node: string;
beforeEach(async () => {
  vi.useRealTimers(); store.before = undefined; store.after = undefined; store.calls = []; vi.clearAllMocks();
  store.holdCrypto = false; store.cryptoCallbacks = [];
  id = `deadline_device_${++sequence}`; node = `activeBuses/deadline_bus_${sequence}_route`;
  const assignment = { busId: `deadline_bus_${sequence}`, routeId: "route" };
  store.documents.set(`devices/${id}`, { ...assignment, secretHash: await hashDeviceSecret(secret) });
  store.documents.set(`buses/${assignment.busId}`, { assignedRoutes: ["route"] });
  store.documents.set("routes/route", {});
  store.nodes.set(node, { ...assignment, status: "active", sessionId: "session", tripState: "in_service", timestamp: 0 });
  await authenticateDeviceCredentials(id, secret, Date.now());
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
function sample(offset = 0) { const now = Date.now() + offset; return {
  lat: 23, lng: 72, speed: 0, heading: 0, motionState: "stopped" as const, gpsHdop: 1,
  timestamp: now, deviceSentAt: now, seq: offset + 1,
}; }

describe("actual ingestion dependency deadlines", () => {
  it("does not dispatch a queued KDF after its credential admission expires", async () => {
    store.holdCrypto = true; let expired = false;
    const hash = `00000000000000000000000000000000:${"00".repeat(64)}`;
    const active = Array.from({ length: 4 }, () => verifyDeviceSecretHash(secret, hash));
    const queued = verifyDeviceSecretHash(secret, hash, () => !expired).catch(error => error);
    await flush(); expect(store.cryptoCallbacks).toHaveLength(4);
    expect(getHttpsTelemetryStatus().kdfExecution).toMatchObject({ active: 4, pending: 1 });
    expired = true;
    for (const callback of store.cryptoCallbacks) callback(null, Buffer.alloc(64));
    await Promise.all(active); expect(await queued).toBeInstanceOf(Error);
    expect(store.cryptoCallbacks).toHaveLength(4);
    expect(getHttpsTelemetryStatus().kdfExecution).toMatchObject({ active: 0, pending: 0 });
    store.holdCrypto = false;
  });
  it("times out a shared quota reservation without dispatching telemetry or caching an uncertain grant", async () => {
    const quota = gate(); const quotaPath = `_deviceRateLimits/${id}`;
    store.before = async path => { if (path === quotaPath) await quota.promise; };
    let outcome: unknown;
    const first = ingestDeviceTelemetry(id, secret, sample()).catch(error => { outcome = error; });
    await flush(); await vi.advanceTimersByTimeAsync(5_001);
    expect(outcome).toBeInstanceOf(ExecutionDeadlineError);
    expect(outcome).toMatchObject({ uncertainCommit: false });
    expect(store.calls).toEqual([quotaPath]);
    expect(getHttpsTelemetryStatus().ingestionExecution.active).toBe(1);
    quota.release(); await first; await flush();
    expect(store.nodes.has(quotaPath)).toBe(false);
    store.before = undefined;
    await expect(ingestDeviceTelemetry(id, secret, sample(2))).resolves.toEqual({ ok: true, duplicate: false });
  });

  it("expires a waiting request at two seconds without starting its dependencies", async () => {
    const ack = gate(); store.after = async path => { if (path === node) await ack.promise; };
    const first = ingestDeviceTelemetry(id, secret, sample()).catch(error => error);
    await flush(); const waiting = ingestDeviceTelemetry(id, secret, sample(1)).catch(error => error);
    await vi.advanceTimersByTimeAsync(2_001);
    expect(await waiting).toBeInstanceOf(TelemetryExecutionFailure);
    expect(await waiting).toMatchObject({ uncertainCommit: false });
    expect(store.calls.filter(path => path === node)).toHaveLength(1);
    expect(getHttpsTelemetryStatus().ingestionExecution).toMatchObject({ active: 1, pending: 0 });
    ack.release(); await first; await flush();
  });

  it("bounds a stalled committed acknowledgement and prevents retry amplification", async () => {
    const ack = gate(); store.after = async path => { if (path === node) await ack.promise; };
    let outcome: unknown;
    const first = ingestDeviceTelemetry(id, secret, sample()).then(value => { outcome = value; }, error => { outcome = error; });
    await flush(); expect(store.calls.filter(path => path === node)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(outcome).toBeInstanceOf(Error);
    expect(outcome).toMatchObject({ uncertainCommit: true });
    const retries = Array.from({ length: 20 }, () => ingestDeviceTelemetry(id, secret, sample(1)).catch(error => error));
    await vi.advanceTimersByTimeAsync(8_001);
    expect(store.calls.filter(path => path === node)).toHaveLength(1);
    ack.release(); await first; await Promise.all(retries); await flush();
    expect(scheduleTelemetryRouteProcessing).not.toHaveBeenCalled();
    store.after = undefined;
    await expect(ingestDeviceTelemetry(id, secret, sample(2))).resolves.toEqual({ ok: true, duplicate: false });
    expect(store.nodes.get(node).seq).toBe(3);
  });

  it("aborts an expired SDK retry callback without publishing an old fix", async () => {
    const dispatch = gate(); store.before = async path => { if (path === node) await dispatch.promise; };
    let outcome: unknown;
    const first = ingestDeviceTelemetry(id, secret, sample()).catch(error => { outcome = error; });
    await flush(); await vi.advanceTimersByTimeAsync(5_001);
    expect(outcome).toBeInstanceOf(Error);
    dispatch.release(); await first; await flush();
    expect(store.nodes.get(node).timestamp).toBe(0);
    store.before = undefined;
    await expect(ingestDeviceTelemetry(id, secret, sample(2))).resolves.toEqual({ ok: true, duplicate: false });
  });
});
