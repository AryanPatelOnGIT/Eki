import { gnssTestMap } from './gnss-test-map.mjs';
import { emulatorTestMap } from './emulator-test-map.mjs';
import { browserTestMap } from './browser-test-map.mjs';
import { mutationTestMap } from './mutation-test-map.mjs';
import { apiTestMap } from './api-test-map.mjs';
import { nativeTestMap } from './native-test-map.mjs';
import { reviewedUnitTestMap } from './reviewed-unit-test-map.mjs';
import { mergeTestMaps } from '../scripts/qa/merge-test-maps.mjs';
// Exact limited assertion links; no complete feature acceptance is claimed.
export const testMap = mergeTestMaps([{
  caseId: 'SEC04',
  scope: 'Mounted Express checks App Check routing, identity and role boundaries for protected reads and device firmware reservations. Firebase verification, credential storage and physical OTA acceptance remain separate.',
  sourcePaths: ['backend/src/middleware/browserAppCheck.ts'],
  tests: [{ path: 'backend/src/middleware/browserAppCheck.routing.test.ts',
    name: 'App Check through mounted browser and device routers > blocks missing and invalid attestation before GET or HEAD work for accepted route spellings',
    level: 'L1', semantics: 'Mounted browser admission and App Check reject lowercase and mixed-case GET/HEAD requests for Places, planning, legacy routes and v2 geometry before fixture handler work.' },
  { path: 'backend/src/middleware/browserAppCheck.routing.test.ts',
    name: 'App Check through mounted browser and device routers > permits verified requests while preserving identity and admin checks',
    level: 'L1', semantics: 'Mocked valid App Check and identity allow the intended handlers while a passenger or invalid identity remains denied; route identifier case is preserved.' },
  { path: 'backend/src/middleware/browserAppCheck.routing.test.ts',
    name: 'App Check through mounted browser and device routers > retains off mode and exact device credential exemptions',
    level: 'L1', semantics: 'Off mode retains authenticated reads; exact firmware installation POST uses device credential authentication, while wrong credentials and extra path segments fail.' },
  { path: 'backend/src/routes/devicesFirmware.test.ts',
    name: 'device OTA through browser admission, App Check and the production router > acquires and releases in enforce mode without browser identity or App Check',
    level: 'L1', semantics: 'The real admission, App Check and device router chain reaches the reservation transaction with only a mocked valid Device credential and no browser token.' },
  { path: 'backend/src/routes/devicesFirmware.test.ts',
    name: 'device OTA through browser admission, App Check and the production router > releases a reservation acquired before enforcement was enabled',
    level: 'L1', semantics: 'A reservation acquired through the off-mode chain is released through the enforce-mode chain using the same mocked device credential and transaction state.' },
  { path: 'backend/src/routes/devicesFirmware.test.ts',
    name: 'device OTA through browser admission, App Check and the production router > keeps missing, malformed, invalid, rotated, disabled and unassigned credentials denied',
    level: 'L1', semantics: 'The mounted router retains 401/403 decisions across credential fixtures without App Check; real credential hashing and invalidation are separate service tests.' },
  { path: 'backend/src/routes/devicesFirmware.test.ts',
    name: 'device OTA through browser admission, App Check and the production router > preserves ride, conflicting lock, owner and retry safeguards',
    level: 'L1', semantics: 'Mocked transaction state retains 409 for active rides and conflicts, rejects concurrent duplicate acquisition, binds credentials to device IDs, and preserves foreign firmware and same-device ride locks.' },
  { path: 'backend/src/routes/devicesFirmware.test.ts',
    name: 'device OTA through browser admission, App Check and the production router > keeps an existing reservation intact when release credentials are denied',
    level: 'L1', semantics: 'Missing, malformed, invalid, rotated, disabled and unassigned mocked release credentials cannot delete an existing reservation; the current assigned credential can release it.' },
  { path: 'backend/src/routes/devicesFirmware.test.ts',
    name: 'device OTA through browser admission, App Check and the production router > applies one exact device path policy to all ingress endpoints',
    level: 'L1', semantics: 'Telemetry, diagnostics, firmware lookup and installation use the shared exact path policy; extra segments and wrong methods with a Device header fail browser admission before device credential verification.' },
  { path: 'backend/src/routes/devicesFirmware.test.ts',
    name: 'device OTA through browser admission, App Check and the production router > requires App Check for authenticated browser mutations outside exact device exemptions',
    level: 'L1', semantics: 'With mocked valid browser identity, wrong methods, extra segments and a trailing slash require App Check. Missing and invalid attestation return the middleware-specific 403 codes without device credential verification or reservation writes.' }],
}, {
  caseId: 'H17',
  scope: 'Mounted Express methods/paths agree with the published OpenAPI contract; L0 only.',
  sourcePaths: ['scripts/verify-openapi.mjs'],
  tests: [{ path: 'scripts/verify-openapi.test.mjs',
    name: 'validates the published contract against mounted Express routers', level: 'L0',
    semantics: 'Checks the published contract with the real static Express router extractor and rejects missing/stale registrations.' }],
}, {
  caseId: 'BOARD07',
  scope: 'Valid trusted fix sub-oracle: reject malformed bus coordinates before first-join proximity/manifest writes and preserve numeric zero. Does not close freshness boundaries, receipt/sample mismatch or full-stack acceptance.',
  sourcePaths: ['backend/src/services/boardingPolicy.ts'],
  tests: [{
    path: 'backend/src/services/boardingPolicy.test.ts',
    name: 'boarding policy > live bus coordinates > %s > rejects malformed coordinate %p',
    level: 'L1',
    semantics: 'Calls the actual projection validator for both axes with non-numeric and non-finite inputs; each must return null.',
  }, {
    path: 'backend/src/services/boardingPolicy.test.ts',
    name: 'boarding policy > live bus coordinates > accepts valid numeric coordinates %p',
    level: 'L1',
    semantics: 'Verifies zero on either axis and geographic limits remain valid numeric coordinates.',
  }, {
    path: 'backend/src/routes/sessions.test.ts',
    name: 'session passenger join route v2=%s > live bus %s > rejects malformed coordinate %p before recording membership',
    level: 'L1',
    semantics: 'Real Express handlers and contract-checked HTTP responses with mocked auth/storage: both APIs reject malformed bus coordinates with 409 and no manifest update even when the passenger matches the formerly coerced location. Not emulator-backed.',
  }, {
    path: 'backend/src/routes/sessions.test.ts',
    name: 'session passenger join route v2=%s > allows first boarding at valid numeric zero coordinates',
    level: 'L1',
    semantics: 'Both HTTP handlers acknowledge boarding and record membership for numeric zero bus/passenger coordinates using mocked storage.',
  }],
}], gnssTestMap, emulatorTestMap, browserTestMap, mutationTestMap, apiTestMap, nativeTestMap, reviewedUnitTestMap);
