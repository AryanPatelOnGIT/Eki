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
  it("opens deletion confirmation outside the scrolling, animated profile container", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    render(<div data-testid="profile-container" style={{ transform: "translateY(0)", overflow: "hidden", height: 300 }}><AccountTab /></div>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete Account" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Account?" });
    expect(document.body.contains(dialog)).toBe(true);
    expect(screen.getByTestId("profile-container").contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
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
    expect(screen.queryByRole("dialog", { name: "Deletion requested" })).toBeNull();
    expect(mocks.logout).not.toHaveBeenCalled();
  });
  it("queues deletion only after explicit confirmation and server acceptance", async () => {
    const fetchMock = vi.fn(async () => new Response('{"accepted":true}', { status: 202 })); vi.stubGlobal("fetch", fetchMock);
    render(<AccountTab />); const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Delete Account" }));
    expect(within(screen.getByRole("dialog")).getByText(/Your feedback, passenger ride entries, and messages will be retained/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete Account" }));
    const accepted = await screen.findByRole("dialog", { name: "Deletion requested" });
    expect(within(accepted).getByText(/Your account deletion request has been queued/)).toBeTruthy();
    expect(within(accepted).queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(mocks.logout).not.toHaveBeenCalled();
    await user.click(within(accepted).getByRole("button", { name: "OK" }));
    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("ngrok-skip-browser-warning")).toBe("1");
  });
  it("signs out when the accepted deletion popup is dismissed with Escape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"accepted":true}', { status: 202 })));
    render(<AccountTab />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Delete Account" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete Account" }));
    await screen.findByRole("dialog", { name: "Deletion requested" });
    await user.keyboard("{Escape}");
    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
