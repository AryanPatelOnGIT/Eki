import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  jobs: new Set<string>(),
  manualJobs: new Set<string>(),
  resumedManual: [] as string[],
  parents: new Set<string>(),
  children: new Set<string>(),
  failDescendant: false,
  failJobWrite: false,
  deletions: [] as string[],
}));

vi.mock("./rideHistoryDeletion", () => ({
  async deleteTerminalRideHistory(_db: unknown, sessionId: string) {
    state.resumedManual.push(sessionId);
    state.manualJobs.delete(sessionId);
  },
}));

vi.mock("../lib/firebaseAdmin", () => {
  const document = (collectionName: string, id: string) => ({
    id, collectionName,
    async set() {
      if (state.failJobWrite) throw new Error("job store unavailable");
      state.jobs.add(id);
    },
    async delete() { state.jobs.delete(id); },
  });
  return { db: {
    collection: (name: string) => {
      const query = {
        doc: (id: string) => document(name, id),
        where: () => query, orderBy: () => query, limit: () => query,
        async get() {
          const ids = name === "_retention_deletion_jobs" ? state.jobs
            : name === "_ride_history_deletion_jobs" ? state.manualJobs
            : name === "ride_sessions" ? state.parents : new Set<string>();
          return { empty: ids.size === 0, size: ids.size,
            docs: [...ids].map(id => ({ id, ref: document(name, id) })) };
        },
      };
      return query;
    },
    async recursiveDelete(ref: { id: string }) {
      state.deletions.push(ref.id);
      state.parents.delete(ref.id);
      if (state.failDescendant) throw new Error("descendant deletion failed");
      state.children.delete(ref.id);
    },
  } };
});
import { runRetentionSweep } from "./retentionSweeper";

beforeEach(() => {
  state.jobs.clear(); state.parents.clear(); state.children.clear();
  state.manualJobs.clear(); state.resumedManual.length = 0;
  state.deletions.length = 0;
  state.failDescendant = false; state.failJobWrite = false;
});

it("retries orphaned descendants on the next sweep after a partial recursive deletion", async () => {
  state.parents.add("old-ride"); state.children.add("old-ride");
  state.failDescendant = true;
  await expect(runRetentionSweep()).rejects.toThrow("descendant deletion failed");
  expect(state.parents.size).toBe(0);
  expect(state.children.has("old-ride")).toBe(true);
  expect(state.jobs.has("old-ride")).toBe(true);
  state.failDescendant = false;
  await runRetentionSweep();
  expect(state.deletions).toEqual(["old-ride", "old-ride"]);
  expect(state.children.size).toBe(0);
  expect(state.jobs.size).toBe(0);
});

it("does not begin deletion if the independent retry job cannot be committed", async () => {
  state.parents.add("old-ride"); state.children.add("old-ride");
  state.failJobWrite = true;
  await expect(runRetentionSweep()).rejects.toThrow("job store unavailable");
  expect(state.parents.has("old-ride")).toBe(true);
  expect(state.children.has("old-ride")).toBe(true);
  expect(state.deletions).toEqual([]);
});

it("resumes a durable job even when its ride parent was already removed before restart", async () => {
  state.jobs.add("orphaned-ride"); state.children.add("orphaned-ride");
  await runRetentionSweep();
  expect(state.deletions).toEqual(["orphaned-ride"]);
  expect(state.children.size).toBe(0);
  expect(state.jobs.size).toBe(0);
});

it("discovers interrupted manual deletions independently of terminal parent queries", async () => {
  state.manualJobs.add("manually-deleted-ride");
  await runRetentionSweep();
  expect(state.resumedManual).toEqual(["manually-deleted-ride"]);
  expect(state.manualJobs.size).toBe(0);
});
