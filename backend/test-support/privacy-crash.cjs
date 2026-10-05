// Disposable process with real emulator writes and synthetic Auth only.
const { Firestore } = require("firebase-admin/firestore");
const Module = require("node:module");
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (process.env.FIREBASE_RULES_TEST !== "1" || !/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host ?? "")) throw Error("Loopback emulator required");
const firestore = new Firestore({ projectId: "eki-privacy-test", host, ssl: false });
const path = require.resolve("../src/lib/firebaseAdmin.ts");
const replacement = new Module(path);
replacement.exports = { db: firestore, auth: { getUser: async () => ({ customClaims: {}, metadata: { creationTime: "2026-01-01" } }), deleteUser: async () => {
  process.send({ dispatched: true }); return new Promise(() => {});
} } };
replacement.loaded = true; require.cache[path] = replacement;
require("../src/services/privacyDeletionWorker.ts").runPrivacyDeletionQueue().catch(error => { console.error(error); process.exitCode = 1; });
