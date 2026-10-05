// Emulator-only child used to verify recovery after a real process exit.
const { Firestore } = require("firebase-admin/firestore");
const Module = require("node:module");
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.FIREBASE_RULES_TEST !== "1" || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host ?? "")) throw Error("Loopback emulator required");
const firestore = new Firestore({ projectId: "eki-rules-test", host, ssl: false });
// Replace only this disposable child's Firebase module before loading the real service.
const modulePath = require.resolve("../src/lib/firebaseAdmin.ts");
const replacement = new Module(modulePath); replacement.exports = { db: firestore }; replacement.loaded = true;
require.cache[modulePath] = replacement;
const { submitOperation, OPERATION_EXECUTOR_ID } = require("../src/services/httpOperations.ts");
const id = process.argv[2];
submitOperation({ collection: "_fleet_reconciliation_jobs", id, payload: {}, budgetMs: 1000, adminUid: "emulator-admin",
  execute: async context => {
    await context.checkpoint({ phase: "authorizing", checked: 0, batchDriverIds: ["emulator-driver"] });
    await firestore.collection("_fleet_reconciliation_locks").doc("singleton").create({ owner: id, executorId: OPERATION_EXECUTOR_ID, operationId: id });
    await firestore.collection("_operation_recovery_test").doc(id).set({ effects: 1 });
    process.send({ id, executorId: OPERATION_EXECUTOR_ID });
    return new Promise(() => {}); // Parent kills this child after real durable writes.
  },
}).catch(error => { console.error(error); process.exitCode = 1; });
