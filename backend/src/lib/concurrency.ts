import { BoundedKeyedExecutor, type ExecutionBudgets } from "./boundedKeyedExecutor";

export interface ConcurrencyLimiter {
  run<T>(work: () => Promise<T>): Promise<T>;
  snapshot(): ReturnType<BoundedKeyedExecutor<number>["snapshot"]>;
}

export function createConcurrencyLimiter(maxConcurrent: number, options: Omit<ExecutionBudgets, "maxConcurrent" | "maxPendingPerKey"> = {}): ConcurrencyLimiter {
  const executor = new BoundedKeyedExecutor<number>({ maxPending: 32, ...options, maxConcurrent, maxPendingPerKey: 1 });
  let sequence = 0;
  return {
    async run<T>(work: () => Promise<T>): Promise<T> {
      return executor.run(sequence++, work);
    },
    snapshot: () => executor.snapshot(),
  };
}
