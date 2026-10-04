import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const ts = require("typescript");
const express = require("express");
function loadHelper(name, dependencies = {}) {
  const source = readFileSync(new URL(`../backend/src/lib/${name}.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", code)(path => dependencies[path] ?? require(path), module.exports, module);
  return module.exports;
}
const { createBrowserAdmission } = loadHelper("browserAdmission", {
  "./rateLimitIdentity": loadHelper("rateLimitIdentity"),
  "./rateLimitShard": loadHelper("rateLimitShard"),
  "../middleware/requireAuth": { requireAuth: async (req, res, next) => {
    // This harness isolates mount accounting; the HTTP Vitest suite verifies
    // admission with the actual authentication middleware and denied tokens.
    if (req.headers.authorization !== "Bearer verified-alice") return res.sendStatus(401);
    req.user = { uid: "alice" };
    next();
  } },
});
const source = ts.createSourceFile("server.ts", readFileSync(new URL("../backend/src/server.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const mounts = [];
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "app.use" &&
      ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === "/api/v2/ride-sessions") {
    mounts.push(node.arguments.slice(1).map(arg => arg.getText(source)));
  }
  ts.forEachChild(node, visit);
}
visit(source);

for (const path of ["/session_1/boarding-code", "/session_1/messages", "/session_1/passengers/me"]) {
  test(`ride-session write budget allows 30 requests to ${path}`, async () => {
    const app = express();
    assert.match(source.text, /app\.use\("\/api", createBrowserAdmission\(RATE_LIMIT_SHARD_FACTOR\)\)/);
    app.use("/api", createBrowserAdmission(1));
    const rideSessionsRouter = express.Router();
    rideSessionsRouter.post("/", (_req, res) => res.sendStatus(201));
    const rideSessionBoardingRouter = express.Router();
    rideSessionBoardingRouter.all(path, (_req, res) => res.sendStatus(200));
    const handlers = { rideSessionsRouter, rideSessionBoardingRouter };
    assert.ok(mounts.length > 0);
    for (const mount of mounts) app.use("/api/v2/ride-sessions", ...mount.map(name => {
      assert.ok(handlers[name], `Unsupported mount middleware: ${name}`);
      return handlers[name];
    }));
    const server = await new Promise(resolve => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    try {
      const url = `http://127.0.0.1:${server.address().port}/api/v2/ride-sessions${path}`;
      const headers = { Authorization: "Bearer verified-alice" };
      // Status polling must not spend the write allowance.
      for (let index = 0; index < 35; index++) {
        const response = await fetch(url, { headers });
        await response.text();
        assert.equal(response.status, 200);
      }
      for (let index = 0; index < 30; index++) {
        const response = await fetch(url, { method: path.endsWith("/me") ? "PUT" : "POST", headers });
        await response.text();
        assert.equal(response.status, 200, `Request ${index + 1} consumed the budget twice`);
      }
      const blocked = await fetch(url, { method: path.endsWith("/me") ? "PUT" : "POST", headers });
      await blocked.text();
      assert.equal(blocked.status, 429);
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}
