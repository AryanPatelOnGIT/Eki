import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ records: new Map<string, unknown>(), inventory: new Map<string, Record<string, unknown>>(),
  reads: [] as string[], pages: [] as number[], writes: vi.fn(), deletes: vi.fn() }));
vi.mock("../lib/firebaseAdmin", () => {
  const doc = (id: string) => ({ id, get: async () => ({ data: () => state.inventory.get(id) }) });
  return {
    db: { collection: () => ({ doc }) },
    rtdb: { ref: (path: string) => {
      let after = "", limit = Infinity;
      const query = {
        path, orderByKey: () => query, startAfter: (key: string) => { after = key; return query; },
        limitToFirst: (count: number) => { limit = count; return query; },
        once: async () => {
          state.reads.push(path);
          const entries = [...state.records].filter(([key]) => key.startsWith(path + "/"))
            .map(([key, value]) => [key.slice(path.length + 1), value] as const)
            .filter(([key]) => key > after).sort(([a], [b]) => a.localeCompare(b)).slice(0, limit);
          if (Number.isFinite(limit)) state.pages.push(entries.length);
          return { val: () => state.records.get(path) ?? null,
            forEach: (callback: (child: { key: string; val: () => unknown }) => void) => entries.forEach(([key, value]) => callback({ key, val: () => value })) };
        },
      }; return query;
    } },
  };
});
vi.mock("../lib/workerFence", () => ({
  workerTransaction: async (_db: unknown, work: (transaction: unknown) => Promise<unknown>) => work({
    get: (ref: { get: () => Promise<unknown> }) => ref.get(),
    set: (ref: { id: string }, value: Record<string, unknown>) => { state.inventory.set(ref.id, value); state.writes(value); },
  }),
  workerRtdbTransaction: async (ref: { path: string }, update: (value: unknown) => unknown) => {
    const value = update(state.records.get(ref.path) ?? null);
    if (value === undefined) return { committed: false };
    state.records.set(ref.path, value); return { committed: true };
  },
  workerDelete: async (_db: unknown, ref: { id: string }) => state.deletes(ref.id),
}));
import { firebaseRtdbRetentionStore } from "./firebaseRtdbRetention";
import { retentionFingerprint } from "./rtdbRetention";
beforeEach(() => { state.records.clear(); state.inventory.clear(); state.reads.length = 0; state.pages.length = 0; vi.clearAllMocks(); });
describe("Firebase RTDB retention adapter", () => {
  it("pages a bounded inventory without skipping entries after the cursor", async () => {
    for (let i = 0; i < 26; i++) state.records.set(`messages/${String(i).padStart(2, "0")}`, { value: i });
    const result = [];
    for await (const item of firebaseRtdbRetentionStore().entries("messages")) result.push(item.key);
    expect(result).toHaveLength(26); expect(new Set(result).size).toBe(26); expect(state.pages).toEqual([25, 1]);
  });
  it("dry-run never creates inventory and changed content resets quarantine", async () => {
    const store = firebaseRtdbRetentionStore();
    expect(await store.observe("messages/old", "first", 100, true)).toBe(100);
    expect(state.writes).not.toHaveBeenCalled();
    expect(await store.observe("messages/old", "first", 100, false)).toBe(100);
    expect(await store.observe("messages/old", "first", 200, false)).toBe(100);
    expect(await store.observe("messages/old", "replacement", 300, false)).toBe(300);
  });
  it("rechecks the current fingerprint before deleting a replacement", async () => {
    const store = firebaseRtdbRetentionStore();
    state.records.set("messages/old", { timestamp: 1 }); const fingerprint = retentionFingerprint({ timestamp: 1 });
    state.records.set("messages/old", { timestamp: 2 });
    expect(await store.removeIfUnchanged("messages/old", fingerprint)).toBe(false);
    expect(state.records.get("messages/old")).toEqual({ timestamp: 2 });
    expect(await store.removeIfUnchanged("messages/old", retentionFingerprint({ timestamp: 2 }))).toBe(true);
    expect(state.records.get("messages/old")).toBeNull();
  });
});
