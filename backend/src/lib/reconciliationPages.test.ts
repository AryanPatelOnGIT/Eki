import { describe, expect, it, vi } from "vitest";
import { forEachBounded, settleTogether } from "./reconciliationPages";
describe("reconciliation settlement", () => {
  it("retains a failed read pair until the other SDK call settles", async () => {
    let release!: () => void;
    const held = new Promise<void>(done => { release = done; });
    const outcome = vi.fn();
    const work = settleTogether([Promise.reject(Error("failed read")), held]).catch(outcome);
    await Promise.resolve(); await Promise.resolve(); expect(outcome).not.toHaveBeenCalled();
    release(); await work; expect(outcome).toHaveBeenCalledOnce();
  });
  it("waits for dispatched peers after failure and does not start another batch", async () => {
    let release!: () => void; const gate = new Promise<void>(done => { release = done; });
    const visited: number[] = [];
    const work = forEachBounded([0, 1, 2, 3, 4], 2, async value => {
      visited.push(value); if (value === 0) throw Error("record failed"); await gate;
    });
    const caught = work.catch(error => error);
    await Promise.resolve(); expect(visited).toEqual([0, 1]); release();
    expect(await caught).toBeInstanceOf(Error); expect(visited).toEqual([0, 1]);
  });
});
