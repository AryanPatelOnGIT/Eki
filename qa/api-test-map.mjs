const path = 'scripts/qa/api-authorization.integration.test.mjs';
const missing = 'missing credentials deny every protected HTTP operation without application or provider effects';
const malformed = 'malformed bearer credentials deny every protected HTTP operation without application or provider effects';
const passenger = 'a real emulator passenger token cannot access any admin-only HTTP operation';
const publicReads = 'public health responses retain minimal no-store JSON and bounded CORS preflight semantics';
export const apiTestMap = [
  ['H02', [missing, malformed], 'All published protected methods reject missing and malformed bearer credentials with 401; selected application collections, Auth claims and synthetic provider calls remain unchanged. Expiry/revocation and wrong valid Device credential are separate.'],
  ['H03', [passenger], 'A real demo Auth passenger token receives 403 from every published admin-only operation; object ownership and assigned/unassigned operator matrices remain separate.'],
  ['H11', [publicReads], 'Actual configured and disallowed-origin OPTIONS responses enforce exact origin policy without credential reflection. Wider request/header partitions remain separate.'],
  ['H12', [publicReads], 'Actual public live/readiness probes expose minimal JSON with no-store. Sensitive authenticated reads and PWA caching remain separate.'],
  ['H13', [missing, malformed, passenger], 'Denied response objects exclude stack, token and boardingCode fields. Full log/OTLP redaction and nested private-error partitions remain separate.'],
  ['H18', [publicReads], 'Actual HTTP OPTIONS returns empty 204 with bounded configured CORS behavior. HEAD, proxy and tunnel partitions remain separate.'],
].map(([caseId, names, scope]) => ({ caseId, scope, sourcePaths: ['backend/src/server.ts', 'backend/openapi.json',
  'backend/src/middleware/requireAdmin.ts', 'backend/src/middleware/requireAuth.ts'],
  tests: names.map(name => ({ path, name, level: 'L2', semantics: scope })) }));
