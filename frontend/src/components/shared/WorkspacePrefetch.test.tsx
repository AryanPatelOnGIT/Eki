// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkspacePrefetch from "./WorkspacePrefetch";

const state = vi.hoisted(() => ({
  user: { role: "passenger" } as { role: string } | null,
  loading: false,
  roleError: null as string | null,
  router: { prefetch: vi.fn() },
  downloaded: [] as string[],
  mounted: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state }));
vi.mock("next/navigation", () => ({ useRouter: () => state.router }));
vi.mock("@/components/admin/DashboardPanel", () => {
  state.downloaded.push("dashboard");
  return { default: state.mounted };
});
vi.mock("@/components/MapProviders", () => {
  state.downloaded.push("maps");
  return { default: state.mounted };
});
vi.mock("@/components/passenger/PassengerWorkspace", () => {
  state.downloaded.push("passenger");
  return { default: state.mounted };
});

beforeEach(() => {
  state.user = { role: "passenger" };
  state.loading = false;
  state.roleError = null;
  state.router.prefetch.mockClear();
  state.mounted.mockClear();
  localStorage.clear();
});
afterEach(cleanup);

describe("workspace prefetch authorization", () => {
  it.each(["passenger", "driver", "", null])("does not warm admin code for role %s, even with forged browser storage", async role => {
    const downloadedBefore = [...state.downloaded];
    state.user = role === null ? null : { role };
    localStorage.setItem("eki:role:qa-user", "admin");
    localStorage.setItem("eki:last-workspace", "/admin");
    render(<WorkspacePrefetch destination="/admin" />);
    await Promise.resolve();
    expect(state.router.prefetch).not.toHaveBeenCalled();
    expect(state.downloaded).toEqual(downloadedBefore);
  });

  it.each(["loading", "error"])("does not warm either workspace while verification has a %s state", async condition => {
    const downloadedBefore = [...state.downloaded];
    state.user = { role: "admin" };
    state.loading = condition === "loading";
    state.roleError = condition === "error" ? "Claims unavailable" : null;
    render(<><WorkspacePrefetch destination="/admin" /><WorkspacePrefetch destination="/passenger" /></>);
    await Promise.resolve();
    expect(state.router.prefetch).not.toHaveBeenCalled();
    expect(state.downloaded).toEqual(downloadedBefore);
  });

  it("warms the admin route and its lazy UI as soon as verification completes, without mounting private reads", async () => {
    state.loading = true;
    state.user = { role: "admin" };
    const view = render(<WorkspacePrefetch destination="/admin" />);
    expect(state.router.prefetch).not.toHaveBeenCalled();
    state.loading = false;
    view.rerender(<WorkspacePrefetch destination="/admin" />);
    expect(state.router.prefetch).toHaveBeenCalledExactlyOnceWith("/admin");
    await waitFor(() => expect(state.downloaded).toEqual(expect.arrayContaining(["dashboard", "maps"])));
    expect(state.mounted).not.toHaveBeenCalled();
    view.rerender(<WorkspacePrefetch destination="/admin" />);
    expect(state.router.prefetch).toHaveBeenCalledTimes(1);
  });

  it("warms the passenger route and its lazy workspace for a verified admin without mounting it", async () => {
    state.user = { role: "admin" };
    render(<WorkspacePrefetch destination="/passenger" />);
    expect(state.router.prefetch).toHaveBeenCalledExactlyOnceWith("/passenger");
    await waitFor(() => expect(state.downloaded).toContain("passenger"));
    expect(state.mounted).not.toHaveBeenCalled();
  });
});
