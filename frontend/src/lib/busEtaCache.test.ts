import { describe, expect, it, vi } from "vitest";

const projection = vi.hoisted(() => ({ calls: [] as number[] }));
vi.mock("./polylineDistance", async importOriginal => {
  const original = await importOriginal<typeof import("./polylineDistance")>();
  return {
    ...original,
    positionAlongPolyline: (...args: Parameters<typeof original.positionAlongPolyline>) => {
      projection.calls.push(args[0].lat);
      return original.positionAlongPolyline(...args);
    },
  };
});

import { busStopArrivalTimestamps } from "./busEta";

describe("stop projections", () => {
  it("reuses unchanged stops and projects them again for a new reroute path", () => {
    projection.calls = [];
    const stop = { id: "destination", lat: 23.01, lng: 72 };
    const path = [{ lat: 23, lng: 72 }, stop];
    const input = { busPoint: path[0], heading: 0, speedKmh: 30, delayMinutes: 0, remainingStops: [stop], now: 0 };
    const direct = busStopArrivalTimestamps({ ...input, path });
    busStopArrivalTimestamps({ ...input, path, now: 1_000 });
    expect(projection.calls).toHaveLength(3); // two changing bus projections, one static stop
    const reroute = [{ lat: 23, lng: 72 }, { lat: 23, lng: 72.01 }, stop];
    const detour = busStopArrivalTimestamps({ ...input, path: reroute });
    expect(projection.calls).toHaveLength(5);
    expect(detour.destination).toBeGreaterThan(direct.destination);
  });
});
