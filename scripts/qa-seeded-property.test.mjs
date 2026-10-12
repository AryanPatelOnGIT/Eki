import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSeededProperty } from './qa/seeded-property.mjs';

test('seeded properties reproduce the same inputs including seed zero', () => {
  const run = seed => { const values = []; checkSeededProperty({ seed, runs: 20,
    generate: random => Math.floor(random() * 1000), check: value => values.push(value) }); return values; };
  assert.deepEqual(run(0), run(0)); assert.notDeepEqual(run(0), run(1));
});
test('isolated faulty oracle is caught, reduced and replayed at the same path', () => {
  const spec = { seed: 31, runs: 100, generate: random => Math.floor(random() * 100) + 1,
    check: value => assert.ok(value < 10), shrink: value => [Math.floor(value / 2), value - 1].filter(n => n > 0) };
  let failure; try { checkSeededProperty(spec); } catch (error) { failure = error; }
  assert.equal(failure.reproduction.minimized, 10);
  assert.ok(failure.reproduction.shrinks > 0);
  assert.throws(() => checkSeededProperty({ ...spec, replayPath: failure.reproduction.replayPath }),
    error => JSON.stringify(error.reproduction) === JSON.stringify(failure.reproduction));
  // The intentionally faulty predicate is confined to this test and removed
  // from the passing control; no application source is mutated.
  assert.equal(checkSeededProperty({ ...spec, check: value => assert.ok(value <= 100) }).executed, 100);
});
test('properties bound invalid seeds, run counts and replay paths', () => {
  const spec = { generate: () => 1, check: () => {} };
  for (const options of [{ seed: -1 }, { seed: 2 ** 32 }, { runs: 0 }, { runs: 10001 }, { replayPath: 200 }]) {
    assert.throws(() => checkSeededProperty({ ...spec, ...options }), /out of bounds/);
  }
});
