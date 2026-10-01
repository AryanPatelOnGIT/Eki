import type { Server } from "node:http";
import type { Request, Response, NextFunction } from "express";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { contractFetch } from "../../test-support/openapi";

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  mirrors: {} as Record<string, unknown>,
  claims: {} as Record<string, unknown>,
  admin: true, writes: 0, revocations: 0, sequence: 0,
  gate: null as Promise<void> | null,
  tail: Promise.resolve() as Promise<unknown>,
  failFinalWrite: false,
  admissionGate: null as Promise<void> | null,
  admissionStarted: false,
  rejectClaims: false,
  claimsRejected: false,
  revokeGate: null as Promise<void> | null,
}));
vi.mock("../middleware/requireAdmin", () => ({
  requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!state.admin) { res.status(403).json({ error: "Admin required." }); return; }
    Object.assign(req, { user: { uid: "admin", admin: true } }); next();
  },
}));
vi.mock("../lib/firebaseAdmin", () => {
  type Ref = ReturnType<typeof document>;
  const snapshot = (path: string) => ({ exists: state.docs.has(path), data: () => state.docs.get(path),
    id: path.split("/").at(-1)!, ref: document(path) });
  function document(path: string) {
    return { path,
      get: async () => snapshot(path),
      set: async (data: Record<string, unknown>, options?: { merge: boolean }) => {
        if (state.failFinalWrite && path.startsWith("_fleet_reconciliation_jobs/") && data.status !== "processing") {
          state.failFinalWrite = false; throw new Error("ambiguous outcome write");
        }
        state.docs.set(path, options?.merge ? { ...state.docs.get(path), ...data } : data);
      },
    };
  }
  return {
    auth: {
      getUser: async () => { if (state.gate) await state.gate; return { customClaims: state.claims }; },
      setCustomUserClaims: async (_uid: string, claims: Record<string, unknown>) => {
        if (state.rejectClaims) { state.claimsRejected = true; throw new Error("private upstream failure"); }
        state.claims = claims; state.writes++;
      },
      revokeRefreshTokens: async () => { if (state.revokeGate) await state.revokeGate; state.revocations++; },
    },
    db: {
      collection: (name: string) => ({ doc: (id = `audit_${++state.sequence}`) => document(`${name}/${id}`),
        limit: (limit: number) => ({ get: async () => {
          const docs = [...state.docs.keys()].filter(path => path.startsWith(`${name}/`)).slice(0, limit).map(snapshot);
          return { docs, size: docs.length, empty: !docs.length };
        } }),
      }),
      runTransaction: (callback: (transaction: { get: (ref: Ref) => Promise<ReturnType<typeof snapshot>>;
        create: (ref: Ref, data: Record<string, unknown>) => void; delete: (ref: Ref) => void }) => Promise<unknown>) => {
        const operation = state.tail.then(async () => {
          if (state.admissionGate) { state.admissionStarted = true; await state.admissionGate; state.admissionGate = null; }
          const writes: (() => void)[] = [];
          const result = await callback({ get: async ref => snapshot(ref.path),
            create: (ref, data) => { if (state.docs.has(ref.path)) throw new Error("Already exists"); writes.push(() => state.docs.set(ref.path, data)); },
            delete: ref => { writes.push(() => state.docs.delete(ref.path)); } });
          writes.forEach(write => write()); return result;
        });
        state.tail = operation.catch(() => {}); return operation;
      },
    },
    rtdb: { ref: (path: string) => ({
      once: async () => ({ val: () => path === "driverRouteAssignments" ? state.mirrors : state.mirrors[path.split("/").at(-1)!] ?? null }),
      set: async (value: unknown) => { state.mirrors[path.split("/").at(-1)!] = value; },
      remove: async () => { delete state.mirrors[path.split("/").at(-1)!]; },
    }) },
  };
});

