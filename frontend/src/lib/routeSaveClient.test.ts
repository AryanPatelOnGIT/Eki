import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./apiClient";
import { ROUTE_SAVE_TIMEOUT_MS, saveRoute } from "./routeSaveClient";

const saved = {
  status: "succeeded" as const,
  saved: true as const,
  saveId: "save-1",
  routeId: "route-1",
  configVersion: 2,
  geometryVersion: 1,
  geometryReused: true,
  polyline: "encoded",
  distanceMeters: 100,
  duration: "10s",
};

describe("route save client", () => {
  afterEach(() => vi.useRealTimers());
  it("recovers a committed save after a transient status failure without another PUT", async () => {
    vi.useFakeTimers();
    const request = vi.fn()
      .mockResolvedValueOnce({ status: "processing", saveId: "save-1", retryAfterMs: 250 })
      .mockRejectedValueOnce(new ApiError("unavailable", "HTTP_ERROR", 503, undefined, false, 500))
      .mockResolvedValueOnce(saved);
    const outcome = saveRoute("route-1", "save-1", {}, "token", undefined, request);
    const assertion = expect(outcome).resolves.toEqual(saved);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/api/routes/route-1",
      "/api/routes/route-1/save-operations/save-1",
      "/api/routes/route-1/save-operations/save-1",
    ]);
  });
  it("keeps the operation ID after an unknown PUT and a failed status GET", async () => {
    vi.useFakeTimers();
    const request = vi.fn()
      .mockRejectedValueOnce(new ApiError("lost write response", "NETWORK_TIMEOUT", null, "network", true))
      .mockRejectedValueOnce(new ApiError("offline", "BACKEND_UNAVAILABLE", null, "network", true))
      .mockResolvedValueOnce(saved);
    const outcome = saveRoute("route-1", "save-1", {}, "token", undefined, request);
    const assertion = expect(outcome).resolves.toEqual(saved);
    await vi.advanceTimersByTimeAsync(750);
    await assertion;
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "/api/routes/route-1",
      "/api/routes/route-1/save-operations/save-1",
      "/api/routes/route-1/save-operations/save-1",
    ]);
  });
  it("stops immediately on terminal status errors", async () => {
    const request = vi.fn().mockResolvedValueOnce({ status: "processing", saveId: "save-1" })
      .mockRejectedValueOnce(new ApiError("forbidden", "HTTP_ERROR", 403));
    await expect(saveRoute("route-1", "save-1", {}, "token", undefined, request))
      .rejects.toMatchObject({ status: 403 });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("honors cancellation before another poll", async () => {
    const controller = new AbortController();
    const request = vi.fn().mockResolvedValueOnce({ status: "processing", saveId: "save-1" });
    const outcome = saveRoute("route-1", "save-1", {}, "token", controller.signal, request);
    const rejection = expect(outcome).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await rejection;
    expect(request).toHaveBeenCalledOnce();
  });
  it("does not poll past the reconciliation deadline when Retry-After is longer", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValueOnce({ status: "processing", saveId: "save-1" })
      .mockRejectedValueOnce(new ApiError("busy", "HTTP_ERROR", 503, undefined, false, 40_000));
    const outcome = saveRoute("route-1", "save-1", {}, "token", undefined, request);
    const rejection = expect(outcome).rejects.toMatchObject({ code: "ROUTE_RECONCILIATION_TIMEOUT" });
    await rejection;
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("uses the route-specific timeout and stable save ID", async () => {
    const request = vi.fn().mockResolvedValue(saved);
    await expect(saveRoute(
      "route-1",
      "save-1",
      { mode: "edit", expectedVersion: 1 },
      "token",
      undefined,
      request,
    )).resolves.toEqual(saved);
    expect(request).toHaveBeenCalledWith(
      "/api/routes/route-1",
      expect.objectContaining({ timeoutMs: ROUTE_SAVE_TIMEOUT_MS }),
    );
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ saveId: "save-1" });
  });

  it("reconciles a timeout-after-commit without issuing another write", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new ApiError("timeout", "NETWORK_TIMEOUT", null, "network", true))
      .mockResolvedValueOnce(saved);
    await expect(saveRoute("route-1", "save-1", { expectedVersion: 1 }, "token", undefined, request))
      .resolves.toEqual(saved);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toContain("save-operations/save-1");
  });

  it("retries once with the same operation after a pre-delivery network failure", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new ApiError("offline", "BACKEND_UNAVAILABLE", null, "network", true))
      .mockRejectedValueOnce(new ApiError("missing", "SAVE_OPERATION_NOT_FOUND", 404))
      .mockResolvedValueOnce(saved);
    await expect(saveRoute("route-1", "save-1", { expectedVersion: 1 }, "token", undefined, request))
      .resolves.toEqual(saved);
    expect(request).toHaveBeenCalledTimes(3);
    expect(JSON.parse(request.mock.calls[0][1].body).saveId).toBe("save-1");
    expect(JSON.parse(request.mock.calls[2][1].body).saveId).toBe("save-1");
  });
});
