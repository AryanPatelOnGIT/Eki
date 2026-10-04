// Synthetic SDK adapter; actual useAuth and firebaseAppCheck remain under test.
export const firebaseApp = {};
const account = (uid: string) => ({ uid, email: `${uid}@example.test`, displayName: uid,
  photoURL: null, isAnonymous: false, getIdToken: async () => `token-${uid}`,
  getIdTokenResult: async () => ({ claims: { role: "admin", admin: true } }),
});
type User = ReturnType<typeof account>;
export const auth = { currentUser: account("qa-admin") as User | null };
export const googleProvider = {};
const observers = new Set<(user: User | null) => void>();
export function onAuthStateChanged(_auth: unknown, callback: (user: User | null) => void) {
  observers.add(callback); queueMicrotask(() => callback(auth.currentUser));
  return () => { observers.delete(callback); };
}
export const browserLocalPersistence = {};
export async function setPersistence() {}
export async function getRedirectResult() { return null; }
export async function signInWithPopup() {}
export async function signInWithRedirect() {}
export async function signOut() { auth.currentUser = null; observers.forEach(callback => callback(null)); }
export function switchAccount() { auth.currentUser = account("qa-second"); observers.forEach(callback => callback(auth.currentUser)); }
export function reverifyAccount() { observers.forEach(callback => callback(auth.currentUser)); }
export class ReCaptchaEnterpriseProvider {}
export class CustomProvider {}
export function initializeAppCheck() { return {}; }
let waiting = false;
const tokenObservers = new Set<() => void>();
export const tokenWaiting = () => waiting;
export function subscribeTokenWaiting(callback: () => void) { tokenObservers.add(callback); return () => { tokenObservers.delete(callback); }; }
function notifyWaiting(value: boolean) { waiting = value; tokenObservers.forEach(callback => callback()); }
let approve: ((result: { token: string }) => void) | undefined;
let deny: ((error: Error) => void) | undefined;
export function getToken() { return new Promise<{ token: string }>((resolve, reject) => { approve = resolve; deny = reject; notifyWaiting(true); }); }
export function approveVerification() { approve?.({ token: "synthetic-attestation" }); notifyWaiting(false); }
export function rejectVerification() { deny?.(new Error("Synthetic provider failure")); notifyWaiting(false); }
