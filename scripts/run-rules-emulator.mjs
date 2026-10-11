import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeEmulatorRuleset } from "./rules-for-emulator.mjs";
import { safetyPreflight } from "./qa/safety-preflight.mjs";

/**
 * Runs the Firebase emulator rules-integration suite against isolated copies
 * of the rules (see rules-for-emulator.mjs). The emulators:exec test
 * command contains spaces, so it is passed as a single argv element: POSIX
 * spawns the npx shim directly, and Windows spawns node with npm's npx CLI
 * entry (avoiding .cmd shims and cmd.exe quote mangling entirely). The
 * deployable repository rule files are never modified.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDirectory = path.join(ROOT, 'artifacts/qa'); mkdirSync(evidenceDirectory, { recursive: true });
for (const name of ['emulator-vitest.json', 'emulator-junit.xml', 'emulator-report.md', 'emulator-run.log']) rmSync(path.join(evidenceDirectory, name), { force: true });
writeFileSync(path.join(evidenceDirectory, 'emulator-report.json'), JSON.stringify({
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8' }).trim()),
  startedAt: new Date().toISOString(), timezone: 'Asia/Calcutta', verdict: 'BLOCKED',
  setupError: 'Emulator setup has not yet produced observed execution evidence', counts: null,
  physicalMotionExecuted: false, realProvidersExecuted: false,
  node: process.version, platform: process.platform, firebaseTools: '15.14.0',
}, null, 2) + '\n');
safetyPreflight(process.env); // Reject inherited provider/cloud credentials before tooling starts.
const { configPath, firestorePath, databasePath } = await writeEmulatorRuleset();

const emulatorArgs = [
  "--yes",
  "firebase-tools@15.14.0",
  "emulators:exec",
  "--config",
  configPath,
  "--only",
  "firestore,database,auth",
  "--project",
  "demo-eki-qa",
  `node "${path.join(ROOT, 'scripts/qa/run-emulator-tests.mjs')}"`,
];

function spawnNpx() {
  const env = {
    ...process.env,
    FIREBASE_RULES_TEST: "1",
    FIRESTORE_RULES_PATH: firestorePath,
    DATABASE_RULES_PATH: databasePath,
    GCLOUD_PROJECT: 'demo-eki-qa',
    FIREBASE_DATABASE_URL: 'http://127.0.0.1:9005/',
    EKI_QA_EXTERNAL_PROVIDERS: 'mock',
    EKI_QA_CONFIRM_DISPOSABLE: '1',
    DOTENV_CONFIG_PATH: path.join(ROOT, 'artifacts/qa/nonexistent.env'),
    METADATA_SERVER_DETECTION: 'none', // No GCP environment discovery in local demo tests.
  };
  const opts = { stdio: "inherit", cwd: ROOT, env };

  if (process.platform !== "win32") {
    return spawn("npx", emulatorArgs, opts);
  }

  // Windows: node + npm's npx CLI keeps every argument (including the quoted
  // emulators:exec script) intact — no .cmd shim, no cmd.exe quote parsing.
  const npxCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npx-cli.js",
  );
  if (existsSync(npxCli)) {
    return spawn(process.execPath, [npxCli, ...emulatorArgs], opts);
  }

  // Fallback: .cmd shim through a shell (spaces in the script arg may be
  // mangled; prefer the node entry above).
  return spawn("npx.cmd", emulatorArgs, { ...opts, shell: true });
}

const child = spawnNpx();
const deadline = setTimeout(() => { console.error('Emulator runner deadline exceeded; dependent tests BLOCKED.'); child.kill('SIGTERM'); }, 6 * 60_000);

child.on("error", (err) => {
  clearTimeout(deadline);
  console.error("Failed to start emulator runner:", err);
  process.exit(1);
});
child.on("exit", (code) => {
  clearTimeout(deadline);
  process.exit(code ?? 1);
});
