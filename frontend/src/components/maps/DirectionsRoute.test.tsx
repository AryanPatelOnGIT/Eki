// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DirectionsRoute from "./DirectionsRoute";
const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@vis.gl/react-google-maps", () => ({ useMap: () => null }));
vi.mock("@/lib/firebaseAuth", () => ({ auth: { currentUser: { getIdToken: async () => "token" } } }));
vi.mock("@/lib/apiClient", () => ({ apiRequest: state.request }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });
it("reports unavailable geometry, then publishes authenticated repaired road geometry", async () => {
  state.request.mockResolvedValue({ forwardPolyline: "_ekkC_omvLo}@o}@" });
  const ready = vi.fn();
  render(<DirectionsRoute routeId="repair" stops={[]} direction="forward" onGeometryReady={ready} />);
  expect(ready).toHaveBeenCalledWith([]);
  await waitFor(() => expect(ready).toHaveBeenLastCalledWith([
    { lat: 23, lng: 72 }, { lat: 23.01, lng: 72.01 },
  ]));
  expect(state.request).toHaveBeenCalledWith("/api/routes/repair/geometry", expect.objectContaining({
    headers: { Authorization: "Bearer token" },
  }));
});
it("keeps failed or corrupt repair unavailable", async () => {
  state.request.mockResolvedValue({ reversePolyline: "~" });
  const ready = vi.fn();
  render(<DirectionsRoute routeId="corrupt" stops={[{lat: 23, lng: 72}]} direction="reverse" onGeometryReady={ready} />);
  await waitFor(() => expect(state.request).toHaveBeenCalled());
  expect(ready).toHaveBeenLastCalledWith([]);
});
