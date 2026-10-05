import { expect, test } from "@playwright/test";

test.use({ trace: "on" });

const scenarios = ["pending", "forward", "reverse", "multiple", "mixed", "device", "empty", "completed"] as const;

test.describe("isolated passenger fixture", () => {
  for (const scenario of scenarios) {
    test(`${scenario} route controls`, async ({ page }, testInfo) => {
      await page.goto("http://127.0.0.1:3100/");
      await page.getByText("QA controls (synthetic)").click();
      await page.getByLabel("QA scenario").selectOption(scenario);
      await page.getByText("QA controls (synthetic)").click();
      if (scenario === "empty" || scenario === "completed") {
        await expect(page.getByRole("button", { name: "Track QA route" })).toHaveCount(0);
      } else {
        await page.getByRole("button", { name: "Track QA route" }).click();
        await expect(page.getByRole("button", { name: "Back to home" })).toBeVisible();
        await page.getByRole("button", { name: "Back to home" }).click();
        await page.getByRole("button", { name: "Track QA route" }).click();
        if (scenario !== "device") {
          await page.getByRole("button", { name: "Open live chat" }).click();
        }
        await page.goto("http://127.0.0.1:3100/");
      }
      await page.getByRole("button", { name: "Profile" }).click();
      await page.getByRole("button", { name: "Routes" }).click();
      await page.screenshot({ path: testInfo.outputPath(`${scenario}.png`), fullPage: true });
    });
  }

  test("settings controls respond to physical clicks", async ({ page }, testInfo) => {
    await page.goto("http://127.0.0.1:3100/");
    await page.getByText("QA controls (synthetic)").click();
    await page.getByLabel("QA view").selectOption("settings");
    await page.getByText("QA controls (synthetic)").click();
    await expect(page.getByText("Settings", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("settings.png"), fullPage: true });
  });
});

test("moving marker simulation completes every profile", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await page.goto("http://127.0.0.1:3150/?telemetryTrace=1");
  await page.getByRole("checkbox", { name: "Use standard animation in this simulation" }).check();
  await page.getByRole("button", { name: "Run all 12 scenarios" }).click();
  await expect(page.getByRole("status")).toContainText("Complete.", { timeout: 280_000 });
  await expect(page.getByRole("row")).toHaveCount(13);
  await page.screenshot({ path: testInfo.outputPath("motion-all.png"), fullPage: true });
});
