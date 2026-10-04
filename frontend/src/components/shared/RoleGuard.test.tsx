// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import RoleGuard from "./RoleGuard";
const state = vi.hoisted(() => ({ user: { uid: "qa-user", role: "passenger" } as { uid: string; role: string } | null, loading: false, roleError: null as string | null, replace: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ ...state, logout: vi.fn() }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin", useRouter: () => ({ replace: state.replace }) }));
beforeEach(() => { state.user = { uid: "qa-user", role: "passenger" }; state.loading = false; state.roleError = null; state.replace.mockClear(); localStorage.clear(); });
afterEach(cleanup);
describe("workspace authorization UI", () => {
  it("shows security recovery even when no verified user was published", () => {
    state.user = null; state.roleError = "Security verification is unavailable.";
    render(<RoleGuard allowedRoles={["admin"]}><button>Protected admin control</button></RoleGuard>);
    expect(screen.getByRole("alert")).toBeTruthy(); expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(state.replace).not.toHaveBeenCalled(); expect(screen.queryByText("Protected admin control")).toBeNull();
  });
  it.each(["passenger", "driver"])("never mounts admin controls for a %s", role => {
    state.user!.role = role; render(<RoleGuard allowedRoles={["admin"]}><button>Protected admin control</button></RoleGuard>);
    expect(screen.queryByRole("button", { name: "Protected admin control" })).toBeNull();
    expect(localStorage.getItem("eki:last-workspace")).toBeNull();
  });
  it("redirects signed-out visitors without rendering protected children", async () => {
    state.user = null; render(<RoleGuard allowedRoles={["admin"]}><button>Protected admin control</button></RoleGuard>);
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/")); expect(screen.queryByRole("button")).toBeNull();
  });
  it("waits for role verification and fails closed on verification errors", () => {
    state.user!.role = "admin"; state.loading = true;
    const view = render(<RoleGuard allowedRoles={["admin"]}><button>Protected admin control</button></RoleGuard>);
    expect(screen.queryByRole("button", { name: "Protected admin control" })).toBeNull();
    state.loading = false; state.roleError = "claims unavailable";
    view.rerender(<RoleGuard allowedRoles={["admin"]}><button>Protected admin control</button></RoleGuard>);
    expect(screen.getByRole("alert")).toBeTruthy(); expect(screen.queryByRole("button", { name: "Protected admin control" })).toBeNull();
  });
  it("renders the authorized admin workspace", () => {
    state.user!.role = "admin"; render(<RoleGuard allowedRoles={["admin"]}><button>Protected admin control</button></RoleGuard>);
    expect(screen.getByRole("button", { name: "Protected admin control" })).toBeTruthy();
  });
});
