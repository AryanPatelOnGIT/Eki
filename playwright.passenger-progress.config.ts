import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/passenger-progress", workers: 1, timeout: 30_000,
  outputDir: "artifacts/passenger-progress", reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:3127", trace: "retain-on-failure" },
  webServer: { command: "node node_modules/vite/bin/vite.js --config e2e/passenger-progress/vite.config.mts", url: "http://127.0.0.1:3127", reuseExistingServer: false },
  projects: [ { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } } ],
});
