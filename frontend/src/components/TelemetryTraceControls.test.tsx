// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UserRole } from "@/hooks/useAuth";
import TelemetryTraceControls from "./TelemetryTraceControls";

const state = vi.hoisted(() => ({ enabled: true, user: { role: "passenger" as UserRole } as { role: UserRole } | null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/lib/telemetryTrace", () => ({ telemetryTraceEnabled: () => state.enabled }));

afterEach(() => {
  cleanup();
  delete window.__ekiTelemetryTrace;
  state.enabled = true;
  state.user = { role: "passenger" };
});

describe("opt-in tab trace export", () => {
  it.each(["passenger", "driver", "admin"] as const)("lets a genuine %s export its existing tab trace without requesting health", role => {
    state.user = { role };
    const download = vi.fn();
    const downloadHealth = vi.fn();
    window.__ekiTelemetryTrace = { download, downloadHealth } as unknown as NonNullable<Window["__ekiTelemetryTrace"]>;
    render(<TelemetryTraceControls />);
    fireEvent.click(screen.getByRole("button", { name: "Download telemetry trace" }));
    expect(download).toHaveBeenCalledOnce();
    expect(downloadHealth).not.toHaveBeenCalled();
  });

  it("does not advertise capture without explicit opt-in", () => {
    state.enabled = false;
    render(<TelemetryTraceControls />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("hides the local download after logout or while role verification is unresolved", () => {
    const { rerender } = render(<TelemetryTraceControls />);
    expect(screen.getByRole("button")).toBeTruthy();
    state.user = { role: null };
    rerender(<TelemetryTraceControls />);
    expect(screen.queryByRole("button")).toBeNull();
    state.user = null;
    rerender(<TelemetryTraceControls />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
