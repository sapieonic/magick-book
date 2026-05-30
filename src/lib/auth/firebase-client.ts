"use client";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type Auth,
} from "firebase/auth";
import { firebaseClientConfig, isFirebaseClientConfigured } from "./config";

let app: FirebaseApp | null = null;

function getClientAuth(): Auth | null {
  if (!isFirebaseClientConfigured()) return null;
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseClientConfig);
  }
  return getAuth(app);
}

export type Provider = "google" | "microsoft";

export async function firebaseSignInWithProvider(provider: Provider): Promise<string> {
  const auth = getClientAuth();
  if (!auth) throw new Error("Firebase is not configured.");
  const p = provider === "google" ? new GoogleAuthProvider() : new OAuthProvider("microsoft.com");
  const cred = await signInWithPopup(auth, p);
  return cred.user.getIdToken();
}

export async function firebaseSignInWithEmail(email: string, password: string, isSignUp: boolean): Promise<string> {
  const auth = getClientAuth();
  if (!auth) throw new Error("Firebase is not configured.");
  const cred = isSignUp
    ? await createUserWithEmailAndPassword(auth, email, password)
    : await signInWithEmailAndPassword(auth, email, password);
  return cred.user.getIdToken();
}

/** Sign out of the Firebase client (e.g. after the server rejects the session). */
export async function firebaseSignOut(): Promise<void> {
  const auth = getClientAuth();
  if (auth) await signOut(auth).catch(() => {});
}
