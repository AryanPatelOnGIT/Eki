import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ initialize: vi.fn(), app: {}, auth: {}, provider: vi.fn(),
  local: {}, indexed: {}, session: {}, resolver: {} }));
vi.mock("./firebaseCore", () => ({ firebaseApp: mocks.app }));
vi.mock("firebase/auth", () => ({
  initializeAuth: mocks.initialize, browserLocalPersistence: mocks.local,
  indexedDBLocalPersistence: mocks.indexed, browserSessionPersistence: mocks.session,
  browserPopupRedirectResolver: mocks.resolver,
  GoogleAuthProvider: class { constructor() { mocks.provider(); } },
}));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.initialize.mockReturnValue(mocks.auth); });
describe("Firebase Auth initialization", () => {
  it("keeps restoration and sign-in on the same ordered persistence fallbacks", async () => {
    const result = await import("./firebaseAuth");
    expect(result.auth).toBe(mocks.auth);
    expect(mocks.initialize).toHaveBeenCalledExactlyOnceWith(mocks.app, {
      persistence: [mocks.local, mocks.indexed, mocks.session], popupRedirectResolver: mocks.resolver,
    });
    expect(mocks.provider).toHaveBeenCalledOnce();
  });
  it("shares one initialization and provider across repeat imports", async () => {
    const first = await import("./firebaseAuth"), second = await import("./firebaseAuth");
    expect(second.auth).toBe(first.auth); expect(second.googleProvider).toBe(first.googleProvider);
    expect(mocks.initialize).toHaveBeenCalledOnce(); expect(mocks.provider).toHaveBeenCalledOnce();
  });
});
