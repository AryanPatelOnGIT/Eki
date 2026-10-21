import { beforeEach, describe, expect, it, vi } from "vitest";
import { retentionFingerprint } from "./rtdbRetention";

const fixture = vi.hoisted(() => ({
  values: [] as unknown[],
  updates: [] as unknown[],
  inventory: undefined as undefined | { fingerprint: string; firstSeenAt: number },
  set: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("../lib/firebaseAdmin", () => ({
  db: {
    collection: () => ({ doc: () => ({ get: async () => ({ data: () => fixture.inventory }) }) }),
    runTransaction: async (work: (tx: object) => Promise<unknown>) => {
      fixture.transaction();
      return work({ get: async () => ({ data: () => fixture.inventory }), set: fixture.set });
    },
  },
  rtdb: { ref: () => ({
    transaction: async (update: (value: unknown) => unknown) => {
      fixture.updates = fixture.values.map(update);
      return { committed: fixture.updates.at(-1) !== undefined };
    },
  }) },
}));
import { firebaseRtdbRetentionStore } from "./firebaseRtdbRetention";

beforeEach(() => {
  fixture.values = []; fixture.updates = []; fixture.inventory = undefined;
  vi.clearAllMocks();
});

describe("Firebase retention adapter", () => {
  it("rechecks the fingerprint on transaction retry and preserves a replacement", async () => {
    const old = { timestamp: 100 }, replacement = { timestamp: 200 };
    fixture.values = [old, replacement];
    expect(await firebaseRtdbRetentionStore().removeIfUnchanged("messages/test", retentionFingerprint(old))).toBe(false);
    expect(fixture.updates).toEqual([null, undefined]);
    fixture.values = [old];
    expect(await firebaseRtdbRetentionStore().removeIfUnchanged("messages/test", retentionFingerprint(old))).toBe(true);
    fixture.values = [null];
    expect(await firebaseRtdbRetentionStore().removeIfUnchanged("messages/test", retentionFingerprint(old))).toBe(false);
  });

  it("reads quarantine age without writes in dry-run and restarts it for changed content", async () => {
    fixture.inventory = { fingerprint: "same", firstSeenAt: 10 };
    const store = firebaseRtdbRetentionStore();
    expect(await store.observe("messages/test", "same", 100, true)).toBe(10);
    expect(await store.observe("messages/test", "changed", 100, true)).toBe(100);
    expect(fixture.transaction).not.toHaveBeenCalled();
    expect(fixture.set).not.toHaveBeenCalled();
    expect(await store.observe("messages/test", "changed", 100, false)).toBe(100);
    expect(fixture.set).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      path: "messages/test", fingerprint: "changed", firstSeenAt: 100,
    });
  });
});
