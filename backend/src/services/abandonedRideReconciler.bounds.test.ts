import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/firebaseAdmin", () => ({ db: {}, rtdb: {} }));
import { runAbandonedRideReconciliation } from "./abandonedRideReconciler";
const now = 1_800_000_000_000;
async function flush() { for (let index = 0; index < 50; index++) await Promise.resolve(); }
function harness(count: number, gate: Promise<void> = Promise.resolve()) {
  let cursor = ""; let limit = Infinity; let active = 0; let maximum = 0; let rootReads = 0;
  const sessions = Array.from({ length: count }, (_, i) => ({ id: `session_${String(i).padStart(4, "0")}`, data: () => ({ status: "active", busId: `bus_${i}`, routeId: "route_1", updatedAt: now }) }));
  const query: any = { where: () => query, orderBy: () => query, limit: (value: number) => { limit = value; return query; }, startAfter: (id: string) => { cursor = id; return query; },
    get: async () => { const docs = sessions.filter(session => session.id > cursor).slice(0, limit); return { docs, size: docs.length }; } };
  const firestore: any = { collection: (name: string) => name === "ride_sessions" ? query : ({ doc: () => ({ get: async () => {
    active++; maximum = Math.max(maximum, active); await gate; active--; return { exists: false, data: () => undefined };
  } }) }) };
  const realtimeDatabase: any = { ref: (path: string) => ({ once: async () => { if (path === "activeBuses") rootReads++; return { val: () => null }; } }) };
  return { firestore, realtimeDatabase, maximum: () => maximum, rootReads: () => rootReads, limit: () => limit };
}
describe("abandoned-session reconciliation bounds", () => {
  it("bounds held per-session reads instead of launching the whole backlog", async () => {
    let release!: () => void; const gate = new Promise<void>(done => { release = done; }); const store = harness(600, gate);
    const task = runAbandonedRideReconciliation({ ...store, now, dryRun: true });
    try { await flush(); expect(store.maximum()).toBeLessThanOrEqual(4); expect(store.limit()).toBeLessThanOrEqual(100); }
    finally { release(); await task; }
  });
  it("uses bounded summaries and visits the entire backlog through cursors without a root RTDB read", async () => {
    const store = harness(601); let cursor: string | undefined; const visited = new Set<string>();
    do {
      const summary = await runAbandonedRideReconciliation({ ...store, now, dryRun: true, cursor } as any);
      expect(summary.scanned).toBeLessThanOrEqual(100);
      for (const id of summary.protectedIds) visited.add(id);
      cursor = (summary as any).nextCursor ?? undefined;
    } while (cursor);
    expect(visited.size).toBe(601); expect(store.rootReads()).toBe(0);
  });
});
