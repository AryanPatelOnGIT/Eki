import { describe, expect, it } from "vitest";
import {
  boardingCodesMatch,
  generateBoardingCode,
  normalizeBoardingCode,
  validateLiveBoardingProjection,
  validatePassengerPosition,
  validateStopSelection,
} from "./boardingPolicy";

describe("boarding policy", () => {
  it("enforces inclusive trusted-fix clock boundaries and exact bus route session binding", () => {
    const now = 1_800_000_000_000;
    const expected = { sessionId: "synthetic_session", busId: "synthetic_bus", routeId: "synthetic_route" };
    const live = { ...expected, status: "active", deviceState: "online", motionState: "stopped", lat: 0, lng: 0, timestamp: now };
    for (const offset of [-60_000, -59_999, 0, 9_999, 10_000]) {
      expect(validateLiveBoardingProjection({ ...live, timestamp: now + offset }, expected, now)).toEqual({ lat: 0, lng: 0 });
    }
    for (const offset of [-60_001, 10_001]) {
      expect(validateLiveBoardingProjection({ ...live, timestamp: now + offset }, expected, now)).toBeNull();
    }
    for (const key of ["sessionId", "busId", "routeId"] as const) {
      expect(validateLiveBoardingProjection({ ...live, [key]: "unrelated" }, expected, now)).toBeNull();
    }
    expect(validateLiveBoardingProjection({ ...live, deviceState: "offline" }, expected, now)).toBeNull();
    expect(validateLiveBoardingProjection({ ...live, status: "completed" }, expected, now)).toBeNull();
  });

  it("enforces finite passenger accuracy and geographic limits at the exact boundary", () => {
    for (const accuracy of [0, 0.001, 99.999, 100]) {
      expect(validatePassengerPosition(-90, 180, accuracy)).toEqual({ lat: -90, lng: 180, accuracy });
    }
    for (const accuracy of [-0.001, 100.001, null, undefined, "100", NaN, Infinity]) {
      expect(validatePassengerPosition(0, 0, accuracy)).toBeNull();
    }
    expect(validatePassengerPosition(-90.001, 0, 1)).toBeNull();
    expect(validatePassengerPosition(0, 180.001, 1)).toBeNull();
  });

  it("accepts only eight valid alphabet characters after display normalization", () => {
    expect(normalizeBoardingCode("ab-z2 349h")).toBe("ABZ2349H");
    for (const input of ["", "ABCDEFG", "ABCDEFGHJ", "ABCDEFGI", "ABCDEFG0", "ABCDEFG1", "ABC.DEF2", null, 123]) {
      expect(normalizeBoardingCode(input)).toBeNull();
    }
  });

  it("generates an unbiased, human-readable 40-bit code", () => {
    expect(generateBoardingCode(Buffer.from([0, 1, 23, 24, 25, 30, 31, 7]))).toBe("ABZ2389H");
    expect(() => generateBoardingCode(Buffer.alloc(7))).toThrow("Insufficient randomness");
  });

  it("normalizes display separators and compares only valid codes", () => {
    expect(normalizeBoardingCode("abz2-349h")).toBe("ABZ2349H");
    expect(boardingCodesMatch("ABZ2349H", "abz2 349h")).toBe(true);
    expect(boardingCodesMatch("ABZ2349H", "ABZ2349I")).toBe(false);
    expect(boardingCodesMatch("short", "short")).toBe(false);
  });

  it("requires route-owned stops in forward order", () => {
    const stops = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
    expect(validateStopSelection(stops, "s1", "s3", "forward")).toEqual({
      boardingStopId: "s1",
      alightingStopId: "s3",
    });
    expect(validateStopSelection(stops, "s2", null, "forward")).toBeNull();
    expect(validateStopSelection(stops, "s2", undefined, "forward")).toBeNull();
    expect(validateStopSelection(stops, "missing", null, "forward")).toBeNull();
    expect(validateStopSelection(stops, "s2", "s2", "forward")).toBeNull();
    expect(validateStopSelection(stops, "s3", "s1", "forward")).toBeNull();
  });

  it("requires route-owned stops in reverse travel order", () => {
    const stops = [{ id: "a" }, { id: "middle" }, { id: "z" }];
    expect(validateStopSelection(stops, "z", "a", "reverse")).toEqual({
      boardingStopId: "z",
      alightingStopId: "a",
    });
    expect(validateStopSelection(stops, "middle", "a", "reverse")).toEqual({
      boardingStopId: "middle",
      alightingStopId: "a",
    });
    expect(validateStopSelection(stops, "a", "z", "reverse")).toBeNull();
  });

  it("binds a fresh trusted projection to the exact live session", () => {
    const now = 1_800_000_000_000;
    const expected = { sessionId: "session_1", busId: "bus_1", routeId: "route_1" };
    const live = {
      ...expected,
      status: "active",
      deviceState: "online",
      motionState: "stopped",
      lat: 23,
      lng: 72.5,
      timestamp: now - 30_000,
    };
    expect(validateLiveBoardingProjection(live, expected, now)).toEqual({ lat: 23, lng: 72.5 });
    expect(validateLiveBoardingProjection({ ...live, sessionId: "other" }, expected, now)).toBeNull();
    expect(validateLiveBoardingProjection({ ...live, timestamp: now - 60_001 }, expected, now)).toBeNull();
    expect(validateLiveBoardingProjection({ ...live, timestamp: now + 10_001 }, expected, now)).toBeNull();
    expect(validateLiveBoardingProjection({ ...live, motionState: "uncertain" }, expected, now)).toBeNull();
  });

  it("rejects low-quality or malformed passenger coordinates", () => {
    expect(validatePassengerPosition(23, 72.5, 25)).toEqual({ lat: 23, lng: 72.5, accuracy: 25 });
    expect(validatePassengerPosition(91, 72.5, 25)).toBeNull();
    expect(validatePassengerPosition(23, 72.5, 101)).toBeNull();
    expect(validatePassengerPosition("23", 72.5, 25)).toBeNull();
  });

  describe("live bus coordinates", () => {
    const now = 1_800_000_000_000;
    const expected = { sessionId: "session_1", busId: "bus_1", routeId: "route_1" };
    const live = {
      ...expected,
      status: "active",
      deviceState: "online",
      motionState: "stopped",
      lat: 23,
      lng: 72.5,
      timestamp: now - 1_000,
    };

    describe.each(["lat", "lng"] as const)("%s", (axis) => {
      it.each([
        null, undefined, "", " ", false, true, "23", [], [23], {},
        Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
      ])("rejects malformed coordinate %p", (value) => {
        expect(validateLiveBoardingProjection({ ...live, [axis]: value }, expected, now)).toBeNull();
      });

      it.each([-1, 1])("rejects a coordinate beyond the range in direction %s", (sign) => {
        const limit = axis === "lat" ? 90 : 180;
        expect(validateLiveBoardingProjection({ ...live, [axis]: sign * (limit + 0.001) }, expected, now)).toBeNull();
      });
    });

    it.each([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 72.5 },
      { lat: 23, lng: 0 },
      { lat: -90, lng: -180 },
      { lat: 90, lng: 180 },
    ])("accepts valid numeric coordinates %p", (position) => {
      expect(validateLiveBoardingProjection({ ...live, ...position }, expected, now)).toEqual(position);
    });
  });
});
