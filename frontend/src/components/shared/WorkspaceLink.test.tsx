// @vitest-environment jsdom
import type { AnchorHTMLAttributes } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
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
afterEach(() => { cleanup(); state.pending = false; state.prefetch.mockClear(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("workspace navigation feedback", () => {
  it("falls back once to a plain same-origin document link when client navigation stalls", async () => {
    vi.useFakeTimers(); state.pending = true;
    const nativeClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<WorkspaceLink href="/admin">Admin Panel</WorkspaceLink>);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(nativeClick).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(nativeClick).toHaveBeenCalledOnce();
    const fallback = nativeClick.mock.instances[0] as HTMLAnchorElement;
    expect(fallback.getAttribute("href")).toBe("/admin");
    expect(fallback).not.toBe(screen.getByRole("link"));
  });
  it("cancels fallback after successful navigation and never forces an external or new-tab link", async () => {
    vi.useFakeTimers(); state.pending = true;
    const nativeClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const view = render(<WorkspaceLink href="/admin">Admin Panel</WorkspaceLink>);
    state.pending = false;
    view.rerender(<WorkspaceLink href="/admin">Admin Panel</WorkspaceLink>);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(nativeClick).not.toHaveBeenCalled();
    state.pending = true;
    view.rerender(<WorkspaceLink href="https://example.org/admin">Admin Panel</WorkspaceLink>);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    view.rerender(<WorkspaceLink href="/admin" target="_blank">Admin Panel</WorkspaceLink>);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(nativeClick).not.toHaveBeenCalled();
  });
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
