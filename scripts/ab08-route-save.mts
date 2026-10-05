/** Isolated AB08 fault replay. Never sends a real route write. */
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { ApiError } from "../frontend/src/lib/apiClient";
import { saveRoute as branchSaveRoute } from "../frontend/src/lib/routeSaveClient";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseCommit = "9579cdc7769e4653fda013dbd2b19d62b988b769";
const baseFile = resolve(root, "frontend/src/lib/routeSaveClient.ab-base.ts");
const baselineSource = execFileSync("git", ["show", `${baseCommit}:frontend/src/lib/routeSaveClient.ts`], { cwd: root, encoding: "utf8" });
writeFileSync(baseFile, baselineSource);

try {
  const { saveRoute: baseSaveRoute } = await import(pathToFileURL(baseFile).href);
  const rows: Array<{ seed: number; order: string; variant: string; result: string; elapsedMs: number; requests: number; writes: number; saveId: string }> = [];
  for (let seed = 101; seed <= 108; seed++) {
    const order = seed % 2 ? ["A", "B"] : ["B", "A"];
    for (const variant of order) {
      let requests = 0;
      let writes = 0;
      const saveId = `ab08-${seed}`;
      const request = async (path: string) => {
        requests++;
        if (!path.includes("save-operations")) {
          writes++;
          return { status: "processing", saveId, retryAfterMs: 250 };
        }
        if (requests === 2) throw new ApiError("transient status outage", "HTTP_ERROR", 503);
        return { status: "succeeded", saved: true, saveId, routeId: "qa-route", configVersion: 2,
          geometryVersion: 1, geometryReused: true, polyline: "encoded", distanceMeters: 100, duration: "10s" };
      };
      const started = performance.now();
      let result = "confirmed";
      try {
        await (variant === "A" ? baseSaveRoute : branchSaveRoute)("qa-route", saveId, {}, "qa-token", undefined, request as never);
      } catch (error) {
        result = error instanceof ApiError ? `unconfirmed:${error.status ?? error.code}` : "unconfirmed:other";
      }
      rows.push({ seed, order: order.join("/"), variant, result,
        elapsedMs: Math.round((performance.now() - started) * 10) / 10, requests, writes, saveId });
    }
  }
  console.log(JSON.stringify({ protocol: "AB08", baseCommit, branchCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), rows,
    pairedDeltaCi: null, limitation: "Baseline never confirms under this fault schedule; time-to-confirmation and its paired CI are undefined, not zero." }, null, 2));
} finally {
  unlinkSync(baseFile);
}
