import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { defineConfig } from "vite";
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  root: local("."), server: { host: "127.0.0.1", port: 3150, strictPort: true },
  resolve: { alias: { "@": local("../../frontend/src") } },
  define: { "process.env": "{}" }, oxc: { jsx: { runtime: "automatic" } },
  plugins: [{ name: "loopback-motion", configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1:3150");
      if (url.pathname === "/capture" && req.method === "POST") {
        if (req.headers.origin !== "http://127.0.0.1:3150") { res.statusCode = 403; res.end(); return; }
        let body = "";
        for await (const chunk of req) { body += chunk; if (body.length > 2_000_000) { res.statusCode = 413; res.end(); return; } }
        try {
          const value = JSON.parse(body);
          if (value.kind !== "synthetic-moving-marker") throw new Error("Wrong capture kind");
          const directory = local("../../temp/motion-captures"); await mkdir(directory, { recursive: true });
          const filename = `motion-${Date.now()}.json`; await writeFile(`${directory}/${filename}`, JSON.stringify(value, null, 2));
          res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ filename }));
        } catch { res.statusCode = 400; res.end("Capture failed"); } return;
      }
      if (url.pathname !== "/events") { next(); return; }
      const profile = url.searchParams.get("profile");
      if (!["matched", "delayed", "stalled", "burst", "disconnect", "context"].includes(profile ?? "")) { res.statusCode = 400; res.end(); return; }
      res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-store"); res.flushHeaders();
      let index = 0; const timers = new Set<ReturnType<typeof setTimeout>>();
      const send = (value: unknown) => res.write(`data: ${JSON.stringify(value)}\n\n`);
      const delay = (callback: () => void, ms: number) => { const timer = setTimeout(() => { timers.delete(timer); callback(); }, ms); timers.add(timer); };
      const tick = () => {
        if (++index > 12) { send({ done: true }); res.end(); return; }
        const timestamp = Date.now(), lat = 23 + index * 0.00008, lng = 72 + index * 0.00006;
        const raw = { lat, lng, speed: 32, heading: 40, motionState: "moving", seq: index, sampledAt: timestamp };
        const entry = { busId: "synthetic-bus", routeId: "synthetic-route", sessionId: profile === "context" && index >= 7 ? "synthetic-ride-two" : "synthetic-ride-one", direction: "forward", routeDirection: "forward", routeVersion: 1, routeState: "ON_ROUTE", deviceState: "online", motionState: "moving", tripState: "in_service", status: "active", timestamp, receivedAt: timestamp, backendReceivedAt: timestamp, lat, lng, rawLocation: raw };
        const matched = { ...entry, mapMatchSeq: index, mapMatchSampledAt: timestamp,
          matchedLocation: { lat, lng, seq: index, sampledAt: timestamp, routeVersion: 1, matchConfidence: 1, segmentIndex: 0, segmentFraction: 0, alongRouteDistanceM: index * 10, distanceToRouteM: 0 } };
        send({ entry: index === 1 || profile === "matched" || profile === "burst" || profile === "context" || profile === "disconnect" ? matched : entry, serverSentAtMs: Date.now() });
        if (profile === "delayed") delay(() => { if (index === raw.seq) send({ entry: matched, serverSentAtMs: Date.now() }); }, 500);
        // A stalled matcher sends no update after the first match. The real hook must time out.
        delay(tick, profile === "burst" ? 80 : profile === "disconnect" && index === 6 ? 3500 : 1000);
      };
      req.on("close", () => timers.forEach(clearTimeout)); tick();
    });
  } }],
});
