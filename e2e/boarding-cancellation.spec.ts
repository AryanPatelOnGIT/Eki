import { expect, test } from "@playwright/test";

test.use({
  geolocation: { latitude: 23, longitude: 72 },
  permissions: ["geolocation"],
  trace: "on",
});

async function fillBoarding(page: import("@playwright/test").Page) {
  await page.getByRole("combobox", { name: "Boarding stop" }).click();
  await page.getByRole("option", { name: "Alpha" }).click();
  await page.getByRole("combobox", { name: "Destination station" }).click();
  await page.getByRole("option", { name: "Beta" }).click();
  await page.getByRole("textbox", { name: "Boarding code" }).fill("ABCDEFGH");
}

test("R23 browser GPS cancellation fences the former session", async ({ page }, testInfo) => {
  const requests: string[] = [];
  await page.route("**/api/sessions/*/join", async route => {
    requests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"joined":true}' });
  });
  await page.goto("http://127.0.0.1:3200/");
  await page.getByRole("button", { name: "Hold GPS" }).click();
  await fillBoarding(page);
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Session qa-session-1" })).toContainText("GPS pending");
  await page.getByRole("button", { name: "Change session" }).click();
  await page.getByRole("button", { name: "Release GPS" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Session qa-session-2" })).toContainText("release delivered");
  expect(requests).toHaveLength(0);
  await fillBoarding(page);
  await page.getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Session qa-session-2" })).toContainText("GPS pending");
  await page.getByRole("button", { name: "Release GPS" }).click();
  await expect(page.getByRole("status").filter({ hasText: "On board" })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain("qa-session-2");
  await page.screenshot({ path: testInfo.outputPath("boarding-cancel.png"), fullPage: true });
});
