// Stand-in for src/lib/firebase.ts in tests/clientSync.e2e.mjs: the same exports, connected to the emulators.
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
export { signInWithEmailAndPassword } from 'firebase/auth';
export { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, writeBatch, deleteDoc, onSnapshot } from 'firebase/firestore';

export const app = initializeApp({ projectId: 'frilensa-e2e', apiKey: 'fake-key' });
export const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
export const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8085);
