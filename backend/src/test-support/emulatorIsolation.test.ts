import { describe, expect, it } from "vitest";
import { assertEmulatorEnvironment, emulatorDatabaseUrl } from "./emulatorIsolation";
const valid = { GCLOUD_PROJECT: "demo-eki-qa", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
  FIREBASE_DATABASE_EMULATOR_HOST: "127.0.0.1:9005", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9095",
  EKI_QA_CONFIRM_DISPOSABLE: "1", EKI_QA_EXTERNAL_PROVIDERS: "mock", FIREBASE_DATABASE_URL: "http://127.0.0.1:9005/" };
describe("emulator SDK configuration boundary", () => {
  it("requires complete demo configuration and the preloaded transport guard", () => {
    const target = globalThis as typeof globalThis & { __ekiQaNetworkGuard?: { enabled: boolean } };
    const original = target.__ekiQaNetworkGuard;
    try {
      target.__ekiQaNetworkGuard = { enabled: true };
      expect(() => assertEmulatorEnvironment(valid)).not.toThrow();
      for (const [key, value] of Object.entries(valid)) {
        expect(() => assertEmulatorEnvironment({ ...valid, [key]: undefined }), key).toThrow();
        expect(() => assertEmulatorEnvironment({ ...valid, [key]: value + "-external" }), key).toThrow();
      }
      expect(() => assertEmulatorEnvironment({ ...valid, GOOGLE_APPLICATION_CREDENTIALS: "private-value" })).toThrow(/forbidden/);
      target.__ekiQaNetworkGuard = undefined;
      expect(() => assertEmulatorEnvironment(valid)).toThrow(/preloaded/);
    } finally { target.__ekiQaNetworkGuard = original; }
  });
  it("builds literal-loopback URLs only for synthetic demo namespaces", () => {
    expect(emulatorDatabaseUrl("demo-eki-ingest-test")).toBe("http://127.0.0.1:9005/?ns=demo-eki-ingest-test-default-rtdb");
    for (const project of ["eki-production", "demo-eki-../", "https://cloud", "demo-other-test"])
      expect(() => emulatorDatabaseUrl(project)).toThrow(/synthetic/);
  });
});
