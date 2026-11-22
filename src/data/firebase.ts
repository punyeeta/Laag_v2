// Firebase setup (Phase 3). The persistent local cache keeps an offline copy
// on each device, so the app opens and works with no signal (NFR-01).
import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  deleteUser,
  getAuth,
  reauthenticateWithPopup,
  linkWithPopup,
  signInAnonymously,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

export const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  // Optional fields left undefined are simply not written.
  ignoreUndefinedProperties: true,
});

const google = new GoogleAuthProvider();

/**
 * Organizers sign in with Google. Someone who joined from a link (anonymous)
 * keeps the same uid when they link Google, so their trips stay theirs.
 */
export async function signInWithGoogle() {
  const u = auth.currentUser;
  try {
    if (u?.isAnonymous) {
      try {
        await linkWithPopup(u, google);
        await u.reload();
        return;
      } catch (e) {
        // That Google account already has a Laag account: switch to it.
        if ((e as { code?: string }).code !== 'auth/credential-already-in-use') throw e;
      }
    }
    await signInWithPopup(auth, google);
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/popup-blocked') await signInWithRedirect(auth, google);
    else throw e;
  }
}

/** Deleting a sign-in needs a recent login; ask Google again if it's been a while. */
export async function deleteSignIn() {
  const u = auth.currentUser;
  if (!u) return;
  try {
    await deleteUser(u);
  } catch (e) {
    if ((e as { code?: string }).code !== 'auth/requires-recent-login') throw e;
    await reauthenticateWithPopup(u, google);
    await deleteUser(u);
  }
}

export const signInGuest = () => signInAnonymously(auth);
export const signOutUser = () => signOut(auth);
