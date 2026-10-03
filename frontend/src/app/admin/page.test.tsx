// @vitest-environment jsdom
import { lazy, Suspense, type ComponentType } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import AdminPage from "./page";
vi.mock("next/dynamic", () => ({ default: (loader: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) => {
  const Loaded = lazy(loader);
  return function TestDynamic(props: Record<string, unknown>) { return <Suspense fallback="Loading panel"><Loaded {...props} /></Suspense>; };
} }));
vi.mock("@/components/admin/DashboardPanel", () => ({ default: () => <p>Operations content</p> }));
vi.mock("@/components/admin/RouteManagementPanel", () => ({ default: () => <p>Routes content</p> }));
vi.mock("@/components/admin/FleetManagementPanel", () => ({ default: () => <p>Fleet content</p> }));
vi.mock("@/components/admin/RideHistoryPanel", () => ({ default: () => <p>History content</p> }));
vi.mock("@/components/admin/FeedbackPanel", () => ({ default: () => <p>Feedback content</p> }));
vi.mock("@/components/admin/SettingsPanel", () => ({ default: () => <p>Settings content</p> }));
afterEach(cleanup);
describe("all administration sections", () => {
  it.each([
    ["Live Ops", "Operations"], ["Routes", "Routes"], ["Fleet & People", "Fleet"],
    ["History", "History"], ["Feedback", "Feedback"], ["Settings", "Settings"],
  ])("opens %s with the matching panel and selection state", async (label, content) => {
    render(<AdminPage />); const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: label }));
    expect(await screen.findByText(`${content} content`)).toBeTruthy();
    expect(screen.getByRole("tab", { name: label }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(screen.getByRole("tab", { name: label }).id);
    expect(screen.getAllByRole("tab").filter(tab => tab.getAttribute("tabindex") === "0")).toHaveLength(1);
  });
  it("navigates with arrow keys, Home and End, wrapping between the first and last tabs", async () => {
    render(<AdminPage />); const user=userEvent.setup();
    screen.getByRole("tab", { name: "Live Ops" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Settings" }));
    await screen.findByText("Settings content");
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Live Ops" }));
    await user.keyboard("{End}"); expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Settings" }));
    await user.keyboard("{Home}"); expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Live Ops" }));
  });
});
