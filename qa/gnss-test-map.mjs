const payloadPath = 'backend/src/services/qaGnssProperties.test.ts';
const sequencesPath = 'backend/src/services/qaTelemetrySequences.test.ts';
const payloadSuite = 'deterministic GNSS software properties';
const sequenceSuite = 'seeded telemetry state sequences';
const boundaries = 'enforces numeric coordinate speed heading HDOP and sequence boundaries';
const clocks = 'enforces inclusive sample clock and send clock bounds with future clamping';
const schemas = 'enforces closed rollout schemas and motion enum without trusting assignment fields';
const recovery = 'requires three coherent good fixes in the bounded outage window';
const rejectedRecovery = 'rejects poor unknown uncertain burst and excessive outage candidates';
const stateOrdering = 'matches a separate timestamp sequence model across reordered duplicated and rebooted samples';
const stateRecovery = 'distinguishes raw outliers held anchors and recovery without completing a ride';

// Exact assertion links; each scope is narrower than the complete acceptance
// oracle. A passing L1 assertion must never close an L2/L3/L5 case.
export const gnssTestMap = [
  ['GNSS02', schemas, 'Closed six/eight/nine-field parsing and conservative missing HDOP normalization.'],
  ['GNSS03', schemas, 'Reject own authority/prototype-like fields before assignment selection.'],
  ['GNSS04', boundaries, 'Finite numeric latitude/longitude inclusive endpoints and just-outside rejection.'],
  ['GNSS05', boundaries, 'Speed 0..200 inclusive and heading 0..360 exclusive plus malformed numeric types.'],
  ['GNSS06', boundaries, 'Transport HDOP 0..99 inclusive; explicit null/nonfinite values invalid. Quality usability is also tested by outage rejection.'],
  ['GNSS07', boundaries, 'Sequence 1..uint32 maximum inclusive with fractional/string/overflow rejection; motion enum checked separately.'],
  ['GNSS08', clocks, 'Inclusive -60s/+10s capture bounds and accepted future clamp.'],
  ['GNSS09', clocks, 'Send time must follow sample and obey inclusive +10s bound.'],
  ['GNSS10', 'enforces the 512 byte boundary before decoding malformed or multibyte JSON', 'Direct binary parser 511/512/513-byte and UTF-8 limits; HTTP middleware requires L2 verification.'],
  ['GNSS16', 'holds a teleport and recovers normal motion in forward reverse and jitter traces', 'Generated forward/reverse fixes advance the pure plausibility anchor; browser outcomes remain.'],
  ['GNSS17', 'bounds equatorial travel with independently constructed metre offsets', 'Independent metre offsets just inside/outside adaptive stationary/moving envelopes.'],
  ['GNSS18', 'holds a teleport and recovers normal motion in forward reverse and jitter traces', 'One teleport holds anchor and next normal fix recovers in a 60-fix synthetic trace.'],
  ['GNSS19', rejectedRecovery, 'Direct recovery window boundary plus combined short-outage state trace.'],
  ['GNSS20', recovery, '400 seeded qualifying outages hold two candidates and accept the third coherent fix.'],
  ['GNSS21', rejectedRecovery, 'Isolated bad-quality/out-of-envelope candidate cannot establish accepted recovery.'],
  ['GNSS22', rejectedRecovery, '499/500/5000/5001ms candidate intervals reset or advance bounded evidence.'],
  ['GNSS23', rejectedRecovery, 'Poor/unknown HDOP and uncertain motion excluded from recovery; state trace rejects repeated/order violations.'],
  ['GNSS24', rejectedRecovery, 'Candidate beyond full-outage travel is rejected independently of short-gap policy.'],
  ['GNSS25', rejectedRecovery, '60000/60001/300000/300001ms recovery boundaries kept distinct.'],
].map(([caseId, title, scope]) => ({ caseId, scope,
  sourcePaths: ['backend/src/services/telemetryPayload.ts', 'backend/src/lib/telemetryMotion.ts'],
  tests: [{ path: payloadPath, name: `${payloadSuite} > ${title}`, level: 'L1', semantics: scope }] }));

for (const [caseId, title, scope] of [
  ['GNSS11', stateOrdering, 'Exact same capture/sequence identity is rejected by the pure state updater; HTTP duplicate acknowledgement still requires integration.'],
  ['GNSS12', stateOrdering, 'Independent lexicographic capture-time/sequence model across 400 shuffled reboot/duplicate walks.'],
  ['GNSS15', 'does not resurrect a retired device assignment with an old revision', 'Old assignment revision cannot revive a retired record; credential cache and multi-replica propagation remain separate.'],
  ['GNSS27', stateRecovery, 'Raw sequence advances while held visible anchor remains; synthetic outage recovery preserves ride state.'],
  ['GNSS35', stateOrdering, 'Sequence resets ordered by capture timestamp; repeated identity cannot advance state.'],
]) gnssTestMap.push({ caseId, scope, sourcePaths: ['backend/src/services/deviceTelemetryService.ts'],
  tests: [{ path: sequencesPath, name: `${sequenceSuite} > ${title}`, level: 'L1', semantics: scope }] });

for (const [caseId, path, suite, title, semantics] of [
  ['GNSS06', payloadPath, payloadSuite, rejectedRecovery, 'HDOP above 4 or unknown cannot supply reacquisition evidence.'],
  ['GNSS07', payloadPath, payloadSuite, schemas, 'Case-sensitive moving/stopped/uncertain enum.'],
  ['GNSS19', sequencesPath, sequenceSuite, stateRecovery, '45-second outage accepts plausible travel without holding the ride.'],
  ['GNSS20', sequencesPath, sequenceSuite, stateRecovery, '120-second trace holds exactly two recovery fixes, accepts third and retains lifecycle.'],
  ['GNSS23', sequencesPath, sequenceSuite, stateRecovery, 'Repeated/out-of-order sequence identity cannot advance accepted state.'],
]) gnssTestMap.find(mapping => mapping.caseId === caseId).tests.push({ path,
  name: `${suite} > ${title}`, level: 'L1', semantics });
