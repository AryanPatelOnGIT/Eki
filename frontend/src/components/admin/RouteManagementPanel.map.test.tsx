// @vitest-environment jsdom
import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RouteManagementPanel from "./RouteManagementPanel";

const sdk = vi.hoisted(() => ({
  save: vi.fn(), preview: vi.fn(), token: vi.fn(), stop: vi.fn(),
  point: { lat: 23, lng: 72 },
  route: {
    id: "qa-route", name: "QA route", color: "#3B82F6", waypoints: [], configVersion: 2,
    polyline: "stored-geometry",
    stops: [{ id: "alpha", name: "Alpha", shortName: "A", lat: 23, lng: 72 }, { id: "beta", name: "Beta", shortName: "B", lat: 23.01, lng: 72.01 }],
  },
}));
vi.mock("@/hooks/useRoutes", () => ({ useRoutes: () => ({ routes: [sdk.route], loading: false }) }));
vi.mock("@/lib/firebaseAuth", () => ({ auth: { currentUser: { getIdToken: sdk.token } } }));
vi.mock("@/lib/routeSaveClient", () => ({ saveRoute: sdk.save, newRouteSaveId: () => "qa-map-save" }));
vi.mock("@vis.gl/react-google-maps", () => ({
  Map: ({ children, onClick }: { children: ReactNode; onClick: (event: unknown) => void }) => <div>
    <button onClick={() => onClick({ detail: { latLng: { ...sdk.point } }, stop: sdk.stop })}>Synthetic map point</button>
    {children}
  </div>,
  AdvancedMarker: ({ title, onDragEnd }: { title: string; onDragEnd: (event: unknown) => void }) =>
    <button onClick={() => onDragEnd({ latLng: { lat: () => sdk.point.lat, lng: () => sdk.point.lng } })}>{title}</button>,
  useMap: () => null,
}));
vi.mock("@/components/maps/DirectionsRoute", () => ({ default: (props: unknown) => { sdk.preview(props); return null; } }));

beforeEach(() => {
  vi.clearAllMocks(); sdk.point = { lat: 23, lng: 72 };
  sdk.save.mockResolvedValue({ saved: true }); sdk.token.mockResolvedValue("test-token");
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://qa.ngrok-free.dev");
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function create() {
  render(<RouteManagementPanel />); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add Route" }));
  await user.type(screen.getByLabelText("Display Name"), "Map QA route");
  return user;
}
async function pick(user: ReturnType<typeof userEvent.setup>, lat: number, lng: number) {
  sdk.point = { lat, lng };
  await user.click(screen.getByRole("button", { name: "Pick on Map" }));
  await user.click(screen.getByRole("button", { name: "Synthetic map point" }));
}

describe("route editor map and place interaction contracts", { timeout: 15_000 }, () => {
  it("requires armed map picking, resets the picker, and saves selected and dragged coordinates", async () => {
    const user = await create();
    await user.click(screen.getByRole("button", { name: "Synthetic map point" }));
    expect(screen.queryByRole("button", { name: /^Map stop A/ })).toBeNull();
    await pick(user, 23, 72); await pick(user, 23.01, 72.01);
    expect(screen.getByRole("button", { name: "Pick on Map" })).toBeTruthy();
    sdk.point = { lat: 23.02, lng: 72.02 };
    await user.click(screen.getByRole("button", { name: "Drag to move stop A" }));
    await user.click(screen.getByRole("button", { name: "Deploy" }));
    expect(await screen.findByText("Route deployed!")).toBeTruthy();
    expect(sdk.token).toHaveBeenCalledWith(true);
    expect(sdk.save).toHaveBeenCalledWith("route-map-qa-route", "qa-map-save", expect.objectContaining({
      mode: "create", expectedVersion: 0,
      stops: [expect.objectContaining({ name: "Map stop A", lat: 23.02, lng: 72.02 }), expect.objectContaining({ name: "Map stop B", lat: 23.01, lng: 72.01 })],
    }), "test-token");
    expect(sdk.stop).toHaveBeenCalledTimes(2);
  });

  it("preserves a manually chosen route ID while renaming and reordering map stops", async () => {
    const user = await create();
    await user.clear(screen.getByLabelText("Route ID")); await user.type(screen.getByLabelText("Route ID"), "qa-custom-route");
    await user.type(screen.getByLabelText("Display Name"), " renamed");
    await pick(user, 23, 72); await pick(user, 23.01, 72.01);
    await user.click(screen.getByRole("button", { name: /^Map stop A/ }));
    const rename = screen.getByLabelText("Rename stop Map stop A");
    await user.clear(rename); await user.type(rename, "  Renamed stop  "); await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Move stop Renamed stop down" }));
    await user.click(screen.getByRole("button", { name: "Deploy" }));
    await screen.findByText("Route deployed!");
    expect(sdk.save.mock.calls[0][0]).toBe("qa-custom-route");
    expect(sdk.save.mock.calls[0][2].stops.map((stop: { name: string }) => stop.name)).toEqual(["Map stop B", "Renamed stop"]);
  });

  it("invalidates stored geometry on a pin move and retains edit version and stable stop IDs", async () => {
    render(<RouteManagementPanel />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit route QA route" }));
    expect(sdk.preview.mock.lastCall?.[0]).toMatchObject({ polyline: "stored-geometry" });
    sdk.point = { lat: 23.03, lng: 72.03 };
    await user.click(screen.getByRole("button", { name: "Drag to move stop B" }));
    expect(sdk.preview.mock.lastCall?.[0]).toMatchObject({ polyline: undefined });
    await user.click(screen.getByRole("button", { name: "Update" })); await screen.findByText("Route updated!");
    expect(sdk.save.mock.calls[0][2]).toMatchObject({ mode: "edit", expectedVersion: 2, stops: [
      { id: "alpha", lat: 23, lng: 72 }, { id: "beta", lat: 23.03, lng: 72.03 },
    ] });
  });

  it("uses authenticated Places results with their coordinates, and keeps map picking available after denial", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: "Permission denied" }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [{ name: "Provider stop", address: "QA address", lat: 23.04, lng: 72.04 }] })));
    vi.stubGlobal("fetch", fetchMock);
    const user = await create(); const search = screen.getByRole("searchbox", { name: "Search for a stop" });
    await user.type(search, "deny");
    await screen.findByRole("alert"); expect(screen.getByRole("button", { name: "Pick on Map" })).toBeTruthy();
    await user.clear(search); await user.type(search, "allowed");
    await user.click(await screen.findByRole("button", { name: /Provider stop/ }));
    expect((search as HTMLInputElement).value).toBe("");
    await pick(user, 23.05, 72.05); await user.click(screen.getByRole("button", { name: "Deploy" }));
    await screen.findByText("Route deployed!");
    expect(fetchMock.mock.calls[1][0]).toContain("/api/places/search?q=allowed");
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer test-token");
    expect(sdk.save.mock.calls[0][2].stops[0]).toMatchObject({ name: "Provider stop", lat: 23.04, lng: 72.04 });
  });
});
