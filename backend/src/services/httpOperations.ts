import { metrics, trace } from "@opentelemetry/api";
import { createHash, randomUUID } from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/firebaseAdmin";
import { BoundedKeyedExecutor } from "../lib/boundedKeyedExecutor";
import { createBoundedSingleFlight } from "../lib/boundedSingleFlight";

export const OPERATION_ID = /^[A-Za-z0-9_-]{16,128}$/;
export const OPERATION_EXECUTOR_ID = randomUUID();
const executor = new BoundedKeyedExecutor<string>({ maxConcurrent: 2, maxPending: 8, maxPendingPerKey: 1, maxQueueAgeMs: 2_000 });
const fills = createBoundedSingleFlight<OperationSnapshot>({ maxFills: 16, maxWaitersPerFill: 32, responseMs: 3_000 });
const controls = createBoundedSingleFlight<unknown>({ maxFills: 16, maxWaitersPerFill: 32, responseMs: 3_000 });
const fleetLockOwners = new Set<string>();
const running = new Set<Promise<unknown>>();
const admissions = new Set<Promise<OperationSnapshot>>();
const localExecutions = new Set<string>();
let draining = false;
const meter = metrics.getMeter("eki-backend");
const duration = meter.createHistogram("eki.http.operation.duration", { unit: "s", description: "Operation execution and durable outcome latency." });
const executions = meter.createCounter("eki.http.operation.executions", { description: "Claimed executions; polls and replays do not increment." });
const tracer = trace.getTracer("eki-backend");

export type OperationCollection = "_route_geometry_previews" | "_fleet_reconciliation_jobs";
export type OperationError = { code: string; error: string; outcomeUnknown?: boolean };
export type OperationOutcome = { result?: unknown; error?: OperationError };
export type OperationProgress = { phase: "claimed" | "executing" | "locking" | "authorizing"; checked?: number; repaired?: number; failed?: number; batchDriverIds?: string[]; cursor?: string };
export type OperationSnapshot = {
  operationId: string; status: "processing" | "succeeded" | "failed";
  result?: unknown; error?: OperationError; retryAfterMs?: number; outcomeUnknown?: boolean;
  progress?: OperationProgress;
  recovery?: { required: true; executorId: string; generation: number; requiresStoppedExecutor: true };
};
export type OperationExecutionContext = {
  assertActive: () => void;
  checkpoint: (progress: OperationProgress) => Promise<void>;
};
export class OperationConflict extends Error {}
export class OperationsUnavailable extends Error {}
export class OperationRecoveryConflict extends Error {}

const keyFor = (collection: string, id: string) => `${collection}/${id}`;
export function operationIsLocallyExecuting(collection: string, id: string) { return localExecutions.has(keyFor(collection, id)); }
export function getHttpOperationExecutionStatus() { return { execution: executor.snapshot(), admissions: fills.snapshot(), controls: controls.snapshot() }; }
export function trackFleetLock(owner: string) {
  fleetLockOwners.add(owner);
  return () => fleetLockOwners.delete(owner);
}
async function control<T>(key: string, work: (isCurrent: () => boolean) => Promise<T>): Promise<T> {
  if (draining) throw new OperationsUnavailable("Server is shutting down.");
  return controls.run(key, key, isCurrent => {
    const raw = work(isCurrent); running.add(raw);
    void raw.then(() => running.delete(raw), () => running.delete(raw));
    return raw;
  }) as Promise<T>;
}
const generationOf = (data: Record<string, unknown>) => Number.isSafeInteger(data.generation) && Number(data.generation) > 0 ? Number(data.generation) : 0;
const executorOf = (data: Record<string, unknown>) => typeof data.executorId === "string" ? data.executorId : "legacy";
const expired = (data: Record<string, unknown>) => !Number.isFinite(Number(data.deadlineAt)) || Number(data.deadlineAt) <= Date.now();

