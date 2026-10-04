import type { Request } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verify = vi.hoisted(() => vi.fn());
vi.mock("../services/authTokenVerifier", () => ({ verifyRevocationAwareIdToken: verify }));
import { verifyRequestToken } from "./verifiedRequest";

beforeEach(() => {
  verify.mockReset();
  verify.mockImplementation(async token => {
    if (token === "invalid") throw new Error("Invalid token");
    return { uid: token, admin: token === "admin" };
  });
});

describe("request-scoped authentication", () => {
  it("reuses the same verified token only within its original request", async () => {
    const request = {} as Request;
    await expect(verifyRequestToken(request, "admin")).resolves.toMatchObject({ admin: true });
    await verifyRequestToken(request, "admin");
    expect(verify).toHaveBeenCalledOnce();
    await verifyRequestToken({} as Request, "admin");
    expect(verify).toHaveBeenCalledTimes(2);
  });
  it("does not trust an injected user or reuse a different token's claims", async () => {
    const request = { user: { uid: "forged", admin: true } } as Request;
    await expect(verifyRequestToken(request, "passenger")).resolves.toMatchObject({ uid: "passenger", admin: false });
    await expect(verifyRequestToken(request, "admin")).resolves.toMatchObject({ uid: "admin", admin: true });
    expect(verify).toHaveBeenCalledTimes(2);
  });
  it("does not memoize a failed verification", async () => {
    const request = {} as Request;
    await expect(verifyRequestToken(request, "invalid")).rejects.toThrow("Invalid token");
    await expect(verifyRequestToken(request, "invalid")).rejects.toThrow("Invalid token");
    expect(verify).toHaveBeenCalledTimes(2);
  });
});
