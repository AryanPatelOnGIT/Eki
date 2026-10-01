import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { registeredOperations, verifyOpenApi } from "./verify-openapi.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(readFileSync(resolve(root, "backend/openapi.json"), "utf8"));

test("validates the published contract against mounted Express routers", async () => {
  const count = await verifyOpenApi(spec);
  assert.equal(count, registeredOperations().length);
  assert.ok(count >= 45);
});

test("a newly registered handler fails until documented", async () => {
  const registered = registeredOperations(root, (filename, encoding) => {
    const text = readFileSync(filename, encoding);
    return filename.endsWith("server.ts") ? `${text}\napp.get('/api/new-resource', handler);` : text;
  });
  await assert.rejects(verifyOpenApi(spec, registered), /Missing: GET \/api\/new-resource/);
});

test("changed mount prefixes and named v2 router exports are reconciled", async () => {
  const registered = registeredOperations(root, (filename, encoding) => {
    const text = readFileSync(filename, encoding);
    return filename.endsWith("server.ts") ? text.replace('"/api/v2/settings/global"', '"/api/v3/settings/global"') : text;
  });
  await assert.rejects(verifyOpenApi(spec, registered), /Missing: PATCH \/api\/v3\/settings\/global.*stale: PATCH \/api\/v2\/settings\/global/);
});

test("removed operations and duplicate registrations fail", async () => {
  const registered = registeredOperations();
  await assert.rejects(verifyOpenApi(spec, registered.slice(1)), /stale:/);
  await assert.rejects(verifyOpenApi(spec, [...registered, registered[0]]), /duplicate registrations: GET/);
});

test("dynamic paths and unsupported chained registrations fail closed", () => {
  for (const extra of ["app.get(dynamicPath, handler);", "app.route('/dynamic').get(handler);", "app[dynamicMethod]('/dynamic', handler);"]) {
    assert.throws(() => registeredOperations(root, (filename, encoding) => {
      const text = readFileSync(filename, encoding);
      return filename.endsWith("server.ts") ? `${text}\n${extra}` : text;
    }), /explicit.*support/);
  }
});

test("dynamic router mount paths fail closed", () => {
  assert.throws(() => registeredOperations(root, (filename, encoding) => {
    const text = readFileSync(filename, encoding);
    return filename.endsWith("server.ts") ? text.replace('app.use("/api/buses",', 'app.use(dynamicMount,') : text;
  }), /dynamic mount/);
});

test("broken references and missing operational policy fail", async () => {
  const broken = structuredClone(spec);
  broken.paths["/health"].get.responses[200].content["application/json"].schema = { $ref: "#/components/schemas/DoesNotExist" };
  await assert.rejects(verifyOpenApi(broken));
  const incomplete = structuredClone(spec);
  delete incomplete.paths["/health"].get["x-retry-policy"];
  await assert.rejects(verifyOpenApi(incomplete), /missing x-retry-policy/);
});
