import { describe, expect, it } from "vitest";
import {
  latestSessionActivity,
  reconciliationDecision,
  timestampMillis,
} from "./abandonedRideReconciliationLogic";

describe("abandoned ride reconciliation logic", () => {
  const cutoff = 1_800_000_000_000;
  it("preserves an undeparted automatic return across an overnight power-off", () => {
    expect(reconciliationDecision("return", {
      status: "armed", automaticTurnaround: true, armedAt: cutoff - 60_000,
    }, { sessionId: "return", tripState: "pre_departure", hasDepartedOrigin: false, updatedAt: cutoff - 60_000 },
    { sessionId: "return", tripState: "pre_departure", timestamp: cutoff - 60_000 }, cutoff))
      .toMatchObject({ stale: false, reason: "ready" });
  });
  it.each(["manual", "departed"])("still retires stale %s sessions", mode => {
    expect(reconciliationDecision("return", {
      status: mode === "departed" ? "active" : "armed", automaticTurnaround: mode !== "manual", armedAt: cutoff - 60_000,
    }, { sessionId: "return", tripState: mode === "departed" ? "in_service" : "pre_departure",
      hasDepartedOrigin: mode === "departed", updatedAt: cutoff - 60_000 }, null, cutoff).stale).toBe(true);
  });

  it.each([24, 48, 168])("retires an unused automatic return after %s hours", hours => {
    const now = cutoff + 12 * 60 * 60_000;
    const old = now - hours * 60 * 60_000;
    expect(reconciliationDecision("return", {
      status: "armed", automaticTurnaround: true, armedAt: old,
    }, { sessionId: "return", tripState: "pre_departure", hasDepartedOrigin: false, updatedAt: old },
    null, cutoff)).toMatchObject({ stale: true, lastActivity: old, reason: "stale" });
  });
  it("keeps a return with recent real activity and honors a longer configured threshold", () => {
    const now = cutoff + 12 * 60 * 60_000, old = now - 48 * 60 * 60_000;
    const session = { status: "armed", automaticTurnaround: true, armedAt: old };
    const active = { sessionId: "return", tripState: "pre_departure", hasDepartedOrigin: false, updatedAt: old };
    expect(reconciliationDecision("return", session, active,
      { sessionId: "return", tripState: "pre_departure", timestamp: now - 1000 }, cutoff, now).stale).toBe(false);
    expect(reconciliationDecision("return", session, active, null, now - 72 * 60 * 60_000, now).stale).toBe(false);
    expect(reconciliationDecision("return", session,
      { ...active, updatedAt: undefined }, null, cutoff, now).reason).toBe("unknown_activity");
  });

  it("normalizes legacy and Firestore timestamps", () => {
    expect(timestampMillis(1_750_000_000)).toBe(1_750_000_000_000);
    expect(timestampMillis({ seconds: 1_750_000_000, nanoseconds: 500_000_000 }))
      .toBe(1_750_000_000_500);
    expect(timestampMillis({ toMillis: () => 1_750_000_000_123 }))
      .toBe(1_750_000_000_123);
  });

  it("uses the latest session event as the interruption time", () => {
    expect(latestSessionActivity({
      status: "active",
      startTime: 1_700_000_000_000,
      stopsReached: {
        0: { timestamp: 1_710_000_000_000 },
        1: { timestamp: { toMillis: () => 1_720_000_000_000 } },
      },
      passengers: { user: { joinedAt: 1_715_000_000_000 } },
    })).toBe(1_720_000_000_000);
  });

  it("reconciles a stale session and matching stale lifecycle records", () => {
    expect(reconciliationDecision(
      "session-a",
      { status: "active", startTime: cutoff - 20_000 },
      { sessionId: "session-a", updatedAt: cutoff - 10_000 },
      { sessionId: "session-a", timestamp: cutoff - 5_000 },
      cutoff,
    )).toEqual({ stale: true, lastActivity: cutoff - 5_000, reason: "stale" });
  });

  it("protects sessions with recent canonical or live activity", () => {
    expect(reconciliationDecision(
      "session-a",
      { status: "armed", armedAt: cutoff - 20_000 },
      { sessionId: "session-a", updatedAt: cutoff + 1 },
      null,
      cutoff,
    ).reason).toBe("recent");
    expect(reconciliationDecision(
      "session-a",
      { status: "active", startTime: cutoff - 20_000 },
      null,
      { sessionId: "session-a", timestamp: cutoff + 1 },
      cutoff,
    ).reason).toBe("recent");
  });

  it("fails closed for matching lifecycle records with unknown activity", () => {
    expect(reconciliationDecision(
      "session-a",
      { status: "active", startTime: cutoff - 20_000 },
      { sessionId: "session-a" },
      null,
      cutoff,
    ).reason).toBe("unknown_activity");
  });

  it("ignores lifecycle records belonging to a newer session", () => {
    expect(reconciliationDecision(
      "session-a",
      { status: "active", startTime: cutoff - 20_000 },
      { sessionId: "session-b", updatedAt: cutoff + 1 },
      { sessionId: "session-b", timestamp: cutoff + 1 },
      cutoff,
    ).stale).toBe(true);
  });
});
