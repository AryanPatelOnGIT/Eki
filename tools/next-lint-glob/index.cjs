"use strict";

const { globSync, isDynamicPattern } = require("tinyglobby");
const { isAbsolute } = require("node:path");
const { realpathSync } = require("node:fs");

function canonicalAbsolutePattern(pattern) {
  if (typeof pattern !== "string" || !isAbsolute(pattern)) return pattern;
  const parts = pattern.replaceAll("\\", "/").split("/");
  const firstGlob = parts.findIndex(part => isDynamicPattern(part));
  const prefix = firstGlob < 0 ? pattern : parts.slice(0, firstGlob).join("/") || "/";
  try {
    // Windows directory crawling resolves DOS aliases and junctions. Match
    // against the same canonical prefix, including roots outside cwd.
    const canonical = realpathSync.native(prefix.endsWith(":") ? prefix + "/" : prefix).replaceAll("\\", "/");
    return canonical + pattern.slice(prefix.length);
  } catch {
    return pattern; // Missing roots retain the normal empty-result behavior.
  }
}

// Next 16.3's lint plugin uses only globSync(pattern, {onlyDirectories:true}).
// fast-glob matches a directory itself; tinyglobby otherwise expands it.
exports.globSync = (pattern, options) => globSync(canonicalAbsolutePattern(pattern), {
  ...options,
  absolute: options?.absolute ?? (typeof pattern === "string" && isAbsolute(pattern)),
  expandDirectories: false,
});
