import { AsyncLocalStorage } from "node:async_hooks";

export class WorkCapacityError extends Error {
  constructor() { super("Work admission capacity is temporarily exhausted."); }
}
export class WorkQueueExpired extends Error {
  constructor() { super("Undispatched work exceeded its queue deadline."); }
}
export interface ExecutionBudgets {
  maxConcurrent?: number;
  maxPending?: number;
  maxPendingPerKey?: number;
  maxQueueAgeMs?: number;
  now?: () => number;
}
interface Task {
  work: () => Promise<unknown>;
  enqueuedAt: number;
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
}
interface KeyState { active: Task | null; pending: Task[]; }

/** Bounded FIFO per key, with fair execution across keys and real-settlement permits. */
export class BoundedKeyedExecutor<K> {
  private readonly states = new Map<K, KeyState>();
  private readonly ready: K[] = [];
  private readonly readySet = new Set<K>();
  private active = 0;
  private waiting = 0;
  private rejected = 0;
  private expired = 0;
  private peakPending = 0;
  private readonly now: () => number;
  readonly maxConcurrent: number;
  readonly maxPending: number;
  readonly maxPendingPerKey: number;
  readonly maxQueueAgeMs: number;

  constructor(options: ExecutionBudgets = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 8;
    this.maxPending = options.maxPending ?? 256;
    this.maxPendingPerKey = options.maxPendingPerKey ?? 32;
    this.maxQueueAgeMs = options.maxQueueAgeMs ?? 5_000;
    this.now = options.now ?? (() => performance.now());
    if (![this.maxConcurrent, this.maxPendingPerKey].every(value => Number.isSafeInteger(value) && value > 0) ||
      !Number.isSafeInteger(this.maxPending) || this.maxPending < 0 ||
      !Number.isFinite(this.maxQueueAgeMs) || this.maxQueueAgeMs <= 0) throw new Error("Invalid execution budgets.");
  }

  /** Throws only on admission; accepted promises reject on expiry/failure. */
  run<T>(key: K, work: () => Promise<T>): Promise<T> {
    const existing = this.states.get(key);
    if (!this.canRun(key)) {
      this.rejected++;
      throw new WorkCapacityError();
    }
    const state = existing ?? { active: null, pending: [] };
    if (!existing) this.states.set(key, state);
    const runInContext = AsyncLocalStorage.snapshot();
    let resolve!: (value: unknown) => void; let reject!: (error: unknown) => void;
    const promise = new Promise<T>((done, fail) => { resolve = value => done(value as T); reject = fail; });
    const task: Task = { work: () => runInContext(work), enqueuedAt: this.now(), promise, resolve, reject, timer: null };
    state.pending.push(task); this.waiting++;
    task.timer = setTimeout(() => this.expire(key, state, task), this.maxQueueAgeMs);
    if (!state.active) this.markReady(key);
    this.pump();
    this.peakPending = Math.max(this.peakPending, this.waiting);
    return promise;
  }

  canRun(key: K): boolean {
    const state = this.states.get(key);
    const startsImmediately = !state?.active && !state?.pending.length && this.active < this.maxConcurrent;
    return (startsImmediately || this.waiting < this.maxPending) &&
      (state?.pending.length ?? 0) < this.maxPendingPerKey;
  }

  private markReady(key: K): void {
    if (!this.readySet.has(key)) { this.readySet.add(key); this.ready.push(key); }
  }

  private expire(key: K, state: KeyState, task: Task): void {
    const index = state.pending.indexOf(task);
    if (index < 0) return; // Dispatched work keeps its permit until true settlement.
    state.pending.splice(index, 1); this.waiting--; this.expired++;
    if (task.timer) clearTimeout(task.timer);
    task.reject(new WorkQueueExpired());
    if (!state.active && state.pending.length === 0) {
      this.states.delete(key); this.readySet.delete(key);
      const readyIndex = this.ready.indexOf(key);
      if (readyIndex >= 0) this.ready.splice(readyIndex, 1);
    }
  }

  private pump(): void {
    while (this.active < this.maxConcurrent && this.ready.length) {
      const key = this.ready.shift()!; this.readySet.delete(key);
      const state = this.states.get(key);
      if (!state || state.active) continue;
      const task = state.pending.shift();
      if (!task) { this.states.delete(key); continue; }
      this.waiting--; this.active++; state.active = task;
      if (task.timer) clearTimeout(task.timer);
      const complete = () => {
        state.active = null; this.active--;
        if (state.pending.length) this.markReady(key); else this.states.delete(key);
        this.pump();
      };
      void Promise.resolve().then(() => {
        if (this.now() - task.enqueuedAt >= this.maxQueueAgeMs) {
          this.expired++; throw new WorkQueueExpired();
        }
        return task.work();
      }).then(value => { complete(); task.resolve(value); }, error => { complete(); task.reject(error); });
    }
  }

  isDispatched(key: K, promise: Promise<unknown>): boolean {
    return this.states.get(key)?.active?.promise === promise;
  }

  /** Only replaceable callers may refresh the age when replacing the payload. */
  refreshPending(key: K, promise: Promise<unknown>): void {
    const state = this.states.get(key);
    const task = state?.pending.find(candidate => candidate.promise === promise);
    if (!state || !task) return;
    task.enqueuedAt = this.now();
    if (task.timer) clearTimeout(task.timer);
    task.timer = setTimeout(() => this.expire(key, state, task), this.maxQueueAgeMs);
  }

  snapshot() {
    return { active: this.active, pending: this.waiting, keys: this.states.size,
      rejected: this.rejected, expired: this.expired, peakPending: this.peakPending,
      maxConcurrent: this.maxConcurrent, maxPending: this.maxPending,
      maxPendingPerKey: this.maxPendingPerKey, maxQueueAgeMs: this.maxQueueAgeMs };
  }

  *pending(): Iterable<Promise<unknown>> {
    for (const state of this.states.values()) {
      if (state.active) yield state.active.promise;
      for (const task of state.pending) yield task.promise;
    }
  }
}