/** Fixed admin-facing shape; payloads, Auth UIDs, hashes and stacks stay private. */
export function operationSnapshot(id: string, data: Record<string, unknown>): OperationSnapshot {
  const status = data.status === "succeeded" || data.status === "failed" ? data.status : "processing";
  const recovery = status === "processing" && (data.phase === "recovery_required" || expired(data));
  const raw = data.progress as Record<string, unknown> | undefined;
  const phases = ["claimed", "executing", "locking", "authorizing"];
  const progress = raw && phases.includes(String(raw.phase)) ? {
    phase: raw.phase as OperationProgress["phase"],
    ...(typeof raw.cursor === "string" && /^(?:|[A-Za-z0-9_-]{1,128})$/.test(raw.cursor) ? { cursor: raw.cursor } : {}),
    ...Object.fromEntries(["checked", "repaired", "failed"].filter(key => Number.isSafeInteger(raw[key]) && Number(raw[key]) >= 0).map(key => [key, raw[key]])),
    ...(Array.isArray(raw.batchDriverIds) ? { batchDriverIds: raw.batchDriverIds.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id)).slice(0, 10) } : {}),
  } : undefined;
  return { operationId: id, status,
    ...(status !== "processing" && data.result !== undefined ? { result: data.result } : {}),
    ...(status === "failed" && data.error ? { error: data.error as OperationError } : {}),
    ...(progress ? { progress } : {}),
    ...(status === "processing" ? { retryAfterMs: 1_000 } : {}),
    ...(recovery ? { outcomeUnknown: true, recovery: { required: true as const,
      executorId: executorOf(data), generation: generationOf(data), requiresStoppedExecutor: true as const } } : {}) };
}

/** All outcome/checkpoint writes conflict with an operator recovery generation. */
async function writeOwned(collection: OperationCollection, id: string, generation: number, patch: Record<string, unknown>) {
  const ref = db.collection(collection).doc(id);
  await db.runTransaction(async transaction => {
    const record = await transaction.get(ref); const data = record.data();
    if (!record.exists || data?.status !== "processing" || data.executorId !== OPERATION_EXECUTOR_ID || generationOf(data) !== generation) {
      throw new OperationRecoveryConflict("Operation authority has changed.");
    }
    transaction.set(ref, patch, { merge: true });
  });
}

type Submission = {
  collection: OperationCollection; id: string; payload: unknown; budgetMs: number; adminUid?: string;
  execute: (context: OperationExecutionContext) => Promise<OperationOutcome>;
};

async function admitOperation(options: Submission, isCurrent: () => boolean): Promise<OperationSnapshot> {
  const ref = db.collection(options.collection).doc(options.id);
  const payloadHash = createHash("sha256").update(JSON.stringify(options.payload)).digest("hex");
  // Replays read durable state without waiting behind the original executor.
  const existing = await ref.get();
  if (existing.exists) {
    if (existing.data()?.payloadHash !== payloadHash) throw new OperationConflict("Operation key belongs to a different payload.");
    return operationSnapshot(options.id, existing.data()!);
  }
  if (!isCurrent()) throw new OperationsUnavailable("Operation admission expired before claim.");
  let resolve!: (snapshot: OperationSnapshot) => void; let reject!: (error: unknown) => void;
  const announced = new Promise<OperationSnapshot>((done, fail) => { resolve = done; reject = fail; });
  const key = keyFor(options.collection, options.id);
  const execution = executor.run(key, async () => {
    if (!isCurrent()) throw new OperationsUnavailable("Operation admission expired before claim.");
    const claim = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref); const data = snapshot.data();
      if (snapshot.exists) {
        if (data?.payloadHash !== payloadHash) throw new OperationConflict("Operation key belongs to a different payload.");
        return { created: false, data: data! };
      }
      if (!isCurrent()) throw new OperationsUnavailable("Admission expired before durable claim dispatch.");
      const dataToStore = { payloadHash, adminUid: options.adminUid ?? null, status: "processing", phase: "claimed",
        progress: { phase: "claimed" }, executorId: OPERATION_EXECUTOR_ID, generation: 1,
        deadlineAt: Date.now() + options.budgetMs, createdAt: FieldValue.serverTimestamp() };
      transaction.create(ref, dataToStore); return { created: true, data: dataToStore };
    });
    if (!claim.created) { resolve(operationSnapshot(options.id, claim.data)); return; }
    localExecutions.add(key);
    const started = performance.now(); const expiresAt = started + options.budgetMs;
    const context: OperationExecutionContext = {
      assertActive: () => { if (performance.now() >= expiresAt) throw new OperationsUnavailable("Operation execution budget expired."); },
      checkpoint: async progress => {
        context.assertActive();
        await writeOwned(options.collection, options.id, 1, { phase: progress.phase, progress, progressAt: FieldValue.serverTimestamp() });
        context.assertActive();
      },
    };
    try {
      if (!isCurrent()) {
        // A late claim acknowledgement cannot launch new side effects.
        await writeOwned(options.collection, options.id, 1, { status: "failed", phase: "not_started",
          error: { code: "OPERATION_ADMISSION_EXPIRED", error: "Admission expired before external work started." }, completedAt: FieldValue.serverTimestamp() });
        reject(new OperationsUnavailable("Operation admission expired.")); return;
      }
      resolve(operationSnapshot(options.id, claim.data));
      await tracer.startActiveSpan("http.operation.execute", async span => {
        const kind = options.collection === "_route_geometry_previews" ? "geometry_preview" : "fleet_reconciliation";
        span.setAttribute("operation.kind", kind); executions.add(1, { "operation.kind": kind });
        let outcomeLabel = "unknown";
        try {
          let outcome: OperationOutcome;
          try { await context.checkpoint({ phase: "executing" }); outcome = await options.execute(context); }
          catch (error) {
            console.error("[Operations] Executor failed:", error);
            outcome = { error: { code: "OPERATION_FAILED", error: "Inspect the operation and recovery status before retrying.", outcomeUnknown: true } };
          }
          await writeOwned(options.collection, options.id, 1, { status: outcome.error ? "failed" : "succeeded", phase: "completed",
            ...outcome, completedAt: FieldValue.serverTimestamp() });
          outcomeLabel = outcome.error ? "failed" : "succeeded";
        } finally {
          span.setAttribute("operation.outcome", outcomeLabel);
          duration.record((performance.now() - started) / 1_000, { "operation.kind": kind, "operation.outcome": outcomeLabel }); span.end();
        }
      });
    } finally { localExecutions.delete(key); }
  });
  running.add(execution);
  void execution.then(() => running.delete(execution), error => {
    running.delete(execution); reject(error);
    // A final acknowledgement can be unknown. Preserve its recoverable claim.
    console.error("[Operations] Claim/execution outcome could not be persisted:", error);
  });
  return announced;
}

