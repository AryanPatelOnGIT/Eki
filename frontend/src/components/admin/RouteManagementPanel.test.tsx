// @vitest-environment jsdom
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RouteManagementPanel from "./RouteManagementPanel";
import { ApiError } from "@/lib/apiClient";
const mocks = vi.hoisted(() => ({ save: vi.fn(), newId: vi.fn(), route: {
  id: "qa-route", name: "QA route", color: "#3B82F6", waypoints: [], configVersion: 2,
  stops: [{ id: "alpha", name: "Alpha", shortName: "A", lat: 23, lng: 72 }, { id: "beta", name: "Beta", shortName: "B", lat: 23.01, lng: 72.01 }],
} }));
vi.mock("@/hooks/useRoutes", () => ({ useRoutes: () => ({ routes: [mocks.route], loading: false }) }));
vi.mock("@/lib/firebaseAuth", () => ({ auth: { currentUser: { getIdToken: async () => "test-token" } } }));
vi.mock("@/lib/routeSaveClient", () => ({ saveRoute: mocks.save, newRouteSaveId: mocks.newId }));
vi.mock("@vis.gl/react-google-maps", () => ({ Map: ({ children }: { children: ReactNode }) => <div>{children}</div>, AdvancedMarker: () => null, useMap: () => null }));
vi.mock("@/components/maps/DirectionsRoute", () => ({ default: () => null }));
beforeEach(() => { mocks.save.mockReset(); mocks.newId.mockReset().mockReturnValue("qa-save-operation"); });
afterEach(cleanup);
async function edit() { render(<RouteManagementPanel />); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Edit route QA route" })); return user; }
describe("route editing and operation recovery", () => {
  it("provides labels and selection state for route fields and colour controls", async () => {
    const user = await edit();
    expect((screen.getByLabelText("Route ID") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Display Name") as HTMLInputElement).value).toBe("QA route");
    const green = screen.getByRole("button", { name: "Route colour #10B981" });
    await user.click(green); expect(green.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Route colour #3B82F6" }).getAttribute("aria-pressed")).toBe("false");
  });
  it("swaps endpoints and cancels the draft without changing the original route", async () => {
    const user = await edit(); await user.click(screen.getByRole("button", { name: "Swap A & B" }));
    expect(screen.getAllByRole("button", { name: /^(Alpha|Beta)/ }).map(button => button.textContent?.split(/\d/)[0].trim())).toEqual(["Beta", "Alpha"]);
    await user.click(screen.getByRole("button", { name: "Cancel route editing" }));
    await user.click(screen.getByRole("button", { name: "Edit route QA route" }));
    expect(screen.getAllByRole("button", { name: /^(Alpha|Beta)/ }).map(button => button.textContent?.split(/\d/)[0].trim())).toEqual(["Alpha", "Beta"]);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("disables save after removing a stop and never deploys an empty route", async () => {
    const user = await edit(); await user.click(screen.getByRole("button", { name: "Remove stop Beta" }));
    expect((screen.getByRole("button", { name: "Update" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancel route editing" }));
    await user.click(screen.getByRole("button", { name: "Add Route" }));
    expect((screen.getByRole("button", { name: "Deploy" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("reconciles a failed save using the same operation ID and expected version", async () => {
    mocks.save.mockRejectedValueOnce(new ApiError("response lost", "NETWORK_TIMEOUT", null, "network", true)).mockResolvedValueOnce({ saved: true });
    const user = await edit(); await user.click(screen.getByRole("button", { name: "Update" }));
    await screen.findByText(/response lost/); await user.click(screen.getByRole("button", { name: "OK" }));
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(await screen.findByText("Route updated!")).toBeTruthy();
    expect(mocks.newId).toHaveBeenCalledOnce();
    expect(mocks.save.mock.calls.map(call => call[1])).toEqual(["qa-save-operation", "qa-save-operation"]);
    expect(mocks.save.mock.calls[1][2]).toMatchObject({ expectedVersion: 2 });
  });
  it("cancel never deletes a route", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); render(<RouteManagementPanel />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete route QA route" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
});
