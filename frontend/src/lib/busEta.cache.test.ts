import { beforeEach, describe, expect, it, vi } from "vitest";

const counter = vi.hoisted(() => ({ projections: 0, itineraries: 0 }));
vi.mock("./routeLegPaths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./routeLegPaths")>();
  return { ...actual, routeLegPaths: (...args: Parameters<typeof actual.routeLegPaths>) => {
    counter.itineraries += 1;
    return actual.routeLegPaths(...args);
  } };
});
vi.mock("./polylineDistance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./polylineDistance")>();
  return {
    ...actual,
    positionAlongPolyline: (...args: Parameters<typeof actual.positionAlongPolyline>) => {
      counter.projections += 1;
      return actual.positionAlongPolyline(...args);
    },
  };
});

import { busStopArrivalTimestamps, StopProjectionCache } from "./busEta";
import { positionAlongPolyline, preparePolylineDistanceIndex } from "./polylineDistance";
import { getDistanceMeters } from "./mapUtils";

const path = [{ lat: 23, lng: 72 }, { lat: 23.01, lng: 72 }, { lat: 23.02, lng: 72 }];
const stops = [{ id: "a", lat: 23, lng: 72 }, { id: "b", lat: 23.01, lng: 72 }, { id: "c", lat: 23.02, lng: 72 }];
const base = { busPoint: { lat: 23.005, lng: 72 }, heading: 0, speedKmh: 30, delayMinutes: 0, path, remainingStops: stops, now: 1000 };

beforeEach(() => { counter.projections = 0; counter.itineraries = 0; });

describe("route scoped stop projections", () => {
  it("uses the immutable first required stop for a partial reroute itinerary", () => {
    const cache = new StopProjectionCache();
    const reroute = [{ lat: 23.005, lng: 72 }, ...path.slice(1)];
    const positions = cache.positions("dynamic:v1", reroute, stops, 1);
    expect(positions.has(JSON.stringify([stops[0].id, stops[0].lat, stops[0].lng]))).toBe(false);
    expect(cache.busPosition("dynamic:v1", reroute[0], 0, 1)).toBe(0);
    const position = cache.busPosition("dynamic:v1", { lat: 23.015, lng: 72 }, 0, 2)!;
    expect(position).toBeCloseTo(getDistanceMeters(reroute[0], { lat: 23.015, lng: 72 }), 3);
    expect(cache.positions("dynamic:v1", reroute, stops, 0)).not.toBe(positions);
  });
  it("avoids all unchanged stop work on another tick and preserves legacy ETA values", () => {
    const legacy = busStopArrivalTimestamps(base);
    expect(counter.projections).toBe(4);
    counter.projections = 0;
    const cache = new StopProjectionCache();
    const positions = cache.positions("route:v1:forward", path, stops);
    expect(counter.itineraries).toBe(1);
    expect(counter.projections).toBe(0);
    // The bus itself still projects once on its changed sample; unchanged
    // peers pass their cached busPathPosition on subsequent fleet ticks.
    const first = busStopArrivalTimestamps({ ...base, stopPositions: positions });
    expect(first).toEqual(legacy);
    expect(counter.projections).toBe(1);
    const busPathPosition = positionAlongPolyline(base.busPoint, preparePolylineDistanceIndex(path), { headingDegrees: 0 });
    counter.projections = 0;
    expect(cache.positions("route:v1:forward", path, stops)).toBe(positions);
    const repeat = busStopArrivalTimestamps({ ...base, now: 2000, stopPositions: positions, busPathPosition });
    expect(counter.projections).toBe(0);
    expect(counter.itineraries).toBe(1);
    expect(repeat.a).toBe(legacy.a + 1000);
  });

  it("invalidates on version, direction, edited stops, and replacement path", () => {
    const cache = new StopProjectionCache();
    const original = cache.positions("route:v1:forward", path, stops);
    expect(counter.itineraries).toBe(1);
    const edited = [{ ...stops[0] }, { ...stops[1], lat: 23.012 }, { ...stops[2] }];
    expect(cache.positions("route:v1:forward", path, edited)).not.toBe(original);
    expect(counter.itineraries).toBe(2);
    cache.positions("route:v2:forward", path, edited);
    cache.positions("route:v2:reverse", path, edited);
    cache.positions("route:v2:reverse", [...path], edited);
    expect(counter.itineraries).toBe(5);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("bounds entries across many reroutes", () => {
    const cache = new StopProjectionCache();
    for (let version = 0; version < 40; version += 1) cache.positions(`route:v${version}`, path, stops);
    expect(cache.size).toBeLessThanOrEqual(16);
  });

  it.each([
    ["loop", [{ lat: 23, lng: 72 }, { lat: 23, lng: 72.01 }, { lat: 23.01, lng: 72.01 }, { lat: 23.01, lng: 72 }, { lat: 23, lng: 72 }]],
    ["parallel carriageways", [{ lat: 23, lng: 72 }, { lat: 23.01, lng: 72 }, { lat: 23.01, lng: 72.0002 }, { lat: 23, lng: 72.0002 }]],
  ])("matches the full-search ETA for a %s", (_name, shape) => {
    const routeStops = shape.map((point, index) => ({ ...point, id: `stop-${index}` }));
    const params = { ...base, path: shape, busPoint: { lat: 23.005, lng: 72.0001 }, heading: 180, remainingStops: routeStops };
    // The ordered vertex itinerary is the reference. Independent nearest
    // projection incorrectly assigns a loop's final stop to its first visit.
    let distance = 0;
    const orderedPositions = new Map(routeStops.map((point, index) => {
      if (index) distance += getDistanceMeters(routeStops[index - 1], point);
      return [JSON.stringify([point.id, point.lat, point.lng]), distance] as const;
    }));
    const expected = busStopArrivalTimestamps({ ...params, stopPositions: orderedPositions });
    const cache = new StopProjectionCache();
    const stopPositions = cache.positions("route:v1", shape, routeStops);
    const busPathPosition = positionAlongPolyline(params.busPoint, preparePolylineDistanceIndex(shape), { headingDegrees: params.heading });
    const actual = busStopArrivalTimestamps({ ...params, stopPositions, busPathPosition });
    for (const id of Object.keys(expected)) expect(actual[id]).toBeCloseTo(expected[id], 5);
  });

  it("preserves Haversine fallback when the bus cannot snap to the road", () => {
    const params = { ...base, busPoint: { lat: 24, lng: 73 } };
    const legacy = busStopArrivalTimestamps(params);
    const cache = new StopProjectionCache();
    const positions = cache.positions("route:v1", path, stops);
    const busPathPosition = positionAlongPolyline(params.busPoint, preparePolylineDistanceIndex(path), { headingDegrees: params.heading });
    expect(busPathPosition).toBeNull();
    expect(busStopArrivalTimestamps({ ...params, stopPositions: positions, busPathPosition })).toEqual(legacy);
    expect(legacy.a).toBe(params.now + getDistanceMeters(params.busPoint, stops[0]) / (30 / 3.6) * 1000);
  });
});