export function submitOperation(options: Submission): Promise<OperationSnapshot> {
  if (draining) return Promise.reject(new OperationsUnavailable("Server is shutting down."));
  const hash = createHash("sha256").update(JSON.stringify(options.payload)).digest("hex");
  const admission = fills.run(`${keyFor(options.collection, options.id)}:${hash}`, keyFor(options.collection, options.id),
    isCurrent => {
      const raw = admitOperation(options, isCurrent);
      running.add(raw);
      void raw.then(() => running.delete(raw), () => running.delete(raw));
      return raw;
    });
  admissions.add(admission);
  void admission.then(() => admissions.delete(admission), () => admissions.delete(admission));
  return admission;
}

async function readRawOperation(collection: string, id: string): Promise<OperationSnapshot | null> {
  const ref = db.collection(collection).doc(id);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref); if (!snapshot.exists) return null;
    const data = snapshot.data()!;
    if (data.status === "processing" && expired(data) && data.phase !== "recovery_required" && !operationIsLocallyExecuting(collection, id)) {
      transaction.set(ref, { phase: "recovery_required", recoveryDetectedAt: FieldValue.serverTimestamp() }, { merge: true });
      data.phase = "recovery_required";
    }
    return operationSnapshot(id, data);
  });
}
export async function readOperation(collection: string, id: string): Promise<OperationSnapshot | null> {
  return control(`read:${collection}/${id}`, () => readRawOperation(collection, id));
}
export async function listRecoverableOperations(collection: OperationCollection, cursor?: string): Promise<{ operations: OperationSnapshot[]; nextCursor: string | null }> {
  return control(`list:${collection}:${cursor ?? ""}`, async () => {
    let query = db.collection(collection).where("status", "==", "processing").orderBy(FieldPath.documentId()).limit(25);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    // One bounded query per page. Selected status reads persist classification;
    // discovery never multiplies per-record reads/writes under latency.
    return { operations: page.docs.map(record => operationSnapshot(record.id, record.data())),
      nextCursor: page.size === 25 ? page.docs.at(-1)!.id : null };
  });
}

