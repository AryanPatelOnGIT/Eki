import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('../backend/', import.meta.url)),
  test: { include: ['src/services/telemetryPayload.test.ts', 'src/services/qaGnssProperties.test.ts'],
    maxWorkers: 1, fileParallelism: false },
});
