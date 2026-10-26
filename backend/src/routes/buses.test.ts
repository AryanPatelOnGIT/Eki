import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../lib/firebaseAdmin", () => {
  const query: any = { once: async () => ({ val: () => state.value,
    forEach: (visit: (child: unknown) => void) => Object.entries(state.value).forEach(([key, value]) => visit({ key, val: () => value })) }) };
  for (const method of ["orderByChild", "orderByKey", "equalTo", "limitToFirst", "startAt", "startAfter", "endAt"]) query[method] = () => query;
  return { rtdb: { ref: () => query } };
});
vi.mock("../middleware/requireAuth", () => ({ requireAuth: (_req: unknown, _res: unknown, next: () => void) => next() }));
import router from "./buses";
let server: Server;
afterEach(async () => { if (server) await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); }); });
describe("legacy bus snapshot public fields", () => {
  it("uses the public whitelist for both fleet and single-bus snapshots", async () => {
    const publicFields = { busId: "bus1", routeId: "route1", lat: 23, timestamp: 1, sessionId: "s1" };
    state.value = { bus1_route1: { ...publicFields, _workerGeneration: 9, routeMatchHistory: [1], turnaroundClaimId: "private", rerouteError: "private" } };
    const app = express(); app.use("/buses", router);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>(done => server.once("listening", done));
    const address = server.address() as { port: number }; const url = `http://127.0.0.1:${address.port}/buses`;
    expect(await (await fetch(url)).json()).toEqual({ buses: [publicFields] });
    expect(await (await fetch(`${url}?routeId=route1&limit=1`)).json()).toEqual({ buses: [publicFields], nextCursor: null });
    expect(await (await fetch(`${url}/bus1`)).json()).toEqual(publicFields);
  });
  it("finds a bus's live node when a retired tombstone for its previous route sorts first", async () => {
    const live = { busId: "bus1", routeId: "route_b", lat: 23, timestamp: 2, sessionId: "s2" };
    state.value = {
      bus1_route_a: { busId: "bus1", routeId: "route_a", deviceState: "offline", retiredAssignmentRevision: 2 },
      bus1_route_b: live,
    };
    const app = express(); app.use("/buses", router);
    server = app.listen(0, "127.0.0.1"); await new Promise<void>(done => server.once("listening", done));
    const address = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/buses/bus1`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(live);
  });
});
