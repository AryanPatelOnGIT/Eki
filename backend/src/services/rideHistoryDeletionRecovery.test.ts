import type { Firestore } from "firebase-admin/firestore";
import { expect, it } from "vitest";
import { deleteTerminalRideHistory, RideHistoryConflictError } from "./rideHistoryDeletion";

function store() {
  const state = { parent: true, child: true, projection: true, job: false,
    failChild: false, failJob: false, status: "completed", recursiveCalls: 0 };
  const document = (collectionName: string, id: string) => ({
    id, path: `${collectionName}/${id}`, collectionName,
    async get() { return { exists: collectionName === "ride_sessions" ? state.parent : state.projection,
      data: () => ({ status: state.status }) }; },
    async set() { if (state.failJob) throw new Error("job unavailable"); state.job = true; },
    async delete() { state.job = false; },
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => document(name, id),
      where: () => ({ get: async () => ({ docs: [] }) }) }),
    async recursiveDelete() {
      state.recursiveCalls += 1; state.parent = false;
      if (state.failChild) throw new Error("child delete failed");
      state.child = false;
    },
    batch: () => ({ delete: () => undefined, commit: async () => { state.projection = false; } }),
  } as unknown as Firestore;
  return { db, state };
}

it("finishes manual child/projection deletion on retry after the parent was removed", async () => {
  const { db, state } = store(); state.failChild = true;
  await expect(deleteTerminalRideHistory(db, "old-ride")).rejects.toThrow("child delete failed");
  expect(state).toMatchObject({ parent: false, child: true, projection: true, job: true });
  state.failChild = false;
  await deleteTerminalRideHistory(db, "old-ride");
  expect(state).toMatchObject({ parent: false, child: false, projection: false, job: false, recursiveCalls: 2 });
});

it("keeps manual history intact when its retry reference cannot be committed", async () => {
  const { db, state } = store(); state.failJob = true;
  await expect(deleteTerminalRideHistory(db, "old-ride")).rejects.toThrow("job unavailable");
  expect(state).toMatchObject({ parent: true, child: true, projection: true, recursiveCalls: 0 });
});

it("refuses manual cleanup for an ongoing ride before creating a job", async () => {
  const { db, state } = store(); state.status = "active";
  await expect(deleteTerminalRideHistory(db, "current-ride")).rejects.toBeInstanceOf(RideHistoryConflictError);
  expect(state).toMatchObject({ parent: true, child: true, projection: true, job: false, recursiveCalls: 0 });
});
