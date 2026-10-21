/** Synthetic stalled-dependency acceptance; no Firebase or provider calls.
 * Run: npm run build --workspace=backend; node --expose-gc scripts/benchmark-work-admission.mjs
 */
import assert from "node:assert/strict";
import { BoundedKeyedExecutor } from "../backend/dist/lib/boundedKeyedExecutor.js";
import { createLatestPendingScheduler } from "../backend/dist/lib/latestPendingScheduler.js";
import { createConcurrencyLimiter } from "../backend/dist/lib/concurrency.js";
import { SerializedChangeWriter } from "../backend/dist/services/serializedChangeWriter.js";

async function main() {
  if (!global.gc) throw Error("Run with --expose-gc to measure retained heap.");
  let release;
  const stall = new Promise(done => { release = done; });
  const kdf = createConcurrencyLimiter(4);
  const writer = new SerializedChangeWriter(1);
  const matcher = createLatestPendingScheduler(async () => stall, () => {});
  const rounds = [];
  for (let round = 0; round < 5; round++) {
    for (let chunk = 0; chunk < 50; chunk++) {
      for (let i = 0; i < 1_000; i++) {
        const key = `${round}-${chunk}-${i}`;
        void kdf.run(async () => stall).catch(() => {});
        void writer.enqueue(key, null, async () => stall).catch(() => {});
        matcher.schedule(key, i);
      }
      await new Promise(done => setImmediate(done));
    }
    global.gc();
    const memory = process.memoryUsage();
    assert(kdf.snapshot().active <= 4 && kdf.snapshot().pending <= 32);
    assert(writer.snapshot().active <= 8 && writer.snapshot().pending <= 256 && writer.snapshot().keys <= 264);
    assert(matcher.snapshot().activeWorkers <= 8 && matcher.snapshot().pendingKeys <= 264);
    rounds.push({ submissions: (round + 1) * 50_000, heapBytes: memory.heapUsed, rssBytes: memory.rss,
      kdf: kdf.snapshot(), writer: writer.snapshot(), matcher: matcher.snapshot() });
  }
  const retainedHeapGrowth = rounds.at(-1).heapBytes - rounds[0].heapBytes;
  assert(retainedHeapGrowth < 4 * 1024 * 1024, `Unexpected retained-heap growth: ${retainedHeapGrowth}`);
  release(); await Promise.allSettled([...writer.pending()]); await matcher.drain();
  // Verify admission reopens without waiting for a response timeout to free an orphan.
  assert.equal(await kdf.run(async () => "recovered"), "recovered");
  assert.equal(await writer.enqueue("fresh", null, async () => "recovered"), "recovered");
  const order = []; const ordered = new BoundedKeyedExecutor();
  await Promise.all(Array.from({ length: 30 }, (_, i) => ordered.run("one", async () => { order.push(i); })));
  assert.deepEqual(order, Array.from({ length: 30 }, (_, i) => i));
  console.log(JSON.stringify({ node: process.version, scope: "synthetic production helpers; stalled dependency; no live fleet load", rounds,
    retainedHeapGrowth, recovered: { kdf: kdf.snapshot(), writer: writer.snapshot(), matcher: matcher.snapshot() }, fifo: true }, null, 2));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

