// Bounded properties for synthetic fixtures. No clocks, sockets or SDK imports.
export function checkSeededProperty({ seed = 42, runs = 200, replayPath, generate, check, shrink = () => [] }) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff ||
      !Number.isSafeInteger(runs) || runs < 1 || runs > 10_000 ||
      (replayPath !== undefined && (!Number.isSafeInteger(replayPath) || replayPath < 0 || replayPath >= runs))) {
    throw new Error('Property seed/runs/replayPath out of bounds');
  }
  let state = seed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  let executed = 0;
  for (let path = 0; path < runs; path++) {
    const value = generate(random, path);
    if (replayPath !== undefined && path !== replayPath) continue;
    executed++;
    try { check(value); }
    catch (cause) {
      let minimal = value; let shrinks = 0;
      const visited = new Set([JSON.stringify(value)]);
      for (let attempt = 0; attempt < 50; attempt++) {
        let reduced = false;
        for (const candidate of shrink(minimal)) {
          const signature = JSON.stringify(candidate);
          if (visited.has(signature)) continue;
          visited.add(signature);
          try { check(candidate); }
          catch { minimal = candidate; shrinks++; reduced = true; break; }
        }
        if (!reduced) break;
      }
      const reproduction = { seed, replayPath: path, runs, counterexample: value, minimized: minimal, shrinks };
      const failure = new Error(`Synthetic property failed: ${JSON.stringify(reproduction)}`, { cause });
      failure.reproduction = reproduction;
      throw failure;
    }
  }
  return { seed, runs, replayPath: replayPath ?? null, executed, status: 'PASS' };
}
