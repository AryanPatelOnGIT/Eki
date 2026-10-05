import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../lib/firebaseAdmin";
import { workerTransaction } from "../lib/workerFence";
import { OPERATION_EXECUTOR_ID, trackFleetLock, type OperationExecutionContext } from "./httpOperations";

export class FleetReconciliationBusy extends Error {}
/** No expiry takeover; every fleet Auth-changing path shares the same durable mutex. */
export async function withFleetLock<T>(operationId: string | null, work: () => Promise<T>, context?: OperationExecutionContext, auditOperationId: string | null = null, privacyRequestId: string | null = null): Promise<T> {
  const lockRef = db.collection("_fleet_reconciliation_locks").doc("singleton");
  const owner = randomUUID(); const untrack = trackFleetLock(owner);
  try {
    await context?.checkpoint({ phase: "locking" });
    await workerTransaction(db, async transaction => {
      context?.assertActive(); const lock = await transaction.get(lockRef);
      if (lock.exists) throw new FleetReconciliationBusy("Fleet authorization is running or awaiting stopped-executor recovery.");
      context?.assertActive();
      transaction.create(lockRef, { owner, operationId, auditOperationId, privacyRequestId, executorId: OPERATION_EXECUTOR_ID, createdAt: FieldValue.serverTimestamp() });
    });
    try { return await work(); }
    finally {
      await db.runTransaction(async transaction => {
        const lock = await transaction.get(lockRef);
        if (lock.data()?.owner === owner) transaction.delete(lockRef);
      });
    }
  } finally { untrack(); }
}
