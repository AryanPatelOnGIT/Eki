import type { ReactNode } from "react";

// Render the actual passenger map/controller/timeline without a Google API
// key. This is a synthetic SDK boundary, not a Google Maps acceptance test.
export function APIProvider({ children }: { children: ReactNode }) { return children; }
export function useMap() { return null; }
export function Map({ children }: { children: ReactNode }) {
  return <div aria-label="Synthetic map" style={{ position: "absolute", inset: 0, background: "#111c25" }}>
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
      <defs><pattern id="qa-grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#263643" /></pattern></defs>
      <rect width="100%" height="100%" fill="url(#qa-grid)" />
    </svg>
    <p style={{ position: "absolute", bottom: 155, left: 20, fontSize: 12 }}>Synthetic SDK adapter · actual map logic</p>
    {children}
  </div>;
}
function point(position: { lat: number; lng: number }) {
  return { left: `${20 + (position.lng - 72) * 5000}%`, top: `${70 - (position.lat - 23) * 3500}%` };
}
export function AdvancedMarker({ children, position, onClick }: {
  children: ReactNode; position: { lat: number; lng: number }; onClick?: () => void;
}) {
  return <div onClick={onClick} style={{ position: "absolute", ...point(position), transform: "translate(-50%, -50%)" }}>{children}</div>;
}
export default function DirectionsRoute({ stops, color = "#3b82f6" }: { stops: Array<{lat: number; lng: number}>; color?: string }) {
  const points = stops.map(stop => `${20 + (stop.lng - 72) * 5000},${70 - (stop.lat - 23) * 3500}`).join(" ");
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-label="Configured route path">
    <polyline points={points} stroke={color} strokeWidth="0.6" fill="none" />
  </svg>;
}