import fleetRouter, { fleetReconciliationJobsRouter, reconcileFleetAuthorization, FleetReconciliationBusy } from "./fleet";
import { drainHttpOperations } from "../services/httpOperations";

let server: Server;
let base = "";
const key = "fleet_job_key_001";
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/api/fleet", fleetRouter);
  app.use("/api/v2/fleet-reconciliation-jobs", fleetReconciliationJobsRouter);
  server = await new Promise<Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No address");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await drainHttpOperations(); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  state.docs.clear(); state.mirrors = {}; state.claims = {}; state.admin = true;
  state.writes = 0; state.revocations = 0; state.gate = null; state.tail = Promise.resolve(); state.failFinalWrite = false;
  state.admissionGate = null; state.admissionStarted = false;
  state.rejectClaims = false; state.claimsRejected = false; state.revokeGate = null;
  state.docs.set("drivers/driver_1", { authUid: "auth_uid", assignedBusId: "bus_1" });
  state.docs.set("buses/bus_1", { assignedRoutes: ["route_1"] });
});
const post = (id = key, body: unknown = {}) => contractFetch(`${base}/api/v2/fleet-reconciliation-jobs`, {
  method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": id }, body: JSON.stringify(body),
});
const poll = (id = key) => contractFetch(`${base}/api/v2/fleet-reconciliation-jobs/${id}`);
const waitTerminal = (id = key) => vi.waitFor(() => expect(state.docs.get(`_fleet_reconciliation_jobs/${id}`)?.status).not.toBe("processing"));

