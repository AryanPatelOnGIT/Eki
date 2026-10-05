import { FieldPath, FieldValue, type Query, type Transaction, type WriteBatch } from "firebase-admin/firestore";
import { auth, db } from "../lib/firebaseAdmin";
import { assertWorkerLeadership, workerTransaction, workerWrite } from "../lib/workerFence";
import { BoundedKeyedExecutor } from "../lib/boundedKeyedExecutor";
import { withFleetLock, FleetReconciliationBusy } from "./fleetMutationLock";
import { OPERATION_EXECUTOR_ID } from "./httpOperations";
import { passengerIdentity, PrivacyConflict, PRIVACY_REQUESTS, PRIVACY_FAILURE_LIMIT, privacyExecutions } from "./privacyDeletionRequests";

const BATCH_SIZE = 200;
const executor = new BoundedKeyedExecutor<string>({ maxConcurrent: 1, maxPending: 20, maxPendingPerKey: 1, maxQueueAgeMs: 2_000 });
const scanner = new BoundedKeyedExecutor<string>({ maxConcurrent: 1, maxPending: 1, maxPendingPerKey: 1, maxQueueAgeMs: 2_000 });
let draining = false;
type Writer = Pick<WriteBatch, "update" | "delete" | "set">;
type Write = (work: (writer: Writer) => void) => Promise<void>;
class PrivacyDeadline extends Error {}

