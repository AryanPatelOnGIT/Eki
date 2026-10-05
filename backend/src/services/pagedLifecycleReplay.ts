/** Recover from durable/current sources without retaining rejected event bodies. */
export function createPagedLifecycleReplay<T>(options: {
  readPage: (cursor: string | null, limit: number) => Promise<{ items: T[]; nextCursor: string | null }>;
  admit: (item: T) => Promise<boolean> | boolean;
  hasCapacity: () => boolean;
  onError: (error: unknown) => void;
}) {
  const pageSize = 25;
  let requested = false; let again = false; let stopped = false;
  let cursor: string | null = null;
  let inFlight: Promise<void> | null = null;
  let scanned = 0; let failures = 0;
  const report = (error: unknown) => { failures++; try { options.onError(error); } catch { /* Keep recovery discoverable. */ } };
  return {
    request() { if (requested) again = true; else requested = true; },
    tick(): Promise<void> {
      if (stopped || !requested || inFlight || !options.hasCapacity()) return inFlight ?? Promise.resolve();
      const running = (async () => {
        const page = await options.readPage(cursor, pageSize);
        if (stopped) return;
        if (page.items.length > pageSize) throw new Error("Lifecycle replay page exceeded its bound.");
        for (const item of page.items) {
          if (stopped) return;
          if (!options.hasCapacity()) { again = true; break; }
          scanned++;
          try { if (!(await options.admit(item))) again = true; }
          catch (error) { again = true; report(error); }
        }
        cursor = page.nextCursor;
        if (cursor === null) { requested = again; again = false; }
      })().catch(report).finally(() => { if (inFlight === running) inFlight = null; });
      inFlight = running; return running;
    },
    stop() { stopped = true; },
    pending() { return inFlight; },
    snapshot() { return { requested, inFlight: inFlight !== null, scanned, failures, pageSize }; },
  };
}
