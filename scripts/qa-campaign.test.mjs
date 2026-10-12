import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignSeeds } from './qa/campaign.mjs';
import { validateCampaign } from './qa/campaign-report.mjs';

test('recorded campaign seeds retain regressions and rotate deterministically with validated provenance', () => {
  const sha = '12345678' + 'a'.repeat(32);
  const seeds = campaignSeeds(sha, '2026-10-12');
  assert.deepEqual(seeds.slice(0, 2), [42, 0]);
  assert.deepEqual(campaignSeeds(sha, '2026-10-12'), seeds);
  assert.notEqual(campaignSeeds(sha, '2026-10-13')[2], seeds[2]);
  assert(seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff));
  for (const [commit, day] of [['testing', '2026-10-12'], [sha, '2026-02-31'], [sha, '../day']])
    assert.throws(() => campaignSeeds(commit, day));
});

test('nightly evidence rejects omitted seeds, another workflow and invented per-seed observations', () => {
  const sha = 'a'.repeat(40), day = '2026-10-12';
  const mapping = { caseId: 'GNSS01', scope: 'input', tests: [{ path: 'input.test.ts', name: 'accepts', level: 'L1' }] };
  const catalog = { sourceCommit: sha, dirty: false, cases: [mapping] };
  const family = { name: 'gnss', level: 'L1', verdict: 'GREEN_FOR_UNIT_SCOPE', mappings: [mapping] };
  const seeds = campaignSeeds(sha, day);
  const campaign = { sourceCommit: sha, dirty: false, suite: 'gnss', day, seeds, accepted: true,
    workflowRunId: '123', physicalMotionExecuted: false, realProvidersExecuted: false,
    observations: seeds.map(seed => ({ seed, accepted: true, exitCode: 0, report: {
      sourceCommit: sha, dirty: false, workflowRunId: '123', seed: String(seed), level: 'L1',
      physicalMotionExecuted: false, realProvidersExecuted: false, verdict: 'GREEN_FOR_UNIT_SCOPE', runnerExitCode: 0,
      startedAt: '2026-10-12T00:00:00Z', finishedAt: '2026-10-12T00:00:01Z',
      counts: { discovered: 1, passed: 1, failed: 0, blocked: 0 }, assertions: [{ path: 'input.test.ts', name: 'accepts', status: 'PASS' }],
      cases: [{ caseId: 'GNSS01', scope: 'input', level: 'L1', status: 'PARTIAL' }],
    } })) };
  assert.deepEqual(validateCampaign(catalog, campaign, family, '123'), []);
  assert(validateCampaign(catalog, campaign, family, '456').length);
  for (const mutate of [item => item.observations.pop(), item => { item.observations[1].seed = 42; },
    item => { item.observations[2].report.assertions[0].name = 'invented'; }]) {
    const invalid = structuredClone(campaign); mutate(invalid);
    assert(validateCampaign(catalog, invalid, family, '123').length);
  }
});
