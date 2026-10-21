import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sweep: vi.fn(), store: {}, cleanup: vi.fn(), done: vi.fn() }));
vi.mock("firebase-admin/app", () => ({ getApps: () => ["synthetic-app"], deleteApp: mocks.cleanup }));
vi.mock("./services/firebaseRtdbRetention", () => ({ firebaseRtdbRetentionStore: () => mocks.store }));
vi.mock("./services/rtdbRetention", () => ({ runRtdbRetentionSweep: mocks.sweep }));
let argv: string[];
let exitCode: typeof process.exitCode;
beforeEach(() => {
  argv = process.argv; exitCode = process.exitCode;
  vi.resetModules(); vi.clearAllMocks();
  mocks.sweep.mockResolvedValue({ dryRun: true }); mocks.cleanup.mockResolvedValue(undefined);
  vi.stubEnv("LEGACY_RTDB_RETIRED", "false");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { process.argv = argv; process.exitCode = exitCode; vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function invoke(args: string[]) {
  process.argv = ["node", "synthetic-cli", ...args];
  await import("./rtdbRetentionCli");
  await vi.waitFor(() => expect(mocks.cleanup).toHaveBeenCalledOnce());
}
describe("RTDB retention CLI safety", () => {
  it("defaults to dry-run and requires explicit legacy retirement", async () => {
    await invoke([]);
    expect(mocks.sweep).toHaveBeenCalledWith(mocks.store, { dryRun: true, legacyRetired: false });
  });
  it("applies only the explicit flag and exact retired-consumer acknowledgement", async () => {
    vi.stubEnv("LEGACY_RTDB_RETIRED", "true");
    await invoke(["--apply"]);
    expect(mocks.sweep).toHaveBeenCalledWith(mocks.store, { dryRun: false, legacyRetired: true });
  });
  it.each([["--unknown"], ["--apply", "--dry-run"]])("rejects invalid arguments without invoking a sweep: %j", async (...args) => {
    await invoke(args as string[]);
    expect(mocks.sweep).not.toHaveBeenCalled(); expect(process.exitCode).toBe(1);
  });
  it("redacts sweep failures and always releases Firebase apps", async () => {
    mocks.sweep.mockRejectedValue(new Error("synthetic-private-record"));
    await invoke(["--dry-run"]);
    expect(process.exitCode).toBe(1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("synthetic-private-record");
    expect(mocks.cleanup).toHaveBeenCalledWith("synthetic-app");
  });
});
