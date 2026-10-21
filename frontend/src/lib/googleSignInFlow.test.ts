// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeGoogleRedirectPending, markGoogleRedirectPending, prefersGoogleRedirect } from "./googleSignInFlow";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("Google OAuth flow selection", () => {
  it("keeps desktop browsers on the popup flow", () => {
    expect(prefersGoogleRedirect(window.location.host)).toBe(false);
  });
  it("recognizes iPad desktop mode and iOS installed mode", () => {
    vi.stubGlobal("navigator", { userAgent: "Desktop", platform: "MacIntel", maxTouchPoints: 5 });
    expect(prefersGoogleRedirect(window.location.host)).toBe(true);
    vi.stubGlobal("navigator", { userAgent: "Desktop", standalone: true });
    expect(prefersGoogleRedirect(window.location.host)).toBe(true);
  });
  it("does not force cross-origin redirects where storage partitioning would lose the session", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android");
    expect(prefersGoogleRedirect("another-project.firebaseapp.com")).toBe(false);
    expect(prefersGoogleRedirect(undefined)).toBe(false);
  });
  it("treats the redirect marker as single-use and tolerates blocked storage", () => {
    markGoogleRedirectPending();
    expect(consumeGoogleRedirectPending()).toBe(true);
    expect(consumeGoogleRedirectPending()).toBe(false);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => markGoogleRedirectPending()).not.toThrow();
    expect(consumeGoogleRedirectPending()).toBe(false);
  });
});
