// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./useAuth";
import { beginAuthVerification, waitForAuth } from "@/lib/authState";
type TestUser = { uid: string; getIdTokenResult: () => Promise<{ claims: { role: string } }> };
const mocks = vi.hoisted(() => ({
  callback: null as null | ((user: TestUser | null) => Promise<void>),
  auth: { currentUser: null as TestUser | null }, check: vi.fn(), observe: vi.fn(),
}));
vi.mock("@/lib/firebaseAuth", () => ({ auth: mocks.auth, googleProvider: {} }));
vi.mock("@/lib/firebaseAppCheck", () => ({ ensureAppCheck: mocks.check }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: mocks.observe, setPersistence: async () => {}, browserLocalPersistence: {},
  getRedirectResult: async () => null, signInWithPopup: vi.fn(), signInWithRedirect: vi.fn(), signOut: vi.fn(),
}));
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
const user = (uid: string): TestUser => ({ uid, getIdTokenResult: async () => ({ claims: { role: "admin" } }) });
beforeEach(() => {
  beginAuthVerification(); vi.clearAllMocks(); mocks.callback = null; mocks.auth.currentUser = null;
  mocks.check.mockResolvedValue(undefined); mocks.observe.mockImplementation((_auth, callback) => { mocks.callback = callback; return () => {}; });
  localStorage.clear(); vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
async function mount() { const hook = renderHook(() => useAuth(), { wrapper: AuthProvider }); await waitFor(() => expect(mocks.callback).not.toBeNull()); return hook; }
describe("verified auth publication", () => {
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
