import { afterEach, describe, expect, it, vi } from "vitest";
import { BoundedKeyedExecutor } from "./boundedKeyedExecutor";
import { ExecutionDeadline, ExecutionDeadlineError } from "./executionDeadline";

function gate() { let release!: () => void; const promise = new Promise<void>(done => { release = done; }); return { promise, release }; }
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
describe("monotonic execution and response budgets", () => {
  it("expires the caller while the real dependency and keyed permit remain occupied", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    const pool = new BoundedKeyedExecutor<string>({ maxConcurrent: 1 });
    const dependency = gate(); const deadline = new ExecutionDeadline(100, 50);
    const operation = pool.run("bus", () => deadline.dependency("write", async () => {
      deadline.markWriteDispatched(); await dependency.promise;
    }));
    const response = deadline.waitForResponse(operation).catch(error => error);
    await vi.advanceTimersByTimeAsync(51);
    expect(await response).toMatchObject({ stage: "write", uncertainCommit: true });
    expect(pool.snapshot()).toMatchObject({ active: 1, pending: 0 });
    dependency.release(); await expect(operation).rejects.toBeInstanceOf(ExecutionDeadlineError);
    expect(pool.snapshot().active).toBe(0);
    await expect(pool.run("bus", async () => "fresh")).resolves.toBe("fresh");
  });

  it("shares the response deadline across successful stages instead of resetting it", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    const deadline = new ExecutionDeadline(100, 80); const first = gate(); const second = gate(); const third = vi.fn();
    const operation = (async () => {
      await deadline.dependency("first", () => first.promise);
      await deadline.dependency("second", () => second.promise);
      await deadline.dependency("third", third);
    })();
    const response = deadline.waitForResponse(operation).catch(error => error);
    await vi.advanceTimersByTimeAsync(60); first.release(); await vi.advanceTimersByTimeAsync(41);
    expect(await response).toMatchObject({ uncertainCommit: false });
    second.release(); await expect(operation).rejects.toBeInstanceOf(ExecutionDeadlineError);
    expect(third).not.toHaveBeenCalled();
  });

  it("uses monotonic time when the wall clock goes backwards", async () => {
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout", "Date"] });
    const deadline = new ExecutionDeadline(100, 50); const pending = gate();
    const operation = deadline.dependency("read", () => pending.promise);
    const response = deadline.waitForResponse(operation).catch(error => error);
    vi.setSystemTime(Date.now() - 3_600_000); await vi.advanceTimersByTimeAsync(51);
    expect(await response).toBeInstanceOf(ExecutionDeadlineError);
    pending.release(); await expect(operation).rejects.toBeInstanceOf(ExecutionDeadlineError);
  });

  it("does not dispatch when expired, including a late success before timer callbacks run", async () => {
    let clock = 0; const deadline = new ExecutionDeadline(100, 50, () => clock);
    const work = vi.fn(async () => { clock = 51; return "late"; });
    await expect(deadline.dependency("read", work)).rejects.toBeInstanceOf(ExecutionDeadlineError);
    const next = vi.fn(async () => "bad");
    await expect(deadline.dependency("next", next)).rejects.toBeInstanceOf(ExecutionDeadlineError);
    expect(next).not.toHaveBeenCalled(); deadline.dispose();
  });

  it("rejects an SDK callback after its dependency budget even before the timer fires", async () => {
    let clock = 0; const deadline = new ExecutionDeadline(100, 50, () => clock);
    const hold = gate(); const operation = deadline.dependency("SDK", () => hold.promise);
    clock = 51; expect(deadline.isActive()).toBe(false);
    hold.release(); await expect(operation).rejects.toMatchObject({ stage: "SDK" }); deadline.dispose();
  });
});
