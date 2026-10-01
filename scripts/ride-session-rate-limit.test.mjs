import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(new URL("../backend/package.json", import.meta.url));
const ts = require("typescript");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
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
    const rideSessionsRouter = express.Router();
    rideSessionsRouter.post("/", (_req, res) => res.sendStatus(201));
    const rideSessionBoardingRouter = express.Router();
    rideSessionBoardingRouter.all(path, (_req, res) => res.sendStatus(200));
    const handlers = { rideSessionsRouter, rideSessionBoardingRouter,
      writeLimiter: rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: false, legacyHeaders: false }) };
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
      for (let index = 0; index < 30; index++) {
        const response = await fetch(url, { method: path.endsWith("/me") ? "PUT" : "POST" });
        await response.text();
        assert.equal(response.status, 200, `Request ${index + 1} consumed the budget twice`);
      }
      const blocked = await fetch(url, { method: path.endsWith("/me") ? "PUT" : "POST" });
      await blocked.text();
      assert.equal(blocked.status, 429);
    } finally {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
}
