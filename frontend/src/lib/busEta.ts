import type { LatLng } from "./polyline";
import {
  positionAlongPolyline,
  preparePolylineDistanceIndex,
} from "./polylineDistance";
import { getDistanceMeters } from "./mapUtils";
import { ETA_SPEED_FLOOR_KMH } from "./etaConstants";
import { routeLegPaths } from "./routeLegPaths";

export interface EtaStopPoint {
  id: string;
  lat: number;
  lng: number;
}

interface StopProjectionEntry {
  path: readonly LatLng[];
  stopsKey: string;
  firstStopIndex: number;
  positions: ReadonlyMap<string, number | null>;
  legs: ReadonlyMap<number, LatLng[]>;
  offsets: ReadonlyMap<number, number>;
}

function stopProjectionKey(stop: EtaStopPoint): string {
  return JSON.stringify([stop.id, stop.lat, stop.lng]);
}

/** Owned by one map instance; route switches and unmount discard its entries. */
export class StopProjectionCache {
  private readonly entries = new Map<string, StopProjectionEntry>();
  private static readonly MAX_ENTRIES = 16;

  positions(routeKey: string, path: readonly LatLng[], stops: readonly EtaStopPoint[], firstStopIndex = 0): ReadonlyMap<string, number | null> {
    // Check coordinates as well as IDs: an edit may reuse a route version until
    // the authoritative version update arrives.
    const stopsKey = JSON.stringify(stops.map((stop) => [stop.id, stop.lat, stop.lng]));
    const existing = this.entries.get(routeKey);
    if (existing?.path === path && existing.stopsKey === stopsKey && existing.firstStopIndex === firstStopIndex) return existing.positions;
    const positions = new Map<string, number | null>();
    const offsets = new Map<number, number>();
    let legs: ReadonlyMap<number, LatLng[]> = new Map();
    // Independent nearest-point projections pick the first visit on a loop
    // or return road. Use the same ordered itinerary as the route renderer
    // whenever this is a complete configured path. Partial reroutes retain
    // their existing per-stop projections until their own itinerary is known.
    const itinerary = routeLegPaths(path, stops, firstStopIndex);
    if (stops.length > 1 && itinerary.size > 0 && itinerary.size === stops.length - Math.max(1, firstStopIndex)) {
      legs = itinerary;
      let distance = 0;
      if (firstStopIndex === 0) positions.set(stopProjectionKey(stops[0]), 0);
      for (let stopIndex = Math.max(1, firstStopIndex); stopIndex < stops.length; stopIndex++) {
        offsets.set(stopIndex, distance);
        const cumulative = preparePolylineDistanceIndex(legs.get(stopIndex)!).cumulative;
        distance += cumulative[cumulative.length - 1];
        positions.set(stopProjectionKey(stops[stopIndex]), distance);
      }
    } else {
      const index = preparePolylineDistanceIndex(path);
      stops.forEach(stop => positions.set(stopProjectionKey(stop), positionAlongPolyline(stop, index)));
    }
    this.entries.delete(routeKey);
    this.entries.set(routeKey, { path, stopsKey, firstStopIndex, positions, legs, offsets });
    if (this.entries.size > StopProjectionCache.MAX_ENTRIES) {
      this.entries.delete(this.entries.keys().next().value!);
    }
    return positions;
  }

  /** Project on the authoritative active leg so repeated road visits differ. */
  busPosition(routeKey: string, point: LatLng, heading: number, nextStopIndex: number): number | null {
    const entry = this.entries.get(routeKey);
    if (!entry) return null;
    const legIndex = Math.max(1, nextStopIndex);
    const leg = entry.legs.get(legIndex);
    const position = positionAlongPolyline(point, preparePolylineDistanceIndex(leg ?? entry.path), { headingDegrees: heading });
    return position === null ? null : position + (leg ? entry.offsets.get(legIndex)! : 0);
  }

  clear(): void { this.entries.clear(); }
  get size(): number { return this.entries.size; }
}

/**
 * Compute arrival timestamps for the stops ahead of a single bus, measured
 * along that BUS's own path. Each bus carries its own active path (a dynamic
 * reroute when it has one, else the shared configured path), so a reroute on
 * one bus never leaks into another bus's ETA.
 *
 * Math mirrors the legacy passenger-map loop: 45s dwell per intermediate stop
 * and a configurable speed floor.
 */
export function busStopArrivalTimestamps(params: {
  busPoint: { lat: number; lng: number };
  heading: number;
  speedKmh: number;
  delayMinutes: number;
  path: readonly LatLng[];
  remainingStops: readonly EtaStopPoint[];
  now: number;
  stopPositions?: ReadonlyMap<string, number | null>;
  busPathPosition?: number | null;
}): Record<string, number> {
  const index = preparePolylineDistanceIndex(params.path);
  const busPathPosition = params.busPathPosition !== undefined
    ? params.busPathPosition
    : positionAlongPolyline(params.busPoint, index, { headingDegrees: params.heading });
  const speedKmh = Math.max(
    params.speedKmh || ETA_SPEED_FLOOR_KMH,
    ETA_SPEED_FLOOR_KMH,
  );
  const speedMs = speedKmh / 3.6;
  const delaySec = (params.delayMinutes || 0) * 60;
  const arrivals: Record<string, number> = {};

  for (let i = 0; i < params.remainingStops.length; i += 1) {
    const stop = params.remainingStops[i];
    const projectionKey = stopProjectionKey(stop);
    const stopPathPosition = params.stopPositions?.has(projectionKey)
      ? params.stopPositions.get(projectionKey) ?? null
      : positionAlongPolyline(stop, index);
    const accumDistMeters =
      busPathPosition !== null && stopPathPosition !== null
        ? Math.abs(stopPathPosition - busPathPosition)
        : getDistanceMeters(params.busPoint, stop);
    let totalSeconds = accumDistMeters / speedMs;
    if (i > 0) totalSeconds += i * 45;
    arrivals[stop.id] =
      params.now + totalSeconds * 1000 + delaySec * 1000;
  }

  return arrivals;
}
