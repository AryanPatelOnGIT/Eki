import { fork } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ firestore: null as Firestore | null }));
vi.mock("./lib/firebaseAdmin", () => ({ db: {
  collection: (name: string) => state.firestore!.collection(name),
  runTransaction: (work: any) => state.firestore!.runTransaction(work),
} }));
import { listRecoverableOperations, readOperation, recoverOperation, recoverFleetLock, submitOperation, getHttpOperationExecutionStatus, drainHttpOperations } from "./services/httpOperations";
const integration = process.env.FIREBASE_RULES_TEST === "1" ? describe : describe.skip;
integration("durable operation recovery against the actual Firestore emulator", () => {
  beforeAll(() => {
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    if (!host || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) throw Error("Loopback Firestore emulator required");
    state.firestore = new Firestore({ projectId: "eki-rules-test", host, ssl: false });
  });
  afterAll(async () => { await drainHttpOperations(); await state.firestore?.terminate(); });
  it("discovers and audits an actual killed executor without repeating its committed effects", async () => {
    const id = `crash_${randomUUID()}`;
    const child = fork(resolve(__dirname, "../test-support/operation-crash.cjs"), [id], { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "inherit", "ipc"] });
    const exit = new Promise<void>(done => child.once("exit", () => done()));
    let identity: { executorId: string };
    try {
      identity = await new Promise((done, fail) => { child.once("message", data => done(data as { executorId: string })); child.once("error", fail); child.once("exit", code => fail(Error(`Executor exited before commit: ${code}`))); });
    } finally { child.kill("SIGKILL"); await exit; }
    await new Promise(done => setTimeout(done, 1100));
    const operation = await readOperation("_fleet_reconciliation_jobs", id);
    expect(operation).toMatchObject({ status: "processing", progress: { phase: "authorizing", batchDriverIds: ["emulator-driver"] }, recovery: { executorId: identity.executorId, generation: 1 } });
    expect((await state.firestore!.collection("_fleet_reconciliation_jobs").doc(id).get()).data()?.phase).toBe("recovery_required");
    await expect(recoverFleetLock({ expectedOwner: id, executorStopped: true, adminUid: "emulator-admin" })).rejects.toThrow("Recover the linked operation");
    await recoverOperation({ collection: "_fleet_reconciliation_jobs", id, expectedExecutorId: identity.executorId, expectedGeneration: 1, executorStopped: true, adminUid: "emulator-admin" });
    const execute = vi.fn(async () => ({ result: {} }));
    expect(await submitOperation({ collection: "_fleet_reconciliation_jobs", id, payload: {}, budgetMs: 1000, execute })).toMatchObject({ status: "failed", error: { outcomeUnknown: true } });
    expect(execute).not.toHaveBeenCalled();
    expect((await state.firestore!.collection("_operation_recovery_test").doc(id).get()).data()?.effects).toBe(1);
    await recoverFleetLock({ expectedOwner: id, executorStopped: true, adminUid: "emulator-admin" });
    expect((await state.firestore!.collection("_fleet_reconciliation_locks").doc("singleton").get()).exists).toBe(false);
    const audit = await state.firestore!.collection("_fleet_lock_recoveries").where("owner", "==", id).get();
    expect(audit.docs[0].data()).toMatchObject({ recoveredBy: "emulator-admin", executorStopped: true, operationId: id });
    const next = `${id}_new`;
    await submitOperation({ collection: "_fleet_reconciliation_jobs", id: next, payload: {}, budgetMs: 5000, execute: async () => ({ result: { deliberate: true } }) });
    await vi.waitFor(() => expect(getHttpOperationExecutionStatus().execution.active).toBe(0));
    expect(await readOperation("_fleet_reconciliation_jobs", next)).toMatchObject({ status: "succeeded" });
  }, 30000);
  it("discovers expired claims beyond the first bounded page without exposing payloads", async () => {
    const prefix = `page_${randomUUID()}`; const batch = state.firestore!.batch();
    for (let index = 0; index < 31; index++) batch.set(state.firestore!.collection("_route_geometry_previews").doc(`${prefix}_${String(index).padStart(2, "0")}`), {
      status: "processing", phase: "claimed", deadlineAt: Date.now() - 1, executorId: "stopped", generation: 1, adminUid: "private-admin", payloadHash: "private-hash",
    });
    await batch.commit(); let cursor: string | undefined; const found = new Set<string>();
    do {
      const page = await listRecoverableOperations("_route_geometry_previews", cursor);
      expect(page.operations.length).toBeLessThanOrEqual(25);
      for (const operation of page.operations) {
        expect(operation).not.toHaveProperty("payloadHash"); expect(operation).not.toHaveProperty("adminUid");
        if (operation.operationId.startsWith(prefix)) { found.add(operation.operationId); expect(operation.recovery?.required).toBe(true); }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(found.size).toBe(31);
    const cleanup = state.firestore!.batch(); for (const id of found) cleanup.delete(state.firestore!.collection("_route_geometry_previews").doc(id)); await cleanup.commit();
  }, 30000);
});
