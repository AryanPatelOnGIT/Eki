import { expect, test } from "@playwright/test";

test("destination ETA, passed stops, segmented road and one bus glyph stay consistent through silence and recovery", async ({ page }, info) => {
  await page.clock.install();
  await page.goto("/");
  await expect(page.locator("[data-position-marker]")).toHaveCount(5); // four stations and one bus
  const picker = page.getByRole("combobox", { name: "Destination station" });
  await picker.click();
  await expect(page.getByRole("option", { name: "Alpha" })).toContainText("Passed");
  await expect(page.getByRole("option", { name: "Beta" })).toContainText("Passed");
  await expect(page.getByRole("option", { name: "Gamma" })).toContainText(/min/);
  await expect(page.getByRole("option", { name: "Delta" })).toContainText(/min/);
  for (const name of ["Gamma", "Delta"]) {
    expect(await page.getByRole("option", { name }).evaluate(element => {
      const rect = element.getBoundingClientRect();
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return top === element || element.contains(top);
    })).toBe(true);
  }
  await expect(page.locator('[data-road-color="#71717a"]')).toHaveCount(1);
  await expect(page.locator('[data-road-color="#3b82f6"]')).toHaveCount(1);
  await expect(page.locator('[data-road-color="#22c55e"]')).toHaveCount(1);
  await expect(page.getByLabel("Beta — passed", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: info.outputPath("destination-etas.png"), fullPage: true });
  await picker.press("Escape");
  await page.getByRole("button", { name: "Publish next stop", exact: true }).click();
  await expect(page.getByLabel("Gamma — passed", { exact: true })).toBeVisible();
  await picker.click();
  await expect(page.getByRole("option", { name: "Gamma" })).toContainText("Passed");
  await page.clock.runFor(105_001);
  await expect(page.getByRole("option", { name: "Delta" })).toContainText("Signal delayed");
  await picker.press("Escape");
  await page.getByRole("button", { name: "Publish fresh fix", exact: true }).click();
  await picker.click();
  await expect(page.getByRole("option", { name: "Gamma" })).toContainText(/min/);
  await expect(page.getByRole("option", { name: "Delta" })).not.toContainText("Signal delayed");
});
