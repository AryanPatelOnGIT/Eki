# Playwright recipes for real-browser checks

Examples are **templates**; bind them to the current checkout's roles, test URL, session fixtures, repo config and selectors. They are not evidence of tests already executed. Prefer editing/adding tests only in the isolated branch/worktree, after reviewing existing suites. Do not run any sample against a shared cloud with live data.

## Capture console and response failures with scrubbing

```ts
import { test, expect } from '@playwright/test';

test('profile image actually decodes', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', e => browserErrors.push(e.message));
  // Use the authorized passenger test auth state / login fixture, NOT a real personal account.
  await page.goto('/passenger');
  await page.getByRole('button', { name: /profile/i }).click(); // replace with actual selector from HEAD
  const image = page.getByRole('img', { name: 'Profile' });
  await expect(image).toBeVisible();
  const loaded = await image.evaluate((img: HTMLImageElement) => ({
    complete: img.complete,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    width: img.getBoundingClientRect().width,
    height: img.getBoundingClientRect().height,
  }));
  expect(loaded.complete).toBe(true);
  expect(loaded.naturalWidth).toBeGreaterThan(0);
  expect(loaded.naturalHeight).toBeGreaterThan(0);
  expect(loaded.width).toBeGreaterThan(0);
  expect(loaded.height).toBeGreaterThan(0);
  expect(browserErrors).toEqual([]);
});
```

If the authenticated test fixture has no `photoURL`, **do not** treat a missing `<img>` as failure; assert the fallback icon instead and mark real-photo scenario BLOCKED until a test user with a valid authorized photo is available. Broken/expired URLs are a separate negative test.

## Live Places search (bounded, explicitly authorized)

```ts
import { test, expect } from '@playwright/test';

test('admin Places input produces a selectable stop', async ({ page }) => {
  // Configure real, authorized admin auth and a disposable route test project first.
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Routes' }).click();
  // Enter Create/Edit using the real UI control from the current source.
  // Check the final form and name against HEAD, not a hardcoded guessed button.
  const input = page.getByRole('searchbox', { name: 'Search for a stop' });
  let searchRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname.endsWith('/api/places/search')) {
      searchRequests += 1;
    }
  });
  await input.fill('Ah'); // fewer than three chars: no search expected
  await page.waitForTimeout(450); // only for documenting the debounce negative case
  expect(searchRequests).toBe(0);
  const query = 'Ahmedabad University';
  const match = page.waitForResponse(r => {
    const url = new URL(r.url());
    return url.pathname.endsWith('/api/places/search') &&
      url.searchParams.get('q') === query && r.request().method() === 'GET';
  }, { timeout: 12_000 });
  await input.fill(query);
  const response = await match;
  expect(response.ok()).toBe(true);
  const json = await response.json();
  expect(Array.isArray(json.results)).toBe(true);
  // Verify at least one *real, provider-backed* prediction for chosen query,
  // and click the exact visible result identified from returned test data.
  // Then check stop coordinates, map marker, Deploy/save and reload.
});
```

**Important:** Real Places search can consume billed Google quota. One deterministic sample query per approved environment is enough for a smoke test; inject the larger negative/race matrix via emulator. A `200` with `[]` may be valid, and is not itself proof of a bug. Review no-search-at-2-chars using a request counter; the wait above alone is not a meaningful assertion.

## Every safely reachable click must include an oracle

```ts
const button = page.getByRole('button', { name: 'Send Feedback' });
await expect(button).toBeVisible();
await button.click();
await expect(page.getByRole('dialog')).toBeVisible();
// The close button becomes a *new separate control* in the ledger.
await page.getByRole('button', { name: /cancel|close/i }).click();
await expect(page.getByRole('dialog')).toHaveCount(0);
```

A smoke loop that blindly performs `page.locator('button').all().click()` is unsafe, misses new overlay controls and proves almost nothing. Build a state graph with each action and independent expected effect. Modal Cancel and Confirm are different branches. Do not `force: true` through obscuring overlays; an intercepted click is precisely a user-visible defect to investigate.

## Assertions beyond HTTP 200

- Verify latest request method/path/status and that no unexpected *extra* write occurs.
- For save: make changes, wait for backend acknowledgement, hard reload, reopen object, assert authoritative persisted value.
- For role: verify unauthorized backend mutation actually returns 401/403, not only that nav link is hidden.
- For maps: provider SDK loaded **and real tiles/geometry/marker visibility**, correct coordinates, no map error.
- For mobile: exact viewport with screenshot, active control bounding rect inside accessible scrollport, pointer interaction not intercepted and no horizontal scroll.
- For error: controlled failure produces specific visible alert, retry works after recovery and transient error clears.
- For session: ensure `sessionId` is stable and messaging/boarding cannot cross old/new rides.

## Example evidence artifact

For each click/save/path, write a compact sanitized JSON record with `sha`, `role`, `viewport`, `page`, `control_id`, `precondition`, `action`, `expected`, `observed`, `provider_tier`, `http_status`, `screenshot_path`, `trace_path`, `timestamp`. Prefer Playwright test report and trace ZIP filenames over attaching raw request headers/cookies. Use the evidence path as `evidence_path` in `coverage.csv` and run the coverage gate.
