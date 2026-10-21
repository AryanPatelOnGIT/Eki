import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ sdk: vi.fn(), start: vi.fn(), logs: vi.fn(), metrics: vi.fn(), http: vi.fn() }));
vi.mock("@opentelemetry/sdk-node", () => ({ NodeSDK: class {
  constructor(options: unknown) { fixture.sdk(options); }
  start() { fixture.start(); }
} }));
vi.mock("@opentelemetry/sdk-logs", () => ({ BatchLogRecordProcessor: class {
  constructor(options: unknown) { fixture.logs(options); }
} }));
vi.mock("@opentelemetry/sdk-metrics", () => ({ PeriodicExportingMetricReader: class {
  constructor(options: unknown) { fixture.metrics(options); }
} }));
vi.mock("@opentelemetry/instrumentation-http", () => ({ HttpInstrumentation: class {
  constructor(options: unknown) { fixture.http(options); }
} }));
import { createTelemetrySdk } from "./telemetrySdk";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("telemetry SDK export policy", () => {
  it("bounds log and metric exports and redacts private HTTP URLs", () => {
    vi.stubEnv("OTEL_SERVICE_NAME", " test-service ");
    createTelemetrySdk();
    expect(fixture.start).toHaveBeenCalledOnce();
    expect(fixture.sdk.mock.calls[0][0].serviceName).toBe("test-service");
    expect(fixture.logs.mock.calls[0][0]).toMatchObject({
      scheduledDelayMillis: 2_000, exportTimeoutMillis: 10_000, maxQueueSize: 2_048, maxExportBatchSize: 512,
    });
    expect(fixture.metrics.mock.calls[0][0]).toMatchObject({ exportIntervalMillis: 30_000, exportTimeoutMillis: 10_000 });
    const http = fixture.http.mock.calls[0][0];
    expect(http.ignoreIncomingRequestHook({ url: "/health?token=private" })).toBe(true);
    expect(http.ignoreIncomingRequestHook({ url: "/live" })).toBe(true);
    expect(http.ignoreIncomingRequestHook({ url: "/api/sessions" })).toBe(false);
    const attributes: Record<string, string> = { "http.url": "https://example.invalid/?token=private" };
    http.requestHook({ setAttribute: (key: string, value: string) => { attributes[key] = value; } });
    expect(attributes).toEqual({ "http.target": "/[redacted]", "http.url": "[redacted]", "url.full": "[redacted]", "url.path": "/[redacted]", "url.query": "" });
  });
});
