const path = 'backend/src/qaTelemetryChain.integration.test.ts';
const suite = 'authenticated telemetry to durable lifecycle and public emulator projection';
const telemetryMappings = [
  ['GNSS01', 'publishes valid device presence without fabricating passenger service', 'Actual Device authentication, parser, scrypt registry, RTDB transaction and public projection; software only.'],
  ['GNSS03', 'rejects invalid credentials authority fields and original oversized bytes without a live write', 'Forged bus field and invalid credential rejected with absent RTDB/session mutation.'],
  ['GNSS10', 'rejects invalid credentials authority fields and original oversized bytes without a live write', '513 original HTTP bytes rejected before JSON normalization; other partitions remain separate.'],
  ['GNSS11', 'preserves durable ride identity through HTTP duplicate and delayed older fixes', 'Exact retry acknowledges duplicate; persistent/session/public state retains newest fix.'],
  ['GNSS12', 'preserves durable ride identity through HTTP duplicate and delayed older fixes', 'Delayed higher-sequence older capture cannot overwrite newer accepted state.'],
  ['GNSS32', 'publishes valid device presence without fabricating passenger service', 'Observed no-store ingress/responded headers, distinct from browser rendering.'],
].map(([caseId, title, scope]) => ({ caseId, scope,
  sourcePaths: ['backend/src/routes/devices.ts', 'backend/src/services/deviceTelemetryService.ts', 'backend/src/services/liveBusProjection.ts'],
  tests: [{ path, name: `${suite} > ${title}`, level: 'L2', semantics: scope }] }));

export const emulatorTestMap = [...telemetryMappings, {
  caseId: 'SEC02',
  scope: 'Actual Firestore and RTDB rules reject stale/missing authorization versions, reassigned/unassigned/deleted drivers and demoted admins while preserving current operator/admin and passenger membership/public reads. Tokens are synthetic; live Auth/provider propagation is separate.',
  sourcePaths: ['firestore.rules', 'database.rules.json'],
  tests: [
    'rejects stale driver tokens after reassignment, unassignment, deletion and repeated assignment',
    'requires current admin authorization in both databases and never revives an old version',
  ].map(title => ({ path: 'backend/src/rulesIntegration.test.ts', name: `Firebase security rules integration > ${title}`, level: 'L2',
    semantics: 'Synthetic old/current tokens exercise actual committed rules against isolated loopback Firestore/RTDB, including forbidden metadata reads and writes.' })),
}, {
  caseId: 'AUTH13',
  scope: 'Production fleet routes publish real emulator authorization records; a saved token loses access after reassignment/deletion/unassignment and cannot regain it when the same identity and assignment are restored. Auth SDK is mocked; live revocation and browser convergence are separate.',
  sourcePaths: ['backend/src/services/userAuthorization.ts', 'backend/src/routes/fleet.ts'],
  tests: [{ path: 'backend/src/reconciliation.integration.test.ts',
    name: 'bounded reconciliation against actual Firebase emulators > denies a saved token through actual rules after production fleet reassignment and deletion', level: 'L2',
    semantics: 'Real fleet HTTP routes and Admin Firestore/RTDB SDK writes followed by saved-token rules reads; also verifies that null fields do not trigger recurring unassigned-driver revocation.' }],
}];
