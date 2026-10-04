// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSmoothPosition } from "./useSmoothPosition";
import type { LatLng } from "@/lib/polyline";
let frames: Map<number, FrameRequestCallback>, id = 0;
beforeEach(() => {
  frames = new Map(); vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (value: number) => frames.delete(value));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function frame(time: number) { const callbacks = [...frames.values()]; frames.clear(); act(() => callbacks.forEach(callback => callback(time))); }
it.each([120, 250])("reaches the target at the configured duration %d", duration => {
  const origin = { lat: 23, lng: 72 }, target = { lat: 23.001, lng: 72.001 };
  const hook = renderHook(({ point }) => useSmoothPosition(point, duration), { initialProps: { point: origin } });
  hook.rerender({ point: target }); frame(duration / 2);
  expect(hook.result.current).not.toEqual(target); frame(duration);
  expect(hook.result.current).toEqual(target); expect(frames.size).toBe(0);
});
it("cancels old animation when the marker disappears and starts from a fresh target", () => {
  const hook = renderHook(({ point }: { point: LatLng | null }) => useSmoothPosition(point, 120), { initialProps: { point: { lat: 23, lng: 72 } as LatLng | null } });
  hook.rerender({ point: { lat: 24, lng: 72 } }); expect(frames.size).toBe(1);
  hook.rerender({ point: null }); expect(hook.result.current).toBeNull(); expect(frames.size).toBe(0);
  hook.rerender({ point: { lat: 25, lng: 73 } }); frame(120);
  expect(hook.result.current).toEqual({ lat: 25, lng: 73 });
});
it("respects reduced motion and cancels callbacks on unmount", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const hook = renderHook(({ point }) => useSmoothPosition(point, 120), { initialProps: { point: { lat: 23, lng: 72 } } });
  hook.rerender({ point: { lat: 24, lng: 73 } }); frame(1);
  expect(hook.result.current).toEqual({ lat: 24, lng: 73 });
  hook.rerender({ point: { lat: 25, lng: 73 } }); hook.unmount(); expect(frames.size).toBe(0);
});
