// Playwright's testDir-relative file path is normalized before exact matching.
export function classifyBrowserCase(mapping, tests) {
  const matched = tests.filter(test => mapping.tests.some(link =>
    link.name === test.name && link.path === `e2e/${test.path.replaceAll('\\', '/')}`));
  const projects = matched.map(test => test.project).sort();
  const passed = matched.length === 2 && projects.join(',') === 'desktop,mobile'
    && matched.every(test => test.status === 'expected' && test.results.length === 1
      && test.results[0].status === 'passed' && test.results[0].retry === 0);
  return passed ? 'PARTIAL' : matched.some(test => test.status === 'unexpected') ? 'FAIL' : 'BLOCKED';
}
