import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useLiveBusMarkerPosition } from "@/hooks/useLiveBusMarkerPosition";
import { useSmoothPosition } from "@/hooks/useSmoothPosition";
import { useTelemetryRenderTrace } from "@/hooks/useTelemetryRenderTrace";
import { recordTelemetryListenerDelivery, setTelemetryServerTimeOffset } from "@/lib/telemetryTrace";
import type { ActiveBusEntry } from "@/lib/activeBusEntries";
import { percentileSummary } from "../../scripts/percentile-summary.mjs";
const profiles = ["matched", "delayed", "stalled", "burst", "disconnect", "context"];
type Row = { profile: string; duration: number; listeners: number; arrivals: number; networkP95: number | null; arrivalP50: number | null; arrivalP95: number | null; held: number; rafP95: number | null };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
// Explicit fixture-only override; actual app and OS accessibility settings stay intact.
const nativeMatchMedia = window.matchMedia.bind(window);
const systemReducedMotion = nativeMatchMedia("(prefers-reduced-motion: reduce)").matches;
let simulateStandardMotion = false;
window.matchMedia = query => {
  const result = nativeMatchMedia(query);
  if (!simulateStandardMotion || query !== "(prefers-reduced-motion: reduce)") return result;
  return new Proxy(result, { get(target, key) { if (key === "matches") return false; const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value; } });
};
function Marker({ entry, duration }: { entry: ActiveBusEntry; duration: number }) {
  const selection = useLiveBusMarkerPosition(entry), position = useSmoothPosition(selection.position, duration);
  useTelemetryRenderTrace(entry, "passenger", !!position, { position, selection });
  return <><p>Sample {entry.rawLocation?.seq}: {selection.decision} ({selection.reason})</p><svg viewBox="0 0 700 160" role="img" aria-label="Synthetic moving bus marker"><path d="M30 130 L650 30" stroke="#cbd5e1" strokeWidth="8"/><circle cx={position ? 30 + (position.lat - 23) * 600000 : 30} cy={position ? 130 - (position.lng - 72) * 120000 : 130} r="10" fill="#2563eb"/></svg></>;
}
function App() {
  const [entry, setEntry] = useState<ActiveBusEntry | null>(null), [duration, setDuration] = useState(250), [rows, setRows] = useState<Row[]>([]), [status, setStatus] = useState("Ready"), [running, setRunning] = useState(false);
  const [standardAnimation, setStandardAnimation] = useState(false);
  const mounted = useRef(true), source = useRef<EventSource | null>(null);
  useEffect(() => () => { mounted.current = false; source.current?.close(); }, []);
  async function run() {
    simulateStandardMotion = standardAnimation;
    setRunning(true); setRows([]); const captures: unknown[] = []; let monitor = 0;
    try {
      for (const animation of [250, 120]) for (const profile of profiles) {
        if (!mounted.current) return;
        setEntry(null); setDuration(animation); await pause(100);
        setTelemetryServerTimeOffset(0); window.__ekiTelemetryTrace!.clear(); window.__ekiTelemetryTrace!.setScenario(`${profile}-${animation}`);
        setStatus(`Running ${profile}, ${animation} ms animation`); const network: number[] = [];
        const visibilityAtStart = document.visibilityState, frameGaps: number[] = []; let lastFrame = performance.now();
        const observeFrames = (at: number) => { frameGaps.push(at - lastFrame); lastFrame = at; monitor = requestAnimationFrame(observeFrames); };
        monitor = requestAnimationFrame(observeFrames);
        await new Promise<void>((resolve, reject) => {
          const stream = new EventSource(`/events?profile=${profile}`); source.current = stream;
          const timeout = setTimeout(() => { stream.close(); reject(new Error("Stream timeout")); }, 23000);
          stream.onerror = () => { clearTimeout(timeout); stream.close(); reject(new Error("Stream disconnected unexpectedly")); };
          stream.onmessage = event => {
            const value = JSON.parse(event.data);
            if (value.done) { clearTimeout(timeout); stream.close(); source.current = null; resolve(); return; }
            network.push(Math.max(0, Date.now() - value.serverSentAtMs));
            recordTelemetryListenerDelivery("synthetic-bus_synthetic-route", value.entry); setEntry(value.entry);
          };
        });
        await pause(2300); cancelAnimationFrame(monitor); const trace = window.__ekiTelemetryTrace!.snapshot();
        const listener = new Map<number, number>(); const arrivals: number[] = [];
        for (const record of trace.records) {
          const seq = record.seq as number, at = record.browserMonotonicAtMs as number;
          if (record.event === "browser_listener" && !listener.has(seq)) listener.set(seq, at);
          if (record.event === "browser_marker_settled" && listener.has(seq)) arrivals.push(at - listener.get(seq)!);
        }
        const summary = percentileSummary(arrivals); const row = { profile, duration: animation, listeners: listener.size, arrivals: arrivals.length, networkP95: percentileSummary(network).p95, arrivalP50: summary.p50, arrivalP95: summary.p95, held: trace.records.filter(record => record.event === "browser_render" && record.displayKind === "held").length, rafP95: percentileSummary(frameGaps).p95 };
        setRows(previous => [...previous, row]); captures.push({ row, visibilityAtStart, visibilityAtEnd: document.visibilityState, frameGapMs: percentileSummary(frameGaps), loopbackDeliveryMs: network, trace });
      }
      const response = await fetch("/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "synthetic-moving-marker", capturedAt: new Date().toISOString(), userAgent: navigator.userAgent, systemReducedMotion, simulatedStandardMotion: standardAnimation, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, captures }) });
      if (!response.ok) throw new Error("Save failed"); const saved = await response.json(); setStatus(`Complete. Saved ${saved.filename}`);
    } catch (error) { setStatus(`Failed: ${error instanceof Error ? error.message : "unknown"}`); }
    finally { cancelAnimationFrame(monitor); source.current?.close(); setRunning(false); }
  }
  return <main><h1>Moving-marker latency simulation</h1><p>Loopback synthetic data · real selection, animation and trace hooks · stationary board unaffected</p><p>Arrival means within 5 cm of the current target. This measures browser state, not Google Maps compositor paint or physical GPS latency.</p><p>System reduced-motion preference: {systemReducedMotion ? "enabled" : "disabled"}. Animation durations are ignored while reduced motion is active.</p><label><input type="checkbox" checked={standardAnimation} disabled={running} onChange={event => setStandardAnimation(event.target.checked)}/> Use standard animation in this simulation</label><br/><br/><button disabled={running} onClick={run}>Run all 12 scenarios</button><p role="status">{status}</p>{entry && <Marker key={`${duration}-${rows.length}`} entry={entry} duration={duration}/>}<table><caption>Milliseconds; held and superseded samples are not arrivals. RAF p95 reveals throttling or load.</caption><thead><tr>{["Profile", "Animation", "Samples", "Arrivals", "Loopback p95", "Arrival p50", "Arrival p95", "Held", "RAF p95"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={`${row.profile}-${row.duration}`}>{Object.values(row).map((value, index) => <td key={index}>{typeof value === "number" ? value.toFixed(1) : value ?? "—"}</td>)}</tr>)}</tbody></table></main>;
}
document.head.insertAdjacentHTML("beforeend", "<style>body{font:16px system-ui;background:#f8fafc;color:#172554;margin:40px}main{max-width:1050px;margin:auto}button{padding:14px;border:0;border-radius:8px;background:#2563eb;color:white}button:disabled{opacity:.5}svg{width:100%;height:140px;background:white;border-radius:12px}table{width:100%;border-collapse:collapse;background:white}th,td{text-align:left;padding:10px;border-bottom:1px solid #e2e8f0}caption{text-align:left;padding:10px}</style>");
createRoot(document.getElementById("root")!).render(<App/>);
