// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FeedbackPanel from "./FeedbackPanel";
const fixtures = vi.hoisted(() => ({ entries: [{ id: "qa-feedback", userId: "qa-passenger", userName: "QA Passenger", type: "general", rating: null, busId: null, driverId: null, comment: "Please improve the route card", timestamp: null, status: "new" }], error: null as string | null, retry: vi.fn() }));
vi.mock("@/hooks/useCollection", () => ({ useCollection: () => ({ data: fixtures.entries, loading: false, error: fixtures.error, retry: fixtures.retry }) }));
vi.mock("@/hooks/useBuses", () => ({ useBuses: () => ({ buses: [] }) }));
vi.mock("@/hooks/useDrivers", () => ({ useDrivers: () => ({ drivers: [] }) }));
vi.mock("@/lib/firebaseAuth", () => ({ auth: { currentUser: { getIdToken: async () => "test-token" } } }));
beforeEach(() => { fixtures.error = null; fixtures.retry.mockClear(); vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://qa.ngrok-free.dev"); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("admin feedback actions", () => {
  it("sends parseable JSON when marking feedback reviewed", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const json = new Headers(init.headers).get("Content-Type") === "application/json";
      return new Response(JSON.stringify(json ? { updated: true, status: "reviewed" } : { error: "Invalid feedback status update." }), { status: json ? 200 : 400 });
    }); vi.stubGlobal("fetch", fetchMock); render(<FeedbackPanel />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { expanded: false })); await user.click(screen.getByRole("button", { name: "reviewed" }));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ status: "reviewed" });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Content-Type")).toBe("application/json");
    expect(screen.queryByText("Invalid feedback status update.")).toBeNull();
  });
  it("surfaces a server rejection without changing the status locally", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"not authorized"}', { status: 403 })));
    render(<FeedbackPanel />); const user = userEvent.setup(); await user.click(screen.getByRole("button", { expanded: false }));
    await user.click(screen.getByRole("button", { name: "resolved" }));
    expect(await screen.findByText("not authorized")).toBeTruthy();
    expect((screen.getByRole("button", { name: "new" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("filters by type, status and search and restores results with Reset", async () => {
    render(<FeedbackPanel />); const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Feedback type"), "ride"); expect(screen.queryByRole("button", { expanded: false })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reset" })); expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Feedback status"), "resolved"); expect(screen.queryByRole("button", { expanded: false })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reset" })); await user.type(screen.getByLabelText("Search feedback"), "missing passenger");
    expect(screen.queryByRole("button", { expanded: false })).toBeNull(); await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
  });
});
