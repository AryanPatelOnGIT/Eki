import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createRouteComputeLimiter } from "./routeComputeLimiter";
let server: Server, url: string;
beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => { req.user = { uid: req.get("x-test-verified-user") ?? "admin" } as typeof req.user; next(); });
  app.use(createRouteComputeLimiter(1)); app.use((_req, res) => { res.json({ ok: true }); });
  server = await new Promise<Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const address = server.address(); if (!address || typeof address === "string") throw Error("No listener"); url = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
it("sixty geometry reads do not spend a verified administrator's ten mutation tokens", async () => {
  for (let index = 0; index < 60; index++) expect((await fetch(url + "/route/geometry")).status).toBe(200);
  expect((await fetch(url + "/route/geometry", { method: "HEAD" })).status).toBe(200);
  for (let index = 0; index < 10; index++) expect((await fetch(url, { method: "PUT" })).status).toBe(200);
  expect((await fetch(url, { method: "PUT" })).status).toBe(429);
  expect((await fetch(url + "/route/geometry")).status).toBe(200);
  // A different verified administrator on the same IP owns an independent bucket.
  expect((await fetch(url, { method: "PUT", headers: { "x-test-verified-user": "other-admin" } })).status).toBe(200);
});
