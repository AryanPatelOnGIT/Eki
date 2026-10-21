import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoundedSingleFlight, SingleFlightCapacityError, SingleFlightDeadlineError } from "./boundedSingleFlight";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { resolve, promise };
}
afterEach(() => vi.useRealTimers());
const options = { maxFills: 2, maxWaitersPerFill: 3, responseMs: 100 };

describe("bounded credential fills", () => {
  it("coalesces identical fills while isolating different credential digests", async () => {
    const loader = createBoundedSingleFlight<number>(options);
    const gate = deferred<number>();
    const work = vi.fn(() => gate.promise);
    const first = loader.run("device:digest-a", "device", work);
    const same = loader.run("device:digest-a", "device", work);
    const other = loader.run("device:digest-b", "device", work);
    await Promise.resolve();
    expect(work).toHaveBeenCalledTimes(2);
    gate.resolve(42);
    await expect(Promise.all([first, same, other])).resolves.toEqual([42, 42, 42]);
    expect(loader.snapshot()).toEqual({ activeFills: 0, waitingCallers: 0 });
  });
  it("bounds both unique fills and same-key waiting callers", async () => {
    const loader = createBoundedSingleFlight<number>(options);
    const gate = deferred<number>();
    const pending = [loader.run("a", "a", () => gate.promise), loader.run("b", "b", () => gate.promise)];
    pending.push(loader.run("a", "a", () => gate.promise), loader.run("a", "a", () => gate.promise));
    await expect(loader.run("c", "c", async () => 3)).rejects.toBeInstanceOf(SingleFlightCapacityError);
    await expect(loader.run("a", "a", async () => 4)).rejects.toBeInstanceOf(SingleFlightCapacityError);
    expect(loader.snapshot()).toEqual({ activeFills: 2, waitingCallers: 4 });
    gate.resolve(1);
    await Promise.all(pending);
  });
  it("retains timed-out underlying slots until real settlement and rejects retry amplification", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const loader = createBoundedSingleFlight<number>({ ...options, maxFills: 1 });
    const gate = deferred<number>();
    const work = vi.fn(() => gate.promise);
    const pending = loader.run("a", "a", work);
    const rejected = expect(pending).rejects.toBeInstanceOf(SingleFlightDeadlineError);
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(loader.snapshot()).toEqual({ activeFills: 1, waitingCallers: 0 });
    await expect(loader.run("b", "b", async () => 2)).rejects.toBeInstanceOf(SingleFlightCapacityError);
    await expect(loader.run("a", "a", work)).rejects.toBeInstanceOf(SingleFlightDeadlineError);
    expect(work).toHaveBeenCalledOnce();
    gate.resolve(1);
    await vi.advanceTimersByTimeAsync(0);
    await expect(loader.run("a", "a", async () => 2)).resolves.toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("fences every digest of an invalidated device while leaving unrelated fills valid", async () => {
    const loader = createBoundedSingleFlight<boolean>(options);
    const gate = deferred<void>();
    const first = loader.run("a:1", "a", async current => { await gate.promise; return current(); });
    const other = loader.run("b:1", "b", async current => { await gate.promise; return current(); });
    loader.invalidate("a");
    gate.resolve();
    await expect(Promise.all([first, other])).resolves.toEqual([false, true]);
    await expect(loader.run("a:1", "a", async current => current())).resolves.toBe(true);
  });
  it("clears failed fills so a later request can recover", async () => {
    const loader = createBoundedSingleFlight<number>(options);
    await expect(loader.run("a", "a", async () => { throw new Error("DB unavailable"); })).rejects.toThrow("DB unavailable");
    await expect(loader.run("a", "a", async () => 2)).resolves.toBe(2);
  });
});
