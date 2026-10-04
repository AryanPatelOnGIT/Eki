import { describe, expect, it, vi } from "vitest";
import { createPagedLifecycleReplay } from "./pagedLifecycleReplay";

describe("bounded lifecycle replay", () => {
  it("waits for capacity and fairly advances past a failing item", async () => {
    let capacity = false;
    const visited: number[] = [];
    const read = vi.fn(async (cursor: string | null, limit: number) => {
      expect(limit).toBe(25);
      return cursor ? { items: [26], nextCursor: null } : { items: [1, 2], nextCursor: "25" };
    });
    const replay = createPagedLifecycleReplay({ readPage: read, hasCapacity: () => capacity,
      admit: async (item: number) => { visited.push(item); if (item === 1) throw Error("poison"); return true; },
      onError: () => { throw Error("reporter"); } });
    replay.request(); await replay.tick(); expect(read).not.toHaveBeenCalled();
    capacity = true; await replay.tick(); await replay.tick();
    expect(visited).toEqual([1, 2, 26]);
    expect(replay.snapshot()).toMatchObject({ requested: true, failures: 1 });
    await replay.tick(); expect(read.mock.calls[2][0]).toBeNull();
  });

  it("keeps one unresolved read and prevents intake after stop", async () => {
    let release!: (page: { items: number[]; nextCursor: null }) => void;
    const read = vi.fn(() => new Promise<{ items: number[]; nextCursor: null }>(done => { release = done; }));
    const admit = vi.fn(() => true);
    const replay = createPagedLifecycleReplay({ readPage: read, admit, hasCapacity: () => true, onError: vi.fn() });
    replay.request(); const first = replay.tick();
    expect(replay.tick()).toBe(first); expect(read).toHaveBeenCalledOnce();
    replay.stop(); release({ items: [1], nextCursor: null }); await first;
    await replay.tick(); expect(admit).not.toHaveBeenCalled(); expect(read).toHaveBeenCalledOnce();
  });

  it("retries read failures at the same cursor and rejects oversized pages", async () => {
    const read = vi.fn().mockRejectedValueOnce(Error("dependency"))
      .mockResolvedValueOnce({ items: Array.from({ length: 26 }, (_, i) => i), nextCursor: null })
      .mockResolvedValue({ items: [], nextCursor: null });
    const admit = vi.fn(() => true);
    const replay = createPagedLifecycleReplay({ readPage: read, admit, hasCapacity: () => true, onError: vi.fn() });
    replay.request(); await replay.tick(); await replay.tick(); await replay.tick();
    expect(read.mock.calls.map(call => call[0])).toEqual([null, null, null]);
    expect(admit).not.toHaveBeenCalled();
    expect(replay.snapshot()).toMatchObject({ requested: false, failures: 2, inFlight: false });
  });

  it("rescans a page skipped when admission fills, without retaining the skipped bodies", async () => {
    let capacity = true;
    const read = vi.fn(async () => ({ items: [1, 2], nextCursor: null }));
    const admit = vi.fn(() => { capacity = false; return true; });
    const replay = createPagedLifecycleReplay({ readPage: read, admit, hasCapacity: () => capacity, onError: vi.fn() });
    replay.request(); await replay.tick(); expect(admit).toHaveBeenCalledOnce();
    expect(replay.snapshot().requested).toBe(true);
    capacity = true; await replay.tick(); expect(read).toHaveBeenCalledTimes(2);
  });
});
