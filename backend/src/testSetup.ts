// Keep pure unit tests independent of a developer .env file and production
// Firebase configuration. Emulator tests provide their own host separately.
import { assertEmulatorEnvironment } from "./test-support/emulatorIsolation";
if (process.env.FIREBASE_RULES_TEST === "1") assertEmulatorEnvironment();
if (!process.env.FIREBASE_DATABASE_URL) {
  process.env.FIREBASE_DATABASE_URL = "https://eki-unit-test-default-rtdb.firebaseio.com";
}
