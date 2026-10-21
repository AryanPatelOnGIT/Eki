// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDrivers } from "./useDrivers";
const mocks = vi.hoisted(() => ({
  user: { uid: "qa-admin", role: "admin" } as { uid: string; role: string } | null,
  ready: vi.fn(), listen: vi.fn(), unsubscribe: vi.fn(), refresh: vi.fn(), loading: false, generation: 0,
  success: undefined as undefined | ((snapshot: { docs: Array<{ id: string; data: () => unknown }> }) => void),
  failure: undefined as undefined | ((error: unknown) => void),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user, loading: mocks.loading, refreshAccess: mocks.refresh }) }));
vi.mock("@/lib/authState", () => ({ waitForAuth: mocks.ready, getAuthVerificationGeneration: () => mocks.generation }));
vi.mock("@/lib/firebaseFirestore", () => ({ db: {} }));
vi.mock("firebase/firestore", async importOriginal => ({
  ...await importOriginal<typeof import("firebase/firestore")>(),
  collection: vi.fn(), limit: vi.fn(), query: vi.fn(), where: vi.fn(), onSnapshot: mocks.listen,
}));
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = { uid: "qa-admin", role: "admin" };
  mocks.loading = false; mocks.generation = 0; mocks.refresh.mockResolvedValue(undefined);
  mocks.ready.mockResolvedValue(undefined);
  mocks.listen.mockImplementation((_query, success, failure) => {
    mocks.success = success; mocks.failure = failure; return mocks.unsubscribe;
  });
});
afterEach(cleanup);
describe("operator metadata failures and retries", () => {
  it.each(["resource-exhausted", "unavailable"])("distinguishes %s from an empty fleet and reconnects on retry", async code => {
    const { result } = renderHook(() => useDrivers());
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledOnce());
    act(() => mocks.success?.({ docs: [{ id: "driver", data: () => ({ name: "QA Driver", assignedBusId: "bus" }) }] }));
    expect(result.current.drivers).toHaveLength(1);
    act(() => mocks.failure?.({ code }));
    expect(result.current.error).toBeTruthy(); expect(result.current.drivers).toEqual([]);
    act(() => result.current.retry());
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledTimes(2));
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    act(() => mocks.success?.({ docs: [] }));
    expect(result.current.error).toBeNull(); expect(result.current.loading).toBe(false);
  });
  it("refreshes denied driver access and fences callbacks from the old verification", async () => {
    const hook = renderHook(() => useDrivers());
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledOnce());
    const oldSuccess = mocks.success!;
    act(() => mocks.failure!({ code: "permission-denied" }));
    act(() => hook.result.current.retry());
    expect(mocks.refresh).toHaveBeenCalledOnce(); expect(mocks.listen).toHaveBeenCalledOnce();
    mocks.generation++; mocks.loading = true; hook.rerender();
    act(() => oldSuccess({ docs: [{ id: "old", data: () => ({ name: "Old" }) }] }));
    expect(hook.result.current.drivers).toEqual([]);
    mocks.loading = false; hook.rerender();
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledTimes(2));
    act(() => mocks.success!({ docs: [{ id: "fresh", data: () => ({ name: "Fresh" }) }] }));
    expect(hook.result.current.drivers[0].id).toBe("fresh");
  });
  it("ends loading and exposes authentication readiness failures", async () => {
    mocks.ready.mockRejectedValue(new Error("auth offline"));
    const { result } = renderHook(() => useDrivers());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.loading).toBe(false); expect(mocks.listen).not.toHaveBeenCalled();
  });
  it("hides cached metadata and errors after switching to a passenger principal", async () => {
    const { result, rerender } = renderHook(() => useDrivers());
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledOnce());
    act(() => mocks.success?.({ docs: [{ id: "driver", data: () => ({ name: "QA Driver" }) }] }));
    mocks.user = { uid: "qa-passenger", role: "passenger" }; rerender();
    expect(result.current.drivers).toEqual([]); expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false); expect(mocks.listen).toHaveBeenCalledOnce();
    act(() => mocks.failure?.({ code: "permission-denied" }));
    expect(result.current.error).toBeNull();
  });
});
