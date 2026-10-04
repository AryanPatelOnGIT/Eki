import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", testMatch: "admin-access.spec.ts", timeout: 30000,
  outputDir: ".playwright-admin-access-results",
  use: { baseURL: "http://127.0.0.1:3105", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "node node_modules/vite/bin/vite.js --config e2e/admin-access/vite.config.mts", url: "http://127.0.0.1:3105", reuseExistingServer: false },
  projects: [
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
});
