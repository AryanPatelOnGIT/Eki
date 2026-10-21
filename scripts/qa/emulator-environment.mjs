// firebase-tools synthesizes this demo-only configuration in emulators:exec.
// Validate its exact shape, then remove it before any SDK can select its URLs.
// The outer launcher still rejects every inherited FIREBASE_CONFIG.
export function removeGeneratedDemoConfig(env) {
  if (!env.FIREBASE_CONFIG) return false;
  let config;
  try { config = JSON.parse(env.FIREBASE_CONFIG); } catch { throw new Error('Unexpected emulator-generated Firebase configuration'); }
  const expected = { projectId: 'demo-eki-qa', storageBucket: 'demo-eki-qa.appspot.com', databaseURL: 'https://demo-eki-qa.firebaseio.com' };
  if (env.GCLOUD_PROJECT !== expected.projectId || !config ||
    Object.keys(config).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, value]) => config[key] !== value)) {
    throw new Error('Unexpected emulator-generated Firebase configuration');
  }
  delete env.FIREBASE_CONFIG;
  return true;
}
