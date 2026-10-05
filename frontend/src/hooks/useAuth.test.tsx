// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./useAuth";
import { beginAuthVerification, waitForAuth } from "@/lib/authState";
type TestUser = { uid: string; getIdToken?: () => Promise<string>; getIdTokenResult: (forceRefresh?: boolean) => Promise<{ claims: { role: string; admin?: boolean } }> };
const mocks = vi.hoisted(() => ({
  callback: null as null | ((user: TestUser | null) => Promise<void>),
  auth: { currentUser: null as TestUser | null }, check: vi.fn(), observe: vi.fn(), signOut: vi.fn(),
  profile: vi.fn(), bootstrap: vi.fn(),
}));
vi.mock("@/lib/firebaseAuth", () => ({ auth: mocks.auth, googleProvider: {} }));
vi.mock("@/lib/firebaseAppCheck", () => ({ ensureAppCheck: mocks.check }));
vi.mock("@/lib/apiClient", () => ({ apiRequest: mocks.bootstrap }));
vi.mock("@/lib/firebaseCore", () => ({ firebaseApp: {} }));
vi.mock("firebase/firestore", () => ({ getFirestore: () => ({}), doc: vi.fn(), getDoc: mocks.profile }));
vi.mock("@/hooks/useCollection", () => ({ clearCollectionCache: vi.fn() }));
vi.mock("@/hooks/useSettings", () => ({ clearSettingsCache: vi.fn() }));
vi.mock("@/lib/liveBusStore", () => ({ invalidateLiveBusCache: vi.fn() }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: mocks.observe, setPersistence: async () => {}, browserLocalPersistence: {},
  getRedirectResult: async () => null, signInWithPopup: vi.fn(), signInWithRedirect: vi.fn(), signOut: mocks.signOut,
}));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
const user = (uid: string): TestUser => ({ uid, getIdTokenResult: async () => ({ claims: { role: "admin", admin: true } }) });
beforeEach(() => {
  beginAuthVerification(); vi.clearAllMocks(); mocks.callback = null; mocks.auth.currentUser = null;
  mocks.check.mockResolvedValue(undefined); mocks.observe.mockImplementation((_auth, callback) => { mocks.callback = callback; return () => {}; });
  mocks.profile.mockResolvedValue({ exists: () => false }); mocks.bootstrap.mockResolvedValue({ role: "passenger" });
  localStorage.clear(); vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function mount() { const hook = renderHook(() => useAuth(), { wrapper: AuthProvider }); await waitFor(() => expect(mocks.callback).not.toBeNull()); return hook; }
describe("verified auth publication", () => {
  it.each(["admin", "driver"])("never grants %s access from a Firestore profile without matching trusted claims", async role => {
    mocks.profile.mockResolvedValue({ exists: () => true, data: () => ({ role }) });
    const hook = await mount();
    const account = { uid: "legacy-profile", getIdToken: async () => "synthetic", getIdTokenResult: async () => ({ claims: { role: "" } }) };
    mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); });
    expect(hook.result.current.user).toBeNull();
    expect(hook.result.current.roleError).toContain("trusted Auth claim synchronization");
  });
  it("observes a revoked admin role during manual access refresh", async () => {
    const hook = await mount(); const getIdTokenResult = vi.fn().mockResolvedValue({ claims: { role: "admin", admin: true } });
    const account = { uid: "downgraded", getIdTokenResult }; mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); });
    getIdTokenResult.mockResolvedValue({ claims: { role: "passenger" } });
    await act(async () => { await hook.result.current.refreshAccess(); });
    expect(hook.result.current.user?.role).toBe("passenger");
    expect(getIdTokenResult).toHaveBeenLastCalledWith(true);
  });
  it("refreshes a persisted passenger token to the current trusted admin claims before publishing access", async () => {
    const hook = await mount();
    const getIdTokenResult = vi.fn(async (forceRefresh?: boolean) => ({ claims: forceRefresh ? { role: "admin", admin: true } : { role: "passenger" } }));
    const account = { uid: "second-admin", getIdTokenResult }; mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); });
    expect(getIdTokenResult).toHaveBeenCalledWith(true);
    expect(hook.result.current.user?.role).toBe("admin");
  });
  it("does not publish admin access from a role string without the trusted admin bit", async () => {
    const hook = await mount(); const account = { uid: "partial-admin", getIdTokenResult: async () => ({ claims: { role: "admin" } }) }; mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); });
    expect(hook.result.current.user).toBeNull(); expect(hook.result.current.roleError).toContain("administrator");
  });
  it("coalesces simultaneous access retries, closes the old data gate and forces new security verification", async () => {
    const hook = await mount(); const account = user("admin"); mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); });
    const check = deferred(); mocks.check.mockReturnValue(check.promise);
    let first!: Promise<void>, second!: Promise<void>;
    await act(async () => { first = hook.result.current.refreshAccess(); second = hook.result.current.refreshAccess(); await Promise.resolve(); });
    expect(first).toBe(second); expect(hook.result.current.user).toBeNull(); expect(hook.result.current.loading).toBe(true);
    expect(mocks.check).toHaveBeenLastCalledWith({ forceRefresh: true });
    await act(async () => { check.resolve(); await first; }); expect(hook.result.current.user?.uid).toBe("admin");
  });
  it("keeps pending verification from republishing access during sign-out", async () => {
    const check = deferred(), signOut = deferred(); mocks.check.mockReturnValue(check.promise); mocks.signOut.mockReturnValue(signOut.promise);
    const hook = await mount(); const account = user("admin"); mocks.auth.currentUser = account;
    let pending!: Promise<void>, logout!: Promise<void>;
    await act(async () => { pending = mocks.callback!(account); await Promise.resolve(); });
    await act(async () => { logout = hook.result.current.logout(); await Promise.resolve(); });
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    await act(async () => { check.resolve(); await pending; });
    expect(hook.result.current.user).toBeNull();
    await act(async () => { signOut.resolve(); mocks.auth.currentUser = null; await mocks.callback!(null); await logout; });
  });
  it("shows recovery when Firebase sign-out fails instead of leaving a silent closed gate", async () => {
    const hook = await mount(); const account = user("admin"); mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); });
    mocks.signOut.mockRejectedValue(new Error("Sign-out unavailable"));
    await act(async () => { await hook.result.current.logout(); });
    expect(hook.result.current.user).toBeNull(); expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.roleError).toContain("Sign-out could not complete");
  });
  it("does not publish cached/admin identity or open readiness before App Check", async () => {
    const check = deferred(); mocks.check.mockReturnValue(check.promise); localStorage.setItem("eki:role:admin", "admin");
    const hook = await mount(); const opened = vi.fn(); void waitForAuth().then(opened);
    const account = user("admin"); mocks.auth.currentUser = account;
    let callback!: Promise<void>; await act(async () => { callback = mocks.callback!(account); await Promise.resolve(); });
    expect(hook.result.current.user).toBeNull(); expect(hook.result.current.loading).toBe(true); expect(opened).not.toHaveBeenCalled();
    await act(async () => { check.resolve(); await callback; });
    expect(hook.result.current.user?.role).toBe("admin"); expect(opened).toHaveBeenCalledOnce();
  });
  it("keeps App Check failures visible and data readiness closed", async () => {
    mocks.check.mockRejectedValue(Object.assign(new Error("security unavailable"), { name: "AppCheckVerificationError" }));
    const hook = await mount(); const opened = vi.fn(); void waitForAuth().then(opened);
    const account = user("admin"); mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); });
    expect(hook.result.current.user).toBeNull(); expect(hook.result.current.roleError).toContain("Security verification");
    expect(hook.result.current.loading).toBe(false); expect(opened).not.toHaveBeenCalled();
    mocks.check.mockResolvedValue(undefined); await act(async () => { await mocks.callback!(account); });
    expect(hook.result.current.roleError).toBeNull(); expect(hook.result.current.user?.uid).toBe("admin");
  });
  it("discards a token completion after sign-out", async () => {
    const check = deferred(); mocks.check.mockReturnValue(check.promise); const hook = await mount();
    const account = user("admin"); mocks.auth.currentUser = account;
    let pending!: Promise<void>; await act(async () => { pending = mocks.callback!(account); await Promise.resolve(); });
    mocks.auth.currentUser = null; await act(async () => { await mocks.callback!(null); check.resolve(); await pending; });
    expect(hook.result.current.user).toBeNull(); expect(hook.result.current.loading).toBe(false);
  });
  it("discards old-account completion during a switch", async () => {
    const old = deferred(); mocks.check.mockReturnValueOnce(old.promise).mockResolvedValue(undefined); const hook = await mount();
    const first = user("first"); mocks.auth.currentUser = first;
    let pending!: Promise<void>; await act(async () => { pending = mocks.callback!(first); await Promise.resolve(); });
    const second = user("second"); mocks.auth.currentUser = second;
    await act(async () => { await mocks.callback!(second); old.resolve(); await pending; });
    expect(hook.result.current.user?.uid).toBe("second");
  });
  it("does not mark an auth restoration timeout ready", async () => {
    vi.useFakeTimers(); const hook = renderHook(() => useAuth(), { wrapper: AuthProvider });
    const opened = vi.fn(); void waitForAuth().then(opened);
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(hook.result.current.roleError).toContain("timed out"); expect(opened).not.toHaveBeenCalled();
  });
});
