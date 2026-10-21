// Exact missing L1 links exposed by comparing the integrated branch to main.
// Each scope names the mocked/pure boundary; none certifies a complete live case.
const link = (path, suite, name) => ({ path, name: suite ? `${suite} > ${name}` : name, level: 'L1' });
const rows = [
  ['TRIP26', 'Direct worker-fence tests reject old/expired authority and SDK retries using controlled transactions/clocks. Actual replica crash/failover remains separate.',
    ['backend/src/lib/workerFence.ts'], [
      link('backend/src/lib/workerFence.test.ts', 'worker destination fencing', 'does not let shutdown or a newer leader lend authority to an old cleanup'),
      link('backend/src/lib/workerFence.test.ts', 'worker destination fencing', 'prevents an old RTDB callback from dispatching another write on SDK retry')]],
  ['DATA11', 'Actual CLI option wiring defaults to dry-run and rejects invalid flags; pure retirement protects unretired legacy roots. Firebase/store adapters are mocked; real consumer approval and purge remain separate.',
    ['backend/src/rtdbRetentionCli.ts', 'backend/src/services/rtdbRetention.ts'], [
      link('backend/src/rtdbRetentionCli.test.ts', 'RTDB retention CLI safety', 'defaults to dry-run and requires explicit legacy retirement'),
      link('backend/src/rtdbRetentionCli.test.ts', 'RTDB retention CLI safety', 'redacts sweep failures and always releases Firebase apps'),
      link('backend/src/services/rtdbRetention.test.ts', '180-day RTDB retirement', 'protects legacy roots until consumers are explicitly retired')]],
  ['DATA12', 'Actual Firebase retention adapter pages 25 entries at a time and avoids dry-run inventory writes; pure sweep compares dry-run eligibility. SDK/destinations are mocked, not deployed retention acceptance.',
    ['backend/src/services/firebaseRtdbRetention.ts', 'backend/src/services/rtdbRetention.ts'], [
      link('backend/src/services/firebaseRtdbRetention.test.ts', 'Firebase RTDB retention adapter', 'pages a bounded inventory without skipping entries after the cursor'),
      link('backend/src/services/firebaseRtdbRetention.test.ts', 'Firebase RTDB retention adapter', 'dry-run never creates inventory and changed content resets quarantine'),
      link('backend/src/services/rtdbRetention.test.ts', '180-day RTDB retirement', 'dry-run scans without writing data or inventory')]],
  ['DATA09', 'Actual adapter rechecks the latest fingerprint and preserves a replacement with mocked RTDB transactions; pure sweep also rejects the inventory/delete race. No live cross-replica proof.',
    ['backend/src/services/firebaseRtdbRetention.ts', 'backend/src/services/rtdbRetention.ts'], [
      link('backend/src/services/firebaseRtdbRetention.test.ts', 'Firebase RTDB retention adapter', 'rechecks the current fingerprint before deleting a replacement'),
      link('backend/src/services/rtdbRetention.test.ts', '180-day RTDB retirement', 'guards against replacement between inventory and deletion')]],
  ['DATA07', 'Actual retention worker retries independent descendant jobs after parent removal using mocked persistence; physical process/replica restart remains separate.',
    ['backend/src/services/retentionSweeper.ts'], [
      link('backend/src/services/retentionRecovery.test.ts', '', 'retries orphaned descendants on the next sweep after a partial recursive deletion'),
      link('backend/src/services/retentionRecovery.test.ts', '', 'resumes a durable job even when its ride parent was already removed before restart')]],
  ['DATA13', 'Actual manual-history deletion helper resumes independent jobs after parent removal and refuses ongoing rides with mocked persistence. Concurrent deployed sweep/delete remains separate.',
    ['backend/src/services/rideHistoryDeletion.ts'], [
      link('backend/src/services/rideHistoryDeletionRecovery.test.ts', '', 'finishes manual child/projection deletion on retry after the parent was removed'),
      link('backend/src/services/rideHistoryDeletionRecovery.test.ts', '', 'refuses manual cleanup for an ongoing ride before creating a job')]],
  ['TRIP06', 'Pure durable stop-history construction preserves terminal/prior timestamps and labels checkpoint repair as recovery evidence; does not prove GNSS arrival or persistence.',
    ['backend/src/services/rideProgressHistory.ts'], [
      link('backend/src/services/rideProgressHistory.test.ts', 'durable stop history', 'includes the terminal stop at completion and preserves prior timestamps'),
      link('backend/src/services/rideProgressHistory.test.ts', 'durable stop history', 'repairs a recovered checkpoint and labels its timing as recovery evidence')]],
  ['FLEET12', 'Actual targeted cache coalesces reads and rejects stale mirror completion; actual fleet mutex remains held through delayed CLI publications. Database/Auth are mocked and deployed reconciliation remains separate.',
    ['backend/src/services/fleetReconciliationCache.ts', 'backend/src/services/fleetMutationLock.ts'], [
      link('backend/src/services/fleetReconciliationCache.test.ts', 'fleet reconciliation cache', 'coalesces targeted reads and does not replace a newer mirror with a late load'),
      link('backend/src/services/fleetReconciliationCache.test.ts', 'fleet reconciliation cache', 'loads a shared bus assignment once for concurrent drivers'),
      link('backend/src/routes/fleetOperations.test.ts', 'fleet operation resources', 'retains the CLI lock until sibling publications settle after a profile read failure')]],
  ['OBS08', 'Direct process diagnostic counters classify bounded rejection/schema/HDOP keys and return detached snapshots without raw inputs. Does not test alert delivery or thresholds.',
    ['backend/src/services/telemetryDiagnosticCounters.ts'], [
      link('backend/src/services/telemetryDiagnosticCounters.test.ts', 'redacted telemetry diagnostic counters', 'distinguishes timestamp rejection, dependency faults and legacy quality limitations without retaining inputs')]],
  ['OBS04', 'Actual telemetry SDK factory installs bounded queue/interval settings and a URL-redacting HTTP hook; exporter/SDK constructors are mocked. Actual collector receipt/outage remains separate.',
    ['backend/src/telemetrySdk.ts'], [
      link('backend/src/telemetrySdk.test.ts', 'telemetry SDK wiring', 'bounds exporter queues and intervals before starting the SDK once'),
      link('backend/src/telemetrySdk.test.ts', 'telemetry SDK wiring', 'excludes health polling and redacts request URLs at the installed HTTP hook')]],
  ['OBS02', 'Mounted RAF trace hook records settled arrival only at the current target and reschedules a cancelled frame. RAF/trace sink are mocked; independent physical paint is not measured.',
    ['frontend/src/hooks/useTelemetryRenderTrace.ts'], [
      link('frontend/src/hooks/useTelemetryRenderTrace.test.tsx', '', "records arrival only after the displayed position reaches this sample's target"),
      link('frontend/src/hooks/useTelemetryRenderTrace.test.tsx', '', 'reschedules a canceled frame when ancillary fields replace the same sample object')]],
  ['AUTH04', 'Actual Auth module chooses consistent persistence fallback order and shares one provider/initialization across imports; Firebase SDK is mocked. Real redirect/partitioned-browser behavior remains separate.',
    ['frontend/src/lib/firebaseAuth.ts'], [
      link('frontend/src/lib/firebaseAuth.test.ts', 'Firebase Auth initialization', 'keeps restoration and sign-in on the same ordered persistence fallbacks'),
      link('frontend/src/lib/firebaseAuth.test.ts', 'Firebase Auth initialization', 'shares one initialization and provider across repeat imports')]],
  ['AUTH05', 'Pure Auth domain resolver selects the exact project Hosting origin and rejects lookalike/other-project hosts; real OAuth/helper browser partitioning remains separate.',
    ['frontend/src/lib/firebaseAuthDomain.ts'], [
      link('frontend/src/lib/firebaseAuthDomain.test.ts', 'resolveFirebaseAuthDomain', 'uses the live web.app hostname so Firebase Auth stays same-origin'),
      link('frontend/src/lib/firebaseAuthDomain.test.ts', 'resolveFirebaseAuthDomain', "never adopts a lookalike or another project's Hosting hostname")]],
  ['PAX25', 'Actual joined-status transport waits for verified auth, validates own completed identity and fences principal changes; HTTP/SDK are mocked. Genuine browser reload/membership authority remains separate.',
    ['frontend/src/lib/joinedRideStatus.ts'], [
      link('frontend/src/lib/joinedRideStatus.acceptance.test.ts', 'joined-session recovery transport', 'makes one authenticated request and returns a validated completed identity'),
      link('frontend/src/lib/joinedRideStatus.acceptance.test.ts', 'joined-session recovery transport', 'rejects a completed response if authentication changed while HTTP was in flight')]],
  ['PAX15', 'Pure snapshot expiry uses receipt bounds and caps orphaned active rides; real scoped/singleton store preserves expiry, terminal snapshots and auth-generation isolation with mocked Firebase. Physical recency remains separate.',
    ['frontend/src/lib/liveBusSnapshot.ts', 'frontend/src/lib/createLiveBusStore.ts', 'frontend/src/lib/liveBusStore.ts'], [
      link('frontend/src/lib/liveBusStore.test.ts', 'live bus snapshot expiry', 'expires an orphaned active ride at its bounded retention deadline'),
      link('frontend/src/lib/liveBusStore.test.ts', 'live bus snapshot expiry', 'uses accepted server receipt for pruning and its exact expiry deadline'),
      link('frontend/src/lib/createLiveBusStore.acceptance.test.ts', 'scoped live store acceptance', 'delivers an initial terminal snapshot before local expiry so joined rides can finish'),
      link('frontend/src/lib/liveBusStoreRecovery.test.ts', 'live bus listener recovery', 'does not replay another auth generation\'s route cache while verification is pending')]],
  ['PAX16', 'Pure bounded retry jitter spreads synthetic clients; actual store retry invalidates stale data and fences old auth/listeners with mocked Firebase. Real reconnect storms and mobile suspension remain separate.',
    ['frontend/src/lib/liveBusRetry.ts', 'frontend/src/lib/liveBusStore.ts', 'frontend/src/lib/createLiveBusStore.ts'], [
      link('frontend/src/lib/liveBusRetry.test.ts', 'liveBusRetryDelayMs', 'spreads independent clients without a zero-delay retry or exceeding the cap'),
      link('frontend/src/lib/liveBusStoreRecovery.test.ts', 'live bus listener recovery', 'invalidates stale data and attaches exactly one retry')]],
  ['GNSS36', 'Pure Passenger normalization isolates malformed coordinates/routes/timestamps/enums and requires complete services while keeping stable keys. Real cloud migration/browsers remain separate.',
    ['frontend/src/lib/passengerLiveBus.ts'], [
      link('frontend/src/lib/passengerLiveBus.test.ts', 'passenger live-bus normalization', 'rejects invalid routes, coordinates, timestamps, and enum values'),
      link('frontend/src/lib/passengerLiveBus.test.ts', 'passenger live-bus normalization', 'keeps only complete services and retains stable selection keys')]],
];
export const promotionTestMap = rows.map(([caseId, scope, sourcePaths, tests]) => ({ caseId, scope, sourcePaths,
  tests: tests.map(test => ({ ...test, semantics: scope })) }));
