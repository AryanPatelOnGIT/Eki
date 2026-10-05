import { describe, expect, it, vi } from "vitest";
import { FleetReconciliationCache } from "./fleetReconciliationCache";

describe("fleet reconciliation cache", () => {
  it("coalesces targeted reads and does not replace a newer mirror with a late load", async () => {
    let complete!: (value: unknown) => void;
    const loader = vi.fn(() => new Promise<unknown>(done => { complete = done; }));
    const cache = new FleetReconciliationCache({}, async () => [], loader);
    const first = cache.mirrorFor("driver"), second = cache.mirrorFor("driver");
    expect(loader).toHaveBeenCalledOnce(); cache.setMirror("driver", null);
    complete({ old: true }); await Promise.all([first, second]);
    expect(await cache.mirrorFor("driver")).toBeNull(); expect(loader).toHaveBeenCalledOnce();
  });
  it("loads a shared bus assignment once for concurrent drivers", async () => {
    const loader = vi.fn(async () => ["route_1", "route_2"]);
    const cache = new FleetReconciliationCache({}, loader);

    const [first, second] = await Promise.all([
      cache.routesForBus("bus_1"),
      cache.routesForBus("bus_1"),
    ]);

    expect(first).toEqual(["route_1", "route_2"]);
    expect(second).toEqual(first);
    expect(loader).toHaveBeenCalledOnce();
  });

  it("serves and updates preloaded mirrors", async () => {
    const cache = new FleetReconciliationCache(
      { driver_1: { bus_1: { route_1: true } } },
      async () => [],
    );
    expect(await cache.mirrorFor("driver_1")).toEqual({ bus_1: { route_1: true } });
    expect(await cache.mirrorFor("missing")).toBeNull();
    cache.setMirror("driver_1", null);
    expect(await cache.mirrorFor("driver_1")).toBeNull();
  });
});
