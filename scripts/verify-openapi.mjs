import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "backend/package.json"));
const ts = require("typescript");
const SwaggerParser = require("@apidevtools/swagger-parser");
const Ajv2020 = require("ajv/dist/2020.js").default;
export const methods = new Set(["get", "put", "post", "delete", "patch", "options", "head", "trace"]);

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, child => visit(child, callback));
}

function literal(node, location) {
  if (!node || !ts.isStringLiteralLike(node)) {
    throw new Error(`${location}: dynamic/array paths need explicit support in the OpenAPI inventory`);
  }
  return node.text;
}

function normalize(prefix, suffix) {
  return `${prefix}/${suffix}`.replace(/\/+/g, "/").replace(/\/$/, "")
    .replace(/:([A-Za-z0-9_]+)/g, "{$1}") || "/";
}

/** Read Express registrations, never execute server.ts or initialize Firebase. */
export function registeredOperations(repositoryRoot = root, read = readFileSync) {
  const cache = new Map();
  function module(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const source = ts.createSourceFile(filename, read(filename, "utf8"), ts.ScriptTarget.Latest, true);
    const info = { imports: new Map(), routers: new Set(), exports: new Map(), calls: [] };
    cache.set(filename, info);
    visit(source, node => {
      if (ts.isImportDeclaration(node) && node.importClause && ts.isStringLiteral(node.moduleSpecifier)) {
        const target = resolve(dirname(filename), `${node.moduleSpecifier.text}.ts`);
        const local = node.moduleSpecifier.text.startsWith(".");
        if (node.importClause.name) info.imports.set(node.importClause.name.text, { target, exported: "default", local });
        const bindings = node.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const binding of bindings.elements) info.imports.set(binding.name.text, {
            target, exported: binding.propertyName?.text ?? binding.name.text, local,
          });
        }
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
        const factory = node.initializer.expression.getText(source);
        if (["Router", "express.Router", "express"].includes(factory)) {
          info.routers.add(node.name.text);
          const statement = node.parent.parent;
          if (statement.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) info.exports.set(node.name.text, node.name.text);
        }
      }
      if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) info.exports.set("default", node.expression.text);
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
        info.calls.push({ owner: node.expression.expression.text, method: node.expression.name.text, args: node.arguments });
      }
      if (ts.isCallExpression(node) && ts.isElementAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)) {
        info.calls.push({ owner: node.expression.expression.text,
          method: ts.isStringLiteralLike(node.expression.argumentExpression) ? node.expression.argumentExpression.text : "dynamic-method",
          args: node.arguments });
      }
    });
    return info;
  }
  const operations = [];
  function expand(filename, owner, prefix, parents = []) {
    const key = `${filename}:${owner}`;
    if (parents.includes(key)) throw new Error(`Recursive router mount: ${key}`);
    const info = module(filename);
    for (const call of info.calls.filter(call => call.owner === owner)) {
      const location = `${filename}:${owner}.${call.method}`;
      if (methods.has(call.method)) {
        operations.push({ method: call.method, path: normalize(prefix, literal(call.args[0], location)) });
      } else if (["route", "all", "dynamic-method"].includes(call.method)) {
        throw new Error(`${location}: registration style needs explicit inventory support`);
      } else if (call.method === "use") {
        let mount = "";
        let args = [...call.args];
        if (args[0] && ts.isStringLiteralLike(args[0])) mount = args.shift().text;
        const assertMount = () => {
          if (!mount && args.length > 1) {
            throw new Error(`${location}: dynamic mount or mountless middleware chain needs explicit inventory support`);
          }
        };
        for (const arg of args) {
          if (!ts.isIdentifier(arg)) continue; // inline middleware, not a router
          const imported = info.imports.get(arg.text);
          if (info.routers.has(arg.text)) {
            assertMount();
            expand(filename, arg.text, normalize(prefix, mount), [...parents, key]);
          } else if (imported?.local) {
            const child = module(imported.target);
            const childOwner = child.exports.get(imported.exported);
            if (childOwner && child.routers.has(childOwner)) {
              assertMount();
              expand(imported.target, childOwner, normalize(prefix, mount), [...parents, key]);
            } else if (imported.target.startsWith(resolve(repositoryRoot, "backend/src/routes"))) {
              throw new Error(`Unresolved router: ${location} ${arg.text}`);
            }
          }
        }
      }
    }
  }
  expand(resolve(repositoryRoot, "backend/src/server.ts"), "app", "");
  return operations;
}

export function operationKeys(spec) {
  return Object.entries(spec.paths).flatMap(([path, item]) => Object.keys(item)
    .filter(method => methods.has(method)).map(method => `${method.toUpperCase()} ${path}`));
}

export async function verifyOpenApi(spec, registered = registeredOperations()) {
  // This validates the OAS structure, all references and JSON Schema dialect.
  // Disable network/file dereferencing: this contract is intentionally self-contained.
  await SwaggerParser.validate(structuredClone(spec), { resolve: { external: false } });
  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  for (const schema of Object.values(spec.components.schemas)) {
    ajv.compile({ ...schema, components: spec.components });
  }
  const actual = registered.map(({ method, path }) => `${method.toUpperCase()} ${path}`);
  const declared = operationKeys(spec);
  const missing = actual.filter(key => !declared.includes(key));
  const stale = declared.filter(key => !actual.includes(key));
  const duplicates = actual.filter((key, index) => actual.indexOf(key) !== index);
  if (missing.length || stale.length || duplicates.length) {
    throw new Error(`OpenAPI route drift. Missing: ${missing.join(", ") || "none"}; stale: ${stale.join(", ") || "none"}; duplicate registrations: ${duplicates.join(", ") || "none"}`);
  }
  const ids = new Set();
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method)) continue;
      const key = `${method.toUpperCase()} ${path}`;
      if (!operation.operationId || ids.has(operation.operationId)) throw new Error(`${key}: missing/duplicate operationId`);
      ids.add(operation.operationId);
      for (const field of ["x-auth-class", "x-body-limit-bytes", "x-rate-limit", "x-cache-policy", "x-timeout-policy", "x-retry-policy", "x-idempotency"]) {
        if (operation[field] === undefined || operation[field] === "") throw new Error(`${key}: missing ${field}`);
      }
      if (!Array.isArray(operation.security)) throw new Error(`${key}: explicit security is required`);
      for (const name of [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1])) {
        if (![...(item.parameters ?? []), ...(operation.parameters ?? [])].some(param => param.in === "path" && param.name === name && param.required)) throw new Error(`${key}: missing required path parameter ${name}`);
      }
      for (const [status, response] of Object.entries(operation.responses)) {
        if (status === "204") {
          if (response.content) throw new Error(`${key}: 204 must have no body`);
        } else if (!response.content?.["application/json"]?.schema) throw new Error(`${key}: ${status} missing JSON response schema`);
      }
      const alias = operation["x-compatibility-alias-of"];
      if (alias && !declared.includes(alias)) throw new Error(`${key}: alias target does not exist: ${alias}`);
    }
  }
  return declared.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const spec = JSON.parse(readFileSync(resolve(root, "backend/openapi.json"), "utf8"));
  try {
    const count = await verifyOpenApi(spec);
    console.log(`OpenAPI verified: ${count} registered HTTP operations, schemas and policy metadata.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
