import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ reads: 0, gate: null as Promise<void> | null, rows: new Map<string, Record<string, unknown>>() }));
vi.mock("../lib/firebaseAdmin", () => ({ db: { collection: () => ({ doc: (id: string) => ({ get: async () => {
  state.reads++; const data = state.rows.get(id); await state.gate; return { exists: Boolean(data), data: () => data };
} }) }) } }));
import { invalidateRouteGeometryRead, readRouteGeometryDocument, routeGeometryReadStatus } from "./routeGeometryReads";
beforeEach(() => { invalidateRouteGeometryRead(); state.rows.clear(); state.reads = 0; state.gate = null; });
afterEach(() => { vi.restoreAllMocks(); });
it("coalesces thirty-two same-route reads and retains a negative cache", async () => {
  let release!: () => void; state.gate = new Promise<void>(done => { release = done; });
  const reads = Array.from({ length: 32 }, () => readRouteGeometryDocument("missing"));
  await vi.waitFor(() => expect(state.reads).toBe(1));
  await expect(readRouteGeometryDocument("missing")).rejects.toThrow("capacity");
  release(); expect((await Promise.all(reads)).every(row => !row.exists)).toBe(true);
  expect((await readRouteGeometryDocument("missing")).exists).toBe(false); expect(state.reads).toBe(1);
});
it("rejects a captured old document after watcher invalidation without caching it", async () => {
  state.rows.set("route", { geometryVersion: 1 });
  let release!: () => void; state.gate = new Promise<void>(done => { release = done; });
  const old = readRouteGeometryDocument("route"); await vi.waitFor(() => expect(state.reads).toBe(1));
  invalidateRouteGeometryRead("route"); state.rows.set("route", { geometryVersion: 2 }); release();
  await expect(old).rejects.toThrow("invalidated"); expect(routeGeometryReadStatus().cached).toBe(0);
  expect((await readRouteGeometryDocument("route")).data?.geometryVersion).toBe(2);
});
it("caps distinct raw reads at sixteen even after caller deadlines", async () => {
  let release!: () => void; state.gate = new Promise<void>(done => { release = done; });
  const reads = Array.from({ length: 16 }, (_, index) => readRouteGeometryDocument(`route-${index}`));
  const settled = Promise.allSettled(reads);
  await vi.waitFor(() => expect(state.reads).toBe(16));
  await expect(readRouteGeometryDocument("extra")).rejects.toThrow("capacity");
  const now = performance.now(); vi.spyOn(performance, "now").mockReturnValue(now + 3_001);
  await expect(readRouteGeometryDocument("route-0")).rejects.toThrow("deadline");
  expect(routeGeometryReadStatus().activeFills).toBe(16);
  release(); expect((await settled).every(row => row.status === "rejected")).toBe(true);
  expect(routeGeometryReadStatus().cached).toBe(0); expect(routeGeometryReadStatus().activeFills).toBe(0);
});
it("uses sixty-second monotonic freshness and evicts after one hundred documents", async () => {
  state.rows.set("route", { geometryVersion: 1 }); await readRouteGeometryDocument("route");
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 86_400_000);
  await readRouteGeometryDocument("route"); expect(state.reads).toBe(1);
  const clock = vi.spyOn(performance, "now").mockReturnValue(performance.now() + 60_001);
  await readRouteGeometryDocument("route"); expect(state.reads).toBe(2); clock.mockRestore();
  for (let index = 0; index < 101; index++) await readRouteGeometryDocument(`extra-${index}`);
  expect(routeGeometryReadStatus().cached).toBe(100);
  await readRouteGeometryDocument("route"); expect(state.reads).toBe(104);
});
