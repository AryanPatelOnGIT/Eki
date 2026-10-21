import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const pluginRequire = createRequire(require.resolve("@next/eslint-plugin-next"));
const { getRootDirs } = pluginRequire("./utils/get-root-dirs.js");
const normalize = values => values.map(value => resolve(value)).sort();
const scratch = resolve("temp");
mkdirSync(scratch, { recursive: true });
const removeFixture = root => {
  assert.ok(resolve(root).startsWith(scratch + "/") || resolve(root).startsWith(scratch + "\\"));
  rmSync(root, { recursive: true, force: true });
};

test("Next lint uses the scoped tinyglobby replacement and retains framework rules", () => {
  assert.equal(pluginRequire("fast-glob/package.json").name, "@eki/next-lint-glob");
  assert.equal(typeof pluginRequire("fast-glob").globSync, "function");
  assert.ok(require("@next/eslint-plugin-next").rules["no-html-link-for-pages"]);
});

test("Next lint resolves literal, Windows-separated and multiple project roots", t => {
  const root = mkdtempSync(join(scratch, "eki lint roots "));
  t.after(() => removeFixture(root));
  const web = join(root, "web"), admin = join(root, "admin");
  mkdirSync(web); mkdirSync(admin);
  const roots = rootDir => normalize(getRootDirs({ cwd: root, settings: { next: { rootDir } } }));
  assert.deepEqual(normalize(getRootDirs({ cwd: web, settings: {} })), [resolve(web)]);
  assert.deepEqual(roots(web), [resolve(web)]);
  assert.deepEqual(roots(web.replaceAll("/", "\\")), [resolve(web)]);
  assert.deepEqual(roots([web, admin]), normalize([web, admin]));
});

test("Next lint root globs support braces, exclude files and tolerate missing roots", t => {
  const root = mkdtempSync(join(scratch, "eki lint glob "));
  t.after(() => removeFixture(root));
  const web = join(root, "web"), admin = join(root, "admin");
  mkdirSync(web); mkdirSync(admin); writeFileSync(join(root, "not-a-directory"), "test");
  const roots = rootDir => normalize(getRootDirs({ cwd: root, settings: { next: { rootDir } } }));
  assert.deepEqual(roots(`${root}/{web,admin}`), normalize([web, admin]));
  assert.deepEqual(roots(`${root}/*`), normalize([web, admin]));
  assert.deepEqual(roots(join(root, "missing")), []);
});

test("Next lint supports external project roots and Windows DOS aliases", t => {
  const root = mkdtempSync(join(tmpdir(), "eki lint external "));
  t.after(() => {
    assert.equal(resolve(root, ".."), resolve(tmpdir()));
    rmSync(root, { recursive: true, force: true });
  });
  const web = join(root, "web"); mkdirSync(web);
  const roots = rootDir => normalize(getRootDirs({ cwd: scratch, settings: { next: { rootDir } } }));
  assert.deepEqual(roots(web), normalize([realpathSync.native(web)]));
  assert.deepEqual(roots(`${root}/*`), normalize([realpathSync.native(web)]));
});
