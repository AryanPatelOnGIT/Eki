import { gnssTestMap } from './gnss-test-map.mjs';
// Reviewed assertion mappings only. No whole acceptance case is closed.
export const testMap = [{
  caseId: 'H17',
  scope: 'Mounted Express methods/paths agree with the published OpenAPI contract; L0 only.',
  sourcePaths: ['scripts/verify-openapi.mjs'],
  tests: [{ path: 'scripts/verify-openapi.test.mjs',
    name: 'validates the published contract against mounted Express routers', level: 'L0',
    semantics: 'Checks the published contract with the real static Express router extractor and rejects missing/stale registrations.' }],
}, ...gnssTestMap];
