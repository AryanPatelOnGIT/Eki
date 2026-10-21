/** Validate the running hub, then retain only our fixed expected topology. */
export function verifiedEmulatorTargets(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Emulator target mismatch');
  if (input.firestore?.host !== '127.0.0.1' || input.firestore?.port !== 8085 ||
      input.database?.host !== '127.0.0.1' || input.database?.port !== 9005 ||
      input.auth?.host !== '127.0.0.1' || input.auth?.port !== 9095) throw Error('Emulator target mismatch');
  return { firestore: { host: '127.0.0.1', port: 8085 }, database: { host: '127.0.0.1', port: 9005 },
    auth: { host: '127.0.0.1', port: 9095 } };
}

/** Report known status categories without retaining an arbitrary response value. */
export function observedAuthorizationStatus(status) {
  switch (status) {
    case 401: return 401;
    case 403: return 403;
    default: return null;
  }
}
