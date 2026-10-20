import { describe, expect, it } from "vitest";
import { departureSamples, inferDepartureDirection } from "./departureDirection";
import { reduceTripState } from "./tripStateReducer";

const point = (meters: number) => ({ lat: 23 + meters / 111_195, lng: 72 });
const stops = [point(0), point(200), point(500)];
const forwardPath = [point(0), point(200), point(500)];
const reversePath = [...forwardPath].reverse();
const samples = [20, 40, 60].map((meters, index) => ({ ...point(meters), timestamp: 100_000 + index * 4_000 }));
const input = { samples, stops, forwardPath, reversePath, now: 108_000 };

describe("credible departure direction", () => {
  it("resolves sustained first-leg travel and then advances ordered stops", () => {
    expect(inferDepartureDirection(input)).toBe("forward");
    const departed = reduceTripState({ ...point(110), motionState: "moving", currentTripState: "pre_departure", currentStopIndex: 0,
      stops, hasDepartedOrigin: false, now: 110_000, timestamp: 110_000, gpsHdop: 1 });
    expect(departed).toMatchObject({ tripState: "in_service", currentStopIndex: 1 });
    const crossed = reduceTripState({ ...point(210), previousPosition: point(190), motionState: "moving", currentTripState: departed.tripState,
      currentStopIndex: departed.currentStopIndex, stops, hasDepartedOrigin: true, now: 114_000, timestamp: 114_000, gpsHdop: 1 });
    expect(crossed.currentStopIndex).toBe(2);
    expect(crossed.tripState).toBe("in_service"); // a moving terminal crossing never completes the ride
  });
  it("resolves reverse departure using independently directed road geometry", () => {
    expect(inferDepartureDirection({ ...input, samples: samples.map((sample, index) => ({ ...sample, ...point(480 - index * 20) })) })).toBe("reverse");
  });
  it("rejects stationary jitter, stale/out-of-order data, jumps and unobserved intermediate stops", () => {
    expect(inferDepartureDirection({ ...input, samples: samples.slice(0, 2) })).toBeNull();
    expect(inferDepartureDirection({ ...input, now: 200_000 })).toBeNull();
    expect(inferDepartureDirection({ ...input, samples: [...samples].reverse() })).toBeNull();
    expect(inferDepartureDirection({ ...input, samples: samples.map(sample => ({ ...sample, ...point(20) })) })).toBeNull();
    expect(inferDepartureDirection({ ...input, samples: samples.map((sample, index) => ({ ...sample, ...point(300 + index * 20) })) })).toBeNull();
    expect(inferDepartureDirection({ ...input, samples: samples.map((sample, index) => ({ ...sample, ...point(index * 300) })) })).toBeNull();
  });
  it("rejects off-road and competing same-direction geometry", () => {
    expect(inferDepartureDirection({ ...input, reversePath: forwardPath })).toBeNull();
    expect(inferDepartureDirection({ ...input, samples: samples.map(sample => ({ ...sample, lng: 72.01 })) })).toBeNull();
  });
  it("isolates samples by session/configuration and discards poor-quality evidence", () => {
    const previous = { context: "session-v1", samples };
    const sample = { ...point(80), timestamp: 112_000 };
    expect(departureSamples(previous, "session-v2", sample, true).samples).toEqual([sample]);
    expect(departureSamples(previous, "session-v1", sample, false).samples).toEqual([]);
    expect(departureSamples(previous, "session-v1", sample, true).samples).toHaveLength(4);
  });
});
