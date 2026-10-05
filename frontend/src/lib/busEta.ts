import type { LatLng } from "./polyline";
import {
  distanceAlongPolyline,
  positionAlongPolyline,
  preparePolylineDistanceIndex,
} from "./polylineDistance";
import { ETA_SPEED_FLOOR_KMH } from "./etaConstants";

// Static stop projections belong to the exact geometry object. A new route
// version/reroute path gets a new cache without retaining the old geometry.
const stopProjectionCache = new WeakMap<readonly LatLng[], Map<string, number | null>>();

function stopPosition(stop: EtaStopPoint, path: readonly LatLng[], index: ReturnType<typeof preparePolylineDistanceIndex>): number | null {
  let positions = stopProjectionCache.get(path);
  if (!positions) {
    positions = new Map();
    stopProjectionCache.set(path, positions);
  }
  const key = `${stop.id}\0${stop.lat}\0${stop.lng}`;
  if (positions.has(key)) return positions.get(key)!;
  const position = positionAlongPolyline(stop, index);
  if (positions.size >= 256) positions.clear();
  positions.set(key, position);
  return position;
}

export interface EtaStopPoint {
  id: string;
  lat: number;
  lng: number;
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
}): Record<string, number> {
  const index = preparePolylineDistanceIndex(params.path);
  const busPathPosition = positionAlongPolyline(params.busPoint, index, {
    headingDegrees: params.heading,
  });
  const speedKmh = Math.max(
    params.speedKmh || ETA_SPEED_FLOOR_KMH,
    ETA_SPEED_FLOOR_KMH,
  );
  const speedMs = speedKmh / 3.6;
  const delaySec = (params.delayMinutes || 0) * 60;
  const arrivals: Record<string, number> = {};

  for (let i = 0; i < params.remainingStops.length; i += 1) {
    const stop = params.remainingStops[i];
    const stopPathPosition = stopPosition(stop, params.path, index);
    const accumDistMeters =
      busPathPosition !== null && stopPathPosition !== null
        ? Math.abs(stopPathPosition - busPathPosition)
        : distanceAlongPolyline(params.busPoint, stop, params.path);
    let totalSeconds = accumDistMeters / speedMs;
    if (i > 0) totalSeconds += i * 45;
    arrivals[stop.id] =
      params.now + totalSeconds * 1000 + delaySec * 1000;
  }

  return arrivals;
}
