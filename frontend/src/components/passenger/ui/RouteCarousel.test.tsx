// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RouteCarousel from "./RouteCarousel";
import type { RouteData } from "@/hooks/useRoutes";

const route: RouteData = {
  id: "qa-route", name: "QA route", color: "#3B82F6", duration: "600s", waypoints: [],
  stops: [{ id: "a", name: "Alpha", shortName: "A", lat: 23, lng: 72 }, { id: "b", name: "Beta", shortName: "B", lat: 23.01, lng: 72.01 }],
};
afterEach(cleanup);
describe("passenger route-card controls", () => {
  it.each(["forward", "reverse", "pending"] as const)("opens an armed route with %s direction", async (direction) => {
    const select = vi.fn();
    render(<RouteCarousel routes={[route]} selectedRouteId="" onClick={select} getActiveBusesCount={() => 1} getAvailableBusesCount={() => 0} getDirectionState={() => direction} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Track QA route" }));
    expect(select).toHaveBeenCalledWith("qa-route");
    if (direction === "pending") expect(screen.getByText("Direction pending")).toBeTruthy();
  });

  it("opens the location preview for a stationary online device before service starts", async () => {
    const select = vi.fn();
    render(<RouteCarousel routes={[route]} selectedRouteId="" onClick={select} getActiveBusesCount={() => 0} getAvailableBusesCount={() => 1} getDirectionState={() => "pending"} />);
    const card = screen.getByRole("button", { name: "Track QA route" });
    expect((card as HTMLButtonElement).disabled).toBe(false);
    await userEvent.setup().click(card);
    expect(select).toHaveBeenCalledWith("qa-route");
    expect(screen.queryByText(/Scheduled:/)).toBeNull();
  });

  it.each(["600s", "invalid", "0s"])("labels configured duration without inventing a scheduled arrival: %s", duration => {
    render(<RouteCarousel routes={[{ ...route, duration }]} selectedRouteId="" onClick={vi.fn()} getActiveBusesCount={() => 1} getAvailableBusesCount={() => 0} getDirectionState={() => "forward"} />);
    expect(screen.queryByText(/Scheduled:/)).toBeNull();
    expect(screen.getByText(duration === "600s" ? "10 min route" : "Duration pending")).toBeTruthy();
  });

  it("hides routes with neither an armed service nor fresh hardware", () => {
    render(<RouteCarousel routes={[route]} selectedRouteId="" onClick={vi.fn()} getActiveBusesCount={() => 0} getAvailableBusesCount={() => 0} getDirectionState={() => "pending"} />);
    expect(screen.getByText("No live routes right now")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
