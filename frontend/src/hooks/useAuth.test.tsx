// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./useAuth";
import { beginAuthVerification, waitForAuth } from "@/lib/authState";
type TestUser = { uid: string; getIdToken?: () => Promise<string>; getIdTokenResult: (forceRefresh?: boolean) => Promise<{ claims: { role: string; admin?: boolean } }> };
const mocks = vi.hoisted(() => ({
  callback: null as null | ((user: TestUser | null) => Promise<void>),
  auth: { currentUser: null as TestUser | null }, claims: vi.fn(), observe: vi.fn(), signOut: vi.fn(),
  profile: vi.fn(), bootstrap: vi.fn(),
}));
vi.mock("@/lib/firebaseAuth", () => ({ auth: mocks.auth, googleProvider: {} }));
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
const user = (uid: string): TestUser => ({ uid, getIdTokenResult: async () => { await mocks.claims(); return { claims: { role: "admin", admin: true } }; } });
beforeEach(() => {
  // Profile-only scenarios must not inherit a developer/build backend URL.
  // Bootstrap scenarios opt in below and keep HTTP transport mocked.
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "");
  beginAuthVerification(); vi.clearAllMocks(); mocks.callback = null; mocks.auth.currentUser = null;
  mocks.claims.mockResolvedValue(undefined); mocks.observe.mockImplementation((_auth, callback) => { mocks.callback = callback; return () => {}; });
  mocks.profile.mockResolvedValue({ exists: () => false }); mocks.bootstrap.mockResolvedValue({ role: "passenger" });
  localStorage.clear(); vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function mount() { const hook = renderHook(() => useAuth(), { wrapper: AuthProvider }); await waitFor(() => expect(mocks.callback).not.toBeNull()); return hook; }
describe("verified auth publication", () => {
  it("recovers transient access with bounded backoff and current trusted claims without relogin", async () => {
    const hook = await mount(); vi.useFakeTimers();
    const account = { uid: "recovering", getIdTokenResult: vi.fn()
      .mockRejectedValueOnce({ code: "auth/network-request-failed" })
      .mockResolvedValue({ claims: { role: "passenger" } }) };
    mocks.auth.currentUser = account;
    const opened = vi.fn(); void waitForAuth().then(opened);
    await act(async () => { await mocks.callback!(account); });
    expect(hook.result.current.user).toBeNull(); expect(opened).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(account.getIdTokenResult).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(hook.result.current.user?.role).toBe("passenger");
    expect(hook.result.current.roleError).toBeNull(); expect(opened).toHaveBeenCalledOnce();
    expect(account.getIdTokenResult).toHaveBeenLastCalledWith(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); window.dispatchEvent(new Event("online")); });
    expect(account.getIdTokenResult).toHaveBeenCalledTimes(2);
  });
  it.each(["permission-denied", "auth/user-disabled", "auth/user-token-expired"])("does not automatically retry %s or reopen access", async code => {
    const hook = await mount(); vi.useFakeTimers();
    mocks.claims.mockRejectedValue({ code }); const account = user("denied"); mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); await vi.advanceTimersByTimeAsync(600_000);
      window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")); });
    expect(mocks.claims).toHaveBeenCalledOnce(); expect(hook.result.current.user).toBeNull();
    expect(hook.result.current.roleError).toBeTruthy();
  });
  it("pauses a transient retry offline and coalesces online, visible and manual recovery", async () => {
    const hook = await mount(); vi.useFakeTimers();
    const connection = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mocks.claims.mockRejectedValueOnce({ code: "auth/network-request-failed" });
    const account = user("offline"); mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); await vi.advanceTimersByTimeAsync(600_000); });
    expect(mocks.claims).toHaveBeenCalledOnce(); expect(hook.result.current.user).toBeNull();
    const pending = deferred(); mocks.claims.mockReturnValue(pending.promise); connection.mockReturnValue(true);
    let manual!: Promise<void>;
    await act(async () => {
      window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange"));
      manual = hook.result.current.refreshAccess();
    });
    expect(mocks.claims).toHaveBeenCalledTimes(2); expect(hook.result.current.user).toBeNull();
    await act(async () => { pending.resolve(); await manual; });
    expect(hook.result.current.user?.uid).toBe("offline");
  });
  it("bounds a failed retry burst then resumes after ten minutes offline", async () => {
    const hook = await mount(); vi.useFakeTimers();
    mocks.claims.mockRejectedValue({ code: "unavailable" }); const account = user("long-outage"); mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); await vi.advanceTimersByTimeAsync(600_000); });
    expect(mocks.claims).toHaveBeenCalledTimes(7); expect(hook.result.current.user).toBeNull();
    mocks.claims.mockResolvedValue(undefined);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(hook.result.current.user?.uid).toBe("long-outage"); expect(mocks.claims).toHaveBeenCalledTimes(8);
  });
  it("stops automatic recovery if the next trusted request reveals revoked access", async () => {
    const hook = await mount(); vi.useFakeTimers();
    mocks.claims.mockRejectedValueOnce({ code: "auth/network-request-failed" })
      .mockRejectedValue({ code: "auth/user-token-expired" });
    const account = user("revoked-after-outage"); mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); await vi.advanceTimersByTimeAsync(600_000);
      window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")); });
    expect(mocks.claims).toHaveBeenCalledTimes(2);
    expect(hook.result.current.user).toBeNull(); expect(hook.result.current.roleError).toBeTruthy();
  });
  it("pauses retries while hidden and recovers only on visible resume", async () => {
    const hook = await mount(); vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    mocks.claims.mockRejectedValueOnce({ code: "deadline-exceeded" }); const account = user("hidden"); mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); await vi.advanceTimersByTimeAsync(60_000); window.dispatchEvent(new Event("online")); });
    expect(mocks.claims).toHaveBeenCalledOnce();
    visibility.mockReturnValue("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(hook.result.current.user?.uid).toBe("hidden");
  });
  it("discards a timed-out verification after a successful retry", async () => {
    const hook = await mount(); vi.useFakeTimers();
    let resolveOld!: (value: { claims: { role: string; admin?: boolean } }) => void;
    const account = { uid: "timeout", getIdTokenResult: vi.fn()
      .mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValue({ claims: { role: "passenger" } }) };
    mocks.auth.currentUser = account;
    let verifying!: Promise<void>;
    await act(async () => { verifying = mocks.callback!(account); await vi.advanceTimersByTimeAsync(10_000); await verifying; });
    expect(hook.result.current.user).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(hook.result.current.user?.role).toBe("passenger");
    await act(async () => { resolveOld({ claims: { role: "admin", admin: true } }); });
    expect(hook.result.current.user?.role).toBe("passenger");
  });
  it("cancels queued automatic recovery on sign-out, account change and unmount", async () => {
    const hook = await mount(); vi.useFakeTimers();
    mocks.claims.mockRejectedValue({ code: "unavailable" });
    const first = user("first"); mocks.auth.currentUser = first;
    await act(async () => { await mocks.callback!(first); });
    mocks.auth.currentUser = null;
    await act(async () => { await mocks.callback!(null); await vi.advanceTimersByTimeAsync(60_000); });
    expect(mocks.claims).toHaveBeenCalledOnce(); expect(hook.result.current.user).toBeNull();
    const second = user("second"); mocks.auth.currentUser = second;
    await act(async () => { await mocks.callback!(second); });
    mocks.claims.mockResolvedValue(undefined); const third = user("third"); mocks.auth.currentUser = third;
    await act(async () => { await mocks.callback!(third); await vi.advanceTimersByTimeAsync(60_000); });
    expect(mocks.claims).toHaveBeenCalledTimes(3); expect(hook.result.current.user?.uid).toBe("third");
    mocks.claims.mockRejectedValue({ code: "unavailable" });
    await act(async () => { await hook.result.current.refreshAccess(); });
    hook.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); window.dispatchEvent(new Event("online")); });
    expect(mocks.claims).toHaveBeenCalledTimes(4);
  });
  it.each(["admin", "driver"])("never grants %s access from a Firestore profile without matching trusted claims", async role => {
    mocks.profile.mockResolvedValue({ exists: () => true, data: () => ({ role }) });
    const hook = await mount();
    const account = { uid: "legacy-profile", getIdToken: async () => "synthetic", getIdTokenResult: async () => ({ claims: { role: "" } }) };
    mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); });
    expect(hook.result.current.user).toBeNull();
    expect(hook.result.current.roleError).toContain("trusted Auth claim synchronization");
  });
  it.each(["admin", "driver"])("never grants %s access from a bootstrap response without matching trusted claims", async role => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://auth-fixture.example.invalid");
    mocks.profile.mockResolvedValue({ exists: () => true, data: () => ({ role: "passenger" }) });
    mocks.bootstrap.mockResolvedValue({ role });
    const hook = await mount();
    const account = { uid: "bootstrap-profile", getIdToken: async () => "synthetic", getIdTokenResult: async () => ({ claims: { role: "" } }) };
    mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); });
    expect(mocks.bootstrap).toHaveBeenCalledOnce();
    expect(hook.result.current.user).toBeNull();
    expect(hook.result.current.roleError).toContain("trusted Auth claim synchronization");
  });
  it.each(["admin", "driver"])("accepts authoritative Passenger bootstrap instead of a legacy %s profile", async role => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://auth-fixture.example.invalid");
    mocks.profile.mockResolvedValue({ exists: () => true, data: () => ({ role }) });
    const hook = await mount();
    const account = { uid: "bootstrap-passenger", getIdToken: async () => "synthetic", getIdTokenResult: async () => ({ claims: { role: "" } }) };
    mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); });
    expect(mocks.bootstrap).toHaveBeenCalledOnce();
    expect(hook.result.current.user?.role).toBe("passenger");
    expect(hook.result.current.roleError).toBeNull();
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
    const check = deferred(); mocks.claims.mockReturnValue(check.promise);
    let first!: Promise<void>, second!: Promise<void>;
    await act(async () => { first = hook.result.current.refreshAccess(); second = hook.result.current.refreshAccess(); await Promise.resolve(); });
    expect(first).toBe(second); expect(hook.result.current.user).toBeNull(); expect(hook.result.current.loading).toBe(true);
    expect(mocks.claims).toHaveBeenCalledTimes(2);
    await act(async () => { check.resolve(); await first; }); expect(hook.result.current.user?.uid).toBe("admin");
  });
  it("keeps pending verification from republishing access during sign-out", async () => {
    const check = deferred(), signOut = deferred(); mocks.claims.mockReturnValue(check.promise); mocks.signOut.mockReturnValue(signOut.promise);
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
  it("does not publish cached/admin identity or open readiness before trusted role verification", async () => {
    const check = deferred(); mocks.claims.mockReturnValue(check.promise); localStorage.setItem("eki:role:admin", "admin");
    const hook = await mount(); const opened = vi.fn(); void waitForAuth().then(opened);
    const account = user("admin"); mocks.auth.currentUser = account;
    let callback!: Promise<void>; await act(async () => { callback = mocks.callback!(account); await Promise.resolve(); });
    expect(hook.result.current.user).toBeNull(); expect(hook.result.current.loading).toBe(true); expect(opened).not.toHaveBeenCalled();
    await act(async () => { check.resolve(); await callback; });
    expect(hook.result.current.user?.role).toBe("admin"); expect(opened).toHaveBeenCalledOnce();
  });
  it("keeps role verification failures visible and data readiness closed", async () => {
    mocks.claims.mockRejectedValue(new Error("role verification unavailable"));
    const hook = await mount(); const opened = vi.fn(); void waitForAuth().then(opened);
    const account = user("admin"); mocks.auth.currentUser = account;
    await act(async () => { await mocks.callback!(account); });
    expect(hook.result.current.user).toBeNull(); expect(hook.result.current.roleError).toContain("We could not verify your access");
    expect(hook.result.current.loading).toBe(false); expect(opened).not.toHaveBeenCalled();
    mocks.claims.mockResolvedValue(undefined); await act(async () => { await mocks.callback!(account); });
    expect(hook.result.current.roleError).toBeNull(); expect(hook.result.current.user?.uid).toBe("admin");
  });
  it("discards a token completion after sign-out", async () => {
    const check = deferred(); mocks.claims.mockReturnValue(check.promise); const hook = await mount();
    const account = user("admin"); mocks.auth.currentUser = account;
    let pending!: Promise<void>; await act(async () => { pending = mocks.callback!(account); await Promise.resolve(); });
    mocks.auth.currentUser = null; await act(async () => { await mocks.callback!(null); check.resolve(); await pending; });
    expect(hook.result.current.user).toBeNull(); expect(hook.result.current.loading).toBe(false);
  });
  it("discards old-account completion during a switch", async () => {
    const old = deferred(); mocks.claims.mockReturnValueOnce(old.promise).mockResolvedValue(undefined); const hook = await mount();
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
