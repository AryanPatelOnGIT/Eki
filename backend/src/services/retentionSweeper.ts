import { assertWorkerLeadership, workerWrite, workerSet, workerDelete } from "../lib/workerFence";
import { FieldPath, Timestamp, type DocumentReference, type Query } from "firebase-admin/firestore";
import { db } from "../lib/firebaseAdmin";
import { deleteTerminalRideHistory } from "./rideHistoryDeletion";
import { firebaseRtdbRetentionStore } from "./firebaseRtdbRetention";
import { runRtdbRetentionSweep } from "./rtdbRetention";

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;
const DELETION_JOBS = "_retention_deletion_jobs";

function readDays(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

async function deleteDocuments(query: Query, recursive = false): Promise<number> {
  let deleted = 0;
  while (true) {
    const snapshot = await query.limit(BATCH_SIZE).get();
    if (snapshot.empty) break;
    if (recursive) {
      for (const document of snapshot.docs) await deleteRideSession(document.ref);
    } else {
      await workerWrite(db, batch => { snapshot.docs.forEach((document) => batch.delete(document.ref)); });
    }
    deleted += snapshot.size;
  }
  return deleted;
}

async function deleteRideSession(sessionRef: DocumentReference): Promise<void> {
  const jobRef = db.collection(DELETION_JOBS).doc(sessionRef.id);
  // recursiveDelete can remove the parent even when a descendant fails. Keep
  // an independent durable reference until every descendant was removed, so
  // the next sweep can retry even when the age query no longer finds a parent.
  await workerSet(db, jobRef, { requestedAt: Timestamp.now() }, { merge: true });
  assertWorkerLeadership();
  await db.recursiveDelete(sessionRef);
  await workerDelete(db, jobRef);
}

async function resumeRideDeletions(): Promise<number> {
  let resumed = 0;
  while (true) {
    const jobs = await db.collection(DELETION_JOBS)
      .orderBy(FieldPath.documentId()).limit(BATCH_SIZE).get();
    if (jobs.empty) return resumed;
    for (const job of jobs.docs) {
      assertWorkerLeadership();
      await db.recursiveDelete(db.collection("ride_sessions").doc(job.id));
      await workerDelete(db, job.ref);
      resumed += 1;
    }
  }
}

async function resumeManualHistoryDeletions(): Promise<number> {
  let resumed = 0;
  while (true) {
    const jobs = await db.collection("_ride_history_deletion_jobs")
      .orderBy(FieldPath.documentId()).limit(BATCH_SIZE).get();
    if (jobs.empty) return resumed;
    for (const job of jobs.docs) {
      await deleteTerminalRideHistory(db, job.id);
      resumed += 1;
    }
  }
}

export function isRetentionSweeperEnabled(
  value: string | undefined,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  const normalized = value?.trim().toLowerCase();
  if (nodeEnv === "production" && normalized !== "true") {
    throw new Error(
      "RETENTION_SWEEPER_ENABLED=true is required in production to enforce the approved data-retention schedule.",
    );
  }
  return normalized === "true";
}

export function assertRetentionConfiguration(
  value: string | undefined,
  nodeEnv = process.env.NODE_ENV,
): void {
  void isRetentionSweeperEnabled(value, nodeEnv);
}

export async function runRetentionSweep(now = Date.now()): Promise<void> {
  const resumedRideDeletions = await resumeRideDeletions();
  const resumedManualHistoryDeletions = await resumeManualHistoryDeletions();
  const rideDays = readDays(process.env.RIDE_SESSION_RETENTION_DAYS, 180);
  const feedbackDays = readDays(process.env.FEEDBACK_RETENTION_DAYS, 180);
  const tripDays = readDays(process.env.COMPLETED_TRIP_RETENTION_DAYS, 180);
  const operationDays = readDays(process.env.OPERATION_LOG_RETENTION_DAYS, 90);

  const [sessions, feedback, trips, fleetOperations, routeSaveOperations, previews, reconciliationJobs, lockRecoveries] = await Promise.all([
    deleteDocuments(
      db.collection("ride_sessions")
        .where("status", "in", ["completed", "failed", "interrupted"])
        .where("endTime", "<", now - rideDays * DAY_MS)
        .orderBy("endTime")
        .orderBy(FieldPath.documentId()),
      true,
    ),
    deleteDocuments(
      db.collection("feedbacks")
        .where("timestamp", "<", Timestamp.fromMillis(now - feedbackDays * DAY_MS))
        .orderBy("timestamp")
        .orderBy(FieldPath.documentId()),
    ),
    deleteDocuments(
      db.collection("completed_trips")
        .where("completedAt", "<", new Date(now - tripDays * DAY_MS).toISOString())
        .orderBy("completedAt")
        .orderBy(FieldPath.documentId()),
    ),
    deleteDocuments(
      db.collection("_fleet_operations")
        .where("createdAt", "<", Timestamp.fromMillis(now - operationDays * DAY_MS))
        .orderBy("createdAt")
        .orderBy(FieldPath.documentId()),
    ),
    deleteDocuments(
      db.collection("_route_save_operations")
        .where("createdAt", "<", Timestamp.fromMillis(now - operationDays * DAY_MS))
        .orderBy("createdAt")
        .orderBy(FieldPath.documentId()),
    ),
    deleteDocuments(
      db.collection("_route_geometry_previews")
        .where("completedAt", "<", Timestamp.fromMillis(now - operationDays * DAY_MS))
        .orderBy("completedAt").orderBy(FieldPath.documentId()),
    ),
    deleteDocuments(
      db.collection("_fleet_reconciliation_jobs")
        .where("completedAt", "<", Timestamp.fromMillis(now - operationDays * DAY_MS))
        .orderBy("completedAt").orderBy(FieldPath.documentId()),
    ),
    deleteDocuments(
      db.collection("_fleet_lock_recoveries")
        .where("recoveredAt", "<", Timestamp.fromMillis(now - operationDays * DAY_MS))
        .orderBy("recoveredAt").orderBy(FieldPath.documentId()),
    ),
  ]);
  console.log("[Retention] Sweep complete", {
    resumedRideDeletions,
    resumedManualHistoryDeletions,
    sessions,
    feedback,
    trips,
    fleetOperations,
    routeSaveOperations, previews, reconciliationJobs, lockRecoveries,
  });
  const rtdbSummary = await runRtdbRetentionSweep(firebaseRtdbRetentionStore(), {
    now,
    dryRun: false,
    legacyRetired: process.env.LEGACY_RTDB_RETIRED === "true",
  });
  console.log("[Retention] RTDB sweep complete", rtdbSummary);
}

export function startRetentionSweeper(): () => void {
  // Development/test remain non-destructive by default. Production is
  // validated before the HTTP listener starts and cannot run with retention
  // omitted or disabled.
  if (!isRetentionSweeperEnabled(process.env.RETENTION_SWEEPER_ENABLED)) {
    console.log("[Retention] Sweeper disabled (set RETENTION_SWEEPER_ENABLED=true to enable)." );
    return () => undefined;
  }
  void runRetentionSweep().catch((error) => {
    console.error("[Retention] Initial sweep failed:", error);
  });
  const timer = setInterval(() => {
    void runRetentionSweep().catch((error) => {
      console.error("[Retention] Scheduled sweep failed:", error);
    });
  }, DAY_MS);
  timer.unref();
  return () => clearInterval(timer);
}
