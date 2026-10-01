import { contractFetch } from "../../test-support/openapi";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  role: "passenger",
  requests: new Map<string, Record<string, unknown>>(),
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: (req: { user?: Record<string, unknown> }, _res: unknown, next: () => void) => {
    req.user = { uid: "user_1", role: harness.role };
    next();
  },
}));

vi.mock("../lib/firebaseAdmin", () => ({
  db: {
    collection: () => ({
      doc: (id: string) => ({
        set: async (value: Record<string, unknown>) => {
          harness.requests.set(id, value);
        },
      }),
    }),
  },
}));

import privacyRouter, { privacyDeletionRequestsRouter } from "./privacy";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/privacy", privacyRouter);
  app.use("/api/v2/privacy-deletion-requests", privacyDeletionRequestsRouter);
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind.");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  harness.role = "passenger";
  harness.requests = new Map();
});

describe("privacy deletion request aliases", () => {
  it("queues the same UID-bound request from both paths", async () => {
    const v2 = await contractFetch(`${baseUrl}/api/v2/privacy-deletion-requests`, { method: "POST" });
    expect(v2.status).toBe(202);
    expect(v2.headers.get("cache-control")).toBe("no-store");
    await expect(v2.json()).resolves.toEqual({ accepted: true });
    const legacy = await contractFetch(`${baseUrl}/api/privacy/deletion-request`, { method: "POST" });
    expect(legacy.status).toBe(202);
    expect(harness.requests.size).toBe(1);
    expect(harness.requests.get("user_1")).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("rejects privileged accounts on both paths", async () => {
    harness.role = "admin";
    expect((await contractFetch(`${baseUrl}/api/v2/privacy-deletion-requests`, { method: "POST" })).status).toBe(409);
    expect((await contractFetch(`${baseUrl}/api/privacy/deletion-request`, { method: "POST" })).status).toBe(409);
    expect(harness.requests.size).toBe(0);
  });

  it("rejects client-supplied identity on the v2 path", async () => {
    const response = await contractFetch(`${baseUrl}/api/v2/privacy-deletion-requests`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: "another_user" }),
    });
    expect(response.status).toBe(400);
    expect(harness.requests.size).toBe(0);
  });
});
