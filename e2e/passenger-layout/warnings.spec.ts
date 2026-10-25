import { expect, test } from "@playwright/test";

test("reconnecting status leaves the tracking title and destination control unobscured", async ({ page }, info) => {
  await page.goto("/?scenario=reconnecting");
  await expect(page.getByText("Reconnecting to live bus data...",{exact:true})).toBeVisible();
  await page.getByRole("button", { name: "Track QA route", exact: true }).click();
  const title = page.getByRole("button", { name: "Back to home", exact: true }).locator("..").getByText(/→|Direction pending/).first();
  for (const control of [title, page.getByRole("combobox", { name: "Destination station" })]) {
    await expect(control).toBeVisible();
    expect(await control.evaluate(el => {
      const r=el.getBoundingClientRect(), top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return top===el || el.contains(top);
    })).toBe(true);
  }
  await page.screenshot({path:info.outputPath("reconnecting-header.png")});
});

test("destination dropdown stays above notices in the map pane", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Track QA route", exact: true }).click();
  await page.getByRole("combobox", { name: "Destination station" }).click();
  for (const name of ["Alpha", "Beta"]) {
    const option = page.getByRole("option", { name, exact: true });
    await expect(option).toBeVisible();
    expect(await option.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return top === element || element.contains(top);
    })).toBe(true);
  }
});

test("location delay stays below variable ride controls and clears on recovery", async ({ page }, info) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByText("QA controls (synthetic)", { exact: true }).click();
  await page.getByLabel("QA scenario").selectOption("multiple");
  await page.getByText("QA controls (synthetic)", { exact: true }).click();
  await page.getByRole("button", { name: "Track QA route", exact: true }).click();
  const warning = page.getByText(/Live location updates delayed/);
  await expect(page.getByLabel("Synthetic map", { exact: true })).toBeVisible();
  await expect(warning).toHaveCount(0);
  await page.clock.runFor(90_001);
  await expect(warning).toBeVisible();
  // Visibility alone does not establish that another layer leaves text readable.
  const header = page.getByRole("button", { name: "Back to home", exact: true }).locator("..").locator("..");
  const headerBox = (await header.boundingBox())!;
  const warningBox = (await warning.boundingBox())!;
  expect(warningBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  expect(await warning.evaluate(element => {
    const box = element.getBoundingClientRect();
    // Notices deliberately pass pointer events through to the map. Enable
    // hit testing only for this visual occlusion probe; preserve layout/stacking.
    const prior = element.style.pointerEvents;
    try {
      element.style.pointerEvents = "auto";
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return top === element || element.contains(top);
    } finally { element.style.pointerEvents = prior; }
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.getByRole("button", { name: "Route Timeline", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("location-delay.png"), fullPage: true });
  await page.getByText("QA controls (synthetic)", { exact: true }).click();
  await page.getByLabel("QA scenario").selectOption("reverse");
  await expect(warning).toHaveCount(0);
});
