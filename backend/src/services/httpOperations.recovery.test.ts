import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ docs: new Map<string, Record<string, any>>(), tail: Promise.resolve() as Promise<unknown>, getGate: null as Promise<void> | null, gets: 0 }));
vi.mock("../lib/firebaseAdmin", () => {
  const snapshot = (path: string) => ({ exists: state.docs.has(path), data: () => state.docs.get(path), id: path.split("/").at(-1) });
  const ref = (path: string) => ({ path, get: async () => { state.gets++; if (state.getGate) await state.getGate; return snapshot(path); },
    set: async (data: Record<string, unknown>, options?: { merge: boolean }) => { state.docs.set(path, options?.merge ? { ...state.docs.get(path), ...data } : data); } });
  return { db: { collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: (work: (transaction: any) => Promise<unknown>) => {
      const operation = state.tail.then(async () => {
        const writes: Array<() => void> = [];
        const result = await work({ get: async (doc: { path: string }) => snapshot(doc.path),
          create: (doc: { path: string }, data: any) => { if (state.docs.has(doc.path)) throw Error("exists"); writes.push(() => state.docs.set(doc.path, data)); },
          set: (doc: { path: string }, data: any, options?: { merge: boolean }) => { writes.push(() => state.docs.set(doc.path, options?.merge ? { ...state.docs.get(doc.path), ...data } : data)); },
          delete: (doc: { path: string }) => { writes.push(() => state.docs.delete(doc.path)); } });
        writes.forEach(write => write()); return result;
      }); state.tail = operation.catch(() => {}); return operation;
    } } };
});
import { getHttpOperationExecutionStatus, OPERATION_EXECUTOR_ID, OperationRecoveryConflict, readOperation, recoverOperation, recoverFleetLock, submitOperation } from "./httpOperations";
async function flush() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
beforeEach(async () => {
  await vi.waitFor(() => expect(getHttpOperationExecutionStatus().execution.active).toBe(0));
  state.docs.clear(); state.tail = Promise.resolve(); state.getGate = null; state.gets = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("durable operation execution bounds and recovery", () => {
  it("bounds independent dispatched executors during an upstream stall", async () => {
    let release!: () => void; const dependency = new Promise<void>(done => { release = done; }); let starts = 0;
    const submissions = Array.from({ length: 100 }, (_, i) => submitOperation({
      collection: "_route_geometry_previews", id: `operation_queue_${i}`, payload: {}, budgetMs: 10_000,
      execute: async () => { starts++; await dependency; return { result: { value: true } }; },
    }).catch(error => error));
    try { await flush(); expect(starts).toBe(2); expect(getHttpOperationExecutionStatus().execution).toMatchObject({ active: 2, pending: 8 }); }
    finally { release(); await Promise.all(submissions); await vi.waitFor(() => expect(getHttpOperationExecutionStatus().execution.active).toBe(0)); }
  });

  it("exposes an actionable recovery state after restart instead of endless processing", async () => {
    state.docs.set("_route_geometry_previews/stranded_operation_1", {
      payloadHash: "hash", status: "processing", deadlineAt: Date.now() - 1,
      executorId: "stopped-executor", generation: 1, phase: "claimed",
    });
    const result = await readOperation("_route_geometry_previews", "stranded_operation_1");
    expect(result).toMatchObject({ status: "processing", recovery: { required: true } });
    expect(state.docs.get("_route_geometry_previews/stranded_operation_1")?.phase).toBe("recovery_required");
  });

  const stranded = (id = "stranded_operation_1", extra = {}) => {
    state.docs.set(`_route_geometry_previews/${id}`, { status: "processing", deadlineAt: Date.now() - 1,
      executorId: "stopped-executor", generation: 1, phase: "executing", ...extra });
    return { collection: "_route_geometry_previews" as const, id, expectedExecutorId: "stopped-executor", expectedGeneration: 1, executorStopped: true as const, adminUid: "admin" };
  };
  it("audits abandonment with a generation bump and retains unknown effects", async () => {
    const request = stranded();
    expect(await recoverOperation(request)).toMatchObject({ status: "failed", error: { outcomeUnknown: true, code: "OPERATION_ABANDONED_AFTER_EXECUTOR_STOP" } });
    expect(state.docs.get(`_route_geometry_previews/${request.id}`)).toMatchObject({ generation: 2, phase: "recovered", recoveredBy: "admin", executorStopped: true });
    await expect(recoverOperation(request)).rejects.toBeInstanceOf(OperationRecoveryConflict);
  });
  it("refuses missing stopped attestation, changed identity, and unexpired claims", async () => {
    const request = stranded();
    await expect(recoverOperation({ ...request, executorStopped: false as unknown as true })).rejects.toBeInstanceOf(OperationRecoveryConflict);
    await expect(recoverOperation({ ...request, expectedGeneration: 2 })).rejects.toBeInstanceOf(OperationRecoveryConflict);
    await expect(recoverOperation({ ...request, expectedExecutorId: "other" })).rejects.toBeInstanceOf(OperationRecoveryConflict);
    state.docs.get(`_route_geometry_previews/${request.id}`)!.deadlineAt = Date.now() + 10000;
    await expect(recoverOperation(request)).rejects.toBeInstanceOf(OperationRecoveryConflict);
  });
  it("never replaces an active raw executor with recovery after its deadline", async () => {
    let release!: () => void; const gate = new Promise<void>(done => { release = done; });
    const id = "live_operation_001";
    await submitOperation({ collection: "_route_geometry_previews", id, payload: {}, budgetMs: 10000, execute: async () => { await gate; return { result: {} }; } });
    await flush(); state.docs.get(`_route_geometry_previews/${id}`)!.deadlineAt = Date.now() - 1;
    try {
      await expect(recoverOperation({ collection: "_route_geometry_previews", id, expectedExecutorId: OPERATION_EXECUTOR_ID, expectedGeneration: 1, executorStopped: true, adminUid: "admin" })).rejects.toBeInstanceOf(OperationRecoveryConflict);
    } finally { release(); await flush(); }
  });
  it("fences a late outcome write when durable authority has changed", async () => {
    let release!: () => void; const gate = new Promise<void>(done => { release = done; }); const id = "fenced_operation_01";
    await submitOperation({ collection: "_route_geometry_previews", id, payload: {}, budgetMs: 10000, execute: async () => { await gate; return { result: { stale: true } }; } });
    await flush(); state.docs.set(`_route_geometry_previews/${id}`, { ...state.docs.get(`_route_geometry_previews/${id}`), status: "failed", generation: 2, phase: "recovered" });
    release(); await vi.waitFor(() => expect(getHttpOperationExecutionStatus().execution.active).toBe(0));
    expect(state.docs.get(`_route_geometry_previews/${id}`)).not.toHaveProperty("result");
  });
  it("expires queued work without launching external execution and recovers capacity", async () => {
    vi.useFakeTimers(); let release!: () => void; const gate = new Promise<void>(done => { release = done; }); let starts = 0;
    const requests = Array.from({ length: 10 }, (_, i) => submitOperation({ collection: "_route_geometry_previews", id: `queued_operation_${i}`, payload: {}, budgetMs: 10000,
      execute: async () => { starts++; await gate; return { result: {} }; } }).catch(error => error));
    await flush(); expect(starts).toBe(2);
    await vi.advanceTimersByTimeAsync(2100); await flush(); expect(getHttpOperationExecutionStatus().execution).toMatchObject({ active: 2, pending: 0 });
    release(); await Promise.all(requests); await flush(); expect(starts).toBe(2);
    await submitOperation({ collection: "_route_geometry_previews", id: "capacity_recovered", payload: {}, budgetMs: 10000, execute: async () => ({ result: {} }) }); await flush();
  });
  it("keeps stalled admission slots after public timeout and refuses late claim dispatch", async () => {
    vi.useFakeTimers(); let release!: () => void; state.getGate = new Promise<void>(done => { release = done; }); const execute = vi.fn(async () => ({ result: {} }));
    const requests = Array.from({ length: 100 }, (_, i) => submitOperation({ collection: "_route_geometry_previews", id: `admission_stall_${i}`, payload: {}, budgetMs: 10000, execute }).catch(error => error));
    await flush(); expect(state.gets).toBe(16);
    await vi.advanceTimersByTimeAsync(3100); await Promise.all(requests);
    expect(getHttpOperationExecutionStatus().admissions.activeFills).toBe(16);
    release(); await flush(); expect(execute).not.toHaveBeenCalled(); expect(state.docs.size).toBe(0);
    expect(getHttpOperationExecutionStatus().admissions.activeFills).toBe(0);
  });
  it("recovers legacy claims and atomically audits only the expected stranded lock", async () => {
    const request = stranded("legacy_operation_1", { executorId: undefined, generation: undefined });
    await recoverOperation({ ...request, expectedExecutorId: "legacy", expectedGeneration: 0 });
    state.docs.set("_fleet_reconciliation_locks/singleton", { owner: "old-owner", executorId: "old-process" });
    await expect(recoverFleetLock({ expectedOwner: "changed", executorStopped: true, adminUid: "admin" })).rejects.toBeInstanceOf(OperationRecoveryConflict);
    expect(await recoverFleetLock({ expectedOwner: "old-owner", executorStopped: true, adminUid: "admin" })).toEqual({ recovered: true });
    expect(state.docs.has("_fleet_reconciliation_locks/singleton")).toBe(false);
    expect([...state.docs.entries()].find(([key]) => key.startsWith("_fleet_lock_recoveries/"))?.[1]).toMatchObject({ owner: "old-owner", recoveredBy: "admin", executorStopped: true });
  });
  it("audits recovery when a linked terminal job has already passed retention", async () => {
    state.docs.set("_fleet_reconciliation_locks/singleton", { owner: "retained-lock", executorId: "stopped", operationId: "expired_job_00001" });
    expect(await recoverFleetLock({ expectedOwner: "retained-lock", executorStopped: true, adminUid: "admin" })).toEqual({ recovered: true });
    expect([...state.docs.entries()].find(([key]) => key.startsWith("_fleet_lock_recoveries/"))?.[1]).toMatchObject({ linkedOperationStatus: "missing" });
  });
});
