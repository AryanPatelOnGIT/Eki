import { randomUUID } from "node:crypto";
import { auth, db, rtdb } from "../lib/firebaseAdmin";

const COLLECTION = "_userAuthorization";

async function settle(writes: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(writes);
  const failure = results.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

function authorizationFor(claims: Record<string, unknown>) {
  return {
    version: claims.authorizationVersion,
    role: claims.role,
    driverId: claims.driverId ?? null,
    assignedBusId: claims.assignedBusId ?? null,
  };
}

/** Missing migration state and interrupted publications require repair. */
export async function authorizationIsCurrent(uid: string, claims: Record<string, unknown>): Promise<boolean> {
  if (typeof claims.authorizationVersion !== "string") return false;
  const [document, mirror] = await Promise.all([
    db.collection(COLLECTION).doc(uid).get(),
    rtdb.ref(`${COLLECTION}/${uid}`).once("value"),
  ]);
  const expected = authorizationFor(claims);
  return [document.data(), mirror.val()].every(record => record &&
    Object.entries(expected).every(([key, value]) => record[key] === value ||
      (value === null && record[key] === undefined))); // RTDB omits null children.
}

/**
 * Callers must hold the durable fleet mutex from authoritative reads through
 * publication and assignment-mirror writes. Version predicates alone cannot
 * serialize the initial invalidation or Auth writes.
 * Rotate before changing claims. A fresh version prevents old tokens from
 * regaining privilege after a repeated demotion/promotion or reassignment.
 * There is no cross-product transaction: deny both first, settle all writes,
 * then publish. Failed activation is rolled back to blocked state. Conditional
 * activation/rollback cannot overwrite a newer concurrent authorization change.
 */
export async function publishUserAuthorization(uid: string, claims: Record<string, unknown>): Promise<void> {
  const version = randomUUID();
  const document = db.collection(COLLECTION).doc(uid);
  const mirror = rtdb.ref(`${COLLECTION}/${uid}`);
  const blocked = { version, role: "blocked", driverId: null, assignedBusId: null };
  await settle([document.set(blocked), mirror.set(blocked)]);
  const nextClaims = { ...claims, authorizationVersion: version };
  // Revoke before exposing the new version in claims: an old refresh session
  // must not mint a token with the version that will be activated below.
  await auth.revokeRefreshTokens(uid);
  await auth.setCustomUserClaims(uid, nextClaims);
  const desired = authorizationFor(nextClaims);
  async function updateDocument(value: typeof blocked | typeof desired) {
    await db.runTransaction(async transaction => {
      const current = await transaction.get(document);
      if (current.data()?.version !== version) throw new Error("Authorization publication was superseded.");
      transaction.set(document, value);
    });
  }
  async function updateMirror(value: typeof blocked | typeof desired) {
    // RTDB first evaluates against its local cache, which can be null even
    // after set() succeeds. Propose only BLOCKED state for null: the server
    // retries against its actual value. A genuinely deleted record must never
    // recreate a grant from this stale publisher.
    const result = await mirror.transaction(current => current === null
      ? blocked : current?.version === version ? value : undefined);
    if (!result.committed || result.snapshot.val()?.role !== value.role || result.snapshot.val()?.version !== version) {
      throw new Error("Authorization publication was superseded.");
    }
  }
  try {
    await settle([updateDocument(desired), updateMirror(desired)]);
  } catch (error) {
    // A rollback failure remains a failed operation, never a successful
    // offboarding response. Each surviving record has the new version, so old
    // tokens remain denied even if one product is temporarily unavailable.
    await Promise.allSettled([updateDocument(blocked), updateMirror(blocked)]);
    throw error;
  }
}
