// @vitest-environment jsdom
import type { AnchorHTMLAttributes } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkspaceLink from "./WorkspaceLink";

const state = vi.hoisted(() => ({ pending: false, prefetch: vi.fn() }));
vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: state.pending }),
  default: ({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch: boolean }) => {
    state.prefetch(prefetch);
    return <a {...props} />;
  },
}));
afterEach(() => { cleanup(); state.pending = false; state.prefetch.mockClear(); });

describe("workspace navigation feedback", () => {
  it("prefetches the route and shows immediate feedback only while Next navigation is pending", () => {
    const view = render(<WorkspaceLink href="/admin">Admin Panel</WorkspaceLink>);
    expect(screen.getByRole("link", { name: "Admin Panel" }).getAttribute("href")).toBe("/admin");
    expect(state.prefetch).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("status")).toBeNull();

    state.pending = true;
    view.rerender(<WorkspaceLink href="/admin">Admin Panel</WorkspaceLink>);
    expect(screen.getByRole("status").textContent).toContain("Opening");
    expect(screen.getByText("Admin Panel").getAttribute("aria-hidden")).toBe("true");

    // Router completion/cancellation/back navigation must clear the indicator;
    // there is no sticky click state or timer to leave the link looking stuck.
    state.pending = false;
    view.rerender(<WorkspaceLink href="/admin">Admin Panel</WorkspaceLink>);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("link", { name: "Admin Panel" })).toBeTruthy();
  });
});
