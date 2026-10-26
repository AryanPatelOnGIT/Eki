import { describe, expect, it } from "vitest";
import {
  decideRouteSaveOperation,
  routeDocumentVersion,
  routeSavePayloadHash,
} from "./routeSaveContract";

describe("route save contract", () => {
  it("replays an identical completed operation but rejects changed content", () => {
    const hash = routeSavePayloadHash({ routeId: "r1", name: "A" });
    const operation = { payloadHash: hash, status: "succeeded", result: { routeVersion: 2 } };
    expect(decideRouteSaveOperation(operation, hash, 100)).toEqual({
      kind: "replay",
      result: { routeVersion: 2 },
    });
    expect(decideRouteSaveOperation(operation, routeSavePayloadHash({ routeId: "r1", name: "B" }), 100))
      .toEqual({ kind: "conflict" });
  });

  it("allows only one live lease and permits recovery after expiry", () => {
    const operation = { payloadHash: "hash", status: "processing", leaseUntil: 200 };
    expect(decideRouteSaveOperation(operation, "hash", 199)).toEqual({ kind: "processing" });
    expect(decideRouteSaveOperation(operation, "hash", 200)).toEqual({ kind: "claim" });
  });

  it("reclaims an unknown-outcome failure but replays a definitive one", () => {
    const unknown = { payloadHash: "hash", status: "failed", httpStatus: 503, error: { code: "ROUTE_PERSISTENCE_FAILED", outcomeUnknown: true } };
    expect(decideRouteSaveOperation(unknown, "hash", 100)).toEqual({ kind: "claim" });
    expect(decideRouteSaveOperation(unknown, "other", 100)).toEqual({ kind: "conflict" });
    const definitive = { payloadHash: "hash", status: "failed", httpStatus: 409, error: { code: "STALE_ROUTE_VERSION" } };
    expect(decideRouteSaveOperation(definitive, "hash", 100)).toMatchObject({ kind: "failed", httpStatus: 409 });
  });

  it("treats legacy route documents as version zero", () => {
    expect(routeDocumentVersion(undefined)).toBe(0);
    expect(routeDocumentVersion({})).toBe(0);
    expect(routeDocumentVersion({ configVersion: 3 })).toBe(3);
  });
});
