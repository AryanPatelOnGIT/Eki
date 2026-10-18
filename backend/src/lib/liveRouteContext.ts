const LIVE_ROUTE_CONTEXT_FIELDS = [
  "activeRouteId",
  "activeRoutePolyline",
  "routeVersion",
  "routeSource",
  "routeDirection",
  "routeSessionId",
  "routeGeometryVersion",
  "routeState",
  "routeMatchHistory",
  "routeMatchAnchor",
  "departureRoute",
  "routeComputedAt",
  "routeTrafficState",
  "offRouteSampleCount",
  "mapMatchUpdatedAt",
  "mapMatchSeq",
  "mapMatchSampledAt",
  "matchConfidence",
  "distanceToActiveRoute",
  "matchedLocation",
  "rerouteRequestId",
  "lastRerouteAttemptAt",
  "rerouteError",
  "rerouteCompletedAt",
  "rerouteFailedAt",
  "rerouteRetry",
] as const;

/** True when any direction-derived matching or rerouting state is present. */
export function hasLiveRouteContext(
  live: Record<string, unknown> | null,
  options: { ignoreVersion?: boolean } = {},
): boolean {
  return Boolean(
    live && LIVE_ROUTE_CONTEXT_FIELDS.some((field) =>
      !(options.ignoreVersion && field === "routeVersion") && Object.prototype.hasOwnProperty.call(live, field)
    ),
  );
}

/**
 * Preserve physical telemetry and lifecycle data while removing every route
 * match/reroute field owned by the previous ride session. Direction resets
 * inside the same session may retain its monotonic revision counter.
 */
export function withoutLiveRouteContext(
  live: Record<string, unknown> | null,
  options: { preserveVersion?: boolean } = {},
): Record<string, unknown> {
  const next = { ...(live ?? {}) };
  for (const field of LIVE_ROUTE_CONTEXT_FIELDS) delete next[field];
  if (options.preserveVersion && typeof live?.routeVersion === "number" &&
      Number.isSafeInteger(live.routeVersion) && live.routeVersion > 0) {
    next.routeVersion = live.routeVersion;
  }
  return next;
}
