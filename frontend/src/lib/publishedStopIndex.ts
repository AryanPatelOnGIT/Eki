/**
 * Backend progress names the next expected stop in travel order. Missing or
 * invalid progress stays unknown; proximity and ETA never prove arrival.
 */
export function publishedStopIndex(value: unknown, stopCount: number): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < stopCount
    ? value : undefined;
}
