import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import cors from "cors";
import { afterEach, describe, expect, it, vi } from "vitest";

const verification = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("../services/authTokenVerifier", () => ({
  AuthVerificationCapacityError: class extends Error {},
  verifyRevocationAwareIdToken: async (token: string) => {
    verification.calls.push(token);
    if (!["alice", "bob"].includes(token)) throw new Error("Unverified token");
    return { uid: token, admin: token === "alice" };
  },
}));
import { createBrowserAdmission, createBrowserIngressLimiter } from "./browserAdmission";
import { requireAdmin } from "../middleware/requireAdmin";

const servers: Server[] = [];
afterEach(async () => {
  verification.calls.length = 0;
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve()); server.closeAllConnections();
  })));
});
async function boot(ingress = 50) {
  const app = express();
  app.use(cors({ origin: "https://bus.example.edu" }));
  app.use(createBrowserIngressLimiter(1, ingress));
  app.use("/api", createBrowserAdmission(1, { read: 3, mutation: 2 }));
  app.get("/api/health", requireAdmin, (_req, res) => res.json({ ok: true }));
  app.use((_req, res) => res.json({ ok: true }));
  const server = await new Promise<Server>(resolve => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  servers.push(server);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return (token = "alice", method = "GET", path = "/api/test") => fetch(url + path, {
    method, headers: { Authorization: `Bearer ${token}`, Origin: "https://bus.example.edu" },
  });
}
describe("production browser admission", () => {
  it("separates verified users sharing one IP, including mutation quotas", async () => {
    const request = await boot();
    for (const method of ["GET", "POST"]) {
      const limit = method === "GET" ? 3 : 2;
      for (let index = 0; index < limit; index++) expect((await request("alice", method)).status).toBe(200);
      expect((await request("alice", method)).status).toBe(429);
      expect((await request("bob", method)).status).toBe(200);
    }
  });
  it("read polling never charges the mutation budget", async () => {
    const request = await boot();
    for (let index = 0; index < 4; index++) await request();
    for (const method of ["PUT", "PATCH"]) expect((await request("alice", method)).status).toBe(200);
    expect((await request("alice", "DELETE")).status).toBe(429);
  });
  it("does not trust forged token identities and preserves CORS on ingress 429", async () => {
    const request = await boot(2);
    expect((await request("forged.alice.signature")).status).toBe(401);
    expect((await request("forged.bob.signature")).status).toBe(401);
    const rejected = await request("bob");
    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("access-control-allow-origin")).toBe("https://bus.example.edu");
    expect(rejected.headers.get("retry-after")).toBeTruthy();
    expect(verification.calls).toHaveLength(2);
  });
  it("preflight and public GET/HEAD probes do not consume ingress budgets", async () => {
    const request = await boot(1);
    for (let index = 0; index < 4; index++) {
      expect((await request("forged", "OPTIONS")).status).toBe(204);
      expect((await request("forged", "GET", "/health")).status).toBe(200);
      expect((await request("forged", "HEAD", "/live")).status).toBe(200);
    }
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(429);
  });
  it("device ingress retains separate auth, including maintenance reservation", async () => {
    const request = await boot(1);
    for (const path of ["telemetry", "diagnostics", "firmware/installation"]) {
      for (let index = 0; index < 4; index++) expect((await request("not-a-browser", "POST", `/api/devices/device_1/${path}`)).status).toBe(200);
    }
    expect((await request("not-a-browser", "GET", "/api/devices/device_1/firmware?sequence=1")).status).toBe(200);
    expect(verification.calls).toHaveLength(0);
    expect((await request("not-a-browser", "PUT", "/api/devices/device_1/firmware")).status).toBe(401);
  });
  it("detailed health remains authenticated but does not consume the read budget", async () => {
    const request = await boot();
    for (let index = 0; index < 5; index++) expect((await request("alice", "GET", "/api/health")).status).toBe(200);
    expect((await request("forged", "GET", "/api/health")).status).toBe(401);
    expect((await request("bob", "GET", "/api/health")).status).toBe(403);
    expect((await request()).status).toBe(200);
    expect(verification.calls).toHaveLength(8);
  });
});
