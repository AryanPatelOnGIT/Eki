// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DashboardPanel from "./DashboardPanel";
const state = vi.hoisted(() => ({ entries: [], geometries: new Map() }));
vi.mock("@vis.gl/react-google-maps", () => ({ Map: ({children}: {children: ReactNode}) => <div>{children}</div>, AdvancedMarker: () => null, useMap: () => null }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "admin", user: {uid: "qa-admin"} }) }));
vi.mock("@/hooks/useActiveBuses", () => ({ useActiveBuses: () => state.entries }));
vi.mock("@/hooks/useDynamicRouteGeometries", () => ({ useDynamicRouteGeometries: () => state.geometries }));
vi.mock("@/hooks/useRTDBResume", () => ({ useRTDBResume: () => ({ isResuming: false }) }));
vi.mock("@/hooks/useBuses", () => ({ useBuses: () => ({ buses: [{id: "qa-bus", name: "QA bus", assignedRoutes: ["qa-route"]}] }) }));
vi.mock("@/hooks/useDrivers", () => ({ useDrivers: () => ({ drivers: [{id: "qa-driver", name: "QA driver", assignedBusId: "qa-bus"}] }) }));
vi.mock("@/hooks/useRoutes", () => ({ useRoutes: () => ({ routes: [{id: "qa-route", name: "QA route", stops: []}] }) }));
vi.mock("@/lib/firebaseAuth", () => ({ auth: {currentUser: {getIdToken: async () => "synthetic-token"}} }));
vi.mock("@/components/ui/CustomSelect", () => ({default: ({ariaLabel, value, options, onChange, disabled}: {ariaLabel: string; value: string; options: {value: string; label: string}[]; onChange: (value: string) => void; disabled?: boolean}) => <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}));
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "https://api.example.test"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function prepare() {
  const user = userEvent.setup(); render(<DashboardPanel />);
  expect((screen.getByRole("button", {name: "Start service"}) as HTMLButtonElement).disabled).toBe(true);
  await user.selectOptions(screen.getByRole("combobox", {name: "Operator"}), "qa-driver");
  return user;
}
describe("admin service creation", () => {
  it.each([200, 503])("reuses the operation key after an uncertain HTTP %i reply and accepts only a confirmed session", async status => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{}', {status})).mockResolvedValueOnce(new Response('{"sessionId":"qa-session","direction":null}'));
    vi.stubGlobal("fetch", fetchMock); const user = await prepare();
    await user.click(screen.getByRole("button", {name: "Start service"}));
    expect(await screen.findByText(status === 200 ? /did not confirm/ : /HTTP 503/)).toBeTruthy();
    await user.click(screen.getByRole("button", {name: "Start service"}));
    expect(await screen.findByText(/Service started \(qa-session\)/)).toBeTruthy();
    const first = new Headers(fetchMock.mock.calls[0][1].headers).get("Idempotency-Key");
    expect(first).toBeTruthy();
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("Idempotency-Key")).toBe(first);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.test/api/v2/ride-sessions");
  });
  it("keeps the start button locked while the server response is pending", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const user = await prepare(); await user.click(screen.getByRole("button", {name: "Start service"}));
    await waitFor(() => expect((screen.getByRole("button", {name: "Start service"}) as HTMLButtonElement).disabled).toBe(true));
  });
});
