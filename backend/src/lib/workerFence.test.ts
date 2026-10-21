import { afterEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { Reference } from "firebase-admin/database";
import { assertWorkerLeadership, bindWorkerCallback, bindWorkerContext, WorkerFence, WorkerLeadershipExpired, workerTransaction, workerRtdbTransaction, workerWrite } from "./workerFence";

function store(lease: () => any) {
  const writes = vi.fn();
  const db = {
    collection: () => ({ doc: () => ({ path: "_worker_leases/trip-state-worker" }) }),
    runTransaction: vi.fn(async callback => callback({
      get: vi.fn(async () => ({ data: lease })), set: writes, delete: writes,
    })),
  };
  return { db: db as unknown as Firestore, writes };
}
const validLease = () => ({ ownerId: "a", generation: 1, expiresAt: { toMillis: () => Date.now() + 45_000 } });
const fence = () => new WorkerFence("a", 1, performance.now() + 40_000);
afterEach(() => vi.useRealTimers());

describe("worker destination fencing", () => {
  it.each([
    { ownerId: "b", generation: 2, expiresAt: { toMillis: () => Date.now() + 45_000 } },
    { ...validLease(), generation: 2 },
    { ...validLease(), expiresAt: { toMillis: () => Date.now() + 1_000 } },
    undefined,
  ])("rejects changed, near-expired and missing leases before durable writes", async lease => {
    const { db, writes } = store(() => lease);
    await expect(fence().run(() => workerWrite(db, writer => { writer.set({} as any, { x: 1 }); }))).rejects.toBeInstanceOf(WorkerLeadershipExpired);
    expect(writes).not.toHaveBeenCalled();
  });

  it("rechecks local authority after a dispatched dependency settles", async () => {
    const leader = fence();
    const { db } = store(validLease);
    await expect(leader.run(() => workerTransaction(db, async () => {
      leader.revoke(); return "late result";
    }))).rejects.toBeInstanceOf(WorkerLeadershipExpired);
  });

  it("captures the original generation in a listener fired outside its registration context", () => {
    const leader = fence(); const callback = vi.fn();
    const listener = leader.run(() => bindWorkerCallback(callback));
    listener(); leader.revoke(); listener();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not let shutdown or a newer leader lend authority to an old cleanup", () => {
    const old = fence();
    const cleanup = old.run(() => bindWorkerContext(() => assertWorkerLeadership()));
    old.revoke();
    expect(() => cleanup()).toThrow(WorkerLeadershipExpired);
    expect(() => new WorkerFence("b", 2, performance.now() + 40_000).run(cleanup)).toThrow(WorkerLeadershipExpired);
  });

  it("checks monotonic expiry even if the cutoff timer has not run", () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const leader = new WorkerFence("a", 1, performance.now() + 40_000);
    vi.advanceTimersByTime(40_001);
    expect(() => leader.run(() => undefined)).toThrow(WorkerLeadershipExpired);
    expect(() => leader.extend(performance.now() + 40_000)).toThrow(WorkerLeadershipExpired);
  });

  it("prevents an old RTDB callback from dispatching another write on SDK retry", async () => {
    const leader = fence(); const mutation = vi.fn(() => ({ state: "completed" }));
    const ref = { transaction: async (callback: any) => {
      expect(callback({ _workerGeneration: 1 })).toEqual({ state: "completed", _workerGeneration: 1 });
      leader.revoke(); expect(callback({ _workerGeneration: 1 })).toBeUndefined();
      return { committed: false };
    } } as unknown as Reference;
    await leader.run(() => workerRtdbTransaction(ref, mutation));
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("enforces destination generations and leaves HTTP callers unchanged", async () => {
    const mutation = vi.fn(() => ({ state: "old" }));
    const ref = { transaction: async (callback: any) => callback({ _workerGeneration: 2 }) } as unknown as Reference;
    expect(await fence().run(() => workerRtdbTransaction(ref, mutation))).toBeUndefined();
    expect(mutation).not.toHaveBeenCalled();
    expect(await workerRtdbTransaction(ref, mutation)).toEqual({ state: "old" });
  });
});
