// Focused observed sub-oracles; these do not close physical/provider acceptance.
const chain = 'authenticated telemetry to durable lifecycle and public emulator projection';
export const automaticServiceTestMap = [{
  caseId: 'TRIP01',
  scope: 'Qualified authenticated device ingress automatically admits one protected service; incomplete setup and RTDB loss repair the same identity. Real loopback Firebase emulators, synthetic receiver; physical motion remains separate.',
  sourcePaths: ['backend/src/services/rideSessionStart.ts', 'backend/src/services/automaticServiceAdmission.ts', 'backend/src/services/deviceTelemetryService.ts'],
  tests: [
    ['automatically admits one stationary service from authenticated telemetry without a start request', 'A stationary endpoint fix creates one assigned protected session and repeated ingress does not duplicate it.'],
    ['keeps a stationary midpoint session pending and recovers the same session after RTDB loss', 'A midpoint fix creates a pending direction with no invented passage and later restores the original session after live-node loss.'],
  ].map(([name, semantics]) => ({path:'backend/src/qaTelemetryChain.integration.test.ts', name:`${chain} > ${name}`, level:'L2', semantics})).concat([
    'handles synchronous capacity rejection without escaping telemetry background scheduling',
    'contains a synchronous capacity rejection while rescheduling the retained latest fix',
  ].map(name => ({path:'backend/src/services/automaticServiceAdmission.test.ts', name, level:'L1', semantics:'The admission scheduler contains synchronous executor-capacity rejection, reports it and applies retry backoff, including the retained-latest reschedule boundary; Firebase is mocked.'}))),
}, {
  caseId: 'AUTH13',
  scope: 'Diagnostic-only unit sub-oracle: fleet mutex contention directs operators to guarded exact-owner recovery after proving the previous executor stopped. No mutex release or live Auth mutation is performed.',
  sourcePaths: ['backend/src/services/fleetMutationLock.ts'],
  tests: [{path:'backend/src/services/fleetMutationLock.test.ts', name:'points operators to guarded recovery without suggesting automatic lock expiry', level:'L1', semantics:'The production error text names the protected lock endpoint and stopped-executor prerequisite; it does not expire or delete the lock.'}],
}, {
  caseId: 'GNSS01',
  scope: 'Freshness default unit sub-oracle: local and deployed frontend use the same five-minute expiry. The neighboring browser receipt-expiry check and actual hardware acceptance are separate.',
  sourcePaths: ['frontend/src/lib/liveBusFreshness.ts'],
  tests: [{path:'frontend/src/lib/liveBusFreshness.test.ts', name:'live bus freshness > uses the same default five-minute expiry in local and deployed builds', level:'L1', semantics:'The actual shared default expiry constant is 300000 milliseconds without an environment override.'}],
}];
