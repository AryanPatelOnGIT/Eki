// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountTab from "./AccountTab";
const mocks = vi.hoisted(() => ({ logout: vi.fn(),
  user: { uid: "qa-passenger", displayName: "QA Passenger", role: "passenger" },
  auth: { currentUser: { uid: "qa-passenger", getIdToken: vi.fn(async () => "test-token") } },
}));
vi.mock("@/lib/firebaseAuth", () => ({ auth: mocks.auth }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user, logout: mocks.logout }) }));
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://qa.ngrok-free.dev"); mocks.logout.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("account confirmations", () => {
  it("cancel and Escape never queue deletion or sign out", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); render(<AccountTab />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete Account" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Sign Out" }));
    await user.keyboard("{Escape}");
    expect(fetchMock).not.toHaveBeenCalled(); expect(mocks.logout).not.toHaveBeenCalled();
  });
  it.each(["<html>proxy warning</html>", "{}", "null"])("never shows deletion queued for invalid acknowledgement %s", async body => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body))); render(<AccountTab />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete Account" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete Account" }));
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.queryByText("Deletion queued. Your account will be removed shortly.")).toBeNull();
  });
  it("queues deletion only after explicit confirmation and server acceptance", async () => {
    const fetchMock = vi.fn(async () => new Response('{"accepted":true}', { status: 202 })); vi.stubGlobal("fetch", fetchMock);
    render(<AccountTab />); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Delete Account" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete Account" }));
    expect(await screen.findByText("Deletion queued. Your account will be removed shortly.")).toBeTruthy();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("ngrok-skip-browser-warning")).toBe("1");
  });
});
