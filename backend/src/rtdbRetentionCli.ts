import { getApps, deleteApp } from "firebase-admin/app";
import { firebaseRtdbRetentionStore } from "./services/firebaseRtdbRetention";
import { runRtdbRetentionSweep } from "./services/rtdbRetention";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--apply" && arg !== "--dry-run") || args.length > 1) {
    throw new Error("Use --dry-run (default) or --apply, never both");
  }
  const summary = await runRtdbRetentionSweep(firebaseRtdbRetentionStore(), {
    dryRun: args[0] !== "--apply",
    legacyRetired: process.env.LEGACY_RTDB_RETIRED === "true",
  });
  console.log(JSON.stringify(summary, null, 2));
}
void main().catch(() => {
  console.error("RTDB retention failed; no raw database data is logged. Inspect credentials/connectivity and retry.");
  process.exitCode = 1;
}).finally(async () => { await Promise.all(getApps().map(app => deleteApp(app))); });
