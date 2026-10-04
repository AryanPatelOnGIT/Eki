import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(), tripStop: vi.fn(async () => undefined),
  retentionStop: vi.fn(), privacyStop: vi.fn(), rideStop: vi.fn(),
  tripStart: vi.fn(), leadership: vi.fn(), fleet: vi.fn(async () => undefined),
}));
vi.mock("../lib/firebaseAdmin", () => ({ db: {
  collection: () => ({ doc: () => ({}) }), runTransaction: mocks.transaction,
} }));
vi.mock("./tripStateEngine", () => ({ startTripStateEngine: mocks.tripStart }));
vi.mock("./retentionSweeper", () => ({ startRetentionSweeper: () => mocks.retentionStop }));
vi.mock("./privacyDeletionWorker", () => ({ startPrivacyDeletionWorker: () => mocks.privacyStop }));
vi.mock("./abandonedRideReconciler", () => ({ startAbandonedRideReconciler: () => mocks.rideStop }));
vi.mock("../routes/fleet", () => ({ reconcileFleetAuthorization: mocks.fleet }));
vi.mock("../lib/metrics", () => ({ setWorkerLeadership: mocks.leadership, recordWorkerRun: vi.fn() }));
import { startWorkerCoordinator } from "./workerCoordinator";

describe("worker leadership expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    vi.clearAllMocks();
    mocks.tripStart.mockReturnValue(mocks.tripStop);
    delete process.env.WORKER_ENABLED;
    mocks.transaction.mockImplementation(async (callback) => callback({
      get: async () => ({ data: () => undefined }), set: vi.fn(), delete: vi.fn(),
    }));
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });

  it("stops leader work independently of a permanently stalled renewal", async () => {
    const stop = startWorkerCoordinator();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.tripStart).toHaveBeenCalledTimes(1);
    mocks.transaction.mockImplementation(() => new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(46_000);
    expect(mocks.tripStop).toHaveBeenCalledTimes(1);
    expect(mocks.retentionStop).toHaveBeenCalledTimes(1);
    expect(mocks.privacyStop).toHaveBeenCalledTimes(1);
    expect(mocks.rideStop).toHaveBeenCalledTimes(1);
    expect(mocks.leadership).toHaveBeenLastCalledWith(false);
    await stop();
  });

  it("does not activate a lease whose transaction reply arrives after its expiry", async () => {
    let complete!: () => void;
    mocks.transaction.mockImplementation(() => new Promise(resolve => { complete = () => resolve({
      generation: 1, expiresAt: Date.now() - 1,
    }); }));
    startWorkerCoordinator();
    await vi.advanceTimersByTimeAsync(46_000);
    complete();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.tripStart).not.toHaveBeenCalled();
  });

  it("ignores a hung renewal's late success after local revocation", async () => {
    const stop = startWorkerCoordinator();
    await vi.advanceTimersByTimeAsync(0);
    let complete!: () => void;
    mocks.transaction.mockImplementation(() => new Promise(resolve => { complete = () => resolve({ generation: 1, expiresAt: Date.now() + 45_000 }); }));
    await vi.advanceTimersByTimeAsync(42_000);
    expect(mocks.tripStop).toHaveBeenCalledTimes(1);
    complete();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.tripStart).toHaveBeenCalledTimes(1);
    await stop();
  });

  it("extends the independent cutoff only on a timely committed renewal", async () => {
    const stop = startWorkerCoordinator();
    await vi.advanceTimersByTimeAsync(30_000);
    mocks.transaction.mockImplementation(() => new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(40_000);
    expect(mocks.tripStop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(mocks.tripStop).toHaveBeenCalledTimes(1);
    await stop();
  });

  it("cuts off leadership even when the wall clock moves backwards", async () => {
    const stop = startWorkerCoordinator();
    await vi.advanceTimersByTimeAsync(0);
    mocks.transaction.mockImplementation(() => new Promise(() => undefined));
    vi.setSystemTime(1);
    await vi.advanceTimersByTimeAsync(42_000);
    expect(mocks.tripStop).toHaveBeenCalledTimes(1);
    await stop();
  });

  it("keeps the takeover generation across release and uses a unique process owner", async () => {
    vi.stubEnv("WORKER_INSTANCE_ID", "shared-label");
    const writes: any[] = [];
    let lease: any = { generation: 7, expiresAt: Timestamp.fromMillis(0) };
    mocks.transaction.mockImplementation(async callback => callback({
      get: async () => ({ data: () => lease }),
      set: (_ref: unknown, data: any, options: any) => { writes.push(data); lease = options?.merge ? { ...lease, ...data } : data; },
    }));
    const stop = startWorkerCoordinator(); await vi.advanceTimersByTimeAsync(0);
    expect(writes[0].generation).toBe(8);
    expect(writes[0].ownerId).toMatch(/^shared-label:/);
    await stop();
    expect(lease.generation).toBe(8);
    expect(lease.expiresAt.toMillis()).toBe(0);
    const stopSecond = startWorkerCoordinator(); await vi.advanceTimersByTimeAsync(0);
    expect(lease.generation).toBe(9);
    expect(lease.ownerId).not.toBe(writes[0].ownerId);
    await stopSecond();
  });

  it("waits out the clock skew allowance before taking over another owner", async () => {
    const write = vi.fn();
    mocks.transaction.mockImplementation(async callback => callback({
      get: async () => ({ data: () => ({ ownerId: "other", generation: 1, expiresAt: Timestamp.fromMillis(Date.now() - 1_000) }) }), set: write,
    }));
    const stop = startWorkerCoordinator(); await vi.advanceTimersByTimeAsync(0);
    expect(write).not.toHaveBeenCalled(); expect(mocks.tripStart).not.toHaveBeenCalled();
    await stop();
  });
});
