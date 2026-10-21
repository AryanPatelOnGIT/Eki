import { contractFetch } from "../../test-support/openapi";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  profile: undefined as Record<string, unknown> | undefined,
  settings: {} as Record<string, unknown>,
  user: {
    uid: "user_1",
    name: "Verified Name",
    email: "verified@example.test",
    picture: "https://images.example.test/avatar.png",
  } as Record<string, unknown>,
  authClaims: {} as Record<string, unknown>,
  authErrorCode: "",
  authDisabled: false,
  inTransaction: false,
  transactionAttempts: 1,
  authLookupInTransaction: false,
  authLookupCalls: 0,
  beforeTransaction: undefined as (() => void) | undefined,
  deletion: undefined as Record<string, unknown> | undefined,
  setCustomClaimsCalls: [] as Array<{ uid: string; claims: Record<string, unknown> }>,
  revokeCalls: [] as string[],
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: (
    req: { user?: Record<string, unknown> },
    _res: unknown,
    next: () => void,
  ) => {
    req.user = harness.user;
    next();
  },
}));

vi.mock("../middleware/requireAdmin", () => ({
  requireAdmin: (
    req: { user?: Record<string, unknown> },
    _res: unknown,
    next: () => void,
  ) => {
    req.user = { uid: "admin_1", role: "admin", admin: true };
    next();
  },
}));

vi.mock("../lib/firebaseAdmin", () => {
  type Ref = {
    collection: string;
    id: string;
    set: (value: Record<string, unknown>, options?: { merge?: boolean }) => Promise<void>;
  };
  const snapshot = () => ({
    exists: Boolean(harness.profile),
    data: () => harness.profile,
  });
  const makeRef = (collection: string, id: string): Ref => ({
    collection,
    id,
    set: async (value, options) => {
      if (collection === "settings") {
        harness.settings = options?.merge ? { ...harness.settings, ...value } : value;
      }
    },
  });

  return {
    auth: {
      getUser: async () => {
        harness.authLookupCalls += 1;
        if (harness.inTransaction) harness.authLookupInTransaction = true;
        if (harness.authErrorCode) throw Object.assign(new Error("Synthetic missing identity"), { code: harness.authErrorCode });
        return { customClaims: harness.authClaims, disabled: harness.authDisabled };
      },
      setCustomUserClaims: async (uid: string, claims: Record<string, unknown>) => {
        harness.authClaims = { ...claims };
        harness.setCustomClaimsCalls.push({ uid, claims: { ...claims } });
      },
      revokeRefreshTokens: async (uid: string) => {
        harness.revokeCalls.push(uid);
      },
    },
    db: {
      collection: (collection: string) => ({
        doc: (id: string) => makeRef(collection, id),
      }),
      runTransaction: async (
        callback: (transaction: {
          create: (ref: Ref, value: Record<string, unknown>) => void;
          get: (ref: Ref) => Promise<ReturnType<typeof snapshot>>;
        }) => Promise<unknown>,
      ) => {
        harness.beforeTransaction?.();
        let result: unknown;
        for (let attempt = 0; attempt < harness.transactionAttempts; attempt += 1) {
          harness.inTransaction = true;
          try {
            result = await callback({
              create: (_ref, value) => {
                if (harness.profile) throw new Error("already exists");
                if (attempt === harness.transactionAttempts - 1) harness.profile = value;
              },
              get: async ref => ref.collection === "_privacy_deletion_requests"
                ? { exists: Boolean(harness.deletion), data: () => harness.deletion }
                : snapshot(),
            });
          } finally {
            harness.inTransaction = false;
          }
        }
        return result;
      },
    },
  };
});

