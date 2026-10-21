import { afterEach, describe, expect, it, vi } from "vitest";
import { createHealthState, probeRtdbConnection } from "./healthState";
import type { Database } from "firebase-admin/database";
const connected = async () => ({ val: () => true });
const firestore = async () => undefined;
afterEach(() => vi.useRealTimers());

describe("idle RTDB readiness", () => {
  function fixture(read: () => Promise<unknown>) {
    let opened = false;
    const get = vi.fn(async () => { await read(); opened = true; });
    const once = vi.fn(async () => ({ val: () => opened }));
    const ref = vi.fn((path: string) => {
      if (path === "_health") return { get };
      if (path === ".info/connected") return { once };
      throw new Error("Unexpected health read path");
    });
    return { database: { ref } as unknown as Pick<Database, "ref">, ref, get, once };
  }

  it("opens the idle transport before checking its connection flag", async () => {
    const sdk = fixture(async () => undefined);
    const health = createHealthState();
    await health.probe(firestore, () => probeRtdbConnection(sdk.database));
    expect(health.snapshot().ready).toBe(true);
    expect(sdk.ref.mock.calls).toEqual([["_health"], [".info/connected"]]);
    expect(sdk.get).toHaveBeenCalledOnce();
    expect(sdk.once).toHaveBeenCalledWith("value");
  });

  it("keeps readiness closed after a rejected or stalled sentinel read", async () => {
    const denied = fixture(async () => { throw new Error("permission denied"); });
    const health = createHealthState();
    await health.probe(firestore, () => probeRtdbConnection(denied.database));
    expect(health.snapshot().ready).toBe(false);
    expect(denied.once).not.toHaveBeenCalled();

    vi.useFakeTimers();
    const stalled = fixture(() => new Promise(() => {}));
    const bounded = createHealthState({ timeoutMs: 50 });
    const pending = bounded.probe(firestore, () => probeRtdbConnection(stalled.database));
    await vi.advanceTimersByTimeAsync(50); await pending;
    await bounded.probe(firestore, () => probeRtdbConnection(stalled.database));
    expect(bounded.snapshot().ready).toBe(false);
    expect(stalled.get).toHaveBeenCalledOnce();
    expect(stalled.once).not.toHaveBeenCalled();
  });
});

describe("cached dependency readiness", () => {
  it("starts disconnected and reports each store separately", async () => {
    const health = createHealthState();
    expect(health.snapshot()).toEqual({ ready: false, firestore: "disconnected", rtdb: "disconnected", checkedAt: null });
    await health.probe(async () => { throw new Error("unreachable"); }, connected);
    expect(health.snapshot()).toMatchObject({ ready: false, firestore: "disconnected", rtdb: "connected" });
    expect(health.snapshot().checkedAt).toBeTruthy();
  });
  it.each([false, null, undefined, 1, "true"])("rejects a fulfilled RTDB snapshot containing %s", async value => {
    const health = createHealthState();
    await health.probe(firestore, async () => ({ val: () => value }));
    expect(health.snapshot()).toMatchObject({ ready: false, firestore: "connected", rtdb: "disconnected" });
  });
  it("rejects malformed snapshots and recovers with an actual true value", async () => {
    const health = createHealthState();
    await health.probe(firestore, async () => undefined);
    expect(health.snapshot().ready).toBe(false);
    await health.probe(firestore, connected);
    expect(health.snapshot().ready).toBe(true);
    await health.probe(firestore, () => { throw new Error("sync failure"); });
    expect(health.snapshot().ready).toBe(false);
  });
  it("expires success independently of wall-clock time", async () => {
    let clock = 100;
    const health = createHealthState({ now: () => clock, freshnessMs: 65_000 });
    await health.probe(firestore, connected);
    clock += 64_999;
    expect(health.snapshot().ready).toBe(true);
    clock++;
    expect(health.snapshot()).toMatchObject({ ready: false, firestore: "disconnected", rtdb: "disconnected" });
    await health.probe(firestore, connected);
    expect(health.snapshot().ready).toBe(true);
  });
  it("coalesces cycles, bounds response time and retains stalled dependency slots", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    let resolve!: (value: unknown) => void;
    const stalled = vi.fn(() => new Promise(done => { resolve = done; }));
    const healthy = vi.fn(firestore);
    const health = createHealthState({ timeoutMs: 50 });
    const first = health.probe(healthy, stalled);
    expect(health.probe(healthy, stalled)).toBe(first);
    await vi.advanceTimersByTimeAsync(50);
    await first;
    expect(health.snapshot()).toMatchObject({ ready: false, firestore: "connected", rtdb: "disconnected" });
    for (let index = 0; index < 10; index++) await health.probe(healthy, stalled);
    expect(stalled).toHaveBeenCalledOnce();
    resolve({ val: () => true });
    await vi.advanceTimersByTimeAsync(0);
    expect(health.snapshot().ready).toBe(false);
    await health.probe(healthy, connected);
    expect(health.snapshot().ready).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects a dependency completing beyond its monotonic budget", async () => {
    let clock = 0;
    const health = createHealthState({ timeoutMs: 50, now: () => clock });
    await health.probe(async () => { clock = 51; }, connected);
    expect(health.snapshot().ready).toBe(false);
  });
});
