import { preparePolylineDistanceIndex } from "../../frontend/src/lib/polylineDistance";

export const route = { id: "synthetic-progress", name: "Synthetic campus route", waypoints: [], color: "#22c55e",
  rideDirection: "forward" as const, configVersion: 1, geometryVersion: 1, polylineQuality: "HIGH_QUALITY" as const,
  polyline: "_ekkC_omvLgEgEgEgEgEgE", stops: ["Alpha", "Beta", "Gamma", "Delta"].map((name, index) => ({
    id: name.toLowerCase(), name, shortName: name[0], lat: 23 + index * 0.001, lng: 72 + index * 0.001 })) };
const listeners = new Set<(snapshot: Record<string, unknown>) => void>();
function liveBus(index: number) {
  const now = Date.now();
  const point = { lat: 23.0015, lng: 72.0015 };
  const distances = preparePolylineDistanceIndex(route.stops).cumulative;
  return { busId: "synthetic-bus", routeId: route.id, sessionId: "synthetic-session", driverId: "synthetic-driver",
    ...point, timestamp: now, backendReceivedAt: now, seq: 1, deviceState: "online", status: "active", tripState: "in_service",
    direction: "forward", directionState: "resolved", routeDirection: "forward", routeVersion: 1, routeGeometryVersion: 1,
    currentStopIndex: index, routeSource: "configured", routeState: "ON_ROUTE", motionState: "moving", speed: 20, heading: 43,
    mapMatchSeq: 1, mapMatchSampledAt: now,
    rawLocation: { ...point, speed: 20, heading: 43, motionState: "moving", seq: 1, sampledAt: now },
    matchedLocation: { ...point, seq: 1, sampledAt: now, routeVersion: 1, matchConfidence: 0.99, distanceToRouteM: 0,
      segmentIndex: 1, segmentFraction: 0.5, alongRouteDistanceM: (distances[1] + distances[2]) / 2 } };
}
let snapshot: Record<string, unknown> = { bus: liveBus(2) };
export function publish(index: number) { snapshot = { bus: liveBus(index) }; listeners.forEach(listener => listener(snapshot)); }
export function subscribeLiveBusesByRoute(_id: string, listener: (snapshot: Record<string, unknown>) => void) {
  listeners.add(listener); listener(snapshot); return () => { listeners.delete(listener); };
}
const empty = new Map();
export function useDynamicRouteGeometries() { return empty; }
export const auth = { currentUser: { uid: "synthetic-passenger", getIdToken: async () => "synthetic-token" } };
export function getAuthVerificationGeneration() { return 1; }
