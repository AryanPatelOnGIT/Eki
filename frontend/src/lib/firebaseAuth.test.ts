import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ app: {}, auth: {}, initialize: vi.fn() }));
vi.mock("./firebaseCore", () => ({ firebaseApp: fixture.app }));
vi.mock("firebase/auth", () => ({
  initializeAuth: fixture.initialize.mockReturnValue(fixture.auth),
  browserLocalPersistence: { type: "LOCAL" },
  indexedDBLocalPersistence: { type: "INDEXED_DB" },
  browserSessionPersistence: { type: "SESSION" },
  browserPopupRedirectResolver: {},
  GoogleAuthProvider: class {},
}));

describe("Firebase Auth initialization", () => {
  it("restores local persistence first without switching an existing tab to another store", async () => {
    const sdk = await import("firebase/auth");
    const { auth, googleProvider } = await import("./firebaseAuth");
    expect(fixture.initialize).toHaveBeenCalledExactlyOnceWith(fixture.app, {
      persistence: [sdk.browserLocalPersistence, sdk.indexedDBLocalPersistence, sdk.browserSessionPersistence],
      popupRedirectResolver: sdk.browserPopupRedirectResolver,
    });
    expect(auth).toBe(fixture.auth);
    expect(googleProvider).toBeInstanceOf(sdk.GoogleAuthProvider);
  });
});
