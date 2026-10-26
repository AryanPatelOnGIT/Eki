import { describe, expect, it } from "vitest";
import { normalizePassengerBusAvailability, passengerBusAvailabilities, reuseUnchangedAvailabilities } from "./passengerBusAvailability";

const now = 2_000_000;

function onlineDevice(overrides: Record<string, unknown> = {}) {
  return {
    busId: "bus_1",
    routeId: "route_1",
    deviceState: "online",
    status: "offline",
    timestamp: now - 500,
    speed: 0,
    motionState: "stopped",
    ...overrides,
  };
}

describe("passenger bus availability", () => {
  it("shows a fresh stopped device without creating ride fields", () => {
    expect(normalizePassengerBusAvailability(
      "bus_1_route_1",
      onlineDevice(),
      now,
    )).toMatchObject({ busId: "bus_1", routeId: "route_1", speed: 0, deviceState: "online" });
  });

  it("does not duplicate an active ride as device-only availability", () => {
    expect(normalizePassengerBusAvailability(
      "bus_1_route_1",
      onlineDevice({
        status: "active",
        sessionId: "session_1",
        direction: "forward",
        tripState: "in_service",
      }),
      now,
    )).toBeNull();
  });

  it.each([
    { timestamp: now - 300_000 },
    { deviceState: "offline" },
    { routeId: "" },
  ])("hides stale, offline, or unassigned devices: %o", (overrides) => {
    expect(normalizePassengerBusAvailability(
      "bus_1_route_1",
      onlineDevice(overrides),
      now,
    )).toBeNull();
  });
  it("keeps the previous list when a presence tick derives the same availability", () => {
    const snapshot = { bus_1_route_1: onlineDevice(), bus_2_route_1: onlineDevice({ busId: "bus_2", lat: 23, lng: 72, seq: 1 }) };
    expect(passengerBusAvailabilities(snapshot, now)).toHaveLength(2);
    const previous = passengerBusAvailabilities(snapshot, now);
    expect(reuseUnchangedAvailabilities(previous, passengerBusAvailabilities(snapshot, now + 2_000))).toBe(previous);

    const moved = passengerBusAvailabilities({ ...snapshot, bus_2_route_1: { ...snapshot.bus_2_route_1, seq: 2 } }, now + 2_000);
    expect(reuseUnchangedAvailabilities(previous, moved)).toBe(moved);
    const expired = passengerBusAvailabilities(snapshot, now + 10 * 60_000);
    expect(reuseUnchangedAvailabilities(previous, expired)).toBe(expired);
  });
});
