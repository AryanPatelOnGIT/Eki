import { expect, test } from "@playwright/test";

test.use({ trace: "on" });

test("R22 browser shows administrator messages distinctly and clears old sessions", async ({ page }, testInfo) => {
  await page.goto("http://127.0.0.1:3250/");
  await page.getByRole("button", { name: "Load messages" }).click();
  await expect(page.getByText("Administrator · Alex")).toBeVisible();
  await expect(page.getByText("Sam", { exact: true })).toBeVisible();
  const adminBubble = await page.getByText("Service update").locator("..").evaluate(
    element => getComputedStyle(element).backgroundColor,
  );
  const driverBubble = await page.getByText("At Alpha").locator("..").evaluate(
    element => getComputedStyle(element).backgroundColor,
  );
  expect(adminBubble).not.toBe(driverBubble);
  await page.getByRole("button", { name: "Change session" }).click();
  await expect(page.getByText("No messages yet")).toBeVisible();
  await expect(page.getByText("Service update")).toHaveCount(0);
  await page.getByRole("button", { name: "Close chat" }).click();
  await expect(page.getByRole("heading", { name: "Live Chat" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open chat" }).click();
  await expect(page.getByRole("heading", { name: "Live Chat" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("chat-admin-role.png"), fullPage: true });
});
