import { FieldPath, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { auth, db, rtdb } from "./lib/firebaseAdmin";
import { publishUserAuthorization } from "./services/userAuthorization";
import { settleTogether } from "./lib/reconciliationPages";
import { withFleetLock } from "./services/fleetMutationLock";

const roles = new Set(["passenger", "driver", "admin"]);
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PAGE_SIZE = 100;
const CONCURRENCY = 8;

async function syncUser(uid: string): Promise<boolean> {
  // Pagination discovers identities only. Roles must be re-read under the lock.
  const user = await db.collection("users").doc(uid).get();
  const role = user.data()?.role;
  if (typeof role !== "string" || !roles.has(role)) {
    console.warn(`Skipping ${uid}: invalid role.`);
    return false;
  }

  try {
    const existingClaims = (await auth.getUser(uid)).customClaims ?? {};
    const previousDriverId =
      typeof existingClaims.driverId === "string" ? existingClaims.driverId : null;
    const preservedClaims = { ...existingClaims };
    delete preservedClaims.admin;
    delete preservedClaims.role;
    delete preservedClaims.driverId;
    delete preservedClaims.assignedBusId;

    const driverAssignment = role === "driver"
      ? await db.collection("drivers").where("authUid", "==", uid).limit(2).get()
      : null;
    if (role === "driver" && driverAssignment?.size !== 1) {
      await publishUserAuthorization(uid, { ...preservedClaims, role: "driver" });
      await settleTogether(
        [...new Set([uid, previousDriverId].filter(Boolean))]
          .map((driverId) => rtdb.ref(`driverRouteAssignments/${driverId}`).remove()),
      );
      throw new Error("Driver must have exactly one authUid assignment.");
    }

    const driver = driverAssignment?.docs[0];
    const assignedBusId = driver?.data().assignedBusId ?? null;
    let routeAssignments: Record<string, true> | undefined;
    if (role === "driver" && assignedBusId !== null) {
      if (typeof assignedBusId !== "string" || !SAFE_ID.test(assignedBusId)) {
        throw new Error("Driver has no valid bus assignment.");
      }
      const bus = await db.collection("buses").doc(assignedBusId).get();
      const busData = bus.data();
      const routeIds = Array.isArray(busData?.assignedRoutes)
        ? busData.assignedRoutes
        : typeof busData?.assignedRouteId === "string"
          ? [busData.assignedRouteId]
          : [];
      const validRouteIds = routeIds.filter(
        (routeId): routeId is string => typeof routeId === "string" && SAFE_ID.test(routeId),
      );
      if (!bus.exists || validRouteIds.length === 0) {
        throw new Error(`Assigned bus ${assignedBusId} has no valid routes.`);
      }
      routeAssignments = Object.fromEntries(validRouteIds.map((routeId) => [routeId, true]));
    }

    await publishUserAuthorization(uid, {
      ...preservedClaims,
      role,
      ...(role === "admin" ? { admin: true } : {}),
      ...(role === "driver" && assignedBusId !== null ? {
        driverId: driver!.id,
        assignedBusId,
      } : {}),
    });

    if (role === "driver" && routeAssignments) {
      await rtdb.ref(`driverRouteAssignments/${driver!.id}`).set({
        [assignedBusId as string]: routeAssignments,
      });
      if (previousDriverId && previousDriverId !== driver!.id) {
        await rtdb.ref(`driverRouteAssignments/${previousDriverId}`).remove();
      }
    } else {
      await settleTogether(
        [...new Set([uid, previousDriverId, driver?.id].filter(Boolean))]
          .map((driverId) => rtdb.ref(`driverRouteAssignments/${driverId}`).remove()),
      );
    }
    return true;
  } catch (error: any) {
    if (error?.errorInfo?.code === "auth/user-not-found") {
      console.warn(`Skipping ${uid}: Auth account not found.`);
    } else {
      console.error(`Error syncing ${uid}:`, error);
    }
    return false;
  }
}

/** Hold the fleet mutex until all publishers and mirror writes have settled. */
export async function syncRoleClaimsChunk(uids: string[]): Promise<boolean[]> {
  return withFleetLock(null, async () => {
    const outcomes = await Promise.allSettled(uids.map(syncUser));
    // A failed profile read must not release the lock while sibling Auth writes run.
    return outcomes.map(outcome => {
      if (outcome.status === "fulfilled") return outcome.value;
      console.error("Error reading user for role synchronization:", outcome.reason);
      return false;
    });
  });
}

async function syncRoleClaims() {
  let lastDocument: QueryDocumentSnapshot | undefined;
  let updated = 0;
  let failed = 0;

  while (true) {
    let query = db.collection("users")
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastDocument) query = query.startAfter(lastDocument);
    const page = await query.get();
    if (page.empty) break;

    for (let offset = 0; offset < page.docs.length; offset += CONCURRENCY) {
      const chunk = page.docs.slice(offset, offset + CONCURRENCY);
      const results = await syncRoleClaimsChunk(chunk.map(user => user.id));
      results.forEach((success) => success ? updated += 1 : failed += 1);
    }
    lastDocument = page.docs.at(-1);
    console.log(`Checkpoint: ${lastDocument?.id} (${updated} updated, ${failed} failed).`);
    if (page.size < PAGE_SIZE) break;
  }

  console.log(`Synchronized ${updated} users; ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  syncRoleClaims()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((error) => {
      console.error("Failed to synchronize role claims:", error);
      process.exit(1);
    });
}
