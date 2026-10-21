export class SingleFlightCapacityError extends Error {
  constructor() { super("Credential verification capacity is temporarily exhausted."); }
}
export class SingleFlightDeadlineError extends Error {
  constructor() { super("Credential verification response deadline exceeded."); }
}

interface Flight<T> {
  scope: string;
  current: boolean;
  startedAt: number;
  waiters: number;
  promise: Promise<T>;
}

/** Bounds distinct underlying fills and callers, including timed-out work. */
export function createBoundedSingleFlight<T>(options: {
  maxFills: number;
  maxWaitersPerFill: number;
  responseMs: number;
  now?: () => number;
}) {
  if (![options.maxFills, options.maxWaitersPerFill].every(value => Number.isSafeInteger(value) && value > 0) ||
    !Number.isFinite(options.responseMs) || options.responseMs <= 0) throw new Error("Invalid single-flight budgets.");
  const now = options.now ?? (() => performance.now());
  const flights = new Map<string, Flight<T>>();
  return {
    invalidate(scope?: string) {
      for (const flight of flights.values()) if (scope === undefined || flight.scope === scope) flight.current = false;
    },
    snapshot() {
      return { activeFills: flights.size, waitingCallers: [...flights.values()].reduce((sum, flight) => sum + flight.waiters, 0) };
    },
    async run(key: string, scope: string, work: (isCurrent: () => boolean) => Promise<T>): Promise<T> {
      let flight = flights.get(key);
      if (!flight) {
        if (flights.size >= options.maxFills) throw new SingleFlightCapacityError();
        const state: Flight<T> = { scope, current: true, startedAt: now(), waiters: 0, promise: Promise.resolve(undefined as T) };
        flights.set(key, state);
        state.promise = Promise.resolve().then(() => work(() => state.current && now() - state.startedAt < options.responseMs))
          .finally(() => { if (flights.get(key) === state) flights.delete(key); });
        // A caller timeout must leave the slot occupied until real settlement.
        void state.promise.catch(() => undefined);
        flight = state;
      }
      if (flight.waiters >= options.maxWaitersPerFill) throw new SingleFlightCapacityError();
      const remaining = options.responseMs - (now() - flight.startedAt);
      if (remaining <= 0) throw new SingleFlightDeadlineError();
      flight.waiters++;
      let timer!: ReturnType<typeof setTimeout>;
      try {
        const value = await Promise.race([
          flight.promise,
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new SingleFlightDeadlineError()), remaining); }),
        ]);
        if (now() - flight.startedAt >= options.responseMs) throw new SingleFlightDeadlineError();
        return value;
      } finally { clearTimeout(timer); flight.waiters--; }
    },
  };
}
