import type { ReactNode } from "react";

const map = { panTo() {}, setZoom() {}, fitBounds() {} };
export function useMap() { return map; }
export function Map({ children }: { children: ReactNode }) {
  return <div aria-label="Synthetic map adapter" style={{ position: "absolute", inset: 0, background: "#17212a" }}>
    <div id="road-overlays" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />{children}
  </div>;
}
export function AdvancedMarker({ children, position, zIndex = 30 }: { children: ReactNode; position: { lat: number; lng: number }; zIndex?: number }) {
  return <div data-position-marker="true" style={{ position: "absolute", left: `${15 + (position.lng - 72) * 20000}%`,
    top: `${80 - (position.lat - 23) * 15000}%`, transform: "translate(-50%, -50%)", zIndex }}>{children}</div>;
}
class ObservedPolyline {
  private element: SVGSVGElement;
  constructor(options: { path: Array<{ lat: number; lng: number }>; strokeColor: string; strokeWeight: number; zIndex: number }) {
    this.element = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.element.setAttribute("viewBox", "0 0 100 100");
    this.element.setAttribute("preserveAspectRatio", "none");
    this.element.dataset.roadColor = options.strokeColor;
    Object.assign(this.element.style, { position: "absolute", inset: "0", width: "100%", height: "100%", zIndex: options.zIndex });
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", options.path.map(point => `${15 + (point.lng - 72) * 20000},${80 - (point.lat - 23) * 15000}`).join(" "));
    line.setAttribute("stroke", options.strokeColor); line.setAttribute("fill", "none"); line.setAttribute("stroke-width", String(options.strokeWeight / 6));
    this.element.append(line); document.getElementById("road-overlays")?.append(this.element);
  }
  setMap(value: unknown) { if (value === null) this.element.remove(); }
}
// This observes actual production renderer calls; it does not load the Google SDK.
Object.assign(globalThis, { google: { maps: { Polyline: ObservedPolyline } } });
