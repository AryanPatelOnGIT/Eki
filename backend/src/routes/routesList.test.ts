import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  reads: 0,
  release: null as null | (() => void),
  docs: [{ id: "qa-route", data: () => ({ name: "Before", stops: [] }) }],
}));

vi.mock("../lib/firebaseAdmin", () => ({
  db: { collection: () => ({ limit: () => ({
    get: () => {
      harness.reads++;
      return new Promise(resolve => { harness.release = () => resolve({ docs: harness.docs }); });
    },
  }) }) },
}));
vi.mock("../middleware/requireAuth", () => ({
  requireAuth: (_request: unknown, _response: unknown, next: () => void) => next(),
}));

import routesList, { routesCollectionRoutes } from "./routesList";

let server: Server;
let origin = "";
beforeAll(async () => {
  const app = express();
  app.use("/api/routes-list", routesList);
  app.use("/api/routes", routesCollectionRoutes);
  server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

describe("route summary reads", () => {
  it("shares an unsettled read across both supported aliases and refreshes the next request", async () => {
    const first = fetch(`${origin}/api/routes-list`);
    const second = fetch(`${origin}/api/routes`);
    await vi.waitFor(() => expect(harness.reads).toBe(1));
    harness.release!();
    const [a, b] = await Promise.all([first, second]);
    expect((await a.json()).routes).toEqual((await b.json()).routes);
    harness.docs = [{ id: "qa-route", data: () => ({ name: "After", stops: [] }) }];
    const third = fetch(`${origin}/api/routes-list`);
    await vi.waitFor(() => expect(harness.reads).toBe(2));
    harness.release!();
    expect((await (await third).json()).routes[0].name).toBe("After");
  });
});
