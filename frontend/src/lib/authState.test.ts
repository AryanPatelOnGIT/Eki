import { describe, expect, it, vi } from "vitest";
describe("protected auth readiness", () => {
  it("waits for verification and resets after account changes", async () => {
    vi.resetModules();
    const { waitForAuth, notifyAuthReady, beginAuthVerification } = await import("./authState");
    const opened = vi.fn(); const first = waitForAuth().then(opened);
    await Promise.resolve(); expect(opened).not.toHaveBeenCalled();
    beginAuthVerification(); await Promise.resolve(); expect(opened).not.toHaveBeenCalled();
    notifyAuthReady(); await first; expect(opened).toHaveBeenCalledOnce();
    beginAuthVerification(); const second = waitForAuth().then(opened);
    await Promise.resolve(); expect(opened).toHaveBeenCalledOnce();
    notifyAuthReady(); await second; expect(opened).toHaveBeenCalledTimes(2);
  });
});
