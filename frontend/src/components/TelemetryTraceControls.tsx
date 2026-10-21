"use client";

import { useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import { telemetryTraceEnabled } from "@/lib/telemetryTrace";

const subscribe = () => () => {};
const serverSnapshot = () => false;

/** Export only this tab's opt-in trace; protected health diagnostics stay separate. */
export default function TelemetryTraceControls() {
  const { user } = useAuth();
  const enabled = useSyncExternalStore(subscribe, telemetryTraceEnabled, serverSnapshot);
  if (!enabled || !user?.role) return null;
  return (
    <button type="button"
      className="fixed bottom-24 left-3 z-[250] rounded-lg border border-white/20 bg-zinc-950 px-3 py-2 text-xs text-white shadow-lg"
      onClick={() => window.__ekiTelemetryTrace?.download()}>
      Download telemetry trace
    </button>
  );
}
