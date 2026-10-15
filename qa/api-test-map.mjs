const path = 'scripts/qa/api-authorization.integration.test.mjs';
const missing = 'missing credentials deny every protected HTTP operation without application or provider effects';
const malformed = 'malformed bearer credentials deny every protected HTTP operation without application or provider effects';
const passenger = 'a real emulator passenger token cannot access any admin-only HTTP operation';
const publicReads = 'public health responses retain minimal no-store JSON and bounded CORS preflight semantics';
const caseHead = 'mixed-case GET and HEAD preserve real identity and admin checks without App Check';
const driver = 'a saved real driver token loses database access through HTTP unassignment replacement and deletion';
const admin = 'real Auth CLI demotion and restoration never revive a saved admin token in either database';
const ota = 'real device verifiers and Firestore transactions enforce OTA reservation ownership and recovery';
export const apiTestMap = [
  ['H02', [missing, malformed], 'All published protected methods reject missing and malformed bearer credentials with 401; selected application collections, Auth claims and synthetic provider calls remain unchanged. Expiry/revocation and wrong valid Device credential are separate.'],
  ['H03', [passenger, driver, admin], 'Real demo Auth passenger tokens receive 403 from every admin operation. Saved driver tokens lose session/message access through HTTP unassignment, UID replacement and deletion. CLI admin demotion/restoration denies saved tokens in both databases. Cloud staging remains separate.'],
  ['H11', [publicReads], 'Actual configured and disallowed-origin OPTIONS responses enforce exact origin policy without credential reflection. Wider request/header partitions remain separate.'],
  ['H12', [publicReads], 'Actual public live/readiness probes expose minimal JSON with no-store. Sensitive authenticated reads and PWA caching remain separate.'],
  ['H13', [missing, malformed, passenger], 'Denied response objects exclude stack, token and boardingCode fields. Full log/OTLP redaction and nested private-error partitions remain separate.'],
  ['H18', [publicReads, caseHead], 'Actual HTTP OPTIONS has bounded CORS behavior. Mixed-case GET/HEAD Places requests enforce real identity/admin checks before provider work, admit current admins without App Check and preserve empty HEAD bodies. Proxy/tunnel acceptance remains separate.'],
  ['SEC04', [caseHead, ota], 'App Check removal preserves real identity/admin enforcement and Device-only OTA reservation access. Real scrypt credentials and Firestore transactions protect ownership, conflicts, disable/re-enable recovery and exact method/path/device-ID case boundaries. Physical signed OTA remains separate.'],
].map(([caseId, names, scope]) => ({ caseId, scope, sourcePaths: ['backend/src/server.ts', 'backend/openapi.json',
  'backend/src/middleware/requireAdmin.ts', 'backend/src/middleware/requireAuth.ts'],
  tests: names.map(name => ({ path, name, level: 'L2', semantics: scope })) }));
