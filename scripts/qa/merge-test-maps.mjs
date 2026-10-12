export function mergeTestMaps(...families) {
  const combined = new Map();
  for (const family of families) {
    const seen = new Set();
    for (const item of family) {
      if (seen.has(item.caseId)) throw new Error(`Duplicate case within mapping family: ${item.caseId}`);
      seen.add(item.caseId);
      const previous = combined.get(item.caseId);
      if (!previous) { combined.set(item.caseId, { ...item, sourcePaths: [...item.sourcePaths], tests: item.tests.map(test => ({ ...test })) }); continue; }
      previous.scope = [...new Set([previous.scope, item.scope])].join(' | ');
      previous.sourcePaths = [...new Set([...previous.sourcePaths, ...item.sourcePaths])];
      for (const test of item.tests) {
        const existing = previous.tests.find(link => link.path === test.path && link.name === test.name && link.level === test.level);
        if (existing && existing.semantics !== test.semantics) throw new Error(`Conflicting test semantics: ${item.caseId}`);
        if (!existing) previous.tests.push({ ...test });
      }
    }
  }
  return [...combined.values()];
}