/** Abandon unknown work only after a stopped-executor attestation; never replay it. */
export async function recoverOperation(options: {
  collection: OperationCollection; id: string; expectedExecutorId: string; expectedGeneration: number;
  executorStopped: true; adminUid: string;
}): Promise<OperationSnapshot> {
  if (options.executorStopped !== true || !options.adminUid || !Number.isSafeInteger(options.expectedGeneration) || options.expectedGeneration < 0) {
    throw new OperationRecoveryConflict("A stopped-executor confirmation and current recovery identity are required.");
  }
  const key = keyFor(options.collection, options.id);
  if (localExecutions.has(key)) throw new OperationRecoveryConflict("This executor still has unsettled operation work.");
  const ref = db.collection(options.collection).doc(options.id);
  return control(`recover:${key}:${options.expectedExecutorId}:${options.expectedGeneration}`, isCurrent => db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref); const data = snapshot.data();
    if (!snapshot.exists || !data || data.status !== "processing" || !expired(data) ||
      executorOf(data) !== options.expectedExecutorId || generationOf(data) !== options.expectedGeneration) {
      throw new OperationRecoveryConflict("Operation recovery state changed or is not eligible.");
    }
    const next = { status: "failed", phase: "recovered", generation: generationOf(data) + 1,
      error: { code: "OPERATION_ABANDONED_AFTER_EXECUTOR_STOP", error: "Prior execution has an unknown outcome; audit effects before a deliberate new-key submission.", outcomeUnknown: true },
      recoveredBy: options.adminUid, executorStopped: options.executorStopped, recoveredAt: FieldValue.serverTimestamp(), completedAt: FieldValue.serverTimestamp() };
    if (!isCurrent() || localExecutions.has(key)) throw new OperationRecoveryConflict("Recovery request expired or the executor is still active.");
    transaction.set(ref, next, { merge: true });
    return operationSnapshot(options.id, { ...data, ...next });
  }));
}

export type FleetLockSnapshot = { owner: string; executorId: string; operationId: string | null; auditOperationId?: string };
export async function readFleetLock(): Promise<FleetLockSnapshot | null> {
  return control("read:fleet-lock", async () => {
    const snapshot = await db.collection("_fleet_reconciliation_locks").doc("singleton").get();
    if (!snapshot.exists) return null;
    const data = snapshot.data()!;
    return { owner: String(data.owner), executorId: executorOf(data), operationId: typeof data.operationId === "string" ? data.operationId : null,
      ...(typeof data.auditOperationId === "string" ? { auditOperationId: data.auditOperationId } : {}) };
  });
}
export async function recoverFleetLock(options: { expectedOwner: string; executorStopped: true; adminUid: string }): Promise<{ recovered: true }> {
  if (!options.adminUid || options.executorStopped !== true || !options.expectedOwner || fleetLockOwners.has(options.expectedOwner)) {
    throw new OperationRecoveryConflict("A stopped executor and current lock identity are required; local work must settle.");
  }
  return control(`recover:fleet-lock:${options.expectedOwner}`, isCurrent => db.runTransaction(async transaction => {
    const ref = db.collection("_fleet_reconciliation_locks").doc("singleton");
    const snapshot = await transaction.get(ref); const data = snapshot.data();
    if (!snapshot.exists || data?.owner !== options.expectedOwner) throw new OperationRecoveryConflict("Fleet lock identity has changed.");
    // Linked operations must be classified/abandoned first, preserving unknown effects.
    let linkedOperationStatus: string | null = null;
    if (typeof data.operationId === "string") {
      const job = await transaction.get(db.collection("_fleet_reconciliation_jobs").doc(data.operationId));
      linkedOperationStatus = job.exists ? String(job.data()?.status) : "missing";
      if ((job.exists && !["succeeded", "failed"].includes(String(job.data()?.status))) || operationIsLocallyExecuting("_fleet_reconciliation_jobs", data.operationId)) {
        throw new OperationRecoveryConflict("Recover the linked operation before releasing its lock.");
      }
    }
    if (!isCurrent() || fleetLockOwners.has(options.expectedOwner)) throw new OperationRecoveryConflict("Recovery expired or local work is still active.");
    transaction.create(db.collection("_fleet_lock_recoveries").doc(randomUUID()), {
      owner: data.owner, executorId: executorOf(data), operationId: data.operationId ?? null, linkedOperationStatus, auditOperationId: data.auditOperationId ?? null,
      recoveredBy: options.adminUid, executorStopped: true, recoveredAt: FieldValue.serverTimestamp(),
    });
    transaction.delete(ref); return { recovered: true as const };
  }));
}

export async function drainHttpOperations(): Promise<void> {
  draining = true;
  await Promise.allSettled([...admissions]);
  await Promise.allSettled([...running]);
}
