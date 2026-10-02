// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FeedbackModal from "./FeedbackModal";

const session = vi.hoisted(() => ({ currentUser: { uid: "qa-passenger", getIdToken: vi.fn(async () => "test-token") } }));
vi.mock("@/lib/firebaseAuth", () => ({ auth: session }));

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://qa.ngrok-free.dev");
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => setTimeout(fn, 0));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function submitGeneral() {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<FeedbackModal userId="qa-passenger" onClose={onClose} />);
  await user.type(screen.getByRole("textbox"), "The route card should open reliably.");
  await user.click(screen.getByRole("button", { name: "Submit Feedback" }));
  return { user, onClose };
}

describe("passenger feedback workflow", () => {
  it.each(["{}", "null", '{"submitted":false}'])("requires the backend submission acknowledgement: %s", async body => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    await submitGeneral();
    expect(await screen.findByText("Failed to send. Please try again.")).toBeTruthy();
    expect(localStorage.getItem("feedbackCooldown:qa-passenger")).toBeNull();
  });
  it("never reports success for an HTTP 200 HTML proxy page", async () => {
    const fetchMock = vi.fn(async () => new Response("<html>ngrok warning</html>", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await submitGeneral();
    await waitFor(() => expect(screen.queryByText("Thank you!")).toBeNull());
    expect(await screen.findByText("Failed to send. Please try again.")).toBeTruthy();
    expect(localStorage.getItem("feedbackCooldown:qa-passenger")).toBeNull();
  });

  it("submits through ngrok with the shared proxy header and preserves auth", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ submitted: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await submitGeneral();
    expect(await screen.findByText("Thank you!")).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://qa.ngrok-free.dev/api/feedback");
    const headers = new Headers(init.headers);
    expect(headers.get("ngrok-skip-browser-warning")).toBe("1");
    expect(headers.get("Authorization")).toBe("Bearer test-token");
    expect(JSON.parse(String(init.body))).toMatchObject({ type: "general", comment: "The route card should open reliably.", requestId: expect.any(String) });
  });

  it("reuses the request ID after an ambiguous failure and retries the same feedback", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection interrupted"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ submitted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { user } = await submitGeneral();
    expect(await screen.findByText("Failed to send. Please try again.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Submit Feedback" }));
    expect(await screen.findByText("Thank you!")).toBeTruthy();
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
    expect(bodies[0].requestId).toBe(bodies[1].requestId);
  });

  it("honors the server cooldown without claiming the feedback was stored", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Limit reached", retryAfterMs: 3_600_000 }), { status: 429 })));
    await submitGeneral();
    expect(await screen.findByText(/Limit reached\. Please try again in/)).toBeTruthy();
    expect(screen.queryByText("Thank you!")).toBeNull();
  });

  it("supports close and Escape without submitting an empty form", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<FeedbackModal userId="qa-passenger" onClose={close} />);
    expect((screen.getByRole("button", { name: "Submit Feedback" }) as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Close feedback" }));
    expect(close).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
