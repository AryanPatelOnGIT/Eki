import { haversineMeters } from "../lib/geo";
import type { LatLng } from "../lib/polylineUtils";
import type { RideDirection } from "../lib/rideDirection";
import { matchRoutePosition, trajectoryHeading } from "./routeMatching";

export interface DepartureSample extends LatLng { timestamp: number }
const MAX_DEPARTURE_BACKSTEP_M = 2.5;

/** Recover a missed stopped endpoint fix from sustained, unambiguous departure.
 * Only the first leg is eligible: starting after an unobserved intermediate
 * stop must not silently claim that stop was served. Heading alone is insufficient.
 */
export function inferDepartureDirection(input: {
  samples: readonly DepartureSample[];
  stops: readonly LatLng[];
  forwardPath: readonly LatLng[];
  reversePath: readonly LatLng[];
  now: number;
}): RideDirection | null {
  const { samples, stops, now } = input;
  if (samples.length < 3 || stops.length < 2 || samples.some((point, index) =>
    !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || !Number.isFinite(point.timestamp) ||
    now - point.timestamp > 60_000 || point.timestamp > now + 10_000 ||
    (index > 0 && (point.timestamp <= samples[index - 1].timestamp ||
      haversineMeters(point, samples[index - 1]) > 250)))) return null;
  if (samples.at(-1)!.timestamp - samples[0].timestamp < 2_000) return null;
  const heading = trajectoryHeading(samples, 30);
  if (heading === undefined) return null;
  const candidates = (["forward", "reverse"] as const).filter(direction => {
    const path = direction === "forward" ? input.forwardPath : input.reversePath;
    const nextStop = direction === "forward" ? stops[1] : stops[stops.length - 2];
    const next = matchRoutePosition(nextStop, path);
    if (!next || next.isAmbiguous || next.distanceToRouteM > 20) return false;
    const matches = samples.map(point => matchRoutePosition(point, path, heading));
    if (matches.some(match => !match || match.isAmbiguous || match.distanceToRouteM > 15 ||
      match.matchConfidence < 0.7 || match.headingDifference === null || match.headingDifference > 35 ||
      match.alongRouteDistanceM > next.alongRouteDistanceM + 10)) return false;
    // Reliable moving fixes can still wobble by a couple of metres. Require
    // sustained net travel and bound jitter against the furthest accepted
    // position, so several small reversals cannot accumulate into a U-turn.
    let furthest = matches[0]!.alongRouteDistanceM;
    return matches.every(match => {
      if (match!.alongRouteDistanceM < furthest - MAX_DEPARTURE_BACKSTEP_M) return false;
      furthest = Math.max(furthest, match!.alongRouteDistanceM);
      return true;
    }) &&
      matches.at(-1)!.alongRouteDistanceM - matches[0]!.alongRouteDistanceM >= 30;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

/** Persist a bounded proof with the live node, scoped to session and route revision. */
export function departureSamples(previous: unknown, context: string, sample: DepartureSample,
  reliableMoving: boolean): { context: string; samples: DepartureSample[] } {
  const record = previous && typeof previous === "object" ? previous as Record<string, unknown> : {};
  const old = record.context === context && Array.isArray(record.samples) ? record.samples : [];
  const valid: DepartureSample[] = reliableMoving ? old.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const point = value as DepartureSample;
    return Number.isFinite(point.lat) && Number.isFinite(point.lng) && Number.isFinite(point.timestamp) &&
      point.timestamp < sample.timestamp && sample.timestamp - point.timestamp <= 60_000 ? [point] : [];
  }) : [];
  // Retain the first fresh anchor as well as recent fixes so a slow departure
  // can accumulate 30m without retaining an unbounded high-frequency history.
  const samples = valid.length > 7 ? [valid[0], ...valid.slice(-6)] : valid;
  if (reliableMoving && (samples.length === 0 || sample.timestamp - samples.at(-1)!.timestamp >= 2_000)) samples.push(sample);
  return { context, samples };
}
