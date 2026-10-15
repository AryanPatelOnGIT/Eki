import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  firestore: undefined as Record<string, unknown> | undefined,
  realtime: undefined as Record<string, unknown> | undefined,
  claims: {} as Record<string, unknown>,
  events: [] as string[], fail: "", revocationGate: null as Promise<void> | null,
  supersede: false,
}));
vi.mock("../lib/firebaseAdmin", () => {
  const write = async (product: "firestore" | "realtime", value: Record<string, unknown>) => {
    state.events.push(`${product}:${value.role}`);
    if (state.fail === `${product}:${value.role}`) throw Error("publication unavailable");
    state[product] = { ...value };
  };
  const document = { get: async () => ({ data: () => state.firestore }), set: (value: Record<string, unknown>) => write("firestore", value) };
  return {
    db: { collection: () => ({ doc: () => document }), runTransaction: async (callback: any) => {
      let value: Record<string, unknown> | undefined;
      await callback({ get: document.get, set: (_ref: unknown, next: Record<string, unknown>) => { value = next; } });
      if (value) await write("firestore", value);
    } },
    rtdb: { ref: () => ({
      once: async () => ({ val: () => state.realtime }),
      set: (value: Record<string, unknown>) => write("realtime", value),
      transaction: async (callback: any) => {
        const value = callback(state.realtime);
        if (value === undefined) return { committed: false, snapshot: { val: () => state.realtime } };
        await write("realtime", value); return { committed: true, snapshot: { val: () => state.realtime } };
      },
    }) },
    auth: {
      setCustomUserClaims: async (_uid: string, claims: Record<string, unknown>) => {
        state.events.push("claims"); if (state.fail === "claims") throw Error("claims unavailable"); state.claims = claims;
        if (state.supersede) state.firestore = state.realtime = { role: "passenger", version: "newer", driverId: null, assignedBusId: null };
      },
      revokeRefreshTokens: async () => {
        state.events.push("revoke"); if (state.revocationGate) await state.revocationGate;
        if (state.fail === "revoke") throw Error("revocation unavailable");
      },
    },
  };
});
import { authorizationIsCurrent, publishUserAuthorization } from "./userAuthorization";

beforeEach(() => {
  state.firestore = state.realtime = { role: "admin", version: "old", driverId: null, assignedBusId: null };
  state.claims = { role: "admin", authorizationVersion: "old" }; state.events = []; state.fail = ""; state.revocationGate = null;
  state.supersede = false;
});

describe("cross-database authorization publication", () => {
  it("invalidates both products before claims and revocation, then publishes matching versions", async () => {
    await publishUserAuthorization("uid", { role: "driver", driverId: "driver", assignedBusId: "bus" });
    expect(state.events.slice(0, 4)).toEqual(["firestore:blocked", "realtime:blocked", "revoke", "claims"]);
    expect(state.events.slice(4).sort()).toEqual(["firestore:driver", "realtime:driver"]);
    expect(state.firestore).toEqual(state.realtime);
    expect(state.firestore?.version).toBe(state.claims.authorizationVersion);
    expect(await authorizationIsCurrent("uid", state.claims)).toBe(true);
    expect(await authorizationIsCurrent("uid", { role: "admin", authorizationVersion: "old" })).toBe(false);
  });
  it.each(["firestore:blocked", "realtime:blocked", "claims", "revoke", "firestore:driver", "realtime:driver"])("reports %s failures and repairs them on retry", async fail => {
    state.fail = fail;
    await expect(publishUserAuthorization("uid", { role: "driver", driverId: "driver", assignedBusId: "bus" })).rejects.toThrow();
    expect(await authorizationIsCurrent("uid", { role: "driver", ...state.claims })).toBe(false);
    if (!fail.endsWith(":blocked")) {
      expect(state.firestore?.role).toBe("blocked"); expect(state.realtime?.role).toBe("blocked");
    } else expect(state.events).not.toContain("claims");
    state.fail = "";
    await publishUserAuthorization("uid", { role: "driver", driverId: "driver", assignedBusId: "bus" });
    expect(await authorizationIsCurrent("uid", state.claims)).toBe(true);
  });
  it("awaits revocation before exposing a new claim version, including when claims fail", async () => {
    state.fail = "claims";
    let release!: () => void; state.revocationGate = new Promise(resolve => { release = resolve; });
    let settled = false;
    const publication = publishUserAuthorization("uid", { role: "passenger" }).catch(() => { settled = true; });
    await vi.waitFor(() => expect(state.events).toContain("revoke"));
    expect(settled).toBe(false); expect(state.events).not.toContain("claims");
    release(); await publication; expect(settled).toBe(true); expect(state.events).toContain("claims");
  });
  it("never reuses versions across demotion and restoration of the same privilege", async () => {
    const old = { ...state.claims };
    await publishUserAuthorization("uid", { role: "passenger" });
    const demoted = state.claims.authorizationVersion;
    await publishUserAuthorization("uid", { role: "admin", admin: true });
    expect(state.claims.authorizationVersion).not.toBe(demoted);
    expect(await authorizationIsCurrent("uid", old)).toBe(false);
  });
  it("preserves a newer authorization change during activation and rollback", async () => {
    state.supersede = true;
    await expect(publishUserAuthorization("uid", { role: "admin", admin: true })).rejects.toThrow("superseded");
    expect(state.firestore).toMatchObject({ role: "passenger", version: "newer" });
    expect(state.realtime).toEqual(state.firestore);
    expect(await authorizationIsCurrent("uid", state.claims)).toBe(false);
  });
  it("recognizes unassigned authorization despite RTDB omitting null fields", async () => {
    state.firestore = { role: "driver", version: "unassigned", driverId: null, assignedBusId: null };
    state.realtime = { role: "driver", version: "unassigned" };
    expect(await authorizationIsCurrent("uid", { role: "driver", authorizationVersion: "unassigned" })).toBe(true);
  });
});