/** One bounded page on each migration path; a later queue turn continues cleanup. */
export async function removePassengerManifest(uid: string, write: Write = work => workerWrite(db, work), check: () => void = assertWorkerLeadership): Promise<{ removed: number; more: boolean }> {
  let removed = 0, more = false;
  for (const query of [db.collection("ride_sessions").where("passengerIds", "array-contains", uid),
    db.collection("ride_sessions").where(new FieldPath("passengers", uid, "userId"), "==", uid)]) {
    check(); const page = await query.limit(BATCH_SIZE).get(); check();
    if (!page.empty) await write(writer => page.docs.forEach(session => {
      writer.update(session.ref, { passengerIds: FieldValue.arrayRemove(uid) });
      writer.update(session.ref, new FieldPath("passengers", uid), FieldValue.delete());
    }));
    removed += page.size || 0; more ||= page.size === BATCH_SIZE;
  }
  return { removed, more };
}
async function processRequest(uid: string): Promise<void> {
  const ref = db.collection(PRIVACY_REQUESTS).doc(uid);
  const started = performance.now();
  const check = () => { assertWorkerLeadership(); if (performance.now() - started >= 30_000) throw new PrivacyDeadline(); };
  check();
  const generation = await workerTransaction(db, async transaction => {
    check(); const data = (await transaction.get(ref)).data();
    if (data?.status !== "pending" || Number(data.nextAttemptAt ?? 0) > Date.now()) return null;
    const next = Number(data.generation ?? 0) + 1;
    check(); transaction.set(ref, { status: "processing", phase: "cleaning", executorId: OPERATION_EXECUTOR_ID, generation: next,
      attempts: FieldValue.increment(1), lastAttemptAt: FieldValue.serverTimestamp(), deadlineAt: Date.now() + Math.max(0, 30_000 - (performance.now() - started)), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });
  if (generation === null) return;
  const owned = async (transaction: Transaction) => {
    const data = (await transaction.get(ref)).data();
    if (data?.status !== "processing" || data.executorId !== OPERATION_EXECUTOR_ID || data.generation !== generation) throw new PrivacyConflict("Deletion claim changed.");
    return data;
  };
  const write: Write = work => workerTransaction(db, async transaction => {
    check(); await owned(transaction); check(); work(transaction as unknown as Writer);
  });
  try {
    await withFleetLock(null, async () => {
      check(); const identity = await passengerIdentity(uid, true); check();
      await workerTransaction(db, async transaction => {
        const data = await owned(transaction); check();
        if (data.targetCreatedAt && identity && data.targetCreatedAt !== identity) throw new PrivacyConflict("Account identity changed.");
        if (!data.targetCreatedAt && identity) transaction.set(ref, { targetCreatedAt: identity }, { merge: true });
      });
      let more = (await removePassengerManifest(uid, write, check)).more;
      const deletePage = async (query: Query) => {
        check(); const page = await query.limit(BATCH_SIZE).get(); check();
        if (!page.empty) await write(writer => page.docs.forEach(document => writer.delete(document.ref)));
        more ||= page.size === BATCH_SIZE;
      };
      await deletePage(db.collection("feedbacks").where("userId", "==", uid));
      await deletePage(db.collectionGroup("messages").where("senderId", "==", uid));
      await deletePage(db.collectionGroup("messageRateLimits").where("userId", "==", uid));
      if (more) {
        await write(writer => writer.set(ref, { status: "pending", failures: 0, nextAttemptAt: Date.now(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
        return;
      }
      // Fleet Auth mutation paths share this lock. Recheck before irreversible Auth dispatch.
      check(); const current = await passengerIdentity(uid, true); check();
      await workerTransaction(db, async transaction => {
        const data = await owned(transaction); check();
        if (data.targetCreatedAt && current && data.targetCreatedAt !== current) throw new PrivacyConflict("Account identity changed.");
        transaction.set(ref, { phase: "auth_deletion_dispatched" }, { merge: true });
        for (const name of ["users", "feedbackCooldowns", "passenger_requests"]) transaction.delete(db.collection(name).doc(uid));
      });
      check(); await auth.deleteUser(uid).catch((error: any) => {
        if ((error?.code ?? error?.errorInfo?.code) !== "auth/user-not-found") throw error;
      });
      await write(writer => writer.delete(ref));
    }, undefined, null, uid);
  } catch (error) {
    // Raw dependencies settle first; a revoked lease cannot publish retry state.
    await workerTransaction(db, async transaction => {
      const data = await owned(transaction);
      const busy = error instanceof FleetReconciliationBusy;
      const failures = Number(data.failures ?? 0) + (busy ? 0 : 1);
      const permanent = error instanceof PrivacyConflict;
      const delay = busy ? 60_000 : Math.min(60 * 60_000, 60_000 * 2 ** Math.min(failures - 1, 6) * (1 + Math.random() * 0.2));
      transaction.set(ref, { status: permanent || failures >= PRIVACY_FAILURE_LIMIT ? "failed" : "pending", failures,
        nextAttemptAt: Date.now() + delay, lastErrorAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        lastErrorCode: permanent ? "ACCOUNT_INELIGIBLE" : busy ? "FLEET_BUSY" : error instanceof PrivacyDeadline ? "DEPENDENCY_DEADLINE" : "DEPENDENCY_FAILURE" }, { merge: true });
    });
  }
}
/** One 20-record page; due-time filtering never traps the cursor on poison records. */
export async function runPrivacyDeletionQueue(isStopped: () => boolean = () => false): Promise<void> {
  if (draining || isStopped()) return;
  await scanner.run("scan", async () => {
    assertWorkerLeadership(); if (draining || isStopped()) return;
    const checkpoint = db.collection("_reconciliation_cursors").doc("privacy-deletions");
    const cursor = (await checkpoint.get()).data()?.cursor;
    assertWorkerLeadership();
    let query = db.collection(PRIVACY_REQUESTS).where("status", "==", "pending").orderBy(FieldPath.documentId()).limit(20);
    if (typeof cursor === "string" && cursor) query = query.startAfter(cursor);
    const page = await query.get(); assertWorkerLeadership();
    if (draining || isStopped()) return;
    for (const request of page.docs) {
      if (privacyExecutions.has(request.id) || Number(request.data().nextAttemptAt ?? 0) > Date.now()) continue;
      if (!executor.canRun(request.id)) return; // Retain cursor on rejected eligible work.
      privacyExecutions.add(request.id);
      try {
        const raw = executor.run(request.id, async () => {
          assertWorkerLeadership(); if (draining || isStopped()) return;
          await processRequest(request.id);
        });
        void raw.catch(() => { console.warn("[Privacy] Execution stopped; inspect durable recovery state."); }).finally(() => privacyExecutions.delete(request.id));
      } catch { privacyExecutions.delete(request.id); return; }
    }
    await workerTransaction(db, async transaction => {
      if (draining || isStopped()) return;
      transaction.set(checkpoint, { cursor: page.size === 20 ? page.docs.at(-1)!.id : null, updatedAt: FieldValue.serverTimestamp() });
    });
  });
}
export function privacyQueueStatus() { return { execution: executor.snapshot(), scan: scanner.snapshot(), tracked: privacyExecutions.size }; }
export async function drainPrivacyDeletions(stopAdmission = true): Promise<void> {
  if (stopAdmission) draining = true;
  await Promise.allSettled([...scanner.pending()]);
  await Promise.allSettled([...executor.pending()]);
}
export function startPrivacyDeletionWorker(): () => void {
  let stopped = false;
  const run = () => { void runPrivacyDeletionQueue(() => stopped).catch(() => console.warn("[Privacy] Queue scan stopped; the durable cursor is retained.")); };
  run(); const timer = setInterval(run, 60_000); timer.unref();
  return () => { stopped = true; clearInterval(timer); };
}
