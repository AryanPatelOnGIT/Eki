import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ sweep: vi.fn(), close: vi.fn(), app: {}, store: {} }));
vi.mock("firebase-admin/app", () => ({ getApps: () => [fixture.app], deleteApp: fixture.close }));
vi.mock("./services/firebaseRtdbRetention", () => ({ firebaseRtdbRetentionStore: () => fixture.store }));
vi.mock("./services/rtdbRetention", () => ({ runRtdbRetentionSweep: fixture.sweep }));

const argv = process.argv, exitCode = process.exitCode;
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("LEGACY_RTDB_RETIRED", "false");
  fixture.sweep.mockReset().mockResolvedValue({ dryRun: true, deleted: 0 });
  fixture.close.mockResolvedValue(undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
});
afterEach(() => {
  process.argv = argv; process.exitCode = exitCode;
  vi.unstubAllEnvs(); vi.restoreAllMocks();
});
async function run(...args: string[]) {
  process.argv = ["node", "rtdbRetentionCli.ts", ...args];
  await import("./rtdbRetentionCli");
  await vi.waitFor(() => expect(fixture.close).toHaveBeenCalledExactlyOnceWith(fixture.app));
}

describe("RTDB retention CLI", () => {
  it("defaults to a non-mutating scan and keeps legacy retirement disabled", async () => {
    await run();
    expect(fixture.sweep).toHaveBeenCalledExactlyOnceWith(fixture.store, { dryRun: true, legacyRetired: false });
    expect(process.exitCode).toBeUndefined();
  });
  it("requires explicit apply and exact legacy retirement opt-in", async () => {
    vi.stubEnv("LEGACY_RTDB_RETIRED", "true");
    await run("--apply");
    expect(fixture.sweep).toHaveBeenCalledExactlyOnceWith(fixture.store, { dryRun: false, legacyRetired: true });
  });
  it.each([["--apply", "--dry-run"], ["--unknown"], ["--apply", "--apply"]])("rejects ambiguous or unknown arguments %j before sweeping", async (...args) => {
    await run(...args);
    expect(fixture.sweep).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
  it("redacts dependency failures and closes Firebase apps", async () => {
    fixture.sweep.mockRejectedValue(new Error("private-database-payload"));
    await run("--dry-run");
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledOnce();
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("private-database-payload");
  });
});
