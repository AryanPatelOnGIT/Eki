import { AsyncLocalStorage } from "node:async_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoundedKeyedExecutor, WorkCapacityError, WorkQueueExpired } from "./boundedKeyedExecutor";

function gate() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function submit<T>(pool: BoundedKeyedExecutor<string>, key: string, work: () => Promise<T>) {
  try { return pool.run(key, work).catch(error => error); } catch (error) { return Promise.resolve(error); }
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("bounded keyed execution under stalls", () => {
  it("caps active and waiting work across distinct keys and recovers after settlement", async () => {
    const dependency = gate(); let starts = 0;
    const pool = new BoundedKeyedExecutor<string>({ maxConcurrent: 2, maxPending: 3 });
    const work = Array.from({ length: 100 }, (_, i) => submit(pool, String(i), async () => { starts++; await dependency.promise; return i; }));
    await Promise.resolve();
    expect(starts).toBe(2);
    expect(pool.snapshot()).toMatchObject({ active: 2, pending: 3, keys: 5, rejected: 95 });
    dependency.resolve();
    const results = await Promise.all(work);
    expect(results.filter(result => result instanceof WorkCapacityError)).toHaveLength(95);
    expect(starts).toBe(5);
    expect(pool.snapshot()).toMatchObject({ active: 0, pending: 0, keys: 0 });
    await expect(pool.run("new", async () => "recovered")).resolves.toBe("recovered");
  });

  it("keeps FIFO for a hot key while giving other keys a fair turn", async () => {
    const dependency = gate(); const order: string[] = [];
    const pool = new BoundedKeyedExecutor<string>({ maxConcurrent: 1 });
    const first = pool.run("a", async () => { order.push("a1"); await dependency.promise; });
    const second = pool.run("a", async () => { order.push("a2"); });
    const other = pool.run("b", async () => { order.push("b1"); });
    const third = pool.run("a", async () => { order.push("a3"); });
    await Promise.resolve(); dependency.resolve(); await Promise.all([first, second, other, third]);
    expect(order).toEqual(["a1", "b1", "a2", "a3"]);
  });

  it("enforces the per-key cap without spending another key's allowance", async () => {
    const dependency = gate();
    const pool = new BoundedKeyedExecutor<string>({ maxConcurrent: 2, maxPendingPerKey: 1 });
    const first = pool.run("a", () => dependency.promise);
    const waiting = pool.run("a", async () => 2);
    expect(() => pool.run("a", async () => 3)).toThrow(WorkCapacityError);
    const other = pool.run("b", async () => 4);
    await expect(other).resolves.toBe(4); dependency.resolve(); await Promise.all([first, waiting]);
  });

  it("expires undispatched work, retains the orphan's permit, and bounds metadata during churn", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    const dependency = gate(); const starts = vi.fn();
    const pool = new BoundedKeyedExecutor<string>({ maxConcurrent: 1, maxPending: 2, maxQueueAgeMs: 100 });
    const active = pool.run("active", () => dependency.promise);
    for (let round = 0; round < 20; round++) {
      const one = submit(pool, `${round}-a`, async () => { starts(); });
      const two = submit(pool, `${round}-b`, async () => { starts(); });
      expect(pool.snapshot()).toMatchObject({ active: 1, pending: 2, keys: 3 });
      await vi.advanceTimersByTimeAsync(101);
      expect(await one).toBeInstanceOf(WorkQueueExpired); expect(await two).toBeInstanceOf(WorkQueueExpired);
      expect(pool.snapshot()).toMatchObject({ active: 1, pending: 0, keys: 1 });
    }
    expect(starts).not.toHaveBeenCalled(); expect(pool.snapshot().expired).toBe(40);
    dependency.resolve(); await active;
    await expect(pool.run("fresh", async () => "fresh")).resolves.toBe("fresh");
  });

  it("preserves the queued caller's async context when another caller releases the permit", async () => {
    const dependency = gate(); const context = new AsyncLocalStorage<string>();
    const pool = new BoundedKeyedExecutor<string>({ maxConcurrent: 1 });
    const first = context.run("first", () => pool.run("a", () => dependency.promise));
    const queued = context.run("second", () => pool.run("b", async () => context.getStore()));
    dependency.resolve(); await first; await expect(queued).resolves.toBe("second");
  });

  it("recovers capacity after a processor throws synchronously", async () => {
    const pool = new BoundedKeyedExecutor<string>({ maxConcurrent: 1 });
    await expect(pool.run("a", () => { throw new Error("processor"); })).rejects.toThrow("processor");
    await expect(pool.run("a", async () => 2)).resolves.toBe(2);
    expect(pool.snapshot()).toMatchObject({ active: 0, pending: 0, keys: 0 });
  });

  it.each([{ maxConcurrent: 0 }, { maxPending: -1 }, { maxPendingPerKey: 0 }, { maxQueueAgeMs: Infinity }])("rejects invalid budgets %j", options => {
    expect(() => new BoundedKeyedExecutor(options)).toThrow("Invalid execution budgets");
  });
});
