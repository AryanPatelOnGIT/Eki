export default {
  mutate: ['backend/src/services/telemetryPayload.ts'],
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'qa/mutation.vitest.config.mts', related: false },
  concurrency: 2,
  timeoutMS: 3000,
  dryRunTimeoutMinutes: 2,
  reporters: ['clear-text', 'json', 'html'],
  jsonReporter: { fileName: 'artifacts/qa/mutation/report.json' },
  htmlReporter: { fileName: 'artifacts/qa/mutation/index.html' },
  tempDirName: 'artifacts/qa/stryker-sandbox',
  ignorePatterns: ['artifacts/**', 'hardware/**', 'frontend/**', '.github/**'],
  thresholds: { high: 95, low: 90, break: 90 },
  // 95.49% was observed locally before this budget; retain all survivors for review.
};
