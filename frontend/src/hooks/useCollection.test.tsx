// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCollectionCache, useCollection } from "./useCollection";
const mocks = vi.hoisted(() => ({
  user: { uid: "admin", role: "admin" } as { uid: string; role: string | null } | null,
  loading: false, generation: 0, ready: vi.fn(), listen: vi.fn(), unsubscribe: vi.fn(),
  success: null as null | ((snapshot: { docs: Array<{ id: string; data: () => unknown }> }) => void),
}));
vi.mock("./useAuth", () => ({ useAuth: () => ({ user: mocks.user, loading: mocks.loading }) }));
vi.mock("@/lib/authState", () => ({ waitForAuth: mocks.ready, getAuthVerificationGeneration: () => mocks.generation }));
vi.mock("@/lib/firebaseFirestore", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({ collection: vi.fn(), limit: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(), onSnapshot: mocks.listen }));
beforeEach(() => {
  clearCollectionCache(); vi.clearAllMocks(); mocks.user = { uid: "admin", role: "admin" }; mocks.loading = false; mocks.generation = 0;
  mocks.ready.mockResolvedValue(undefined); mocks.listen.mockImplementation((_query, success) => { mocks.success = success; return mocks.unsubscribe; });
});
afterEach(() => { cleanup(); clearCollectionCache(); });
describe("protected collection lifecycle", () => {
  it.each(["signed-out", "unverified", "loading"])("does not subscribe while %s", async condition => {
    if (condition === "signed-out") mocks.user = null;
    if (condition === "unverified") mocks.user!.role = null;
    if (condition === "loading") mocks.loading = true;
    renderHook(() => useCollection("buses")); await act(async () => {}); expect(mocks.listen).not.toHaveBeenCalled();
  });
  it("shares a verified listener and hides stale data on sign-out", async () => {
    const hook = renderHook(() => [useCollection("buses"), useCollection("buses")]);
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledOnce());
    act(() => mocks.success!({ docs: [{ id: "bus", data: () => ({ name: "Bus" }) }] }));
    expect(hook.result.current[0].data).toHaveLength(1); mocks.user = null; hook.rerender();
    expect(hook.result.current[0].data).toEqual([]); expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it("reattaches only the new cache entry after clearing deferred readiness", async () => {
    let resolve!: () => void; mocks.ready.mockReturnValue(new Promise<void>(done => { resolve = done; }));
    renderHook(() => useCollection("buses")); act(() => clearCollectionCache());
    await act(async () => { resolve(); });
    await waitFor(() => expect(mocks.listen).toHaveBeenCalledOnce());
  });
  it("does not attach after unmount while waiting for auth", async () => {
    let resolve!: () => void; mocks.ready.mockReturnValue(new Promise<void>(done => { resolve = done; }));
    const hook = renderHook(() => useCollection("buses")); hook.unmount();
    await act(async () => { resolve(); }); expect(mocks.listen).not.toHaveBeenCalled();
  });
  it("fences a changed auth generation before React cleanup runs", async () => {
    let resolve!: () => void; mocks.ready.mockReturnValue(new Promise<void>(done => { resolve = done; }));
    renderHook(() => useCollection("buses")); mocks.generation++;
    await act(async () => { resolve(); }); expect(mocks.listen).not.toHaveBeenCalled();
  });
});
