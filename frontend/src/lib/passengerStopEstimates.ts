import type { DirectedRouteData } from "./rideDirection";

export interface PassengerStopEstimates {
  context: string;
  minutes: Record<string, number>;
  nextStopIndex?: number;
  unavailable?: string;
}

/** A map publication may only be used by controls for that exact itinerary and bus. */
export function stopEstimateContext(route: DirectedRouteData, busKey?: string, busRouteVersion?: number): string {
  return JSON.stringify([route.id, route.configVersion, route.geometryVersion, route.rideDirection,
    route.stops.map(stop => [stop.id, stop.lat, stop.lng]), busKey, busRouteVersion]);
}

export function stopEstimateLabel(estimates: PassengerStopEstimates | undefined, stopId: string, index: number): string {
  if (estimates?.nextStopIndex !== undefined && index < estimates.nextStopIndex) return "Passed";
  if (estimates?.unavailable) return estimates.unavailable;
  const minutes = estimates?.minutes[stopId];
  return typeof minutes === "number" && Number.isFinite(minutes)
    ? minutes === 0 ? "<1 min" : `${minutes} min`
    : "Calculating";
}
