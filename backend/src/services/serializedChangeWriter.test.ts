import { afterEach, describe, expect, it, vi } from "vitest";
import { SerializedChangeWriter } from "./serializedChangeWriter";
import { BoundedKeyedExecutor, WorkCapacityError, WorkQueueExpired } from "../lib/boundedKeyedExecutor";

/** Resolves after a couple of microtask turns so ordering is observable. */
function tick(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

describe("SerializedChangeWriter", () => {
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it("bounds writes independently of fingerprint LRU size and does not suppress rejected retries", async () => {
    let release!: () => void; const gate = new Promise<void>(done => { release = done; });
    const writer = new SerializedChangeWriter(1, { maxConcurrent: 1, maxPending: 2 });
    const results = Array.from({ length: 100 }, (_, i) => writer.enqueue(String(i), "state", () => gate).catch(error => error));
    await tick(); expect(writer.snapshot()).toMatchObject({ active: 1, pending: 2, keys: 3, rejected: 97 });
    release(); expect((await Promise.all(results)).filter(error => error instanceof WorkCapacityError)).toHaveLength(97);
    const retry = vi.fn(async () => "recovered");
    await expect(writer.enqueue("99", "state", retry)).resolves.toBe("recovered"); expect(retry).toHaveBeenCalledOnce();
  });

  it("keeps an uncertain commit ordered after queued expiry and fingerprint clearing", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    let release!: () => void; const gate = new Promise<void>(done => { release = done; });
    const committed: string[] = [];
    const writer = new SerializedChangeWriter(1, { maxConcurrent: 1, maxPendingPerKey: 1, maxQueueAgeMs: 100 });
    const old = writer.enqueue("bus", "old", async () => { await gate; committed.push("old"); });
    const stale = writer.enqueue("bus", "stale", async () => { committed.push("stale"); }).catch(error => error);
    await vi.advanceTimersByTimeAsync(101); expect(await stale).toBeInstanceOf(WorkQueueExpired);
    writer.clear(); const fresh = writer.enqueue("bus", "fresh", async () => { committed.push("fresh"); });
    expect(Array.from(writer.pending())).toHaveLength(2); expect(committed).toEqual([]);
    release(); await Promise.all([old, fresh]); expect(committed).toEqual(["old", "fresh"]);
  });

  it("shares a global execution ceiling without conflating writer keys", async () => {
    let release!: () => void; const gate = new Promise<void>(done => { release = done; });
    const executor = new BoundedKeyedExecutor<string>({ maxConcurrent: 1, maxPending: 1 });
    const fleet = new SerializedChangeWriter(1, { executor }); const rides = new SerializedChangeWriter(1, { executor });
    const first = fleet.enqueue("bus", null, () => gate);
    const second = rides.enqueue("bus", null, async () => 2);
    await expect(fleet.enqueue("other", null, async () => 3)).rejects.toBeInstanceOf(WorkCapacityError);
    expect(executor.snapshot()).toMatchObject({ active: 1, pending: 1 });
    release(); await first; await expect(second).resolves.toBe(2);
  });
  it("serializes writes for the same key in FIFO order", async () => {
    const writer = new SerializedChangeWriter();
    const order: string[] = [];
    const write = (name: string) => async () => {
      order.push(`start:${name}`);
      await tick();
      order.push(`end:${name}`);
    };

    await Promise.all([
      writer.enqueue("bus-1", null, write("a")),
      writer.enqueue("bus-1", null, write("b")),
      writer.enqueue("bus-1", null, write("c")),
    ]);

    expect(order).toEqual([
      "start:a",
      "end:a",
      "start:b",
      "end:b",
      "start:c",
      "end:c",
    ]);
  });

  it("keeps independent queues for different keys", async () => {
    const writer = new SerializedChangeWriter();
    const order: string[] = [];
    const write = (name: string) => async () => {
      order.push(`start:${name}`);
      await tick();
      order.push(`end:${name}`);
    };

    await Promise.all([
      writer.enqueue("bus-1", null, write("1a")),
      writer.enqueue("bus-2", null, write("2a")),
      writer.enqueue("bus-1", null, write("1b")),
    ]);

    // bus-1 stays strictly ordered even though bus-2's write is interleaved:
    // a write for bus-2 starts before the second bus-1 write is queued behind
    // the first one.
    expect(order.indexOf("start:1a")).toBeLessThan(order.indexOf("start:1b"));
    expect(order.indexOf("end:1a")).toBeLessThan(order.indexOf("start:1b"));
    expect(order.indexOf("start:2a")).toBeLessThan(order.indexOf("start:1b"));
  });

  it("skips a write whose fingerprint matches the last enqueued one", async () => {
    const writer = new SerializedChangeWriter();
    const calls: string[] = [];

    const first = writer.enqueue("bus-1", "fingerprint-1", async () => {
      calls.push("first");
      await tick();
      return "first-result";
    });
    const second = writer.enqueue("bus-1", "fingerprint-1", async () => {
      calls.push("second");
      return "second-result";
    });

    expect(await first).toBe("first-result");
    // The deduped call resolves with the pending write's own result.
    expect(await second).toBe("first-result");
    expect(calls).toEqual(["first"]);
  });

  it("re-enqueues after retry() clears the dedup fingerprint", async () => {
    const writer = new SerializedChangeWriter();
    const calls: string[] = [];

    await writer.enqueue("bus-1", "fingerprint-1", async () => {
      calls.push("first");
    });
    // Identical state is now suppressed…
    await writer.enqueue("bus-1", "fingerprint-1", async () => {
      calls.push("suppressed");
    });
    expect(calls).toEqual(["first"]);

    // …until the fingerprint is invalidated, e.g. a lock check failed.
    writer.retry("bus-1", "fingerprint-1");
    await writer.enqueue("bus-1", "fingerprint-1", async () => {
      calls.push("retried");
    });
    expect(calls).toEqual(["first", "retried"]);
  });

  it("lets a later event retry after a rejected write", async () => {
    const writer = new SerializedChangeWriter();
    const calls: string[] = [];

    await expect(
      writer.enqueue("bus-1", "fingerprint-1", async () => {
        calls.push("failing");
        throw new Error("transaction failed");
      }),
    ).rejects.toThrow("transaction failed");

    await writer.enqueue("bus-1", "fingerprint-1", async () => {
      calls.push("after-failure");
    });
    expect(calls).toEqual(["failing", "after-failure"]);
  });

  it("does not poison later writes for the same key after a rejection", async () => {
    const writer = new SerializedChangeWriter();
    const calls: string[] = [];

    const failing = writer.enqueue("bus-1", null, async () => {
      calls.push("failing");
      throw new Error("boom");
    });
    const following = writer.enqueue("bus-1", null, async () => {
      calls.push("following");
    });

    await expect(failing).rejects.toThrow("boom");
    await following;
    expect(calls).toEqual(["failing", "following"]);
  });

  it("forgetFingerprint() drops dedup state without touching the queue", async () => {
    const writer = new SerializedChangeWriter();
    const calls: string[] = [];

    await writer.enqueue("bus-1", "fingerprint-1", async () => {
      calls.push("first");
    });
    writer.forgetFingerprint("bus-1");
    await writer.enqueue("bus-1", "fingerprint-1", async () => {
      calls.push("second");
    });
    expect(calls).toEqual(["first", "second"]);
  });

  it("invalidate() drops dedup state but preserves ordering with in-flight work", async () => {
    const writer = new SerializedChangeWriter();
    const calls: string[] = [];

    const pending = writer.enqueue("bus-1", "fingerprint-1", async () => {
      calls.push("pending");
      await tick();
    });
    writer.invalidate("bus-1");

    // The fingerprint is no longer suppressed, but the fresh write must stay
    // behind the old one: an in-flight persistence operation cannot safely be
    // cancelled and must never race to overwrite newer state.
    await writer.enqueue("bus-1", "fingerprint-1", async () => {
      calls.push("fresh");
    });
    await pending;
    expect(calls).toEqual(["pending", "fresh"]);
  });

  it("pending() reports in-flight writes and clear() preserves their ordering", async () => {
    const writer = new SerializedChangeWriter();
    const calls: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const pending = writer.enqueue("bus-1", "fingerprint-1", async () => {
      calls.push("pending");
      await gate;
      calls.push("done");
    });

    await tick();
    expect(Array.from(writer.pending())).toHaveLength(1);

    writer.clear();
    expect(Array.from(writer.pending())).toHaveLength(1);

    // The dedup fingerprint is gone, but the fresh write remains queued behind
    // the still-running operation.
    const afterClear = writer.enqueue("bus-1", "fingerprint-1", async () => {
      calls.push("after-clear");
    });
    expect(calls).toEqual(["pending"]);

    release();
    await pending;
    await afterClear;
    expect(calls).toEqual(["pending", "done", "after-clear"]);
  });

  it("bounds the dedup fingerprint map, falling back to a redundant write", async () => {
    const writer = new SerializedChangeWriter(4);
    let writes = 0;
    const write = () => async () => {
      writes += 1;
      await tick();
    };

    await writer.enqueue("a", "fa", write());
    await writer.enqueue("b", "fb", write());
    await writer.enqueue("c", "fc", write());
    await writer.enqueue("d", "fd", write());
    // Inserting "e" evicts the oldest fingerprint ("a"), then re-inserting
    // "a" evicts the next-oldest ("b").
    await writer.enqueue("e", "fe", write());

    // "a" was evicted, so the identical state must be written again.
    await writer.enqueue("a", "fa", write());
    // "c" is still cached, so this identical write is deduped.
    await writer.enqueue("c", "fc", write());

    expect(writes).toBe(6);
  });
});
