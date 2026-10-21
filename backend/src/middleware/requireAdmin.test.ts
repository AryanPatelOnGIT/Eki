import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ verify: vi.fn(), current: vi.fn() }));
vi.mock("./verifiedRequest", () => ({ verifyRequestToken: state.verify }));
vi.mock("../services/userAuthorization", () => ({ authorizationIsCurrent: state.current }));
import { requireAdmin } from "./requireAdmin";

async function attempt() {
  const req = { headers: { authorization: "Bearer synthetic-only" } } as Request;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn().mockReturnThis() };
  const next = vi.fn();
  await requireAdmin(req, res as unknown as Response, next);
  return { req, res, next };
}

describe("current admin HTTP authorization", () => {
  beforeEach(() => {
    state.verify.mockReset().mockResolvedValue({ uid: "admin", admin: true, role: "admin", authorizationVersion: "current" });
    state.current.mockReset().mockResolvedValue(true);
  });

  it("denies a provider-valid token whose current authorization has been revoked", async () => {
    // Firebase's second-resolution cutoff can accept a token authenticated in
    // the same second as revocation. The backend-owned version remains decisive.
    state.current.mockResolvedValue(false);
    const { res, next } = await attempt();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("admits a current admin only after checking its published authorization", async () => {
    const { req, next } = await attempt();
    expect(state.current).toHaveBeenCalledWith("admin", expect.objectContaining({ authorizationVersion: "current" }));
    expect(req.user?.uid).toBe("admin");
    expect(next).toHaveBeenCalledOnce();
  });

  it("fails closed with a retryable response when current authorization cannot be read", async () => {
    state.current.mockRejectedValue(new Error("Synthetic store outage"));
    const { res, next } = await attempt();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.set).toHaveBeenCalledWith("Retry-After", "1");
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    { role: "passenger" },
    { role: "driver", admin: false, authorizationVersion: "current" },
    { admin: true, role: "passenger", authorizationVersion: "current" },
    { admin: "true", role: "admin", authorizationVersion: "current" },
    { admin: false, role: "admin", authorizationVersion: "current" },
    { admin: true, role: "admin" },
  ])("denies incomplete or inconsistent admin claims: %j", async claims => {
    state.verify.mockResolvedValue({ uid: "admin", ...claims });
    const { res, next } = await attempt();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(state.current).not.toHaveBeenCalled();
  });
});
