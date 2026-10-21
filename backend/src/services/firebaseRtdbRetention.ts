import { workerTransaction, workerRtdbTransaction, workerDelete } from "../lib/workerFence";
import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { db, rtdb } from "../lib/firebaseAdmin";
import { retentionFingerprint, type RtdbRetentionStore } from "./rtdbRetention";

const INVENTORY = "_rtdb_retention_inventory";
const PAGE_SIZE = 25;
const inventoryRef = (path: string) => db.collection(INVENTORY).doc(createHash("sha256").update(path).digest("hex"));

export function firebaseRtdbRetentionStore(): RtdbRetentionStore {
  return {
    async *entries(path) {
      let cursor: string | null = null;
      while (true) {
        let query = rtdb.ref(path).orderByKey();
        if (cursor !== null) query = query.startAfter(cursor);
        const snapshot = await query.limitToFirst(PAGE_SIZE).once("value");
        const entries: { key: string; value: unknown }[] = [];
        snapshot.forEach(child => { entries.push({ key: child.key!, value: child.val() }); });
        for (const entry of entries) yield entry;
        if (entries.length < PAGE_SIZE) break;
        cursor = entries[entries.length - 1].key;
      }
    },
    async read(path) { return (await rtdb.ref(path).once("value")).val(); },
    async observe(path, fingerprint, now, dryRun) {
      const ref = inventoryRef(path);
      const observedAt = (data: FirebaseFirestore.DocumentData | undefined): number =>
        data?.fingerprint === fingerprint && Number.isSafeInteger(data.firstSeenAt)
          ? data.firstSeenAt : now;
      if (dryRun) return observedAt((await ref.get()).data());
      return workerTransaction(db, async transaction => {
        const firstSeenAt = observedAt((await transaction.get(ref)).data());
        transaction.set(ref, { path, fingerprint, firstSeenAt });
        return firstSeenAt;
      });
    },
    async removeIfUnchanged(path, fingerprint) {
      const outcome = await workerRtdbTransaction(rtdb.ref(path), current => {
        if (current === null || retentionFingerprint(current) !== fingerprint) return;
        return null;
      });
      return outcome.committed;
    },
    async forget(path) { await workerDelete(db, inventoryRef(path)); },
    async cleanOrphans(dryRun) {
      let cursor: string | null = null;
      while (true) {
        let query = db.collection(INVENTORY).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
        if (cursor !== null) query = query.startAfter(cursor);
        const snapshot = await query.get();
        for (const doc of snapshot.docs) {
          const path = doc.data().path;
          if (typeof path !== "string" || !/^(users|messages|activeRouteGeometry)\/[^/]+(\/[^/]+)?$/.test(path)) continue;
          if (!dryRun && !(await rtdb.ref(path).once("value")).exists()) await workerDelete(db, doc.ref);
        }
        if (snapshot.size < PAGE_SIZE) break;
        cursor = snapshot.docs[snapshot.docs.length - 1].id;
      }
    },
  };
}
