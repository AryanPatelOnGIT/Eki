import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

type Operation = {
  responses: Record<string, {
    content?: Record<string, { schema: object }>;
    headers?: Record<string, { schema: object }>;
  }>;
};
export const spec = JSON.parse(readFileSync(resolve(__dirname, "../openapi.json"), "utf8")) as {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, object> };
};
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
const validators = new Map<string, ReturnType<typeof ajv.compile>>();

export function assertSchema(schema: object, value: unknown): void {
  const key = JSON.stringify(schema);
  let validate = validators.get(key);
  if (!validate) {
    validate = ajv.compile({ ...schema, components: spec.components });
    validators.set(key, validate);
  }
  if (!validate(value)) throw new Error(`OpenAPI schema mismatch: ${ajv.errorsText(validate.errors)}`);
}

/** Validate real HTTP responses without consuming the body used by assertions. */
export async function assertResponse(method: string, template: string, response: Response): Promise<Response> {
  const operation = spec.paths[template]?.[method.toLowerCase()];
  if (!operation) throw new Error(`Undocumented operation ${method} ${template}`);
  const expected = operation.responses[String(response.status)];
  if (!expected) throw new Error(`Undocumented status ${response.status} for ${method} ${template}`);
  if (response.status === 204) {
    if (await response.clone().text()) throw new Error("204 response contained a body");
  } else {
    if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Expected JSON content type");
    assertSchema(expected.content!["application/json"].schema, await response.clone().json());
  }
  for (const [name, header] of Object.entries(expected.headers ?? {})) {
    const value = response.headers.get(name);
    if (value !== null) assertSchema(header.schema, value);
  }
  return response;
}

const networkFetch = globalThis.fetch;
/** Match concrete URLs to the published templates, then assert status/body. */
export async function contractFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input);
  const method = init?.method ?? "GET";
  const template = Object.keys(spec.paths).find(path => {
    const pattern = path.split("/").map(segment => segment.startsWith("{") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/");
    return new RegExp(`^${pattern}/?$`).test(url.pathname) && spec.paths[path][method.toLowerCase()];
  });
  if (!template) throw new Error(`Undocumented request ${method} ${url.pathname}`);
  return assertResponse(method, template, await networkFetch(input, init));
}
