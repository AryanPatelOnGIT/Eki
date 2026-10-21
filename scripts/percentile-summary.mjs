/** Browser-safe nearest-rank statistics shared with the offline analyzer. */
export function percentileSummary(values) {
  const sorted = values.filter(value => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return { samples: 0, average: null, p50: null, p95: null, p99: null, maximum: null };
  const percentile = ratio => sorted[Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1)];
  return { samples: sorted.length, average: Number((sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(1)), p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), maximum: sorted.at(-1) };
}
