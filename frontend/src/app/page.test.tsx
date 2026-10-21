// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

const fixture = vi.hoisted(() => ({
  auth: { user: null as null | { role: string }, loading: true, loginReady: true,
    loginFallbackAvailable: false, loginLoading: false, roleError: null,
    loginError: null, loginWithGoogle: vi.fn(), loginWithGoogleRedirect: vi.fn(), refreshAccess: vi.fn() },
  replace: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => fixture.auth }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: fixture.replace }) }));
beforeEach(() => {
  Object.assign(fixture.auth, { user: null, loading: true, loginReady: true, loginFallbackAvailable: false });
  fixture.replace.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("landing sign-in and redirect recovery", () => {
  it("enables sign-in when ready and shows redirect fallback only after a popup failure", () => {
    const { rerender } = render(<HomePage />);
    expect((screen.getByRole("button", { name: "Sign In with Google" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: /Continue with full-page/ })).toBeNull();
    fixture.auth.loginFallbackAvailable = true;
    rerender(<HomePage />);
    expect(screen.getByRole("button", { name: /Continue with full-page/ })).toBeTruthy();
  });
  it("offers reload after ten seconds if opening the workspace stalls", async () => {
    vi.useFakeTimers();
    fixture.auth.user = { role: "passenger" }; fixture.auth.loading = false;
    render(<HomePage />);
    expect(fixture.replace).toHaveBeenCalledWith("/passenger");
    expect(screen.queryByRole("button", { name: "Try reloading" })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByRole("button", { name: "Try reloading" })).toBeTruthy();
  });
  it.each([ ["admin", "/admin"], ["passenger", "/passenger"] ])(
    "waits for verification before routing a returned %s account", (role, workspace) => {
      localStorage.clear();
      fixture.auth.user = { role };
      const { rerender } = render(<HomePage />);
      expect(fixture.replace).not.toHaveBeenCalled();
      fixture.auth.loading = false;
      rerender(<HomePage />);
      expect(fixture.replace).toHaveBeenCalledWith(workspace);
    },
  );
});
