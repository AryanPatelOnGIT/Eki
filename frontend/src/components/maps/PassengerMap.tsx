"use client";

import { memo, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Map as GoogleMap, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import RouteTimelineSheet from "@/components/passenger/RouteTimelineSheet";
import DirectionsRoute from "@/components/maps/DirectionsRoute";
import BusPositionGlyph from "@/components/maps/BusPositionGlyph";
import { RouteStop } from "@/hooks/useRoutes";
import { getDistanceMeters } from "@/lib/mapUtils";
import { isLiveBusSignalLost, liveBusFreshnessTimestamp } from "@/lib/liveBusFreshness";
import { subscribeLiveBusesByRoute } from "@/lib/liveBusStore";
import {
  normalizePassengerMapBus,
  passengerLiveBusSelectionKey,
  reusePassengerMapBus,
  type PassengerMapBus,
} from "@/lib/passengerLiveBus";
import { passengerRerouteNotice } from "@/lib/passengerRouteStatus";

import { WifiOff, Navigation } from "lucide-react";
import { MAP_OPTIONS, MAPS_MAP_ID } from "@/config/maps";
import {
  directionsMatch,
  type DirectedRouteData,
} from "@/lib/rideDirection";
import { normalizeHeading, unwrapHeading } from "@/lib/markerHeading";
import { busEtaPath } from "@/lib/busRouteGeometry";
import { selectLiveBusMarkerPosition, type LiveBusMarkerSelection } from "@/lib/liveBusMarkerPosition";
import { useLiveBusMarkerPosition } from "@/hooks/useLiveBusMarkerPosition";
import { useSmoothPosition } from "@/hooks/useSmoothPosition";
import {
  decodeRoutePathForDisplay,
} from "@/lib/mapRouteGeometry";
import { busStopArrivalTimestamps, StopProjectionCache } from "@/lib/busEta";
import { useDynamicRouteGeometries } from "@/hooks/useDynamicRouteGeometries";
import { useTelemetryRenderTrace } from "@/hooks/useTelemetryRenderTrace";
import { stopLabel } from "@/lib/stopLabel";
import { routeDisplayPath } from "@/lib/routeDisplayPath";
import { publishedStopIndex } from "@/lib/publishedStopIndex";
import type { LatLng } from "@/lib/polyline";
import { stopEstimateContext, type PassengerStopEstimates } from "@/lib/passengerStopEstimates";

export interface PassengerMapProps {
  /** Height of the floating ride controls above the map's usable area. */
  topInset?: number;
  targetStop: RouteStop;
  route: DirectedRouteData | null;
  resumeGeneration?: number;
  preview?: boolean;
  selectedBusKey?: string;
  /** Explicit destination selection; targetStop may only be a camera fallback. */
  selectedDestinationStopId?: string;
  onStopEstimatesChange?: (estimates: PassengerStopEstimates) => void;
}

type IncomingBusData = PassengerMapBus;

const WALKING_KMH = 5;
const WALKING_M_PER_MIN = (WALKING_KMH * 1000) / 60;
const BUS_MOTION_COLORS: Record<string, string> = {
  moving:    "#2563eb",
  stopped:   "#b45309",
  uncertain: "#b45309",
};

const BusMarker = memo(function BusMarker({
  bus,
  signalLost,
}: {
  bus: IncomingBusData;
  signalLost: boolean;
}) {
  const markerSelection = useLiveBusMarkerPosition(bus);
  const markerPoint = useSmoothPosition(markerSelection.position);
  useTelemetryRenderTrace(bus, "passenger", markerPoint !== null, { position: markerPoint, selection: markerSelection });

  const [displayHeading, setDisplayHeading] = useState(() =>
    normalizeHeading(bus.heading),
  );
  const displayHeadingRef = useRef(displayHeading);
  useEffect(() => {
    if (bus.motionState !== "moving" || bus.speed < 3 || bus.deviceState !== "online") return;
    const nextDisplayHeading = unwrapHeading(bus.heading, displayHeadingRef.current);
    displayHeadingRef.current = nextDisplayHeading;
    setDisplayHeading(nextDisplayHeading);
  }, [bus.heading, bus.motionState, bus.speed, bus.deviceState]);

  const color = signalLost || markerSelection.uncertain ? "#b45309"
    : BUS_MOTION_COLORS[bus.motionState] ?? BUS_MOTION_COLORS.uncertain;

  if (!markerPoint) return null;
  return (
    <AdvancedMarker position={markerPoint} anchorLeft="-50%" anchorTop="-50%" zIndex={40}>
      <BusPositionGlyph
        label={
          signalLost ? `${bus.busId} — last known location`
          : markerSelection.decision === "match_pending"
            ? `${bus.busId} — updating route position`
            : markerSelection.uncertain
              ? `${bus.busId} — approximate GNSS position`
              : `${bus.busId} — ${bus.motionState}`
        }
        heading={displayHeading}
        color={color}
        uncertain={signalLost || markerSelection.uncertain || bus.deviceState !== "online"}
      />
    </AdvancedMarker>
  );
});


// ── Traffic layer rendered imperatively ──────────────────────────────────────
// ── Pan/zoom controller ──────────────────────────────────────────────────────
function MapCenterer({ target, isCentered, previewPoints, hasBus, topInset }: {
  topInset: number;
  target: { lat: number; lng: number } | null;
  isCentered: boolean;
  previewPoints?: { lat: number; lng: number }[];
  hasBus: boolean;
}) {
  const map = useMap();
  const fittedStage = useRef<string | null>(null);
  useEffect(() => {
    if (!map || !isCentered) return;
    if (previewPoints) {
      // Fit once for the route, and once when its first GPS fix arrives.
      // Subsequent fixes must not repeatedly zoom or override a manual drag.
      const stage = `${hasBus ? "bus" : "route"}:${topInset}`;
      if (fittedStage.current === stage) return;
      const points = [...previewPoints, ...(hasBus && target ? [target] : [])]
        .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng));
      if (points.length === 0) return;
      const bounds = points.reduce((result, point) => ({
        north: Math.max(result.north, point.lat), south: Math.min(result.south, point.lat),
        east: Math.max(result.east, point.lng), west: Math.min(result.west, point.lng),
      }), { north: -Infinity, south: Infinity, east: -Infinity, west: Infinity });
      map.fitBounds(bounds, { top: topInset + 32, bottom: 160, left: 48, right: 72 });
      fittedStage.current = stage;
      return;
    }
    if (isCentered && target && map) {
      map.panTo(target);
      map.setZoom(16);
    }
  }, [isCentered, target, map, previewPoints, hasBus, topInset]);
  return null;
}

