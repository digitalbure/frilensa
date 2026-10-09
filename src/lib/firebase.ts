import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  signOut,
  onAuthStateChanged,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  applyActionCode,
  reload,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocFromServer,
  getDocs, 
  query, 
  where, 
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  initializeFirestore,
  type Firestore
} from 'firebase/firestore';
import 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App safely
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firebase Analytics safely if supported by current browser environment
export let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  isSupported().then(supported => {
    if (supported) {
      try {
        analytics = getAnalytics(app);
      } catch (err) {
        console.warn('Firebase Analytics initialization notice:', err);
      }
    }
  }).catch(() => {});
}

// Initialize Firebase services
export const auth = getAuth(app);

// Safe initialization of Firestore with multi-tier fallbacks and undefined property safety
function initFirestoreInstance(): Firestore {
  const dbId = (firebaseConfig as any).firestoreDatabaseId;

  // Tier 1: initializeFirestore with ignoreUndefinedProperties: true (crucial for object/document writes)
  try {
    if (dbId && dbId !== '(default)') {
      return initializeFirestore(app, {
        ignoreUndefinedProperties: true,
      }, dbId);
    }
    return initializeFirestore(app, {
      ignoreUndefinedProperties: true,
    });
  } catch (err1: any) {
    console.warn('Primary initializeFirestore with ignoreUndefinedProperties failed:', err1);
  }

  // Tier 2: initializeFirestore with experimentalForceLongPolling and ignoreUndefinedProperties
  try {
    if (dbId && dbId !== '(default)') {
      return initializeFirestore(app, {
        experimentalForceLongPolling: true,
        ignoreUndefinedProperties: true,
      }, dbId);
    }
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      ignoreUndefinedProperties: true,
    });
  } catch (err2: any) {
    console.warn('Long polling initializeFirestore failed:', err2);
  }

  // Tier 3: Standard getFirestore with custom or default db
  try {
    if (dbId && dbId !== '(default)') {
      return getFirestore(app, dbId);
    }
    return getFirestore(app);
  } catch (err3: any) {
    console.warn('getFirestore fallback failed:', err3);
    return getFirestore(app);
  }
}

export const db: Firestore = initFirestoreInstance();
export const googleProvider = new GoogleAuthProvider();

// Error handling types and helper as specified in the Firebase Skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Error Context: ', JSON.stringify(errInfo));
  return errInfo;
}

// Google Sign-In helper
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.warn("Popup blocked or failed, attempting redirect: ", error);
    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (redirectError) {
      console.error("Redirect sign-in failed: ", redirectError);
      throw redirectError;
    }
  }
};

/**
 * Sends a Firebase Auth verification email to the currently signed-in user.
 */
export const sendUserVerificationEmail = async (targetUser?: User | null) => {
  const user = targetUser || auth.currentUser;
  if (!user) {
    throw new Error('No user is currently signed in to send verification email.');
  }
  await sendEmailVerification(user, {
    url: window.location.origin,
    handleCodeInApp: true,
  });
  return true;
};

/**
 * Checks if the current Firebase user has completed email verification.
 * Reloads the user auth token first to obtain the latest status from Firebase servers.
 */
export const checkEmailVerificationStatus = async (targetUser?: User | null): Promise<boolean> => {
  const user = targetUser || auth.currentUser;
  if (!user) return false;
  try {
    await reload(user);
    return Boolean(auth.currentUser?.emailVerified);
  } catch (err) {
    console.error('Error reloading user auth state:', err);
    return Boolean(user.emailVerified);
  }
};

/**
 * Completes email verification if the user visits via an action code URL (e.g. ?mode=verifyEmail&oobCode=...).
 */
export const verifyEmailActionCode = async (oobCode: string): Promise<boolean> => {
  try {
    await applyActionCode(auth, oobCode);
    if (auth.currentUser) {
      await reload(auth.currentUser);
    }
    return true;
  } catch (error) {
    console.error('Error applying email action code:', error);
    throw error;
  }
};

/**
 * Sends a password reset email to the specified user email address.
 */
export const sendUserPasswordResetEmail = async (emailAddress: string): Promise<boolean> => {
  if (!emailAddress) {
    throw new Error('Please provide an email address to send password reset instructions.');
  }
  await sendPasswordResetEmail(auth, emailAddress, {
    url: window.location.origin,
    handleCodeInApp: true,
  });
  return true;
};

export { 
  signOut, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  applyActionCode,
  reload,
  updateProfile,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  getDocs,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch
};
export type { User };

