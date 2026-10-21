import { AsyncLocalStorage } from "node:async_hooks";

export class TelemetryExecutionFailure extends Error {
  constructor(message: string, public readonly uncertainCommit: boolean, public readonly cause?: unknown) { super(message); }
}
export class ExecutionDeadlineError extends TelemetryExecutionFailure {
  constructor(public readonly stage: string, uncertainCommit: boolean) {
    super(`Telemetry ${stage} budget exceeded.`, uncertainCommit);
  }
}

const context = new AsyncLocalStorage<ExecutionDeadline>();
export function currentExecutionDeadline() { return context.getStore(); }

/** Caller expiry never resolves/rejects the dispatched dependency's promise. */
export class ExecutionDeadline {
  private expired: ExecutionDeadlineError | null = null;
  private writeDispatched = false;
  private activeDependency: { stage: string; expiresAt: number } | null = null;
  private readonly responseAt: number;
  private readonly responseTimer: ReturnType<typeof setTimeout>;
  private readonly expiry: Promise<never>;
  private rejectExpiry!: (error: ExecutionDeadlineError) => void;

  constructor(readonly responseMs = 8_000, readonly dependencyMs = 5_000,
    private readonly now: () => number = () => performance.now()) {
    if (![responseMs, dependencyMs].every(value => Number.isFinite(value) && value > 0)) throw Error("Invalid execution deadlines.");
    this.responseAt = now() + responseMs;
    this.expiry = new Promise<never>((_done, reject) => { this.rejectExpiry = reject; });
    void this.expiry.catch(() => {});
    this.responseTimer = setTimeout(() => this.expire("response"), responseMs);
  }

  private expire(stage: string) {
    if (!this.expired) {
      this.expired = new ExecutionDeadlineError(stage, this.writeDispatched);
      this.rejectExpiry(this.expired);
    }
    return this.expired;
  }

  assert() {
    if (this.now() >= this.responseAt) this.expire("response");
    if (this.activeDependency && this.now() >= this.activeDependency.expiresAt) this.expire(this.activeDependency.stage);
    if (this.expired) throw this.expired;
  }
  isActive() { try { this.assert(); return true; } catch { return false; } }
  markWriteDispatched() { this.assert(); this.writeDispatched = true; }
  hasUncertainCommit() { return this.writeDispatched; }
  run<T>(work: () => Promise<T>) { return context.run(this, work); }

  async dependency<T>(stage: string, work: () => Promise<T>): Promise<T> {
    this.assert();
    const expiresAt = Math.min(this.responseAt, this.now() + this.dependencyMs);
    const previous = this.activeDependency;
    const current = { stage, expiresAt };
    this.activeDependency = current;
    const timer = setTimeout(() => this.expire(stage), Math.max(0, expiresAt - this.now()));
    try {
      // Await the real operation. Only waitForResponse races caller expiry.
      const value = await work();
      if (this.now() >= expiresAt) this.expire(stage);
      this.assert(); return value;
    } finally {
      clearTimeout(timer);
      if (this.activeDependency === current) this.activeDependency = previous;
    }
  }

  async waitForResponse<T>(operation: Promise<T>): Promise<T> {
    try {
      const value = await Promise.race([operation, this.expiry]);
      this.assert(); return value;
    } finally { clearTimeout(this.responseTimer); }
  }
  dispose() { clearTimeout(this.responseTimer); }
}
