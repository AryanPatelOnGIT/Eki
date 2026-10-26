import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const [generator, registrar, worker] = await Promise.all([
  readFile(new URL("./generate-sw.mjs", import.meta.url), "utf8"),
  readFile(new URL("../frontend/src/components/ServiceWorkerRegistrar.tsx", import.meta.url), "utf8"),
  readFile(new URL("../frontend/src/sw.js", import.meta.url), "utf8"),
]);

test("precaches each exported shell's immutable bootstrap chunks", () => {
  assert.match(generator, /bootstrapShellEntries/);
  assert.match(generator, /const bootstrap = await bootstrapShellEntries\(\)/);
  assert.match(generator, /additionalManifestEntries: bootstrap\.entries/);
  assert.match(generator, /result\.size \+ bootstrap\.size/);
  assert.match(generator, /html\.matchAll/);
  assert.match(generator, /exceeds the 1 MB precache-file limit/);
  assert.match(generator, /_next\\\/static/);
  assert.match(generator, /PRECACHE_BUDGET_BYTES/);
  assert.match(generator, /"icon\*\.png"/);
  assert.doesNotMatch(generator, /"\*\.webp"/);
  assert.match(worker, /eki-next-static/);
  assert.match(worker, /url\.pathname\.startsWith\("\/_next\/static\/"\)/);
});

test("worker updates wait for active tabs without forcing a reload", () => {
  assert.doesNotMatch(registrar, /SKIP_WAITING|controllerchange|location\.reload/);
  assert.doesNotMatch(worker, /skipWaiting\(\)|clientsClaim\(\)/);
  assert.doesNotMatch(worker, /controllerchange|location\.reload/);
});

test("activating a new worker retires the previous deployment's navigation HTML", async () => {
  // Offline or slow (>3 s) navigations fall back to the NetworkFirst cache.
  // HTML cached under the previous worker references hashed chunks that the
  // new worker's precache cleanup has already deleted and Hosting no longer
  // serves, so it must not outlive the deployment that produced it.
  const events = new Map(), deleted = [];
  class Strategy { constructor(options) { this.options = options; } }
  class NavigationRoute { constructor(handler, options) { this.handler = handler; this.options = options; } }
  const strategies = [];
  class NetworkFirst extends Strategy { constructor(options) { super(options); strategies.push(this); } }
  const { runInNewContext } = await import("node:vm");
  runInNewContext(worker.replace(/import\s+[\s\S]*?\s+from\s+"[^"]+";/g, ""), {
    self: { location: { origin: "https://app.example.test" }, addEventListener: (name, callback) => events.set(name, callback) },
    caches: { delete: async name => { deleted.push(name); return true; } },
    URL, NavigationRoute, NetworkFirst, NetworkOnly: Strategy, CacheFirst: Strategy,
    StaleWhileRevalidate: Strategy, ExpirationPlugin: Strategy, CacheableResponsePlugin: Strategy,
    cleanupOutdatedCaches() {}, precacheAndRoute() {}, matchPrecache() {}, setDefaultHandler() {}, registerRoute() {},
  });
  const navigationCache = strategies.find(strategy => strategy.options?.cacheName)?.options.cacheName;
  assert.equal(navigationCache, "eki-navigations");
  let activation;
  events.get("activate")({ waitUntil: promise => { activation = promise; } });
  await activation;
  assert.ok(deleted.includes(navigationCache), "navigation cache must be cleared on activate");
});
