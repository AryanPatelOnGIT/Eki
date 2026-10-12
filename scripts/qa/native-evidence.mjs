import { relative } from 'node:path';
import { nativeTestMap } from '../../qa/native-test-map.mjs';

export function summarizeNative(raw, rootPath, declared, mappings = nativeTestMap) {
  if (!raw || !Array.isArray(raw.test_suites)) throw Error('Missing PlatformIO suite observations');
  if (raw.test_suites.some(suite => suite.env_name !== 'native' && suite.test_cases?.length)) throw Error('Unexpected non-native execution');
  const suites = raw.test_suites.filter(suite => suite.env_name === 'native');
  const expectedSuites = [...new Set(declared.map(item => item.path.split('/').at(-2)))].sort();
  if (JSON.stringify(suites.map(item => item.test_name).sort()) !== JSON.stringify(expectedSuites)) throw Error('Native suite census mismatch');
  const diagnostics = [];
  const assertions = suites.flatMap(suite => {
    if (!Array.isArray(suite.test_cases) || suite.testcase_nums !== suite.test_cases.length || !suite.timestamp || suite.duration <= 0)
      throw Error('Incomplete native suite observation');
    return suite.test_cases.flatMap(item => {
      if (!item.source) {
        if (item.status !== 'ERRORED') throw Error('Unidentified non-error native assertion');
        diagnostics.push({ nativeSuite: suite.test_name, name: item.name, exception: item.exception ?? null, message: item.message ?? null });
        return [];
      }
      const source = item.source?.file?.replaceAll('\\', '/');
      const path = source?.startsWith('test/') ? `hardware/${source}` : source ? relative(rootPath, source).replaceAll('\\', '/') : '';
      return [{ path, name: item.name, status: item.status === 'PASSED' ? 'PASS' : item.status === 'FAILED' ? 'FAIL' : 'BLOCKED',
        durationMs: item.duration * 1000, message: item.message ?? null, nativeSuite: suite.test_name }];
    });
  });
  const key = item => `${item.path}|${item.name}`;
  if (new Set(assertions.map(key)).size !== assertions.length || assertions.length !== declared.length
      || !declared.every(item => assertions.some(value => key(item) === key(value)))) throw Error('Native assertion identity census mismatch');
  const counts = { discovered: assertions.length, passed: assertions.filter(item => item.status === 'PASS').length,
    failed: assertions.filter(item => item.status === 'FAIL').length, blocked: assertions.filter(item => item.status === 'BLOCKED').length };
  if (raw.testcase_nums !== assertions.length + diagnostics.length || raw.failure_nums !== counts.failed || raw.error_nums + raw.skipped_nums !== counts.blocked + diagnostics.length)
    throw Error('Native counts disagree with observed assertions');
  return { counts, assertions, diagnostics, cases: mappings.map(mapping => ({ caseId: mapping.caseId, level: 'L1', scope: mapping.scope,
    status: mapping.tests.every(link => assertions.some(item => key(item) === key(link) && item.status === 'PASS')) ? 'PARTIAL'
      : mapping.tests.some(link => assertions.some(item => key(item) === key(link) && item.status === 'FAIL')) ? 'FAIL' : 'BLOCKED' })) };
}
