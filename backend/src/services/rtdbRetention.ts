import { createHash } from "node:crypto";

export const RTDB_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
// A stalled publisher must expire before historical versions can be collected.
export const GEOMETRY_PUBLICATION_GRACE_MS = 24 * 60 * 60 * 1000;
const MIN_TIMESTAMP = Date.UTC(2000, 0, 1);
const TIME_FIELDS = new Set(["timestamp", "createdAt", "updatedAt", "sentAt", "endTime", "completedAt"]);

export interface RetentionEntry { key: string; value: unknown }
export interface RtdbRetentionStore {
  entries(path: string): AsyncIterable<RetentionEntry>;
  read(path: string): Promise<unknown>;
  observe(path: string, fingerprint: string, now: number, dryRun: boolean): Promise<number>;
  removeIfUnchanged(path: string, fingerprint: string): Promise<boolean>;
  forget(path: string): Promise<void>;
  cleanOrphans(dryRun: boolean): Promise<void>;
}

export function retentionFingerprint(value: unknown): string {
  // RTDB object key enumeration is stable for a snapshot and a transaction.
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object") return Object.fromEntries(
      Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]),
    );
    return item;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value)) ?? "null").digest("hex");
}

function timestamp(value: unknown): number | null {
  if (typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value)) value = Date.parse(value);
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // Old clients used both seconds and milliseconds since epoch.
  const millis = value < 100_000_000_000 ? value * 1000 : value;
  return Number.isSafeInteger(millis) && millis >= MIN_TIMESTAMP ? millis : null;
}

/** Latest known activity; malformed/unbounded records fail closed. */
export function newestRecordTimestamp(value: unknown): number | null {
  let newest: number | null = null;
  let visited = 0;
  const visit = (item: unknown, depth: number): void => {
    if (++visited > 100_000 || depth > 32) throw new Error("RTDB record exceeds inventory bounds");
    if (!item || typeof item !== "object") return;
    for (const [key, entry] of Object.entries(item)) {
      if (TIME_FIELDS.has(key)) {
        const time = timestamp(entry);
        if (time !== null) newest = Math.max(newest ?? 0, time);
      }
      if (entry && typeof entry === "object") visit(entry, depth + 1);
    }
  };
  visit(value, 0);
  return newest;
}

export function geometryPublicationIsFresh(createdAt: number, now = Date.now()): boolean {
  return Number.isSafeInteger(createdAt) && now >= createdAt && now - createdAt < GEOMETRY_PUBLICATION_GRACE_MS;
}

export interface RtdbRetentionSummary {
  dryRun: boolean;
  scanned: number;
  candidates: number;
  deleted: number;
  currentGeometry: number;
  geometryGrace: number;
  quarantined: number;
  changedDuringDeletion: number;
  skippedMalformed: number;
  legacyEnabled: boolean;
}

/** No identifiers, geometry, coordinates, profiles or message text in results. */
export async function runRtdbRetentionSweep(
  store: RtdbRetentionStore,
  { now = Date.now(), dryRun = true, legacyRetired = false } = {},
): Promise<RtdbRetentionSummary> {
  const result: RtdbRetentionSummary = { dryRun, scanned: 0, candidates: 0, deleted: 0, currentGeometry: 0, geometryGrace: 0, quarantined: 0, changedDuringDeletion: 0, skippedMalformed: 0, legacyEnabled: legacyRetired };
  const cutoff = now - RTDB_RETENTION_MS;
  const inspect = async (path: string, value: unknown, knownTime: number | null, geometry = false): Promise<void> => {
    result.scanned += 1;
    const fingerprint = retentionFingerprint(value);
    // Undated or changed legacy data receives a full 180-day observation window.
    const firstSeen = await store.observe(path, geometry ? `unreferenced:${fingerprint}` : fingerprint, now, dryRun);
    const age = knownTime ?? firstSeen;
    if (knownTime === null) result.quarantined += 1;
    if (age >= cutoff || !Number.isSafeInteger(age) || age < MIN_TIMESTAMP) return;
    if (geometry && now - firstSeen < GEOMETRY_PUBLICATION_GRACE_MS) { result.geometryGrace += 1; return; }
    result.candidates += 1;
    if (dryRun) return;
    if (await store.removeIfUnchanged(path, fingerprint)) {
      result.deleted += 1;
      await store.forget(path);
    } else result.changedDuringDeletion += 1;
  };
  if (legacyRetired) {
    for (const root of ["users", "messages"]) {
      for await (const entry of store.entries(root)) {
        let lastActivity: number | null;
        try { lastActivity = newestRecordTimestamp(entry.value); }
        catch { result.skippedMalformed += 1; continue; }
        await inspect(`${root}/${entry.key}`, entry.value, lastActivity);
      }
    }
  }
  for await (const node of store.entries("activeRouteGeometry")) {
    // Only backend publishers can change pointers. They always allocate a new
    // version and expire after one day; an aged candidate can never become a
    // new pointer after this read. Retain the pointer regardless of ride state.
    const live = await store.read(`activeBuses/${node.key}`) as { routeVersion?: unknown } | null;
    if (!node.value || typeof node.value !== "object") continue;
    for (const [key, value] of Object.entries(node.value)) {
      const entry = { key, value };
      if (String(live?.routeVersion) === entry.key) {
        result.currentGeometry += 1;
        await store.observe(`activeRouteGeometry/${node.key}/${entry.key}`, `referenced:${retentionFingerprint(entry.value)}`, now, dryRun);
        continue;
      }
      const record = entry.value as { createdAt?: unknown } | null;
      const createdAt = timestamp(record?.createdAt) ?? timestamp(Number(entry.key));
      await inspect(`activeRouteGeometry/${node.key}/${entry.key}`, entry.value, createdAt, true);
    }
  }
  await store.cleanOrphans(dryRun);
  return result;
}