function PassengerMapInner({
  topInset = 0,
  targetStop,
  route,
  resumeGeneration = 0,
  preview = false,
  selectedBusKey,
  selectedDestinationStopId,
  onStopEstimatesChange,
}: {
  topInset?: number;
  targetStop: RouteStop;
  route: DirectedRouteData;
  resumeGeneration?: number;
  preview?: boolean;
  selectedBusKey?: string;
  selectedDestinationStopId?: string;
  onStopEstimatesChange?: PassengerMapProps["onStopEstimatesChange"];
}) {
  const [buses, setBuses] = useState<Map<string, IncomingBusData>>(new Map<string, IncomingBusData>());
  const previousBusesRef = useRef<Map<string, IncomingBusData>>(new Map());
  const [stopETAs, setStopETAs] = useState<Record<string, number>>({});
  const [uiNow, setUiNow] = useState(() => Date.now());
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);
  useEffect(() => {
    previousBusesRef.current = new Map();
  }, [route.id, route.rideDirection, route.configVersion, route.stops, selectedBusKey]);

  const [passengerLocation, setPassengerLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geolocationNotice, setGeolocationNotice] = useState<string | null>(null);
  const [liveReadFailed, setLiveReadFailed] = useState(false);
  const [isCentered, setIsCentered] = useState(true);
  const [focusBus, setFocusBus] = useState(false);
  const arrivalTimestampsRef = useRef<Record<string, number>>({});
  const routeStops = useMemo(() => {
    return route.stops?.map(s => ({ lat: s.lat, lng: s.lng })) ?? [];
  }, [route.stops]);
  // Dynamic reroute geometry is fetched once per route version from a
  // version-keyed sibling node (`activeRouteGeometry`), so the high-frequency
  // activeBuses child never carries the full polyline.
  const dynamicGeometries = useDynamicRouteGeometries(buses);
  // Each bus keeps its own geometry and next-stop progress.
  const etaMarkerSelections = useRef(new Map<string, LiveBusMarkerSelection>());
  const etaSelectionInputs = useRef(new Map<string, IncomingBusData>());
  const etaBusPositions = useRef(new Map<string, {
    path: readonly LatLng[]; point: LatLng; heading: number;
    routeVersion: number | undefined; direction: unknown; position: number | null;
    sessionId: string | undefined; nextStopIndex: number; stopPositions: ReadonlyMap<string, number | null>;
  }>());
  const stopProjectionCache = useRef(new StopProjectionCache());
  useEffect(() => {
    const selections = etaMarkerSelections.current;
    const inputs = etaSelectionInputs.current;
    const positions = etaBusPositions.current;
    const projections = stopProjectionCache.current;
    return () => {
      selections.clear();
      inputs.clear();
      positions.clear();
      projections.clear();
    };
  }, [route.id, route.rideDirection, route.configVersion, route.geometryVersion]);
  // Backend active geometry is already ordered in travel direction; direction-
  // specific reversePolyline stays in Z→A order. Only legacy forward-only
  // geometry is reversed for a reverse ride (handled in mapRouteGeometry).
  const routePath = useMemo(
    () => decodeRoutePathForDisplay(route, null),
    [route],
  );
  const [repairedRoadPath, setRepairedRoadPath] = useState<LatLng[]>([]);
  const roadPath = useMemo(
    () => repairedRoadPath.length >= 2 ? repairedRoadPath :
      routeDisplayPath(route.polylineQuality === "HIGH_QUALITY" ? route.polyline : undefined, [], true),
    [repairedRoadPath, route.polyline, route.polylineQuality],
  );
  const onConfiguredGeometryReady = useCallback((path: LatLng[]) => {
    setRepairedRoadPath(path);
  }, []);
  const geometryUnavailable = !preview && [...buses.values()].some(bus =>
    bus.routeSource === "dynamic-reroute"
      ? !dynamicGeometries.has(bus.busId)
      : roadPath.length < 2,
  );
  const anyGeometryAvailable = [...buses.values()].some(bus => bus.routeSource === "dynamic-reroute"
    ? dynamicGeometries.has(bus.busId) : roadPath.length >= 2);
  const aggregateArrivals = !selectedBusKey && buses.size > 1;
  // A fleet has no single progress index. A selected/sole bus always follows
  // its current publication, including corrections and session replacement.
  const progressBus = !preview && buses.size === 1 ? buses.values().next().value : undefined;
  const activeBusStopIndex = publishedStopIndex(progressBus?.currentStopIndex, route.stops.length);

  // ── Passenger geolocation (read-only — ESP32 is sole source for bus GPS) ──
  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPassengerLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeolocationNotice(null);
      },
      (error) => {
        setGeolocationNotice(
          error.code === error.PERMISSION_DENIED
            ? "Allow location access to show your walking ETA."
            : "Your location is temporarily unavailable.",
        );
      },
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 10_000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const walkMinutesToTarget = useMemo(() => {
    if (!passengerLocation || selectedDestinationStopId !== targetStop.id) return undefined;
    const dist = getDistanceMeters(passengerLocation, targetStop);
    return Math.ceil(dist / WALKING_M_PER_MIN);
  }, [passengerLocation, selectedDestinationStopId, targetStop]);


  // ── RTDB subscription: filtered by routeId ───────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeLiveBusesByRoute(route.id, (snapshot) => {
        setLiveReadFailed(false);
        const allData = snapshot as Record<string, unknown> | null;
        const now = Date.now();
        const currentRoute = routeRef.current;

        if (!allData) {
          previousBusesRef.current = new Map();
          arrivalTimestampsRef.current = {};
          setStopETAs({});
          setBuses(new Map());
          return;
        }

        const activeBuses = new Map<string, IncomingBusData>();

        Object.entries(allData).forEach(([key, incoming]) => {
          const normalized = normalizePassengerMapBus(key, incoming, now);
          if (
            !normalized ||
            normalized.routeId !== currentRoute.id ||
            (selectedBusKey && passengerLiveBusSelectionKey(normalized) !== selectedBusKey) ||
            (!preview && !directionsMatch(normalized.direction, currentRoute.rideDirection))
          ) return;
          const nextBus: IncomingBusData = {
            ...normalized,
            ...(preview ? { direction: undefined, matchedLocation: undefined, mapMatchSeq: undefined, mapMatchSampledAt: undefined, routeSource: undefined } : {}),
            heading: normalizeHeading(normalized.heading),
          };

          const bus = reusePassengerMapBus(previousBusesRef.current.get(nextBus.busId), nextBus);
          activeBuses.set(bus.busId, bus);

        });
        previousBusesRef.current = activeBuses;
        if (activeBuses.size === 0) {
          arrivalTimestampsRef.current = {};
          setStopETAs({});
        }
        setBuses((previous) => previous.size === activeBuses.size &&
          [...activeBuses].every(([id, bus]) => previous.get(id) === bus)
          ? previous : activeBuses);
      }, (error) => {
        console.warn("[RTDB] activeBuses read failed:", error.message);
        setLiveReadFailed(true);
      });

    return () => {
      unsubscribe();
    };
  }, [route.id, route.rideDirection, route.configVersion, route.stops, resumeGeneration, preview, selectedBusKey]);

  // One clock publication; the calculation effect owns arrival labels.
  const updateUI = useCallback(() => {
    setUiNow(Date.now());
  }, []);

  useEffect(() => {
    if (preview || !route.stops || route.stops.length === 0 || buses.size === 0) {
      // No bus to compute arrivals for (route empty or bus gone): clear any
      // previous route's arrival timestamps so stale countdowns never outlive
      // the bus that produced them (#67).
      if (Object.keys(arrivalTimestampsRef.current).length > 0) {
        arrivalTimestampsRef.current = {};
        let cancelled = false;
        queueMicrotask(() => { if (!cancelled) setStopETAs({}); });
        return () => { cancelled = true; };
      }
      return;
    }

    const calculateETAs = () => {
      const now = Date.now();
      for (const id of etaMarkerSelections.current.keys()) {
        if (!buses.has(id)) {
          etaMarkerSelections.current.delete(id);
          etaSelectionInputs.current.delete(id);
          etaBusPositions.current.delete(id);
        }
      }
      const newArrivals: Record<string, number> = {};

      for (const bus of Array.from(buses.values())) {
        if (bus.deviceState !== "online" || isLiveBusSignalLost(liveBusFreshnessTimestamp(bus), now)) continue;
        const nextStopIndex = publishedStopIndex(bus.currentStopIndex, route.stops.length);
        if (nextStopIndex === undefined) continue;
        const remainingStops = route.stops.slice(nextStopIndex);
        if (remainingStops.length === 0) continue;
        // Each bus projects its position and stops along ITS OWN path so a
        // dynamic reroute on one bus never shifts another bus's ETA. Dynamic
        // geometry is fetched once per route version; until it resolves the
        // bus falls back to the shared configured path.
        if (bus.routeSource === "dynamic-reroute" && !dynamicGeometries.has(bus.busId)) continue;
        const busPath = busEtaPath(bus.busId, dynamicGeometries, roadPath);
        if (busPath.length < 2) continue;
        const previousSelection = etaMarkerSelections.current.get(bus.busId);
        const selection = etaSelectionInputs.current.get(bus.busId) === bus &&
          previousSelection && (previousSelection.pendingUntil === undefined || now < previousSelection.pendingUntil)
          ? previousSelection
          : selectLiveBusMarkerPosition(bus, previousSelection, now);
        etaMarkerSelections.current.set(bus.busId, selection);
        etaSelectionInputs.current.set(bus.busId, bus);
        const busPoint = selection.position ?? { lat: bus.lat, lng: bus.lng };
        const geometryKey = bus.routeSource === "dynamic-reroute"
          ? ["dynamic", bus.busId, bus.routeVersion]
          : ["configured", route.id, route.geometryVersion];
        const projectionKey = JSON.stringify([...geometryKey, route.rideDirection, route.configVersion]);
        const stopPositions = stopProjectionCache.current.positions(
          projectionKey, busPath, route.stops,
          bus.routeSource === "dynamic-reroute" ? dynamicGeometries.get(bus.busId)?.firstStopIndex ?? 0 : 0,
        );
        const cachedPosition = etaBusPositions.current.get(bus.busId);
        // The same coordinate/heading can belong to another loop visit.
        // Reuse only the same session, authoritative leg and itinerary revision.
        const busPathPosition = cachedPosition?.path === busPath &&
          cachedPosition.point.lat === busPoint.lat && cachedPosition.point.lng === busPoint.lng &&
          cachedPosition.heading === bus.heading && cachedPosition.routeVersion === bus.routeVersion &&
          cachedPosition.direction === bus.routeDirection && cachedPosition.sessionId === bus.sessionId &&
          cachedPosition.nextStopIndex === nextStopIndex && cachedPosition.stopPositions === stopPositions
          ? cachedPosition.position
          : stopProjectionCache.current.busPosition(projectionKey, busPoint, bus.heading, nextStopIndex);
        etaBusPositions.current.set(bus.busId, {
          path: busPath, point: busPoint, heading: bus.heading,
          routeVersion: bus.routeVersion, direction: bus.routeDirection, position: busPathPosition,
          sessionId: bus.sessionId, nextStopIndex, stopPositions,
        });
        const arrivals = busStopArrivalTimestamps({
          busPoint,
          heading: bus.heading,
          speedKmh: bus.speed,
          delayMinutes: bus.delayMinutes ?? 0,
          path: busPath,
          remainingStops,
          now,
          stopPositions,
          busPathPosition,
        });
        for (const [stopId, arrivalTimestamp] of Object.entries(arrivals)) {
          if (
            !newArrivals[stopId] ||
            arrivalTimestamp < newArrivals[stopId]
          ) {
            newArrivals[stopId] = arrivalTimestamp;
          }
        }
      }

      arrivalTimestampsRef.current = newArrivals;
      // Publish arrival labels without advancing the clock from this effect.
      // The independent timer advances uiNow; feeding it back here loops.
      setStopETAs(Object.fromEntries(Object.entries(newArrivals).map(([id, time]) =>
        [id, Math.max(0, Math.ceil((time - now) / 60_000))],
      )));
    };

    calculateETAs();
  }, [
    buses,
    uiNow,
    preview,
    route.id,
    route.rideDirection,
    route.configVersion,
    route.geometryVersion,
    route.stops,
    roadPath,
    dynamicGeometries,
  ]);

  // ── ETA Smooth Interpolation ───────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(updateUI, 15_000);
    return () => clearInterval(interval);
  }, [updateUI]);

  // The UI timer triggers renders during silence. Evaluate against the actual
  // clock on every render: a new fix can be newer than the last timer tick.
  const signalLostBuses = [...buses.values()].filter(bus =>
    bus.deviceState === "offline" || isLiveBusSignalLost(liveBusFreshnessTimestamp(bus)),
  );
  const signalLostLastSeen = signalLostBuses.length
    ? Math.min(...signalLostBuses.map(bus => liveBusFreshnessTimestamp(bus) ?? bus.timestamp)) : null;
  const signalLostMinutes = signalLostLastSeen
    ? Math.max(0, Math.round((uiNow - signalLostLastSeen) / 60_000))
    : null;
  const rerouteNotice = useMemo(() => {
    return passengerRerouteNotice([...buses.values()].map((bus) => bus.routeState));
  }, [buses]);

  const mapCenter = useMemo(() => ({ lat: targetStop.lat, lng: targetStop.lng }), [targetStop.lat, targetStop.lng]);
  const firstBus = useMemo(() => Array.from(buses.values())[0], [buses]);
  const firstBusMarker = useLiveBusMarkerPosition(firstBus);
  const estimatesUnavailable = liveReadFailed ? "Updates unavailable"
    : signalLostBuses.length === buses.size && buses.size > 0 ? "Signal delayed"
    : preview ? (firstBus?.sessionId ? "Direction pending" : "Service not started")
    : buses.size === 0 ? "Waiting for bus"
    : progressBus && activeBusStopIndex === undefined ? "Stop progress unavailable"
    : !anyGeometryAvailable ? "Route unavailable" : undefined;
  const estimateContext = stopEstimateContext(route, selectedBusKey, buses.size === 1 ? firstBus?.routeVersion : undefined);
  useEffect(() => {
    onStopEstimatesChange?.({ context: estimateContext, minutes: estimatesUnavailable ? {} : stopETAs,
      nextStopIndex: activeBusStopIndex, unavailable: estimatesUnavailable });
  }, [onStopEstimatesChange, estimateContext, estimatesUnavailable, stopETAs, activeBusStopIndex]);
  const centerTarget = useMemo(() => {
    return firstBusMarker.position ?? mapCenter;
  }, [firstBusMarker.position, mapCenter]);

  return (
    <>
      {liveReadFailed && (
        <div className="absolute left-4 right-20 z-50 rounded-xl px-4 py-2.5 text-[12px] font-semibold"
          style={{ top: topInset + 16, background: "var(--status-warning-bg)", color: "var(--status-warning)" }} role="alert">
          Live bus updates are unavailable. Check your connection and reload to retry.
        </div>
      )}
      {preview && buses.size === 0 && (
        <div className="absolute left-4 right-4 z-40 rounded-xl bg-zinc-950/90 p-3 text-sm" style={{ top: topInset + 72 }} role="status">
          Waiting for a valid GPS fix. The configured route remains available.
        </div>
      )}
      {/* Telemetry silence does not identify a receiver or network failure. */}
      {!liveReadFailed && signalLostBuses.length > 0 && (
        <div className="absolute left-4 right-20 z-50 animate-slide-down" style={{ top: topInset + 16 }} role="status" aria-live="polite">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-semibold"
            style={{ 
              background: "var(--status-warning-bg)", 
              border: "1px solid rgba(251, 191, 36, 0.2)",
              color: "var(--status-warning)" 
            }}>
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>
              Live location updates delayed
              {signalLostMinutes !== null && signalLostMinutes > 0
                ? ` · last update ${signalLostMinutes}m ago`
                : " · waiting for a fresh update…"}
            </span>
          </div>
        </div>
      )}
      {!liveReadFailed && rerouteNotice && signalLostBuses.length === 0 && (
        <div className="absolute left-4 right-20 z-50" style={{ top: topInset + 16 }} role="status">
          <div
            className="flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-[12px] font-semibold"
            style={{
              background: "var(--status-warning-bg)",
              border: "1px solid rgba(251, 191, 36, 0.2)",
              color: "var(--status-warning)",
            }}
          >
            <Navigation className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{rerouteNotice}</span>
          </div>
        </div>
      )}
      {!liveReadFailed && geolocationNotice && signalLostBuses.length === 0 && !rerouteNotice && (
        <div className="absolute left-4 right-20 z-50" style={{ top: topInset + 16 }} role="status">
          <div
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] font-semibold"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
          >
            <Navigation className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{geolocationNotice}</span>
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-0" style={{ background: "var(--surface-0)" }} onPointerDown={() => setIsCentered(false)} onTouchStart={() => setIsCentered(false)}>
        <GoogleMap
          mapId={MAPS_MAP_ID}
          defaultCenter={centerTarget}
          defaultZoom={15}
          style={{ width: "100%", height: "100%" }}
          {...MAP_OPTIONS}
        >
          <MapCenterer target={centerTarget} isCentered={isCentered}
            topInset={topInset}
            previewPoints={preview && !focusBus ? (routePath.length ? routePath : routeStops) : undefined}
            hasBus={Boolean(firstBusMarker.position)} />
          <DirectionsRoute
            key={`${route.id}:${route.rideDirection}:configured`}
            routeId={route.id}
            stops={routeStops}
            polyline={route.polyline}
            polylineQuality={route.polylineQuality}
            color={route.color || "#3b82f6"}
            hasBuses={buses.size > 0}
            direction={route.rideDirection}
            nextStopIndices={preview ? undefined : [...buses.values()].filter(bus => bus.routeSource !== "dynamic-reroute").flatMap(bus => {
              const index = publishedStopIndex(bus.currentStopIndex, route.stops.length);
              return index === undefined ? [] : [index];
            })}
            progressDistanceM={!preview && buses.size === 1 && firstBus && firstBus.routeSource !== "dynamic-reroute" &&
              firstBusMarker.decision === "matched" && !firstBusMarker.uncertain &&
              (firstBus.matchedLocation?.matchConfidence ?? 0) >= 0.7 && firstBus.routeGeometryVersion === route.geometryVersion &&
              !isLiveBusSignalLost(liveBusFreshnessTimestamp(firstBus))
              ? firstBus?.matchedLocation?.alongRouteDistanceM : undefined}
            completedStopIndex={progressBus?.routeSource === "dynamic-reroute" ? activeBusStopIndex : undefined}
            onGeometryReady={onConfiguredGeometryReady}
          />

          {[...dynamicGeometries.entries()].map(([busId, geometry]) => {
            const bus = buses.get(busId);
            if (!bus || preview) return null;
            const index = publishedStopIndex(bus.currentStopIndex, route.stops.length);
            return <DirectionsRoute
              key={`${busId}:${buses.get(busId)?.routeVersion}`}
              stops={routeStops}
              polyline={geometry.polyline}
              polylineQuality="HIGH_QUALITY"
              color={route.color || "#3b82f6"}
              hasBuses
              nextStopIndices={index === undefined ? [] : [index]}
              firstStopIndex={geometry.firstStopIndex ?? -1}
              progressDistanceM={buses.size === 1 && firstBusMarker.decision === "matched" && !firstBusMarker.uncertain &&
                (bus.matchedLocation?.matchConfidence ?? 0) >= 0.7 &&
                !isLiveBusSignalLost(liveBusFreshnessTimestamp(bus)) ? bus.matchedLocation?.alongRouteDistanceM : undefined}
              direction={route.rideDirection}
            />;
          })}

          {/* Bus markers */}
          {Array.from(buses.values()).map(bus => (
            <BusMarker key={bus.busId} bus={bus} signalLost={bus.deviceState !== "online" || isLiveBusSignalLost(liveBusFreshnessTimestamp(bus))} />
          ))}

          {/* Stop markers */}
          {route.stops?.map((stop, i) => {
            const isTarget = stop.id === selectedDestinationStopId;
            const isPast = activeBusStopIndex !== undefined && i < activeBusStopIndex;
            const dotColor = isPast ? "#71717a" : "var(--accent)";
            
            // Native halo text style (White text, thick black halo)
            const labelStyle: React.CSSProperties = {
              marginTop: 4,
              color: "#ffffff",
              fontSize: isTarget ? 11 : 9.5,
              fontWeight: 800,
              whiteSpace: "nowrap",
              textShadow: "2px 0 #000, -2px 0 #000, 0 2px #000, 0 -2px #000, 1px 1px #000, -1px -1px #000, 1px -1px #000, -1px 1px #000, 0 4px 8px rgba(0,0,0,0.8)",
              zIndex: 50
            };

            return (
              <AdvancedMarker key={`stop-${stop.id || i}`} position={{ lat: stop.lat, lng: stop.lng }}>
                {isPast ? (
                  <div title={`${stop.name} — passed`} aria-label={`${stop.name} — passed`} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, background: dotColor, opacity: 0.6, borderRadius: "50%" }}>
                    <span style={{ color: "#ffffff", fontWeight: 800, fontSize: 7 }}>{stopLabel(i)}</span>
                  </div>
                ) : isTarget ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ position: "absolute", top: 2, width: 26, height: 26, background: dotColor, borderRadius: "50%", animation: "ripple 2s infinite" }} />
                    <div style={{ width: 26, height: 26, background: dotColor, border: `3.5px solid #000000`, borderRadius: "50%", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.5)" }}>
                      <span style={{ color: "#ffffff", fontWeight: 900, fontSize: 12 }}>{stopLabel(i)}</span>
                    </div>
                    <span style={labelStyle}>
                      {stop.shortName}
                    </span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ width: 20, height: 20, background: dotColor, border: `3px solid #000000`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 4px rgba(0,0,0,0.4)" }}>
                      <span style={{ color: "#ffffff", fontWeight: 800, fontSize: 9 }}>{stopLabel(i)}</span>
                    </div>
                    <span style={labelStyle}>
                      {stop.shortName}
                    </span>
                  </div>
                )}
              </AdvancedMarker>
            );
          })}
        </GoogleMap>
      </div>

      <style>{`
        @keyframes ripple {
          0% { transform: scale(1); opacity: 0.6; }
          70% { transform: scale(3.5); opacity: 0; }
          100% { transform: scale(3.5); opacity: 0; }
        }
      `}</style>

      <div className="absolute right-4 z-40" style={{ top: topInset + 16 }}>
        <button
          onClick={() => { setFocusBus(true); setIsCentered(true); }}
          className="flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 border active:scale-95 shadow-lg"
          style={{
            background: isCentered ? "rgba(59, 130, 246, 0.15)" : "var(--surface-2)",
            borderColor: isCentered ? "rgba(59, 130, 246, 0.3)" : "var(--border-default)",
            color: isCentered ? "#60A5FA" : "var(--text-secondary)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
          aria-label="Center on bus"
        >
          <Navigation className="w-5 h-5" fill={isCentered ? "currentColor" : "none"} />
        </button>
      </div>

      <RouteTimelineSheet
        route={route}
        preview={preview}
        targetStopId={selectedDestinationStopId ?? ""}
        activeBusId={null}
        stopETAs={estimatesUnavailable ? {} : stopETAs}
        walkMinutesToTarget={walkMinutesToTarget}
        currentStopIndex={activeBusStopIndex}
        aggregateArrivals={aggregateArrivals}
        geometryUnavailable={geometryUnavailable}
      />
    </>
  );
}

export default function PassengerMap(props: PassengerMapProps) {
  if (!props.route) {
    return <div style={{ position: "relative", width: "100%", height: "100%", background: "var(--surface-0)" }} />;
  }
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <PassengerMapInner
        topInset={props.topInset}
        key={`${props.route.id}:${props.route.rideDirection}:${props.preview ? "preview" : "ride"}:${props.selectedBusKey ?? "all"}`}
        targetStop={props.targetStop}
        route={props.route}
        resumeGeneration={props.resumeGeneration}
        preview={props.preview}
        selectedBusKey={props.selectedBusKey}
        selectedDestinationStopId={props.selectedDestinationStopId}
        onStopEstimatesChange={props.onStopEstimatesChange}
      />
    </div>
  );
}
