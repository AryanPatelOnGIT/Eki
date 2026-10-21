export type StoreStatus = "connected" | "disconnected";

export interface HealthSnapshot {
  ready: boolean;
  firestore: StoreStatus;
  rtdb: StoreStatus;
  checkedAt: string | null;
}

export interface HealthState {
  probe: (firestoreProbe: () => Promise<unknown>, rtdbProbe: () => Promise<unknown>) => Promise<void>;
  snapshot: () => HealthSnapshot;
}

interface StoreProbe {
  ready: boolean;
  completedAt: number | null;
  // A response timeout cannot cancel a Firebase promise. Keep its slot until
  // it actually settles so a stalled dependency never accumulates probes.
  flight: Promise<unknown> | null;
}

/** Cached readiness; HTTP reads never dispatch dependency work. */
export function createHealthState(options: {
  timeoutMs?: number;
  freshnessMs?: number;
  now?: () => number;
} = {}): HealthState {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const freshnessMs = options.freshnessMs ?? 65_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(freshnessMs) || freshnessMs <= 0) {
    throw new Error("Health probe budgets must be positive finite milliseconds.");
  }
  const now = options.now ?? (() => performance.now());
  const firestore: StoreProbe = { ready: false, completedAt: null, flight: null };
  const rtdb: StoreProbe = { ready: false, completedAt: null, flight: null };
  let checkedAt: string | null = null;
  let cycle: Promise<void> | null = null;

  const check = async (state: StoreProbe, probe: () => Promise<unknown>, validate: (value: unknown) => boolean) => {
    if (state.flight) { state.ready = false; return; }
    const startedAt = now();
    const flight = Promise.resolve().then(probe);
    state.flight = flight;
    void flight.then(
      () => { if (state.flight === flight) state.flight = null; },
      () => { if (state.flight === flight) state.flight = null; },
    );
    let timer!: ReturnType<typeof setTimeout>;
    try {
      const value = await Promise.race([
        flight,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("Health probe deadline exceeded.")), timeoutMs);
        }),
      ]);
      state.ready = now() - startedAt < timeoutMs && validate(value);
    } catch { state.ready = false; }
    finally {
      clearTimeout(timer);
      state.completedAt = now();
    }
  };
  const connected = (state: StoreProbe) => state.ready && state.completedAt !== null &&
    now() - state.completedAt >= 0 && now() - state.completedAt < freshnessMs;

  return {
    probe(firestoreProbe, rtdbProbe) {
      if (cycle) return cycle;
      cycle = Promise.all([
        check(firestore, firestoreProbe, () => true),
        check(rtdb, rtdbProbe, value => {
          const snapshot = value as { val?: () => unknown } | null;
          return typeof snapshot?.val === "function" && snapshot.val() === true;
        }),
      ]).then(() => { checkedAt = new Date().toISOString(); }).finally(() => { cycle = null; });
      return cycle;
    },
    snapshot() {
      const firestoreReady = connected(firestore);
      const rtdbReady = connected(rtdb);
      return {
        ready: firestoreReady && rtdbReady,
        firestore: firestoreReady ? "connected" : "disconnected",
        rtdb: rtdbReady ? "connected" : "disconnected",
        checkedAt,
      };
    },
  };
}
