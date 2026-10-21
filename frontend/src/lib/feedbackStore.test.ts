import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFeedback, submitFeedback, updateFeedbackStatus } from "./feedbackStore";

const fixture = vi.hoisted(() => ({
  uid: "passenger", generation: 0, records: new Map<string, Record<string, unknown>>(),
  writes: vi.fn(), read: vi.fn(), update: vi.fn(),
  beforeRead: null as (() => void) | null,
}));
vi.mock("./firebaseAuth", () => ({ auth: { get currentUser() { return { uid: fixture.uid }; } } }));
vi.mock("./authState", () => ({ getAuthVerificationGeneration: () => fixture.generation }));
vi.mock("./firebaseFirestore", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  collection: (_db: unknown, name: string) => name,
  query: (...parts: unknown[]) => parts,
  orderBy: (...parts: unknown[]) => parts,
  limit: (count: number) => count,
  serverTimestamp: () => "server-timestamp",
  getDocsFromServer: (...args: unknown[]) => fixture.read(...args),
  updateDoc: (...args: unknown[]) => fixture.update(...args),
  runTransaction: async (_db: unknown, callback: (tx: unknown) => Promise<void>) => {
    const pending = new Map<string, Record<string, unknown>>();
    await callback({
      get: async (path: string) => {
        fixture.beforeRead?.();
        const value = fixture.records.get(path);
        return { exists: () => value !== undefined, data: () => value };
      },
      set: (path: string, data: Record<string, unknown>) => pending.set(path, data),
    });
    for (const [path, data] of pending) { fixture.writes(path, data); fixture.records.set(path, data); }
  },
}));
const requestId = "feedback-request-0001";
const input = { type: "general" as const, rating: null, comment: "  Please improve the timetable  " };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const path = `feedbacks/${hash(`passenger\0${requestId}`)}`;
beforeEach(() => {
  fixture.uid = "passenger"; fixture.generation = 0; fixture.records.clear();
  fixture.beforeRead = null; fixture.writes.mockClear(); fixture.read.mockReset(); fixture.update.mockReset();
  fixture.records.set("users/passenger", { displayName: "Passenger Name" });
});
describe("Firestore feedback persistence", () => {
  it("writes feedback and cooldown atomically with API-compatible retry hashes", async () => {
    await submitFeedback("passenger", input, requestId);
    expect(fixture.records.get(path)).toMatchObject({ userId: "passenger", userName: "Passenger Name", type: "general",
      comment: input.comment.trim(), busId: null, rating: null, status: "new", timestamp: "server-timestamp",
      requestHash: hash(JSON.stringify({ kind: "general", sessionId: null, busId: null, driverId: null, rating: null, comment: input.comment.trim() })),
    });
    expect(fixture.records.get("feedbackCooldowns/passenger")).toEqual({ userId: "passenger", feedbackId: path.split("/")[1], lastSubmittedAt: "server-timestamp" });
    expect(fixture.writes).toHaveBeenCalledTimes(2);
  });
  it("replays a committed request without a duplicate even during cooldown", async () => {
    await submitFeedback("passenger", input, requestId);
    fixture.records.set("feedbackCooldowns/passenger", { lastSubmittedAt: { toMillis: () => Date.now() } });
    fixture.writes.mockClear(); await submitFeedback("passenger", input, requestId);
    expect(fixture.writes).not.toHaveBeenCalled();
    await expect(submitFeedback("passenger", { ...input, comment: "Changed feedback" }, requestId)).rejects.toMatchObject({ status: 409 });
  });
  it.each(["timestamp", "legacy-number"])("honors shared cooldowns (%s) without any writes", async format => {
    const stamp = Date.now(); fixture.records.set("feedbackCooldowns/passenger", { lastSubmittedAt: format === "timestamp" ? { toMillis: () => stamp } : stamp });
    await expect(submitFeedback("passenger", input, requestId)).rejects.toMatchObject({ status: 429, retryAfterMs: expect.any(Number) });
    expect(fixture.writes).not.toHaveBeenCalled();
  });
  it("rejects deleted profiles and changed accounts before writing", async () => {
    fixture.records.delete("users/passenger");
    await expect(submitFeedback("passenger", input, requestId)).rejects.toMatchObject({ status: 403 });
    fixture.records.set("users/passenger", {});
    fixture.beforeRead = () => { fixture.generation++; };
    await expect(submitFeedback("passenger", input, requestId)).rejects.toMatchObject({ status: 401 });
    expect(fixture.writes).not.toHaveBeenCalled();
  });
  it("validates missing ride context and excessive words before writing", async () => {
    await expect(submitFeedback("passenger", { ...input, type: "ride", rating: 5 }, requestId)).rejects.toThrow(/completed ride/);
    await expect(submitFeedback("passenger", { ...input, comment: "word ".repeat(201) }, requestId)).rejects.toThrow(/limits/);
    expect(fixture.writes).not.toHaveBeenCalled();
  });
  it("loads the latest 200 from the server on every retry and validates stored data", async () => {
    fixture.read.mockResolvedValue({ docs: [{ id: "existing", data: () => ({ userId: "passenger", comment: "A suggestion" }) }] });
    expect(await loadFeedback()).toMatchObject([{ id: "existing", type: "general", status: "new" }]);
    await loadFeedback();
    expect(fixture.read).toHaveBeenCalledTimes(2);
    expect(fixture.read).toHaveBeenCalledWith(["feedbacks", ["timestamp", "desc"], 200]);
    fixture.read.mockResolvedValue({ docs: [{ id: "bad", data: () => ({ rating: "five" }) }] });
    await expect(loadFeedback()).rejects.toThrow(/invalid feedback/);
  });
  it("records the authenticated admin and waits for write errors", async () => {
    fixture.uid = "admin";
    fixture.update.mockRejectedValueOnce({ code: "permission-denied" });
    await expect(updateFeedbackStatus("admin", "existing", "reviewed")).rejects.toMatchObject({ code: "permission-denied" });
    expect(fixture.update).toHaveBeenCalledWith("feedbacks/existing", { status: "reviewed", reviewedBy: "admin", reviewedAt: "server-timestamp" });
  });
});
