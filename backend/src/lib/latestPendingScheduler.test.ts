import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLatestPendingScheduler } from "./latestPendingScheduler";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("latest pending scheduler", () => {
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it("bounds distinct keys and replaces a queued payload without starting extra workers", async () => {
    const gate = deferred(); const processed: string[] = [];
    const scheduler = createLatestPendingScheduler<string, number>(async (key, value) => {
      processed.push(`${key}:${value}`); if (key === "a") await gate.promise;
    }, vi.fn(), () => performance.now(), { maxConcurrent: 1, maxPending: 2 });
    expect(scheduler.schedule("a", 1)).toBe(true);
    expect(scheduler.schedule("b", 1)).toBe(true);
    expect(scheduler.schedule("c", 1)).toBe(true);
    expect(scheduler.schedule("d", 1)).toBe(false);
    scheduler.schedule("b", 2);
    expect(scheduler.snapshot()).toMatchObject({ activeWorkers: 1, pendingKeys: 2, rejected: 1 });
    gate.resolve(); await scheduler.drain();
    expect(processed).toEqual(["a:1", "b:2", "c:1"]);
    expect(scheduler.schedule("d", 2)).toBe(true); await scheduler.drain();
  });

  it("expires a queued key and an old follow-up without releasing the active dependency", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    const gate = deferred(); const processed: number[] = [];
    const scheduler = createLatestPendingScheduler<string, number>(async (_key, value) => {
      processed.push(value); if (value === 1) await gate.promise;
    }, () => { throw Error("reporter"); }, () => performance.now(), { maxConcurrent: 1, maxPending: 1, maxQueueAgeMs: 100 });
    scheduler.schedule("a", 1); await Promise.resolve();
    scheduler.schedule("a", 2); scheduler.schedule("b", 3);
    await vi.advanceTimersByTimeAsync(101);
    expect(scheduler.snapshot()).toMatchObject({ activeWorkers: 1, expired: 1, pendingKeys: 1 });
    gate.resolve(); await scheduler.drain();
    expect(processed).toEqual([1]); expect(scheduler.snapshot().expired).toBe(2);
    scheduler.schedule("a", 4); await scheduler.drain(); expect(processed).toEqual([1, 4]);
  });

  it("refreshes queued position age and preserves the replacement caller's context", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    const gate = deferred(); const context = new AsyncLocalStorage<string>(); const seen: string[] = [];
    const scheduler = createLatestPendingScheduler<string, number>(async (key, value) => {
      seen.push(`${value}:${context.getStore()}`); if (key === "a" && value === 1) await gate.promise;
    }, vi.fn(), () => performance.now(), { maxConcurrent: 1, maxQueueAgeMs: 100 });
    context.run("old", () => scheduler.schedule("a", 1));
    context.run("queued", () => scheduler.schedule("b", 2));
    await vi.advanceTimersByTimeAsync(80);
    context.run("replacement", () => scheduler.schedule("b", 3));
    context.run("follow-up", () => scheduler.schedule("a", 4));
    await vi.advanceTimersByTimeAsync(30);
    gate.resolve(); await scheduler.drain();
    expect(seen).toEqual(["1:old", "3:replacement", "4:follow-up"]);
    expect(scheduler.snapshot().expired).toBe(0);
  });
  it("keeps only the latest pending task for one busy key", async () => {
    const gate = deferred();
    const processed: number[] = [];
    const scheduler = createLatestPendingScheduler<string, number>(
      async (_key, value) => {
        processed.push(value);
        if (value === 1) await gate.promise;
      },
      vi.fn(),
    );

    scheduler.schedule("bus-a", 1);
    scheduler.schedule("bus-a", 2);
    scheduler.schedule("bus-a", 3);
    expect(scheduler.snapshot()).toMatchObject({
      scheduled: 3,
      coalesced: 1,
      activeWorkers: 1,
      pendingKeys: 1,
    });

    gate.resolve();
    await scheduler.drain();
    expect(processed).toEqual([1, 3]);
    expect(scheduler.snapshot()).toMatchObject({
      processed: 2,
      activeWorkers: 0,
      pendingKeys: 0,
    });
  });

  it("isolates keys and continues after a processor error", async () => {
    const processed: string[] = [];
    const errors = vi.fn();
    const scheduler = createLatestPendingScheduler<string, number>(
      async (key, value) => {
        processed.push(`${key}:${value}`);
        if (value === 1) throw new Error("simulated");
      },
      errors,
    );

    scheduler.schedule("bus-a", 1);
    scheduler.schedule("bus-a", 2);
    scheduler.schedule("bus-b", 3);
    await scheduler.drain();

    expect(processed).toEqual(expect.arrayContaining(["bus-a:1", "bus-a:2", "bus-b:3"]));
    expect(errors).toHaveBeenCalledOnce();
    expect(scheduler.snapshot()).toMatchObject({ failed: 1, processed: 3 });
  });

  it("reports queue age for work delayed behind an in-flight task", async () => {
    const gate = deferred();
    let clock = 1_000;
    const scheduler = createLatestPendingScheduler<string, number>(
      async (_key, value) => {
        if (value === 1) await gate.promise;
      },
      vi.fn(),
      () => clock,
    );
    scheduler.schedule("bus-a", 1);
    await Promise.resolve(); // The first task is dispatched before advancing the clock.
    clock = 1_025;
    scheduler.schedule("bus-a", 2);
    clock = 1_075;
    gate.resolve();
    await scheduler.drain();

    expect(scheduler.snapshot()).toMatchObject({
      lastQueueAgeMs: 50,
      maxQueueAgeMs: 50,
    });
  });
});
