import { expect, test } from "@playwright/test";
// Adversarial admin access checks: in-flight writes across account changes,
// dropped protected reads and repeated online/offline flapping.
const entry = { id: "feedback", userId: "passenger", userName: "Browser Passenger", type: "general", busId: null,
  driverId: null, sessionId: null, rating: null, comment: "Browser verification", timestamp: null, status: "new" };
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(() => { expect(errors).toEqual([]); });

for (const action of ["Synthetic sign out", "Switch account"]) {
  test(`a status write acknowledged after "${action}" never resurfaces the previous session`, async ({ page }) => {
    let acknowledge!: () => void; const held = new Promise<void>(resolve => { acknowledge = resolve; });
    const reads: string[] = [];
    await page.route("**/__qa/firestore/feedback**", async route => {
      if (route.request().method() === "PATCH") { await held; return route.fulfill({ json: { updated: true } }); }
      reads.push(route.request().headers().authorization);
      return route.fulfill({ json: { feedbacks: [{ ...entry, userName: `Reader ${reads.length}` }] } });
    });
    await page.goto("/"); await page.getByRole("button", { name: "Approve verification" }).click();
    await expect(page.getByText("Reader 1")).toBeVisible();
    await page.getByRole("button", { expanded: false }).click();
    await page.getByRole("button", { name: "reviewed", exact: true }).click();
    await expect(page.getByRole("button", { name: "reviewed", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: action }).click();
    await expect(page.getByText("Reader 1")).toHaveCount(0);
    acknowledge();
    await page.waitForTimeout(300);
    await expect(page.getByText("Reader 1")).toHaveCount(0);
    if (action === "Switch account") {
      await page.getByRole("button", { name: "Approve verification" }).click();
      await expect(page.getByText("Reader 2")).toBeVisible();
      await page.getByRole("button", { expanded: false }).click();
      // The second account starts with idle controls and no inherited error.
      await expect(page.getByRole("button", { name: "reviewed", exact: true })).toBeEnabled();
      await expect(page.getByRole("alert")).toHaveCount(0);
      expect(reads).toEqual(["Bearer token-qa-admin", "Bearer token-qa-second"]);
    }
  });
}

test("a dropped feedback read shows a retryable error and the retry recovers", async ({ page }) => {
  let calls = 0;
  await page.route("**/__qa/firestore/feedback", route => ++calls === 1
    ? route.abort("connectionreset") : route.fulfill({ json: { feedbacks: [entry] } }));
  await page.goto("/"); await page.getByRole("button", { name: "Approve verification" }).click();
  await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
  await page.getByRole("button", { name: /retry/i }).click();
  await expect(page.getByText("Browser Passenger")).toBeVisible();
  expect(calls).toBe(2);
});

test("a slow feedback read finishing after an account switch never shows to the new account", async ({ page }) => {
  let release!: () => void; const slow = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route("**/__qa/firestore/feedback", async route => {
    const call = ++calls;
    if (call === 1) await slow;
    await route.fulfill({ json: { feedbacks: [{ ...entry, userName: call === 1 ? "First account data" : "Second account data" }] } }).catch(() => {});
  });
  await page.goto("/"); await page.getByRole("button", { name: "Approve verification" }).click();
  await expect.poll(() => calls).toBe(1);
  await page.getByRole("button", { name: "Switch account" }).click();
  await page.getByRole("button", { name: "Approve verification" }).click();
  await expect(page.getByText("Second account data")).toBeVisible();
  release();
  await page.waitForTimeout(500);
  await expect(page.getByText("First account data")).toHaveCount(0);
  await expect(page.getByText("Second account data")).toBeVisible();
});

test("rapid offline/online flapping on the live fleet settles ready with one fleet", async ({ page, context }) => {
  await page.goto("/?resume");
  await page.getByRole("button", { name: "Approve verification" }).click();
  await expect(page.getByLabel("Connection state")).toHaveText("Ready");
  for (let i = 0; i < 6; i++) {
    await context.setOffline(i % 2 === 0);
    await page.evaluate(offline => window.dispatchEvent(new Event(offline ? "offline" : "online")), i % 2 === 0);
  }
  await context.setOffline(false);
  await expect(page.getByLabel("Connection state")).toHaveText("Ready", { timeout: 15_000 });
  await expect(page.getByText("Live qa-bus", { exact: true })).toHaveCount(1);
});