import settingsRouter, { settingsV2Router } from "./settings";
import usersRouter from "./users";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/users", usersRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/v2/settings/global", settingsV2Router);
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
  harness.profile = undefined;
  harness.settings = {};
  harness.authClaims = {};
  harness.authErrorCode = ""; harness.authDisabled = false; harness.deletion = undefined;
  harness.inTransaction = false;
  harness.transactionAttempts = 1;
  harness.authLookupInTransaction = false;
  harness.authLookupCalls = 0;
  harness.beforeTransaction = undefined;
  harness.setCustomClaimsCalls = [];
  harness.revokeCalls = [];
  harness.user = {
    uid: "user_1",
    name: "Verified Name",
    email: "verified@example.test",
    picture: "https://images.example.test/avatar.png",
  };
});

describe("profile bootstrap route", () => {
  it("checks Auth outside retried Firestore transaction callbacks", async () => {
    harness.transactionAttempts = 3;
    const response = await contractFetch(`${baseUrl}/api/users/bootstrap`, { method: "POST" });
    expect(response.status).toBe(201);
    expect(harness.profile?.role).toBe("passenger");
    expect(harness.authLookupInTransaction).toBe(false);
    expect(harness.authLookupCalls).toBe(2); // one validation, one fresh claim synchronization
  });

  it("reads the deletion fence transactionally after the Auth lookup", async () => {
    harness.beforeTransaction = () => { harness.deletion = { status: "processing" }; };
    const response = await contractFetch(`${baseUrl}/api/users/bootstrap`, { method: "POST" });
    expect(response.status).toBe(409);
    expect(harness.profile).toBeUndefined();
    expect(harness.setCustomClaimsCalls).toEqual([]);
  });
  it.each(["auth/user-not-found", "auth/user-disabled"])("a cached token cannot recreate a profile for %s", async code => {
    if (code === "auth/user-disabled") harness.authDisabled = true;
    else harness.authErrorCode = code;
    const response = await contractFetch(`${baseUrl}/api/users/bootstrap`, { method: "POST" });
    expect(harness.profile).toBeUndefined();
    expect(response.status).toBe(401);
    expect(harness.setCustomClaimsCalls).toEqual([]);
  });
  it("does not recreate a missing profile while its deletion request is present", async () => {
    harness.deletion = { status: "processing", phase: "auth_deletion_dispatched" };
    const response = await contractFetch(`${baseUrl}/api/users/bootstrap`, { method: "POST" });
    expect(harness.profile).toBeUndefined();
    expect(response.status).toBe(409);
    expect(harness.setCustomClaimsCalls).toEqual([]);
  });
  it("creates a passenger profile only from verified token claims", async () => {
    const response = await contractFetch(`${baseUrl}/api/users/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Attacker Name",
        email: "attacker@example.test",
        role: "admin",
      }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(harness.profile).toMatchObject({
      uid: "user_1",
      displayName: "Verified Name",
      email: "verified@example.test",
      role: "passenger",
    });
    await expect(response.json()).resolves.toEqual({
      role: "passenger",
      claimsUpdated: true,
    });
    expect(harness.setCustomClaimsCalls).toEqual([{
      uid: "user_1",
      claims: { role: "passenger" },
    }]);
    expect(harness.revokeCalls).toEqual([]);
  });

  it("preserves an existing privileged profile", async () => {
    harness.profile = { uid: "user_1", role: "admin", displayName: "Existing" };

    const response = await contractFetch(`${baseUrl}/api/users/bootstrap`, { method: "POST" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ role: "admin" });
    expect(harness.profile.displayName).toBe("Existing");
    expect(harness.setCustomClaimsCalls).toEqual([]);
  });

  it("repairs a missing passenger claim on an existing profile", async () => {
    harness.profile = { uid: "user_1", role: "passenger" };
    harness.authClaims = { featureFlag: true };

    const response = await contractFetch(`${baseUrl}/api/users/bootstrap`, { method: "POST" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      role: "passenger",
      claimsUpdated: true,
    });
    expect(harness.setCustomClaimsCalls[0]?.claims).toEqual({
      featureFlag: true,
      role: "passenger",
    });
    expect(harness.revokeCalls).toEqual([]);
  });

  it("does not rewrite an already synchronized passenger claim", async () => {
    harness.profile = { uid: "user_1", role: "passenger" };
    harness.authClaims = { role: "passenger", featureFlag: true };

    const response = await contractFetch(`${baseUrl}/api/users/bootstrap`, { method: "POST" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ role: "passenger" });
    expect(harness.setCustomClaimsCalls).toEqual([]);
    expect(harness.revokeCalls).toEqual([]);
  });

  it.each([
    { role: "driver", driverId: "driver_1", assignedBusId: "bus_1", featureFlag: true },
    { role: "admin", admin: true, featureFlag: true },
  ])("preserves fresh $role claims when the passenger profile is stale", async claims => {
    harness.profile = { uid: "user_1", role: "passenger" };
    harness.authClaims = claims;

    const response = await contractFetch(`${baseUrl}/api/users/bootstrap`, { method: "POST" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ role: claims.role });
    expect(harness.authClaims).toEqual(claims);
    expect(harness.setCustomClaimsCalls).toEqual([]);
    expect(harness.revokeCalls).toEqual([]);
    expect(harness.profile.role).toBe("passenger");
  });
});

describe("settings route", () => {
  async function save(body: Record<string, unknown>, v2 = false) {
    return contractFetch(`${baseUrl}${v2 ? "/api/v2/settings/global" : "/api/settings"}`, {
      method: v2 ? "PATCH" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("enforces literal text limits and blank policy on both settings aliases with no rejected mutation", async () => {
    for (const v2 of [false, true]) {
      for (const [field, limit] of [["serviceStartTime", 64], ["noBusesMessage", 200], ["noBusesSubMessage", 300], ["announcementText", 500]] as const) {
        for (const length of [limit - 1, limit, limit + 1]) {
          harness.settings = { announcementActive: true };
          const previous = { ...harness.settings };
          const response = await save({ [field]: "a".repeat(length) }, v2);
          expect(response.status).toBe(length <= limit ? 200 : 400);
          if (length <= limit) expect(harness.settings[field]).toBe("a".repeat(length));
          else expect(harness.settings).toEqual(previous);
        }
        harness.settings = { announcementActive: true };
        const response = await save({ [field]: "   " }, v2);
        expect(response.status).toBe(field === "announcementText" ? 200 : 400);
        if (field === "announcementText") expect(harness.settings[field]).toBe("   ");
        else expect(harness.settings).toEqual({ announcementActive: true });
      }
    }
  });

  it("accepts only literal boolean announcement states on both aliases", async () => {
    for (const v2 of [false, true]) {
      for (const value of [true, false]) {
        expect((await save({ announcementActive: value }, v2)).status).toBe(200);
        expect(harness.settings.announcementActive).toBe(value);
      }
      for (const value of ["true", "false", 1, 0, null]) {
        const previous = { ...harness.settings };
        expect((await save({ announcementActive: value }, v2)).status).toBe(400);
        expect(harness.settings).toEqual(previous);
      }
    }
  });

  it("rejects empty, unknown, and invalid settings", async () => {
    expect((await save({})).status).toBe(400);
    expect((await save({ role: "admin" })).status).toBe(400);
    expect((await save({ announcementActive: "yes" })).status).toBe(400);
    expect((await save({ noBusesMessage: "   " })).status).toBe(400);
  });

  it("persists only validated fields with server audit metadata", async () => {
    const response = await save({ announcementText: "Service update", announcementActive: true });

    expect(response.status).toBe(200);
    expect(harness.settings).toMatchObject({
      announcementText: "Service update",
      announcementActive: true,
      updatedBy: "admin_1",
    });
    expect(harness.settings.updatedAt).toBeDefined();
  });

  it("uses the same partial validation and persistence for v2 PATCH", async () => {
    expect((await save({ role: "admin" }, true)).status).toBe(400);
    const response = await save({ announcementText: "Updated" }, true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ saved: true });
    expect(harness.settings).toMatchObject({ announcementText: "Updated", updatedBy: "admin_1" });
    const legacy = await save({ announcementActive: true });
    expect(legacy.status).toBe(200);
    expect(harness.settings).toMatchObject({ announcementText: "Updated", announcementActive: true });
  });
});
