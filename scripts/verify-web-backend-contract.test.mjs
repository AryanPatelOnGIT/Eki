import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertWebBackendContract,
  connectSourcesFromCsp,
  verifyBackendAvailability,
} from "./verify-web-backend-contract.mjs";

function config(csp) {
  return {
    hosting: {
      headers: [{
        source: "**",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      }],
    },
  };
}

describe("web/backend deployment contract", () => {
  it("extracts only connect-src tokens", () => {
    assert.deepEqual(
      connectSourcesFromCsp("default-src 'self'; connect-src 'self' https://api.test; img-src data:;"),
      ["'self'", "https://api.test"],
    );
  });

  it("accepts the exact configured backend origin", () => {
    assert.deepEqual(
      assertWebBackendContract(
        config("default-src 'self'; connect-src 'self' https://api.test;"),
        "https://api.test/v1",
        true,
      ),
      { checked: true, origin: "https://api.test" },
    );
  });

  it("rejects a missing origin and an unset strict production URL", () => {
    assert.throws(() => assertWebBackendContract(
      config("connect-src 'self' https://old.test;"),
      "https://api.test",
      true,
    ));
    assert.throws(() => assertWebBackendContract(config("connect-src 'self';"), "", true));
  });
});

describe("live backend release preflight", () => {
  const origin = "https://api.example.test";
  const frontend = "https://eki.example.test";
  const healthy = () => new Response(JSON.stringify({ status: "ok" }), {
    headers: { "access-control-allow-origin": frontend },
  });
  const allowed = () => new Response(null, { status: 204, headers: {
    "access-control-allow-origin": frontend,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Authorization,Content-Type,Ngrok-Skip-Browser-Warning",
  } });

  it("checks readiness and an actual browser preflight without writing data", async () => {
    const calls = [];
    await verifyBackendAvailability(origin, frontend, async (url, init) => {
      calls.push([url, init]);
      return calls.length === 1 ? healthy() : allowed();
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], `${origin}/health`);
    assert.equal(calls[1][0], `${origin}/api/users/bootstrap`);
    assert.equal(calls[1][1].method, "OPTIONS");
    assert.equal(calls[1][1].headers.Origin, frontend);
    assert.equal(calls[1][1].body, undefined);
    assert.equal(calls[0][1].redirect, "error");
    assert.equal(calls[1][1].headers["Access-Control-Request-Headers"], "authorization,content-type");
  });

  it("includes the browser's ngrok interstitial bypass header only for ngrok", async () => {
    const calls = [];
    await verifyBackendAvailability("https://example.ngrok-free.dev", frontend, async (url, init) => {
      calls.push([url, init]); return calls.length === 1 ? healthy() : allowed();
    });
    assert.equal(calls[0][1].headers["ngrok-skip-browser-warning"], "1");
    assert.match(calls[1][1].headers["Access-Control-Request-Headers"], /ngrok-skip-browser-warning/);
  });

  it("rejects dead DNS and degraded or misleading health responses", async () => {
    await assert.rejects(verifyBackendAvailability(origin, frontend, async () => { throw new TypeError("fetch failed"); }));
    for (const response of [
      new Response('{"status":"degraded"}', { status: 503 }),
      new Response('{"status":"degraded"}'),
      new Response('<html>Tunnel offline</html>'),
    ]) await assert.rejects(verifyBackendAvailability(origin, frontend, async () => response));
  });

  it("rejects healthy APIs that the deployed browser cannot access", async () => {
    await assert.rejects(verifyBackendAvailability(origin, frontend, async () => new Response('{"status":"ok"}')), /CORS/);
    for (const missing of ["access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers"]) {
      let calls = 0;
      await assert.rejects(verifyBackendAvailability(origin, frontend, async () => {
        if (++calls === 1) return healthy();
        const response = allowed(); response.headers.delete(missing); return response;
      }), /preflight/);
    }
  });

  it("requires an explicit frontend origin", async () => {
    await assert.rejects(verifyBackendAvailability(origin, undefined), /EKI_FRONTEND_ORIGIN/);
    await assert.rejects(verifyBackendAvailability(origin, `${frontend}/path`), /EKI_FRONTEND_ORIGIN/);
  });
});
