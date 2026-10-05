/** AB04 component proxy: paired ETA work over identical reroute geometry. */
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { busStopArrivalTimestamps as branchEta } from "../frontend/src/lib/busEta";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseCommit = "9579cdc7769e4653fda013dbd2b19d62b988b769";
const baseFile = resolve(root, "frontend/src/lib/busEta.ab-base.ts");
writeFileSync(baseFile, execFileSync("git", ["show", `${baseCommit}:frontend/src/lib/busEta.ts`], { cwd: root, encoding: "utf8" }));
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
function ci(deltas: number[]) {
  let state = 0x246ab04;
  const sample = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2 ** 32; };
  const means: number[] = [];
  for (let i = 0; i < 10_000; i++) {
    let total = 0;
    for (let j = 0; j < deltas.length; j++) total += deltas[Math.floor(sample() * deltas.length)];
    means.push(total / deltas.length);
  }
  means.sort((a, b) => a - b);
  return [means[250], means[9749]];
}
try {
  const { busStopArrivalTimestamps: baseEta } = await import(pathToFileURL(baseFile).href);
  const rows: Array<{ seed: number; order: string; baselineP95Ms: number; branchP95Ms: number; deltaMs: number; equal: boolean }> = [];
  for (let seed = 201; seed <= 216; seed++) {
    const path = Array.from({ length: 401 }, (_, i) => ({ lat: 23 + i * 0.00001, lng: 72 + i * 0.000005 }));
    const reroute = path.map((point, i) => ({ lat: point.lat + (i > 100 && i < 300 ? 0.0002 : 0), lng: point.lng }));
    const stops = Array.from({ length: 10 }, (_, i) => ({ ...path[40 * (i + 1)], id: `s${i}` }));
    const inputs = Array.from({ length: 200 }, (_, i) => ({
      busPoint: path[(i * 3 + seed) % 250], heading: 20, speedKmh: 30,
      delayMinutes: 0, path: i < 100 ? path : reroute, remainingStops: stops, now: 1_800_000_000_000 + i * 1000,
    }));
    const order = seed % 2 ? ["A", "B"] : ["B", "A"];
    const timings: Record<string, number[]> = {};
    const outputs: Record<string, unknown[]> = {};
    for (const variant of order) {
      const compute = variant === "A" ? baseEta : branchEta;
      for (let i = 0; i < 5; i++) compute(inputs[i]);
      timings[variant] = []; outputs[variant] = [];
      for (const input of inputs) {
        const started = performance.now();
        outputs[variant].push(compute(input));
        timings[variant].push(performance.now() - started);
      }
    }
    const baselineP95Ms = p95(timings.A), branchP95Ms = p95(timings.B);
    rows.push({ seed, order: order.join("/"), baselineP95Ms, branchP95Ms,
      deltaMs: branchP95Ms - baselineP95Ms,
      equal: JSON.stringify(outputs.A) === JSON.stringify(outputs.B) });
  }
  const deltas = rows.map(row => row.deltaMs);
  console.log(JSON.stringify({ protocol: "AB04 component proxy", baseCommit,
    branchCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    metric: "p95 ETA calculation duration per independent seeded reroute replay (ms)",
    rows, meanPairedDeltaMs: deltas.reduce((a, b) => a + b, 0) / deltas.length,
    bootstrap95CiMs: ci(deltas),
    limitation: "Does not measure deviation-to-current-route-visible or map compositor; full AB04 acceptance remains open." }, null, 2));
} finally {
  unlinkSync(baseFile);
}
