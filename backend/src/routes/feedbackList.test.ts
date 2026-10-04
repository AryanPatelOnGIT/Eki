import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { contractFetch } from "../../test-support/openapi";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), order: vi.fn(), limit: vi.fn(), get: vi.fn() }));
vi.mock("../services/authTokenVerifier", () => ({
  verifyRevocationAwareIdToken: mocks.verify,
  AuthVerificationCapacityError: class extends Error {},
}));
vi.mock("../lib/firebaseAdmin", () => ({ db: {
  collection: () => ({ orderBy: mocks.order }),
} }));
import { feedbackV2Router } from "./feedback";
let server: Server;
let base = "";
beforeAll(async () => {
  const app = express(); app.use("/api/v2/feedback", feedbackV2Router);
  server = await new Promise<Server>(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No test server");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
beforeEach(() => {
  vi.clearAllMocks(); mocks.verify.mockResolvedValue({ uid: "admin", admin: true });
  mocks.order.mockReturnValue({ limit: mocks.limit }); mocks.limit.mockReturnValue({ get: mocks.get });
  mocks.get.mockResolvedValue({ docs: [] });
});
describe("admin feedback list", () => {
  it("rejects a missing bearer token without touching feedback", async () => {
    const response = await contractFetch(`${base}/api/v2/feedback`);
    expect(response.status).toBe(401); expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(["auth/id-token-expired", "auth/id-token-revoked", "auth/invalid-id-token"])("rejects %s without touching feedback", async code => {
    mocks.verify.mockRejectedValue({ code });
    const response = await contractFetch(`${base}/api/v2/feedback`, { headers: { Authorization: "Bearer invalid" } });
    expect(response.status).toBe(401); expect(mocks.get).not.toHaveBeenCalled();
  });
  it("denies a role string without the trusted admin claim", async () => {
    mocks.verify.mockResolvedValue({ uid: "passenger", role: "admin" });
    const response = await contractFetch(`${base}/api/v2/feedback`, { headers: { Authorization: "Bearer non-admin" } });
    expect(response.status).toBe(403); expect(mocks.get).not.toHaveBeenCalled();
  });
  it("orders and bounds the response and excludes internal fields", async () => {
    mocks.get.mockResolvedValue({ docs: [{ id: "real-id", data: () => ({
      id: "spoofed-id", userId: "passenger", userName: "Passenger", type: "ride", busId: "bus", driverId: "driver",
      sessionId: "session", comment: "Nice ride", rating: 4, status: "reviewed", requestHash: "internal-hash",
      timestamp: { seconds: 12345, nanoseconds: 400000 }, reviewedBy: "private-reviewer",
    }) }] });
    const response = await contractFetch(`${base}/api/v2/feedback`, { headers: { Authorization: "Bearer admin-token" } });
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.verify).toHaveBeenCalledWith("admin-token"); expect(mocks.order).toHaveBeenCalledWith("timestamp", "desc");
    expect(mocks.limit).toHaveBeenCalledWith(200);
    const body = await response.json(); expect(body.feedbacks[0].id).toBe("real-id");
    expect(body.feedbacks[0].timestamp).toEqual({ seconds: 12345, nanoseconds: 400000 });
    expect(body.feedbacks[0]).not.toHaveProperty("requestHash"); expect(body.feedbacks[0]).not.toHaveProperty("reviewedBy");
  });
  it("normalizes incomplete legacy data without returning invalid fields", async () => {
    mocks.get.mockResolvedValue({ docs: [{ id: "legacy", data: () => ({ rating: Number.NaN, timestamp: { seconds: 5, nanoseconds: -1 } }) }] });
    const response = await contractFetch(`${base}/api/v2/feedback`, { headers: { Authorization: "Bearer admin" } });
    expect((await response.json()).feedbacks[0]).toMatchObject({ id: "legacy", userId: "", type: "general", rating: null, timestamp: null, status: "new" });
  });
  it("returns a redacted no-store error when the data source fails", async () => {
    mocks.get.mockRejectedValue(new Error("private-provider-detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await contractFetch(`${base}/api/v2/feedback`, { headers: { Authorization: "Bearer admin" } });
      expect(response.status).toBe(500); expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "Unable to load feedback." });
    } finally { log.mockRestore(); }
  });
});
