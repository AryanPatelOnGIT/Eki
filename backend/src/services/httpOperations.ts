import { metrics, trace } from "@opentelemetry/api";
import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/firebaseAdmin";

export const OPERATION_ID = /^[A-Za-z0-9_-]{16,128}$/;
const running = new Set<Promise<void>>();
const admissions = new Set<Promise<OperationSnapshot>>();
let draining = false;
const meter = metrics.getMeter("eki-backend");
const duration = meter.createHistogram("eki.http.operation.duration", { unit: "s", description: "Operation execution and durable outcome latency." });
const executions = meter.createCounter("eki.http.operation.executions", { description: "Claimed executions; polls and replays do not increment." });
const tracer = trace.getTracer("eki-backend");

export type OperationError = { code: string; error: string; outcomeUnknown?: boolean };
export type OperationOutcome = { result?: unknown; error?: OperationError };
export type OperationSnapshot = {
  operationId: string;
  status: "processing" | "succeeded" | "failed";
  result?: unknown;
  error?: OperationError;
  retryAfterMs?: number;
  outcomeUnknown?: boolean;
};

export class OperationConflict extends Error {}
export class OperationsUnavailable extends Error {}

/** Whitelist the public shape; internal payload hashes/owners/timestamps stay private. */
export function operationSnapshot(id: string, data: Record<string, unknown>): OperationSnapshot {
  const status = data.status === "succeeded" || data.status === "failed" ? data.status : "processing";
  return { operationId: id, status,
    ...(status !== "processing" && data.result !== undefined ? { result: data.result } : {}),
    ...(status === "failed" && data.error ? { error: data.error as OperationError } : {}),
    ...(status === "processing" ? { retryAfterMs: 1_000,
      ...(Number(data.deadlineAt) <= Date.now() ? { outcomeUnknown: true } : {}) } : {}) };
}

/** Claim once across replicas. Ambiguous execution is never automatically repeated. */
async function claimOperation(options: {
  collection: "_route_geometry_previews" | "_fleet_reconciliation_jobs";
  id: string;
  payload: unknown;
  budgetMs: number;
  adminUid?: string;
  execute: () => Promise<OperationOutcome>;
}): Promise<OperationSnapshot> {
  const ref = db.collection(options.collection).doc(options.id);
  const payloadHash = createHash("sha256").update(JSON.stringify(options.payload)).digest("hex");
  const claim = await db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    const data = existing.data();
    if (existing.exists) {
      if (data?.payloadHash !== payloadHash) throw new OperationConflict("Operation key belongs to a different payload.");
      return { created: false, data: data! };
    }
    const dataToStore = { payloadHash, adminUid: options.adminUid ?? null, status: "processing", deadlineAt: Date.now() + options.budgetMs,
      createdAt: FieldValue.serverTimestamp() };
    transaction.create(ref, dataToStore);
    return { created: true, data: dataToStore };
  });
  if (claim.created) {
    // Start only after the durable claim commits. Polls/retries never launch work.
    const execution = Promise.resolve().then(() => tracer.startActiveSpan("http.operation.execute", async span => {
      const started = performance.now();
      const kind = options.collection === "_route_geometry_previews" ? "geometry_preview" : "fleet_reconciliation";
      span.setAttribute("operation.kind", kind);
      executions.add(1, { "operation.kind": kind });
      let outcomeLabel = "unknown";
      try {
        let outcome: OperationOutcome;
        try { outcome = await options.execute(); }
        catch (error) {
          console.error("[Operations] Executor failed:", error);
          outcome = { error: { code: "OPERATION_FAILED", error: "The operation failed; inspect its status before retrying.", outcomeUnknown: true } };
        }
        await ref.set({ status: outcome.error ? "failed" : "succeeded", ...outcome,
          completedAt: FieldValue.serverTimestamp() }, { merge: true });
        outcomeLabel = outcome.error ? "failed" : "succeeded";
      } finally {
        span.setAttribute("operation.outcome", outcomeLabel);
        duration.record((performance.now() - started) / 1_000, { "operation.kind": kind, "operation.outcome": outcomeLabel });
        span.end();
      }
    })).catch(error => {
      // Retain processing on an ambiguous final write. Re-execution could bill
      // twice or revoke tokens again; status exposes the unresolved deadline.
      console.error("[Operations] Could not persist outcome:", error);
    });
    running.add(execution);
    void execution.finally(() => running.delete(execution));
  }
  return operationSnapshot(options.id, claim.data);
}

export function submitOperation(options: Parameters<typeof claimOperation>[0]): Promise<OperationSnapshot> {
  if (draining) return Promise.reject(new OperationsUnavailable("Server is shutting down."));
  const admission = claimOperation(options);
  admissions.add(admission);
  void admission.then(() => admissions.delete(admission), () => admissions.delete(admission));
  return admission;
}

export async function readOperation(collection: string, id: string): Promise<OperationSnapshot | null> {
  const snapshot = await db.collection(collection).doc(id).get();
  return snapshot.exists ? operationSnapshot(id, snapshot.data()!) : null;
}

export async function drainHttpOperations(): Promise<void> {
  draining = true;
  await Promise.allSettled([...admissions]);
  await Promise.allSettled([...running]);
}
