import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter';

// Incremental synthetic observations survive a killed test runner.
// They are supplementary evidence and never replace the final report gate.
export default class ProgressReporter implements Reporter {
  private root = process.cwd();
  private snapshot: { expectedExecutions: number; completed: boolean; status?: string; tests: unknown[] } =
    { expectedExecutions: 0, completed: false, tests: [] };
  private persist() {
    try {
      mkdirSync(resolve(this.root, 'artifacts/qa'), { recursive: true });
      writeFileSync(resolve(this.root, 'artifacts/qa/browser-progress.json'), JSON.stringify(this.snapshot, null, 2) + '\n');
    } catch { process.stderr.write('QA progress evidence could not be saved\n'); process.exitCode = 1; }
  }
  onBegin(config: FullConfig, suite: Suite) {
    this.root = config.rootDir.endsWith('e2e') ? resolve(config.rootDir, '..') : process.cwd();
    this.snapshot.expectedExecutions = suite.allTests().length; this.persist();
  }
  onTestEnd(test: TestCase, result: TestResult) {
    this.snapshot.tests.push({ name: test.title, path: relative(this.root, test.location.file).replaceAll('\\', '/'),
      project: test.parent.project()?.name, status: result.status, durationMs: result.duration, retry: result.retry,
      // No request/response headers, cookies, tokens or browser storage.
      errors: result.errors.map(error => ({ message: error.message })) });
    this.persist();
  }
  onEnd(result: FullResult) {
    this.snapshot.completed = result.status !== 'interrupted' && this.snapshot.tests.length === this.snapshot.expectedExecutions;
    this.snapshot.status = result.status; this.persist();
  }
}
