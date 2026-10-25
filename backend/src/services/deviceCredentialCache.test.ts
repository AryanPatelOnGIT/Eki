import { expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(),
  reads: [] as string[],
}));
vi.mock("../lib/firebaseAdmin", () => ({
  db: { collection: (name: string) => ({ doc: (id: string) => ({ get: async () => {
    harness.reads.push(`${name}/${id}`);
    const data = harness.documents.get(`${name}/${id}`);
    return { exists: data !== undefined, data: () => data };
  } }) }) },
  rtdb: { ref: () => ({ on() {}, off() {} }) },
}));
// Cheap KDF parameters keep a 1,000-request flood fast; verification logic is unchanged.
vi.mock("node:crypto", async importOriginal => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, scrypt: (secret: string, salt: string, length: number, callback: (error: Error | null, key: Buffer) => void) =>
    actual.scrypt(secret, salt, length, { N: 16 }, callback) };
});
import { checkDeviceCredentials, hashDeviceSecret } from "./deviceTelemetryService";

it("does not let unauthenticated device-ID floods evict a verified device credential", async () => {
  const secret = "legitimate-device-secret-with-entropy";
  harness.documents.set("devices/device_1", { busId: "bus_1", routeId: "route_1", secretHash: await hashDeviceSecret(secret) });
  harness.documents.set("buses/bus_1", { assignedRoutes: ["route_1"] });
  harness.documents.set("routes/route_1", {});
  const now = Date.now();
  await expect(checkDeviceCredentials("device_1", secret, now)).resolves.toMatchObject({ status: "assigned" });

  for (let index = 0; index < 1_000; index += 1) {
    await expect(checkDeviceCredentials(`guess_${index}`, "x".repeat(24), now + 1))
      .resolves.toEqual({ status: "invalid" });
  }

  harness.reads.length = 0;
  await expect(checkDeviceCredentials("device_1", secret, now + 2)).resolves.toMatchObject({ status: "assigned" });
  expect(harness.reads).toEqual([]);
}, 30_000);
