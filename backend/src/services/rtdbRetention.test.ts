import { describe, expect, it } from "vitest";
import { GEOMETRY_PUBLICATION_GRACE_MS, geometryPublicationIsFresh, newestRecordTimestamp, retentionFingerprint, RTDB_RETENTION_MS, runRtdbRetentionSweep, type RtdbRetentionStore } from "./rtdbRetention";

const NOW = Date.UTC(2026, 9, 3);
const OLD = NOW - RTDB_RETENTION_MS - 1;
function fixture(initial: Record<string, unknown>) {
  const records = new Map(Object.entries(initial));
  const inventory = new Map<string, { fingerprint: string; firstSeen: number }>();
  const writes: string[] = [];
  let failOnce = false;
  let changeBeforeDelete = false;
  const store: RtdbRetentionStore = {
    async *entries(root) {
      const groups = new Map<string, unknown>();
      for (const [path, value] of records) {
        if (!path.startsWith(`${root}/`)) continue;
        const suffix = path.slice(root.length + 1);
        const [key, ...rest] = suffix.split("/");
        if (!rest.length) groups.set(key, value);
        else groups.set(key, { ...(groups.get(key) as object ?? {}), [rest.join("/")]: value });
      }
      for (const [key, value] of groups) yield { key, value };
    },
    async read(path) { return records.get(path) ?? null; },
    async observe(path, fingerprint, now, dryRun) {
      const previous = inventory.get(path);
      const firstSeen = previous?.fingerprint === fingerprint ? previous.firstSeen : now;
      if (!dryRun) { inventory.set(path, { fingerprint, firstSeen }); writes.push(`observe:${path}`); }
      return firstSeen;
    },
    async removeIfUnchanged(path, fingerprint) {
      if (failOnce) { failOnce = false; throw new Error("interrupted transport"); }
      if (changeBeforeDelete) { records.set(path, { updatedAt: NOW }); changeBeforeDelete = false; }
      if (!records.has(path) || retentionFingerprint(records.get(path)) !== fingerprint) return false;
      records.delete(path); writes.push(`delete:${path}`); return true;
    },
    async forget(path) { inventory.delete(path); },
    async cleanOrphans(dryRun) { if (!dryRun) for (const path of inventory.keys()) if (!records.has(path)) inventory.delete(path); },
  };
  return { store, records, inventory, writes, fail() { failOnce = true; }, race() { changeBeforeDelete = true; } };
}
describe("180-day RTDB retirement", () => {
  it("dry-run scans without writing data or inventory", async () => {
    const f = fixture({ "messages/old": { timestamp: OLD, text: "synthetic" } });
    const result = await runRtdbRetentionSweep(f.store, { now: NOW, legacyRetired: true });
    expect(result).toMatchObject({ candidates: 1, deleted: 0, dryRun: true });
    expect(f.writes).toEqual([]); expect(f.inventory.size).toBe(0); expect(f.records.size).toBe(1);
  });
  it("protects legacy roots until consumers are explicitly retired", async () => {
    const f = fixture({ "users/old": { createdAt: OLD }, "messages/old": { timestamp: OLD } });
    expect((await runRtdbRetentionSweep(f.store, { now: NOW, dryRun: false })).scanned).toBe(0);
    expect(f.writes).toEqual([]); expect(f.records.size).toBe(2);
  });
  it("enforces strict cutoff and normalizes seconds and ISO timestamps", async () => {
    const f = fixture({ "messages/seconds": { timestamp: Math.floor(OLD / 1000) }, "messages/iso": { sentAt: new Date(OLD).toISOString() }, "messages/boundary": { timestamp: NOW - RTDB_RETENTION_MS }, "messages/future": { updatedAt: NOW + RTDB_RETENTION_MS } });
    expect((await runRtdbRetentionSweep(f.store, { now: NOW, dryRun: false, legacyRetired: true })).deleted).toBe(2);
    expect([...f.records.keys()]).toEqual(["messages/boundary", "messages/future"]);
  });
  it("quarantines undated records for a full observation window", async () => {
    const f = fixture({ "users/undated": { name: "synthetic" } });
    await runRtdbRetentionSweep(f.store, { now: NOW, dryRun: false, legacyRetired: true });
    expect((await runRtdbRetentionSweep(f.store, { now: NOW + RTDB_RETENTION_MS, dryRun: false, legacyRetired: true })).deleted).toBe(0);
    expect((await runRtdbRetentionSweep(f.store, { now: NOW + RTDB_RETENTION_MS + 1, dryRun: false, legacyRetired: true })).deleted).toBe(1);
  });
  it("restarts quarantine when an undated record changes", async () => {
    const f = fixture({ "users/undated": { name: "old" } });
    await runRtdbRetentionSweep(f.store, { now: NOW, dryRun: false, legacyRetired: true });
    f.records.set("users/undated", { name: "changed" });
    expect((await runRtdbRetentionSweep(f.store, { now: NOW + RTDB_RETENTION_MS + 1, dryRun: false, legacyRetired: true })).deleted).toBe(0);
  });
  it("never deletes the current pointer, even when its geometry is older than retention", async () => {
    const f = fixture({ "activeBuses/bus_route": { routeVersion: OLD }, [`activeRouteGeometry/bus_route/${OLD}`]: { polyline: "current", createdAt: OLD }, [`activeRouteGeometry/bus_route/${OLD - 1}`]: { polyline: "history", createdAt: OLD - 1 } });
    const result = await runRtdbRetentionSweep(f.store, { now: NOW, dryRun: false });
    expect(result).toMatchObject({ currentGeometry: 1, deleted: 0, geometryGrace: 1 });
    expect((await runRtdbRetentionSweep(f.store, { now: NOW + GEOMETRY_PUBLICATION_GRACE_MS, dryRun: false })).deleted).toBe(1);
    expect(f.records.has(`activeRouteGeometry/bus_route/${OLD}`)).toBe(true);
  });
  it("collects aged aborted publication and deleted-fleet geometry but retains reader/publication grace", async () => {
    const f = fixture({ [`activeRouteGeometry/deleted_bus/${OLD}`]: { polyline: "old" }, [`activeRouteGeometry/aborted_bus/${NOW - 60_000}`]: { polyline: "recent" } });
    expect((await runRtdbRetentionSweep(f.store, { now: NOW, dryRun: false })).deleted).toBe(0);
    expect((await runRtdbRetentionSweep(f.store, { now: NOW + GEOMETRY_PUBLICATION_GRACE_MS, dryRun: false })).deleted).toBe(1);
    expect(f.records.has(`activeRouteGeometry/aborted_bus/${NOW - 60_000}`)).toBe(true);
  });
  it("guards against replacement between inventory and deletion", async () => {
    const f = fixture({ "messages/old": { timestamp: OLD } }); f.race();
    const result = await runRtdbRetentionSweep(f.store, { now: NOW, dryRun: false, legacyRetired: true });
    expect(result).toMatchObject({ deleted: 0, changedDuringDeletion: 1 }); expect(f.records.size).toBe(1);
  });
  it("starts a new reader grace window after an aged current pointer is replaced", async () => {
    const path = `activeRouteGeometry/bus_route/${OLD}`;
    const f = fixture({ "activeBuses/bus_route": { routeVersion: OLD }, [path]: { createdAt: OLD } });
    await runRtdbRetentionSweep(f.store, { now: NOW, dryRun: false });
    f.records.set("activeBuses/bus_route", { routeVersion: NOW });
    expect((await runRtdbRetentionSweep(f.store, { now: NOW + 1, dryRun: false })).deleted).toBe(0);
    expect((await runRtdbRetentionSweep(f.store, { now: NOW + GEOMETRY_PUBLICATION_GRACE_MS + 1, dryRun: false })).deleted).toBe(1);
  });
  it("resumes safely after a partial transport failure and on a second replica", async () => {
    const f = fixture({ "messages/old": { timestamp: OLD } }); f.fail();
    await expect(runRtdbRetentionSweep(f.store, { now: NOW, dryRun: false, legacyRetired: true })).rejects.toThrow("interrupted transport");
    expect((await runRtdbRetentionSweep(f.store, { now: NOW, dryRun: false, legacyRetired: true })).deleted).toBe(1);
    expect((await runRtdbRetentionSweep(f.store, { now: NOW, dryRun: false, legacyRetired: true })).deleted).toBe(0);
    expect(f.inventory.size).toBe(0);
  });
  it("uses latest nested activity and fails closed for excessive nesting", () => {
    expect(newestRecordTimestamp({ first: { timestamp: OLD }, last: { sentAt: NOW } })).toBe(NOW);
    let value: object = {}; for (let i = 0; i < 35; i++) value = { child: value };
    expect(() => newestRecordTimestamp(value)).toThrow("inventory bounds");
  });
  it("retains a malformed record without blocking other eligible records", async () => {
    let value: object = {}; for (let i = 0; i < 35; i++) value = { child: value };
    const f = fixture({ "users/malformed": value, "users/aged": { createdAt: OLD } });
    expect(await runRtdbRetentionSweep(f.store, { now: NOW, dryRun: false, legacyRetired: true })).toMatchObject({ skippedMalformed: 1, deleted: 1 });
    expect(f.records.has("users/malformed")).toBe(true);
  });
  it("expires stalled publishers before an aged version can become a new pointer", () => {
    expect(geometryPublicationIsFresh(NOW, NOW + 60_000)).toBe(true);
    expect(geometryPublicationIsFresh(OLD, NOW)).toBe(false);
    expect(geometryPublicationIsFresh(NOW, NOW - 1)).toBe(false);
  });
  it("fingerprints ignore object field order", () => {
    expect(retentionFingerprint({ a: 1, b: { y: 2, x: 3 } })).toBe(retentionFingerprint({ b: { x: 3, y: 2 }, a: 1 }));
  });
});
