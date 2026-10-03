# Next lint directory matching

Issue #234: Next's lint plugin imports `fast-glob` only for
`globSync(rootDir, { onlyDirectories: true })`. That dependency introduced the
unpatched `braces` recursion advisory through `micromatch`.

The root development dependency and scoped npm override resolve this import to
this private adapter, backed by pinned `tinyglobby@0.2.17`. Next, its lint plugin
and its framework rules stay on 16.3.8. This is a repository dependency removal,
not a claim of an upstream braces patch.

The adapter disables directory expansion, preserves absolute results for
absolute patterns and canonicalizes existing absolute prefixes for Windows DOS
aliases/junctions. The plugin's string, array-of-roots, brace/wildcard,
missing-directory and external-root behavior is exercised through its actual
`getRootDirs` helper in `scripts/next-lint-root-resolution.test.mjs`.

Only the plugin's used `globSync` API is supported. Recheck the adapter when
upgrading the Next lint plugin or adding another `fast-glob` consumer. No global
`fast-glob` override is applied to other packages. Full npm audit is a CI gate.

References: [advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
[tinyglobby migration option](https://superchupu.dev/tinyglobby/options#expanddirectories).
