import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', testMatch: 'emulator-acceptance.spec.ts', timeout: 30000, workers: 1, retries: 0,
  outputDir: 'artifacts/qa/browser-results',
  reporter: [['list'], ['json', { outputFile: 'artifacts/qa/browser-playwright.json' }], ['junit', { outputFile: 'artifacts/qa/browser-junit.xml' }]],
  use: { baseURL: 'http://127.0.0.1:3115', trace: 'off', screenshot: 'only-on-failure',
    permissions: ['geolocation'], geolocation: { latitude: 23, longitude: 72, accuracy: 5 } },
  webServer: [
    { command: 'node --import ./scripts/qa/network-guard.mjs e2e/emulator/backend.mjs', url: 'http://127.0.0.1:3117/evidence', reuseExistingServer: false, timeout: 30000,
      env: { PORT: '3116', CORS_ORIGIN: 'http://127.0.0.1:3115', NODE_ENV: 'development', API_APPCHECK_MODE: 'off' } },
    { command: 'node node_modules/vite/bin/vite.js --config e2e/emulator/vite.config.mts', url: 'http://127.0.0.1:3115', reuseExistingServer: false, timeout: 30000 },
  ],
  projects: [
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
