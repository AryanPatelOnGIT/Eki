import { gnssTestMap } from './gnss-test-map.mjs';
import { emulatorTestMap } from './emulator-test-map.mjs';
import { browserTestMap } from './browser-test-map.mjs';
import { mergeTestMaps } from '../scripts/qa/merge-test-maps.mjs';
// Exact limited assertion links; no complete feature acceptance is claimed.
export const testMap = mergeTestMaps([{
  caseId: 'H17',
  scope: 'Mounted Express methods/paths agree with the published OpenAPI contract; L0 only.',
  sourcePaths: ['scripts/verify-openapi.mjs'],
  tests: [{ path: 'scripts/verify-openapi.test.mjs',
    name: 'validates the published contract against mounted Express routers', level: 'L0',
    semantics: 'Checks the published contract with the real static Express router extractor and rejects missing/stale registrations.' }],
}], gnssTestMap, emulatorTestMap, browserTestMap);