describe("fleet operation resources", () => {
  it("keeps admin authorization and rejects unsupported bodies/keys", async () => {
    expect((await post("bad")).status).toBe(400); expect((await post(key, { authUid: "injected" })).status).toBe(400);
    state.admin = false; expect((await post()).status).toBe(403); expect((await poll()).status).toBe(403);
    expect(state.writes).toBe(0);
  });
  it("replays the same job across concurrent submissions without duplicate effects", async () => {
    let release!: () => void; state.gate = new Promise<void>(resolve => { release = resolve; });
    const first = await post(); expect(first.status).toBe(202);
    expect(first.headers.get("location")).toBe(`/api/v2/fleet-reconciliation-jobs/${key}`);
    expect(first.headers.get("retry-after")).toBe("1");
    expect((await post()).status).toBe(202);
    expect(await (await poll()).json()).toMatchObject({ status: "processing" });
    release(); await waitTerminal();
    const body = await (await poll()).json();
    expect(body).toMatchObject({ status: "succeeded", result: { checked: 1, repaired: 1, failed: 0 } });
    expect(JSON.stringify(body)).not.toContain("auth_uid"); expect(body).not.toHaveProperty("payloadHash");
    expect(body).not.toHaveProperty("adminUid");
    expect(state.docs.get(`_fleet_reconciliation_jobs/${key}`)?.adminUid).toBe("admin");
    expect(await (await post()).json()).toEqual(body);
    expect(state.writes).toBe(1); expect(state.revocations).toBe(1);
    expect(state.docs.has("_fleet_reconciliation_locks/singleton")).toBe(false);
  });
  it("coordinates different keys, legacy reconciliation and periodic worker across the singleton lock", async () => {
    let release!: () => void; state.gate = new Promise<void>(resolve => { release = resolve; });
    await post(); await vi.waitFor(() => expect(state.docs.has("_fleet_reconciliation_locks/singleton")).toBe(true));
    await expect(reconcileFleetAuthorization()).rejects.toBeInstanceOf(FleetReconciliationBusy);
    expect((await contractFetch(`${base}/api/fleet/reconcile`, { method: "POST" })).status).toBe(409);
    const other = "fleet_other_key_01"; expect((await post(other)).status).toBe(202); await waitTerminal(other);
    expect(await (await poll(other)).json()).toMatchObject({ status: "failed", error: { code: "FLEET_RECONCILIATION_BUSY" } });
    release(); await waitTerminal(); expect(state.writes).toBe(1);
  });
  it("retains partial per-record outcomes without exposing internal errors", async () => {
    state.docs.set("drivers/invalid", { authUid: "unsafe/uid" });
    await post(); await waitTerminal();
    const body = await (await poll()).json();
    expect(body).toMatchObject({ status: "failed", result: { checked: 2, repaired: 1, failed: 1,
      records: [{ driverId: "driver_1", outcome: "repaired" }, { driverId: "invalid", outcome: "failed", code: "INVALID_DRIVER_AUTH" }] } });
    expect((await post()).status).toBe(200); expect(state.writes).toBe(1);
  });
  it("stops launching work past its budget and releases ownership safely", async () => {
    const result = await reconcileFleetAuthorization(Date.now() - 1);
    expect(result).toMatchObject({ repaired: 0, failed: 1, records: [{ code: "TIME_BUDGET_EXCEEDED" }] });
    expect(state.writes).toBe(0); expect(state.docs.has("_fleet_reconciliation_locks/singleton")).toBe(false);
  });
  it("preserves an unresolved crash lock instead of retrying side effects", async () => {
    state.docs.set("_fleet_reconciliation_locks/singleton", { owner: "stopped_or_unknown_replica" });
    await post(); await waitTerminal();
    expect(state.writes).toBe(0); expect(state.docs.has("_fleet_reconciliation_locks/singleton")).toBe(true);
  });
  it("keeps legacy result shape", async () => {
    const response = await contractFetch(`${base}/api/fleet/reconcile`, { method: "POST" });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ checked: 1, repaired: 1, failed: 0 });
  });
  it("retains processing after an ambiguous final write and does not rerun", async () => {
    state.failFinalWrite = true; await post(); await vi.waitFor(() => expect(state.writes).toBe(1));
    await vi.waitFor(() => expect(state.failFinalWrite).toBe(false));
    state.docs.get(`_fleet_reconciliation_jobs/${key}`)!.deadlineAt = Date.now() - 1;
    expect(await (await poll()).json()).toMatchObject({ status: "processing", outcomeUnknown: true });
    expect((await post()).status).toBe(202); expect(state.revocations).toBe(1);
  });
  it("holds ownership until all side effects settle even when one write rejects early", async () => {
    state.rejectClaims = true;
    let release!: () => void; state.revokeGate = new Promise<void>(resolve => { release = resolve; });
    await post(); await vi.waitFor(() => expect(state.claimsRejected).toBe(true));
    expect(state.docs.has("_fleet_reconciliation_locks/singleton")).toBe(true);
    expect(await (await poll()).json()).toMatchObject({ status: "processing" });
    await expect(reconcileFleetAuthorization()).rejects.toBeInstanceOf(FleetReconciliationBusy);
    release(); await waitTerminal();
    const body = await (await poll()).json();
    expect(body).toMatchObject({ status: "failed", result: { records: [{ code: "RECONCILIATION_RECORD_FAILED" }] } });
    expect(JSON.stringify(body)).not.toContain("private upstream");
    expect(state.docs.has("_fleet_reconciliation_locks/singleton")).toBe(false);
  });
  it("drains accepted work and rejects new admissions during shutdown", async () => {
    let admit!: () => void; state.admissionGate = new Promise<void>(resolve => { admit = resolve; });
    let release!: () => void; state.gate = new Promise<void>(resolve => { release = resolve; });
    const pending = post();
    await vi.waitFor(() => expect(state.admissionStarted).toBe(true));
    let drained = false;
    const shutdown = drainHttpOperations().then(() => { drained = true; });
    expect((await post("shutdown_new_key_1")).status).toBe(503);
    expect(drained).toBe(false);
    admit(); expect((await pending).status).toBe(202);
    expect(drained).toBe(false);
    release(); await shutdown;
    expect(state.docs.get(`_fleet_reconciliation_jobs/${key}`)?.status).toBe("succeeded");
  });
});
