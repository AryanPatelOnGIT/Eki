import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Execute the actual documented snippet against a disposable synthetic page.
// This validates the recipe's oracle, not Google Places or the Eki application.
const documents = [
  'docs/testing/EKI_Antigravity_Webapp_Testing_Skill.md',
  'docs/testing/skills/eki-antigravity-webapp-audit/references/PLAYWRIGHT-RECIPES.md',
];
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
for (const document of documents) {
  const text = readFileSync(document, 'utf8');
  const section = text.slice(text.indexOf('## Live Places search'));
  const start = section.indexOf('  const input =');
  const end = section.indexOf('  // Verify at least one');
  if (start < 0 || end < start) throw new Error(`Missing Places recipe in ${document}`);
  const recipe = new AsyncFunction('page', 'expect', section.slice(start, end) + '\nreturn json;');

  for (const minimumLength of [3, 2]) {
    test(`${document}: ${minimumLength === 3 ? 'matches only the full query' : 'rejects a short-query request'}`, async ({ page }) => {
      const queries: string[] = [];
      await page.route('http://127.0.0.1:3199/**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/places/search') {
          queries.push(route.request().method() + ':' + (url.searchParams.get('q') || ''));
          if (url.searchParams.get('q') === 'Ahmedabad University' && route.request().method() === 'GET') {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          await route.fulfill({ json: { results: [], query: url.searchParams.get('q'), method: route.request().method() } });
          return;
        }
        await route.fulfill({ contentType: 'text/html', body: `
          <input type="search" aria-label="Search for a stop">
          <script>
            let timer;
            document.querySelector('input').oninput = event => {
              clearTimeout(timer);
              const query = event.target.value;
              timer = setTimeout(() => {
                if (query.length < ${minimumLength}) return;
                if (query.length > 2) {
                  fetch('/api/places/search?q=' + encodeURIComponent(query), { method: 'POST' });
                  fetch('/api/places/search?q=Ah'); // unrelated responses arrive first
                }
                fetch('/api/places/search?q=' + encodeURIComponent(query));
              }, 250);
            };
          </script>` });
      });
      await page.goto('http://127.0.0.1:3199/recipe');
      if (minimumLength === 2) {
        await expect(recipe(page, expect)).rejects.toThrow(/toBe/);
        expect(queries).toEqual(['GET:Ah']);
      } else {
        const result = await recipe(page, expect);
        expect(result.query).toBe('Ahmedabad University');
        expect(result.method).toBe('GET');
        expect(queries).toEqual(['POST:Ahmedabad University', 'GET:Ah', 'GET:Ahmedabad University']);
      }
    });
  }
}
