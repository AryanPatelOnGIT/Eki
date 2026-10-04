// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FleetManagementPanel from "./FleetManagementPanel";
vi.mock("@/hooks/useBuses", () => ({ useBuses: () => ({ buses: [{ id: "qa-bus", name: "QA Bus", assignedRoutes: ["qa-route"] }], loading: false }) }));
vi.mock("@/hooks/useDrivers", () => ({ useDrivers: () => ({ drivers: [{ id: "qa-driver", name: "QA Driver", authUid: "qa-driver-uid", busId: "qa-bus" }], loading: false }) }));
vi.mock("@/hooks/useRoutes", () => ({ useRoutes: () => ({ routes: [{ id: "qa-route", name: "QA route" }], loading: false }) }));
vi.mock("@/hooks/useActiveBuses", () => ({ useActiveBuses: () => [] }));
vi.mock("@/lib/firebaseAuth", () => ({ auth: { currentUser: { getIdToken: async () => "test-token" } } }));
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://qa.ngrok-free.dev"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("fleet and personnel controls", () => {
  it("validates empty vehicle and operator forms before any API call", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); render(<FleetManagementPanel />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add new vehicle" })); expect(screen.getByText("Vehicle ID is required.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Dismiss error" }));
    await user.click(screen.getByRole("button", { name: "Add new operator" })); expect(screen.getByText("Operator ID is required.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["vehicle QA Bus", "operator QA Driver"])("cancels deletion of %s without a write", async target => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); render(<FleetManagementPanel />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: `Delete ${target}` }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cancels inline edits and collapses/reopens saved vehicle and operator lists", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); render(<FleetManagementPanel />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit vehicle QA Bus" }));
    await user.clear(screen.getByLabelText("Edit vehicle display name")); await user.type(screen.getByLabelText("Edit vehicle display name"), "Unsaved vehicle");
    await user.click(screen.getByRole("button", { name: "Cancel editing vehicle" }));
    await user.click(screen.getByRole("button", { name: "Collapse saved vehicles" }));
    expect(screen.queryByRole("button", { name: "Edit vehicle QA Bus" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Expand saved vehicles" }));
    expect(screen.getByRole("button", { name: "Edit vehicle QA Bus" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Edit operator QA Driver" }));
    await user.click(screen.getByRole("button", { name: "Cancel editing operator" }));
    await user.click(screen.getByRole("button", { name: "Collapse saved operators" }));
    await user.click(screen.getByRole("button", { name: "Expand saved operators" }));
    expect(screen.getByRole("button", { name: "Edit operator QA Driver" })).toBeTruthy(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("retains new vehicle input after a server rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"vehicle already exists"}', { status: 409 })));
    render(<FleetManagementPanel />); const user = userEvent.setup();
    await user.type(screen.getByLabelText("New vehicle Bus ID"), "qa-bus");
    await user.type(screen.getByLabelText("New vehicle display name"), "QA duplicate");
    await user.click(screen.getByRole("checkbox", { name: "QA route" }));
    await user.click(screen.getByRole("button", { name: "Add new vehicle" }));
    expect(await screen.findByText(/vehicle already exists/)).toBeTruthy();
    expect((screen.getByLabelText("New vehicle display name") as HTMLInputElement).value).toBe("QA duplicate");
  });
});
