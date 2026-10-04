// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FeedbackPanel from "./FeedbackPanel";
const fixtures = vi.hoisted(() => ({
  entry: { id: "qa-feedback", userId: "qa-passenger", userName: "QA Passenger", type: "general", rating: null, busId: null, driverId: null, sessionId: null, comment: "Please improve the route card", timestamp: null, status: "new" },
  user: { uid: "admin", role: "admin" } as { uid: string; role: string } | null,
  loading: false, auth: { currentUser: { uid: "admin", getIdToken: async () => "test-token" } },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: fixtures.user, loading: fixtures.loading }) }));
vi.mock("@/hooks/useBuses", () => ({ useBuses: () => ({ buses: [] }) }));
vi.mock("@/hooks/useDrivers", () => ({ useDrivers: () => ({ drivers: [] }) }));
vi.mock("@/lib/firebaseAuth", () => ({ auth: fixtures.auth }));
const listResponse = () => new Response(JSON.stringify({ feedbacks: [fixtures.entry] }));
beforeEach(() => {
  fixtures.user = { uid: "admin", role: "admin" }; fixtures.loading = false; fixtures.auth.currentUser.uid = "admin";
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://qa.ngrok-free.dev");
  vi.spyOn(console, "error").mockImplementation(() => {}); vi.stubGlobal("fetch", vi.fn(async () => listResponse()));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function expand() { const user = userEvent.setup(); await user.click(await screen.findByRole("button", { expanded: false })); return user; }
describe("admin feedback API workflow", () => {
  it.each([false, true])("loads the shared panel through the API (embedded=%s)", async embedded => {
    render(<FeedbackPanel embedded={embedded} />); await screen.findByText("QA Passenger");
    const fetch = vi.mocked(globalThis.fetch); expect(fetch.mock.calls[0][0]).toBe("https://qa.ngrok-free.dev/api/v2/feedback");
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer test-token");
  });
  it("sends parseable JSON and updates status only after acknowledgement", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "PATCH") return listResponse();
      const json = new Headers(init.headers).get("Content-Type") === "application/json";
      return new Response(JSON.stringify(json ? { updated: true, status: "reviewed" } : { error: "Invalid feedback status update." }), { status: json ? 200 : 400 });
    }); vi.stubGlobal("fetch", fetch); render(<FeedbackPanel />); const user = await expand();
    await user.click(screen.getByRole("button", { name: "reviewed" }));
    const init = fetch.mock.calls.find(([, options]) => options?.method === "PATCH")![1]!;
    expect(JSON.parse(String(init.body))).toEqual({ status: "reviewed" });
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    await waitFor(() => expect((screen.getByRole("button", { name: "reviewed" }) as HTMLButtonElement).disabled).toBe(true));
  });
  it.each([new Response('{"error":"not authorized"}', { status: 403 }), new Response('{}')])("rejects failed or malformed PATCH acknowledgement", async response => {
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => init?.method === "PATCH" ? response : listResponse()));
    render(<FeedbackPanel />); const user = await expand(); await user.click(screen.getByRole("button", { name: "resolved" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "new" }) as HTMLButtonElement).disabled).toBe(true));
    await screen.findByText(response.status === 403 ? "not authorized" : /backend did not confirm/);
  });
  it("filters by type, status and search and restores results with Reset", async () => {
    render(<FeedbackPanel />); await screen.findByText("QA Passenger"); const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Feedback type"), "ride"); expect(screen.queryByRole("button", { expanded: false })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reset" })); expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Feedback status"), "resolved"); expect(screen.queryByRole("button", { expanded: false })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reset" })); await user.type(screen.getByLabelText("Search feedback"), "missing passenger");
    expect(screen.queryByRole("button", { expanded: false })).toBeNull(); await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { expanded: false })).toBeTruthy();
  });
  it("surfaces GET denial and reloads on retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response('{"error":"admin access required"}', { status: 403 })).mockImplementation(async () => listResponse()));
    render(<FeedbackPanel />); await screen.findByText("admin access required");
    await userEvent.setup().click(screen.getByRole("button", { name: /retry/i })); await screen.findByText("QA Passenger");
  });
  it("rejects malformed successful GET instead of pretending it is an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"feedbacks":[{"id":"broken"}]}')));
    render(<FeedbackPanel />); await screen.findByText(/backend did not confirm/); expect(screen.queryByText("QA Passenger")).toBeNull();
  });
  it("does not fetch before role/App Check verification", async () => {
    fixtures.loading = true; const view = render(<FeedbackPanel />); await Promise.resolve(); expect(globalThis.fetch).not.toHaveBeenCalled();
    fixtures.loading = false; view.rerender(<FeedbackPanel />); await screen.findByText("QA Passenger");
  });
  it("hides old-account data on sign-out", async () => {
    const view = render(<FeedbackPanel />); await screen.findByText("QA Passenger");
    fixtures.user = null; view.rerender(<FeedbackPanel />);
    expect(screen.queryByText("QA Passenger")).toBeNull();
  });
  it("aborts pending reads and ignores late data after sign-out", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; })); vi.stubGlobal("fetch", fetch);
    const view = render(<FeedbackPanel />); await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const signal = vi.mocked(globalThis.fetch).mock.calls[0][1]?.signal;
    fixtures.user = null; view.rerender(<FeedbackPanel />); expect(signal?.aborted).toBe(true);
    resolve(listResponse()); await waitFor(() => expect(screen.queryByText("QA Passenger")).toBeNull());
  });
});
