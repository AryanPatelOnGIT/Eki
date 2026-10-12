/** Test-only configuration boundary. Never imported by application bootstrap. */
export function assertEmulatorEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (env.GCLOUD_PROJECT !== "demo-eki-qa" || env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8085" ||
    env.FIREBASE_DATABASE_EMULATOR_HOST !== "127.0.0.1:9005" || env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9095" ||
    env.EKI_QA_CONFIRM_DISPOSABLE !== "1" || env.EKI_QA_EXTERNAL_PROVIDERS !== "mock" ||
    env.FIREBASE_DATABASE_URL !== "http://127.0.0.1:9005/") throw new Error("Verified disposable demo emulator configuration required");
  for (const key of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT", "FIREBASE_CONFIG", "GOOGLE_MAPS_API_KEY", "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"]) {
    if (env[key]) throw new Error(`${key}: real credentials forbidden in emulator tests`);
  }
  if (!(globalThis as typeof globalThis & { __ekiQaNetworkGuard?: { enabled: boolean } }).__ekiQaNetworkGuard?.enabled) {
    throw new Error("Node emulator transport guard must be preloaded before any SDK import");
  }
}

export function emulatorDatabaseUrl(project: string): string {
  if (!/^demo-eki-[a-z0-9-]+$/.test(project)) throw new Error("Test namespace must be a synthetic demo project");
  return `http://127.0.0.1:9005/?ns=${project}-default-rtdb`;
}
