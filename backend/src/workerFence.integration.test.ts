import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { Timestamp, Firestore } from "firebase-admin/firestore";
import { getDatabase, type Database } from "firebase-admin/database";
import { WorkerFence, WorkerLeadershipExpired, WORKER_LEASE_ID, workerWrite, workerTransaction, workerRtdbTransaction } from "./lib/workerFence";
import { SerializedChangeWriter } from "./services/serializedChangeWriter";
import { WorkQueueExpired } from "./lib/boundedKeyedExecutor";
import { BoundedKeyedExecutor } from "./lib/boundedKeyedExecutor";
import { ExecutionDeadline, ExecutionDeadlineError } from "./lib/executionDeadline";

const integration = process.env.FIREBASE_RULES_TEST === "1" ? describe : describe.skip;
integration("worker fencing against actual Firebase emulators", () => {
  let app: App; let firestore: Firestore; let realtime: Database;
  const leader = (generation: number) => new WorkerFence("emulator-leader", generation, performance.now() + 40_000);
  beforeAll(() => {
    // Never allow this fault-injection suite to reach an external database.
    for (const host of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_DATABASE_EMULATOR_HOST]) {
      if (!host || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) throw new Error("Both loopback Firebase emulators are required.");
    }
    app = initializeApp({ projectId: "eki-rules-test", databaseURL: "https://eki-rules-test-default-rtdb.firebaseio.com",
      // Emulator-only owner token prevents an ADC/metadata-network lookup.
      credential: { getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }) },
    }, "worker-fence-integration");
    firestore = new Firestore({ projectId: "eki-rules-test", host: process.env.FIRESTORE_EMULATOR_HOST, ssl: false });
    realtime = getDatabase(app);
  });
  afterAll(async () => { await firestore?.terminate(); if (app) await deleteApp(app); });

  async function lease(generation: number) {
    await firestore.collection("_worker_leases").doc(WORKER_LEASE_ID).set({
      ownerId: "emulator-leader", generation, expiresAt: Timestamp.fromMillis(Date.now() + 45_000),
    });
  }

  it("keeps an actual committed telemetry update uncertain until acknowledgement and then admits newer state", async () => {
    const destination = realtime.ref("_worker_fence_test/deadline");
    await destination.set({ timestamp: 1 });
    const pool = new BoundedKeyedExecutor<string>({ maxConcurrent: 1 });
    let acknowledge!: () => void; let committed!: () => void;
    const ack = new Promise<void>(done => { acknowledge = done; });
    const commit = new Promise<void>(done => { committed = done; });
    // Real Firebase commits before the injected lost/held acknowledgement.
    const underlying = destination.transaction(current => ({ ...current, timestamp: 2 })).then(async value => {
      committed(); await ack; return value;
    });
    await commit;
    const deadline = new ExecutionDeadline(500, 100); deadline.markWriteDispatched();
    const operation = pool.run("device", () => deadline.dependency("telemetry commit", () => underlying));
    await expect(deadline.waitForResponse(operation)).rejects.toMatchObject({ uncertainCommit: true });
    expect(pool.snapshot()).toMatchObject({ active: 1, pending: 0 });
    expect((await destination.get()).val().timestamp).toBe(2);
    const fresh = pool.run("device", async () => destination.transaction(current => ({ ...current, timestamp: 3 })));
    acknowledge(); await expect(operation).rejects.toBeInstanceOf(ExecutionDeadlineError); await fresh;
    expect((await destination.get()).val().timestamp).toBe(3);
    expect(pool.snapshot()).toMatchObject({ active: 0, pending: 0 });
  });

  it("retains ordering through a committed write with a stalled acknowledgement and queued expiry", async () => {
    await lease(20);
    const destination = firestore.collection("_worker_fence_test").doc("bounded-order");
    const writer = new SerializedChangeWriter(1, { maxConcurrent: 1, maxQueueAgeMs: 300 });
    let acknowledge!: () => void; let committed!: () => void;
    const ack = new Promise<void>(done => { acknowledge = done; });
    const commit = new Promise<void>(done => { committed = done; });
    const old = leader(20).run(() => writer.enqueue("bus", "old", async () => {
      await workerWrite(firestore, tx => { tx.set(destination, { progress: 1 }); });
      committed(); await ack;
    }));
    await commit;
    const expired = leader(20).run(() => writer.enqueue("bus", "expired", async () => {
      await workerWrite(firestore, tx => { tx.set(destination, { progress: 0 }); });
    })).catch(error => error);
    expect(await expired).toBeInstanceOf(WorkQueueExpired);
    expect(writer.snapshot()).toMatchObject({ active: 1, pending: 0 });
    expect((await destination.get()).data()).toEqual({ progress: 1 });
    const fresh = leader(20).run(() => writer.enqueue("bus", "fresh", async () => {
      await workerWrite(firestore, tx => { tx.set(destination, { progress: 2 }); });
    }));
    acknowledge(); await Promise.all([old, fresh]);
    expect((await destination.get()).data()).toEqual({ progress: 2 });
  });

  it("commits a valid lifecycle write and rejects the superseded owner", async () => {
    const destination = firestore.collection("_worker_fence_test").doc("lifecycle");
    await lease(1);
    await leader(1).run(() => workerWrite(firestore, writer => { writer.set(destination, { progress: 1 }); }));
    await lease(2);
    await leader(2).run(() => workerWrite(firestore, writer => { writer.set(destination, { progress: 2 }); }));
    await expect(leader(1).run(() => workerWrite(firestore, writer => { writer.set(destination, { progress: 0 }); }))).rejects.toBeInstanceOf(WorkerLeadershipExpired);
    expect((await destination.get()).data()).toEqual({ progress: 2 });
  });

  it("aborts the actual transaction if expiry occurs after its destination read", async () => {
    await lease(3);
    const destination = firestore.collection("_worker_fence_test").doc("late");
    await destination.set({ progress: 1 });
    const fence = leader(3);
    await expect(fence.run(() => workerTransaction(firestore, async transaction => {
      await transaction.get(destination);
      fence.revoke(); // independent cutoff while a dependency was dispatched
      transaction.set(destination, { progress: 0 });
    }))).rejects.toBeInstanceOf(WorkerLeadershipExpired);
    expect((await destination.get()).data()).toEqual({ progress: 1 });
  });

  it("enforces generations on actual RTDB writes after takeover", async () => {
    const destination = realtime.ref("_workerFenceTest/lifecycle");
    await destination.set({ progress: 1 });
    expect((await leader(5).run(() => workerRtdbTransaction(destination, current => ({ ...current, progress: 2 })))).committed).toBe(true);
    expect((await leader(4).run(() => workerRtdbTransaction(destination, current => ({ ...current, progress: 0 })))).committed).toBe(false);
    expect((await destination.once("value")).val()).toEqual({ progress: 2, _workerGeneration: 5 });
  });
});
