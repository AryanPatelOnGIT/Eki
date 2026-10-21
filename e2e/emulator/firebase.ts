import { initializeApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence, browserPopupRedirectResolver, connectAuthEmulator, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';

export const firebaseApp = initializeApp({ apiKey: 'synthetic-emulator-key', projectId: 'demo-eki-qa',
  appId: 'synthetic-emulator-app', authDomain: '127.0.0.1', databaseURL: 'http://127.0.0.1:9005/?ns=demo-eki-qa-default-rtdb' });
export const auth = initializeAuth(firebaseApp, { persistence: browserLocalPersistence, popupRedirectResolver: browserPopupRedirectResolver });
connectAuthEmulator(auth, 'http://127.0.0.1:9095', { disableWarnings: true });
export const googleProvider = new GoogleAuthProvider();
export const db = initializeFirestore(firebaseApp, { experimentalForceLongPolling: true });
connectFirestoreEmulator(db, '127.0.0.1', 8085);
export const rtdb = getDatabase(firebaseApp); connectDatabaseEmulator(rtdb, '127.0.0.1', 9005);
