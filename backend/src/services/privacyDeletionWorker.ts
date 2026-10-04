import { assertWorkerLeadership, workerWrite, workerSet, workerDelete } from "../lib/workerFence";
import { FieldPath, FieldValue, type Query } from "firebase-admin/firestore";
import { auth, db } from "../lib/firebaseAdmin";

const BATCH_SIZE = 200;

async function deleteQuery(
  query: Query,
): Promise<number> {
  let count = 0;
  while (true) {
    const snapshot = await query.limit(BATCH_SIZE).get();
    if (snapshot.empty) return count;
    await workerWrite(db, batch => { snapshot.docs.forEach((document) => batch.delete(document.ref)); });
    count += snapshot.size;
  }
}

/** Removes one passenger from every ride manifest, including legacy documents. */
export async function removePassengerManifest(uid: string): Promise<number> {
  const removeFrom = async (query: Query): Promise<number> => {
    let removed = 0;
    while (true) {
      const sessions = await query.limit(BATCH_SIZE).get();
      if (sessions.empty) return removed;
      await workerWrite(db, batch => {
        sessions.docs.forEach((session) => {
          batch.update(session.ref, {
            passengerIds: FieldValue.arrayRemove(uid),
          });
          batch.update(session.ref, new FieldPath("passengers", uid), FieldValue.delete());
        });
      });
      removed += sessions.size;
    }
  };

  // passengerIds is the efficient path for newly-written sessions. Keep the
  // old, dynamic membership query during the migration window: historic
  // sessions do not yet have passengerIds, and privacy deletion must never
  // silently leave their manifest data behind.
  const indexed = db.collection("ride_sessions")
    .where("passengerIds", "array-contains", uid);
  const legacy = db.collection("ride_sessions")
    .where(new FieldPath("passengers", uid, "userId"), "==", uid);

  return (await removeFrom(indexed)) + (await removeFrom(legacy));
}

async function processDeletion(uid: string): Promise<void> {
  await Promise.all([
    removePassengerManifest(uid),
    deleteQuery(db.collection("feedbacks").where("userId", "==", uid)),
    deleteQuery(db.collectionGroup("messages").where("senderId", "==", uid)),
    deleteQuery(db.collectionGroup("messageRateLimits").where("userId", "==", uid)),
  ]);

  await workerWrite(db, batch => {
    batch.delete(db.collection("users").doc(uid));
    batch.delete(db.collection("feedbackCooldowns").doc(uid));
    batch.delete(db.collection("passenger_requests").doc(uid));
  });
  assertWorkerLeadership();
  await auth.deleteUser(uid).catch((error: any) => {
    if (error?.errorInfo?.code !== "auth/user-not-found") throw error;
  });
  await workerDelete(db, db.collection("_privacy_deletion_requests").doc(uid));
}

async function runPrivacyDeletionQueue(): Promise<void> {
  const requests = await db.collection("_privacy_deletion_requests")
    .where("status", "==", "pending")
    .limit(20)
    .get();
  for (const request of requests.docs) {
    assertWorkerLeadership();
    try {
      await workerSet(db, request.ref, {
        attempts: FieldValue.increment(1),
        lastAttemptAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await processDeletion(request.id);
      console.log("[Privacy] Completed one account deletion request.");
    } catch (error) {
      console.error("[Privacy] Account deletion attempt failed:", error);
      await workerSet(db, request.ref, {
        lastErrorAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
}

export function startPrivacyDeletionWorker(): () => void {
  void runPrivacyDeletionQueue().catch((error) => {
    console.error("[Privacy] Initial deletion queue run failed:", error);
  });
  const timer = setInterval(() => {
    void runPrivacyDeletionQueue().catch((error) => {
      console.error("[Privacy] Deletion queue run failed:", error);
    });
  }, 60 * 60 * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
