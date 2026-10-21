"use client";

import { useEffect, useRef } from "react";
import type { ActiveBusEntry } from "@/lib/activeBusEntries";
import type { LatLng } from "@/lib/polyline";
import { markerTargetIsCurrent, type LiveBusMarkerSelection } from "@/lib/liveBusMarkerPosition";
import { getDistanceMeters } from "@/lib/mapUtils";
import {
  recordTelemetryRender,
  telemetryTraceEnabled,
} from "@/lib/telemetryTrace";

export function useTelemetryRenderTrace(
  entry: ActiveBusEntry,
  consumer: "admin" | "passenger",
  markerVisible: boolean,
  marker?: { position: LatLng | null; selection: LiveBusMarkerSelection },
): void {
  const traceEnabled = telemetryTraceEnabled();
  const rawSequence = entry.rawLocation?.seq;
  const matchedSequence = entry.matchedLocation?.seq;
  const matchedIsCurrent =
    rawSequence !== undefined &&
    matchedSequence === rawSequence &&
    entry.matchedLocation?.sampledAt === entry.timestamp &&
    entry.matchedLocation?.routeVersion === entry.routeVersion;
  const displayKind = !markerVisible
    ? "none" as const
    : marker
      ? !markerTargetIsCurrent(entry, marker.selection)
        ? "held" as const
        : marker.selection.decision === "matched" ? "matched" as const : "raw" as const
    : matchedIsCurrent
      ? "matched" as const
      : "raw" as const;
  const traceKey = [
    entry.busId, entry.routeId, entry.sessionId,
    marker?.selection.contextKey ?? "",
    rawSequence ?? "none",
    matchedSequence ?? "none",
    entry.timestamp ?? "none",
    entry.routeVersion ?? "none",
    displayKind,
  ].join(":");
  const lastTraceKey = useRef<string | null>(null);
  const lastSettledKey = useRef<string | null>(null);
  const target = marker?.selection.position;
  const position = marker?.position;
  const settled = traceEnabled && displayKind !== "held" && displayKind !== "none" &&
    target != null && position != null && getDistanceMeters(target, position) <= 0.05;

  useEffect(() => {
    if (!traceEnabled) return;
    if (lastTraceKey.current === traceKey) return;
    const frame = requestAnimationFrame(() => {
      lastTraceKey.current = traceKey;
      recordTelemetryRender(entry, consumer, displayKind);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    consumer,
    displayKind,
    entry,
    matchedSequence,
    rawSequence,
    traceKey,
    traceEnabled,
  ]);

  useEffect(() => {
    if (!traceEnabled || !settled || lastSettledKey.current === traceKey) return;
    const frame = requestAnimationFrame(() => {
      lastSettledKey.current = traceKey;
      recordTelemetryRender(entry, consumer, displayKind, "browser_marker_settled");
    });
    return () => cancelAnimationFrame(frame);
  }, [consumer, displayKind, entry, settled, traceEnabled, traceKey]);
}
