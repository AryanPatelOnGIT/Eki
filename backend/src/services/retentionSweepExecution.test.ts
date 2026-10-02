import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  filters: new Map<string, unknown[][]>(),
  recursiveDelete: vi.fn(async () => undefined),
}));
vi.mock("../lib/firebaseAdmin", () => ({ db: {
  collection: (name: string) => {
    const filters: unknown[][] = [];
    mocks.filters.set(name, filters);
    const query = {
      where: (...args: unknown[]) => { filters.push(args); return query; },
      orderBy: () => query,
      limit: () => query,
      get: async () => ({ empty: true, docs: [], size: 0 }),
    };
    return query;
  },
  recursiveDelete: mocks.recursiveDelete,
} }));
import { runRetentionSweep } from "./retentionSweeper";

afterEach(() => vi.unstubAllEnvs());

describe("retention query boundaries", () => {
  it("keeps both ride stores for 180 days and excludes ongoing rides", async () => {
    vi.stubEnv("RIDE_SESSION_RETENTION_DAYS", "");
    vi.stubEnv("COMPLETED_TRIP_RETENTION_DAYS", "");
    const now = Date.UTC(2026, 9, 2, 10);
    const cutoff = now - 180 * 24 * 60 * 60 * 1000;
    await runRetentionSweep(now);
    expect(mocks.filters.get("ride_sessions")).toEqual([
      ["status", "in", ["completed", "failed", "interrupted"]],
      ["endTime", "<", cutoff],
    ]);
    expect(mocks.filters.get("completed_trips")).toEqual([["completedAt", "<", new Date(cutoff).toISOString()]]);
    expect(mocks.filters.has("active_rides")).toBe(false);
    expect(mocks.filters.has("_active_bus_locks")).toBe(false);
    expect(mocks.recursiveDelete).not.toHaveBeenCalled();
  });

  it("falls back to 180 days for malformed or nonpositive ride retention", async () => {
    vi.stubEnv("RIDE_SESSION_RETENTION_DAYS", "-1");
    vi.stubEnv("COMPLETED_TRIP_RETENTION_DAYS", "invalid");
    const now = Date.UTC(2026, 9, 2, 10);
    await runRetentionSweep(now);
    expect(mocks.filters.get("ride_sessions")?.[1]).toEqual(["endTime", "<", now - 180 * 86400000]);
  });
});
