import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Adapter { constructor(public options?: Record<string, unknown>) {} }
  return { Adapter, sdk: vi.fn(), start: vi.fn() };
});
vi.mock("@opentelemetry/sdk-node", () => ({ NodeSDK: class { constructor(options: unknown) { mocks.sdk(options); } start() { mocks.start(); } } }));
vi.mock("@opentelemetry/exporter-logs-otlp-http", () => ({ OTLPLogExporter: mocks.Adapter }));
vi.mock("@opentelemetry/exporter-metrics-otlp-http", () => ({ OTLPMetricExporter: mocks.Adapter }));
vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({ OTLPTraceExporter: mocks.Adapter }));
vi.mock("@opentelemetry/sdk-logs", () => ({ BatchLogRecordProcessor: mocks.Adapter }));
vi.mock("@opentelemetry/sdk-metrics", () => ({ PeriodicExportingMetricReader: mocks.Adapter }));
vi.mock("@opentelemetry/instrumentation-http", () => ({ HttpInstrumentation: mocks.Adapter }));
vi.mock("@opentelemetry/instrumentation-express", () => ({ ExpressInstrumentation: mocks.Adapter }));
vi.mock("@opentelemetry/instrumentation-grpc", () => ({ GrpcInstrumentation: mocks.Adapter }));
vi.mock("@opentelemetry/instrumentation-pino", () => ({ PinoInstrumentation: mocks.Adapter }));
vi.mock("@opentelemetry/instrumentation-runtime-node", () => ({ RuntimeNodeInstrumentation: mocks.Adapter }));
vi.mock("@opentelemetry/instrumentation-undici", () => ({ UndiciInstrumentation: mocks.Adapter }));
import { createTelemetrySdk } from "./telemetrySdk";
beforeEach(() => vi.clearAllMocks());
describe("telemetry SDK wiring", () => {
  it("bounds exporter queues and intervals before starting the SDK once", () => {
    createTelemetrySdk();
    const options = mocks.sdk.mock.calls[0][0];
    expect(options.metricReaders[0].options).toMatchObject({ exportIntervalMillis: 30000, exportTimeoutMillis: 10000 });
    expect(options.logRecordProcessors[0].options).toMatchObject({ maxQueueSize: 2048, maxExportBatchSize: 512, exportTimeoutMillis: 10000 });
    expect(mocks.start).toHaveBeenCalledOnce();
  });
  it("excludes health polling and redacts request URLs at the installed HTTP hook", () => {
    createTelemetrySdk();
    const options = mocks.sdk.mock.calls[0][0].instrumentations[0].options;
    expect(options.ignoreIncomingRequestHook({ url: "/health?secret=value" })).toBe(true);
    expect(options.ignoreIncomingRequestHook({ url: "/live" })).toBe(true);
    expect(options.ignoreIncomingRequestHook({ url: "/api/sessions" })).toBe(false);
    const setAttribute = vi.fn(); options.requestHook({ setAttribute });
    expect(setAttribute).toHaveBeenCalledWith("url.query", "");
    expect(setAttribute).toHaveBeenCalledWith("http.url", "[redacted]");
  });
});
