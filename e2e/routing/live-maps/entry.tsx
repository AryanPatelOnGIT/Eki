import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { useApiIsLoaded, useMapsLibrary } from "@vis.gl/react-google-maps";
import MapProviders from "@/components/MapProviders";
import PassengerMap from "@/components/maps/PassengerMap";
import DashboardPanel from "@/components/admin/DashboardPanel";
import { routeInRideDirection } from "@/lib/rideDirection";
import { route, publish, paths, useSimulation } from "./store";
import "./style.css";

// Observe the real SDK objects created by the unchanged application components.
// No Maps API, map, polyline, marker, selector or animation is mocked.
function MapsReady({ children }: { children: ReactNode }) {
  const loaded = useApiIsLoaded(), maps = useMapsLibrary("maps"), marker = useMapsLibrary("marker");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!loaded || !maps || !marker) return;
    const lines: google.maps.Polyline[] = [], markers: google.maps.marker.AdvancedMarkerElement[] = [];
    const loadedMaps = new Map<google.maps.Map, { tilesLoaded: boolean }>();
    const OriginalLine = google.maps.Polyline, OriginalMarker = google.maps.marker.AdvancedMarkerElement;
    google.maps.Polyline = class extends OriginalLine { constructor(options?: google.maps.PolylineOptions) {
      super(options); lines.push(this);
      const map = options?.map;
      if (map instanceof google.maps.Map && !loadedMaps.has(map)) {
        const state = { tilesLoaded: false }; loadedMaps.set(map, state);
        google.maps.event.addListenerOnce(map, "tilesloaded", () => { state.tilesLoaded = true; });
      }
    } };
    // importLibrary returns a frozen exports object. Observe the real marker's
    // public position setter rather than replacing that module's constructor.
    const positionDescriptor = Object.getOwnPropertyDescriptor(OriginalMarker.prototype, "position")!;
    Object.defineProperty(OriginalMarker.prototype, "position", { ...positionDescriptor,
      set(this: google.maps.marker.AdvancedMarkerElement, value: unknown) {
        if (!markers.includes(this)) markers.push(this);
        positionDescriptor.set!.call(this, value);
      },
    });
    (window as any).__ekiInAppMaps = { snapshot: () => ({
      sdkLoaded: true, observedMarkerCount: markers.length,
      maps: [...loadedMaps].filter(([map]) => document.contains(map.getDiv())).map(([map, state]) => ({
        view: map.getDiv().closest("section")?.getAttribute("aria-label"), tilesLoaded: state.tilesLoaded,
        renderingType: map.getRenderingType(),
      })),
      lines: lines.filter(line => line.getMap()).map(line => ({ view: (line.getMap() as google.maps.Map).getDiv().closest("section")?.getAttribute("aria-label"), color: line.get("strokeColor"), path: line.getPath().getArray().map(point => point.toJSON()) })),
      markers: markers.filter(item => item.map).map(item => ({
        position: item.position ? { lat: typeof item.position.lat === "function" ? item.position.lat() : item.position.lat,
          lng: typeof item.position.lng === "function" ? item.position.lng() : item.position.lng } : null,
        view: (item.map as google.maps.Map).getDiv().closest("section")?.getAttribute("aria-label"),
        title: (item.content as HTMLElement | null)?.querySelector("[title]")?.getAttribute("title") ?? (item.content as HTMLElement | null)?.getAttribute("title") ?? "",
      })),
    }) };
    setReady(true);
    return () => { google.maps.Polyline = OriginalLine; Object.defineProperty(OriginalMarker.prototype, "position", positionDescriptor); };
  }, [loaded, maps, marker]);
  return ready ? children : <p role="status">Loading the real Google Maps JavaScript API…</p>;
}
function App() {
  const state = useSimulation(), directed = routeInRideDirection(route, state.direction);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => publish(state.direction, Math.min(state.index + 1, paths[state.direction].length - 1)), 1000);
    return () => clearInterval(timer);
  }, [playing, state.direction, state.index]);
  return <><header className="replay-toolbar"><h1>Eki · in-app Google Maps replay</h1>
    <p>Real passenger and Live Ops components + Google Maps SDK. Only bus/store inputs are simulated.</p>
    <nav><button onClick={() => { setPlaying(false); publish("forward", 20); }}>A → B</button>
      <button onClick={() => { setPlaying(false); publish("reverse", 20); }}>B → A</button>
      <button onClick={() => setPlaying(value => !value)}>{playing ? "Pause replay" : "Play simulated GNSS"}</button>
      <button onClick={() => publish(state.direction, Math.min(state.index + 1, paths[state.direction].length - 1))}>Next fix</button>
      <button onClick={() => { setPlaying(false); publish(state.direction, state.index, false); }}>Low-confidence fix</button>
      <button onClick={() => publish(state.direction, Math.min(state.index + 10, paths[state.direction].length - 1), true, 1)}>Delayed old revision</button></nav>
    <output data-testid="simulation-state">{state.direction} · fix {state.bus.seq} · route v{state.bus.routeVersion}</output>
  </header><MapProviders><MapsReady><main className="replay-grid">
    <section aria-label="Eki passenger map"><h2>PassengerMap</h2><div className="replay-pane">
      <MapProviders><PassengerMap route={directed} targetStop={directed.stops.at(-1)!} selectedBusKey={`session:simulated-${state.direction}`} /></MapProviders>
    </div></section>
    <section aria-label="Eki admin map"><h2>DashboardPanel · Live Ops</h2><div className="replay-pane"><MapProviders><DashboardPanel /></MapProviders></div></section>
  </main></MapsReady></MapProviders></>;
}
createRoot(document.getElementById("root")!).render(<App />);
