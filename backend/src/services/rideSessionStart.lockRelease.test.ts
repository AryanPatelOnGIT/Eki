import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, Record<string, unknown>>>,
  live: {} as Record<string, Record<string, unknown> | null>,
  transactions: 0,
  failTransaction: 0,
  raceWinner: null as Record<string, unknown> | null,
  nextId: 0,
}));

vi.mock("../lib/firebaseAdmin", () => {
  const snap = (collection: string, id: string) => {
    const value = state.docs[collection]?.[id];
    return { id, exists: value !== undefined, data: () => (value === undefined ? undefined : structuredClone(value)) };
  };
  const write = (collection: string, id: string, data: Record<string, unknown>, merge?: boolean) => {
    state.docs[collection] ??= {};
    state.docs[collection][id] = merge ? { ...(state.docs[collection][id] ?? {}), ...data } : { ...data };
  };
  const ref = (collection: string, id: string) => ({
    collection, id,
    get: async () => snap(collection, id),
    set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => write(collection, id, data, options?.merge),
  });
  const db = {
    collection: (collection: string) => ({ doc: (id?: string) => ref(collection, id ?? `auto${++state.nextId}`) }),
    runTransaction: async (work: (transaction: unknown) => Promise<unknown>) => {
      state.transactions++;
      if (state.failTransaction === state.transactions) throw new Error("transient firestore unavailable");
      const writes: Array<() => void> = [];
      const result = await work({
        get: async (r: { collection: string; id: string }) => snap(r.collection, r.id),
        set: (r: { collection: string; id: string }, data: Record<string, unknown>, options?: { merge?: boolean }) =>
          writes.push(() => write(r.collection, r.id, data, options?.merge)),
        create: (r: { collection: string; id: string }, data: Record<string, unknown>) =>
          writes.push(() => write(r.collection, r.id, data)),
        delete: (r: { collection: string; id: string }) => writes.push(() => { delete state.docs[r.collection]?.[r.id]; }),
      });
      writes.forEach(apply => apply());
      return result;
    },
    batch: () => { throw new Error("unexpected batch"); },
  };
  const rtdb = {
    ref: (path: string) => {
      const key = path.replace("activeBuses/", "");
      return {
        once: async () => ({ val: () => structuredClone(state.live[key] ?? null) }),
        transaction: async (update: (value: unknown) => unknown) => {
          // Another start wins the RTDB claim after this request read the node.
          if (state.raceWinner) state.live[key] = state.raceWinner;
          const next = update(structuredClone(state.live[key] ?? null));
          if (next !== undefined) state.live[key] = next as Record<string, unknown>;
          return { committed: next !== undefined, snapshot: { val: () => structuredClone(state.live[key] ?? null) } };
        },
      };
    },
  };
  return { db, rtdb };
});

import { startAssignedService } from "./rideSessionStart";

const assignment = { driverId: "driver1", busId: "bus1", routeId: "route1" };

describe("lost RTDB claim after creating a session", () => {
  beforeEach(() => {
    state.docs = { routes: { route1: { stops: [
      { id: "a", name: "A", lat: 23.0, lng: 72.5 },
      { id: "b", name: "B", lat: 23.1, lng: 72.6 },
    ] } } };
    state.live = { bus1_route1: { busId: "bus1", routeId: "route1", status: "offline", lat: 23.05, lng: 72.55, timestamp: Date.now() } };
    state.transactions = 0;
    state.failTransaction = 0;
    state.nextId = 0;
    state.raceWinner = { busId: "bus1", routeId: "route1", driverId: "driver2", sessionId: "winner", status: "active", tripState: "pre_departure" };
  });

  it("never leaves the bus lock owned by a failed session after a transient release failure", async () => {
    // Transaction 1 claims the lock; transaction 2 is the rollback.
    state.failTransaction = 2;
    await expect(startAssignedService(assignment, { principalScope: "driver:driver1" })).rejects.toThrow();
    const lock = state.docs._active_bus_locks?.bus1;
    if (lock) {
      // A retained lock must stay reconcilable: its session is still non-terminal.
      const owner = state.docs.ride_sessions?.[String(lock.sessionId)];
      expect(["pending", "armed", "active"]).toContain(owner?.status);
    }
  });

  it("fails the created session and releases its lock together on conflict", async () => {
    await expect(startAssignedService(assignment, { principalScope: "driver:driver1" })).rejects.toThrow("already has an active shift");
    expect(state.docs._active_bus_locks?.bus1).toBeUndefined();
    const sessions = Object.values(state.docs.ride_sessions ?? {});
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ status: "failed", failureReason: "shift_conflict" });
  });
});
