import { relative } from 'node:path';
import { repositoryRoot } from './acceptance-catalog.mjs';

export default async function* reporter(events) {
  const assertions = [];
  for await (const event of events) if (['test:pass', 'test:fail'].includes(event.type)) {
    const value = event.data;
    assertions.push({ path: typeof value.file === 'string' ? relative(repositoryRoot, value.file).replaceAll('\\', '/') : '',
      name: value.name, status: value.skip || value.todo ? 'BLOCKED' : event.type === 'test:pass' ? 'PASS' : 'FAIL',
      durationMs: value.details?.duration_ms ?? null,
      failure: value.details?.error?.message ?? null });
  }
  yield JSON.stringify({ assertions, counts: { discovered: assertions.length,
    passed: assertions.filter(item => item.status === 'PASS').length,
    failed: assertions.filter(item => item.status === 'FAIL').length,
    blocked: assertions.filter(item => item.status === 'BLOCKED').length } }) + '\n';
}
