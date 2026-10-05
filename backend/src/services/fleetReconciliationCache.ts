export class FleetReconciliationCache {
  private readonly mirrorLoads = new Map<string, Promise<unknown>>();
  private readonly routeLoads = new Map<string, Promise<string[]>>();

  constructor(
    private readonly mirrors: Record<string, unknown>,
    private readonly loadRoutes: (busId: string) => Promise<string[]>,
    private readonly loadMirror?: (driverId: string) => Promise<unknown>,
  ) {}

  async mirrorFor(driverId: string): Promise<unknown> {
    if (Object.prototype.hasOwnProperty.call(this.mirrors, driverId)) return this.mirrors[driverId];
    const existing = this.mirrorLoads.get(driverId); if (existing) return existing;
    const load = (this.loadMirror?.(driverId) ?? Promise.resolve(null)).then(value => {
      if (this.mirrorLoads.get(driverId) === load) { this.mirrorLoads.delete(driverId); this.mirrors[driverId] = value; }
      return value;
    }, error => { if (this.mirrorLoads.get(driverId) === load) this.mirrorLoads.delete(driverId); throw error; });
    this.mirrorLoads.set(driverId, load); return load;
  }

  setMirror(driverId: string, value: unknown): void {
    this.mirrorLoads.delete(driverId);
    this.mirrors[driverId] = value;
  }

  routesForBus(busId: string): Promise<string[]> {
    const existing = this.routeLoads.get(busId);
    if (existing) return existing;
    const load = this.loadRoutes(busId).catch((error) => {
      this.routeLoads.delete(busId);
      throw error;
    });
    this.routeLoads.set(busId, load);
    return load;
  }
}
