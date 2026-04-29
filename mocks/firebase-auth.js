import { vi } from 'vitest';

export const firebaseAuthMock = {
  auth: {
    currentUser: null,
    name: '[DEFAULT]',
  },
  authStateCallback: null,
  unsubscribe: vi.fn(),
  reset() {
    this.auth.currentUser = null;
    this.authStateCallback = null;
    this.unsubscribe = vi.fn();
    onAuthStateChanged.mockClear();
    signInWithEmailAndPassword.mockReset();
    signInWithCustomToken.mockReset();
    signInWithPopup.mockReset();
    signOut.mockReset();
    GoogleAuthProvider.mockClear();
  },
};

export const onAuthStateChanged = vi.fn((_auth, callback) => {
  firebaseAuthMock.authStateCallback = callback;
  return firebaseAuthMock.unsubscribe;
});

export const signInWithEmailAndPassword = vi.fn();
export const signInWithCustomToken = vi.fn();
export const signInWithPopup = vi.fn();
export const signOut = vi.fn();

export const GoogleAuthProvider = vi.fn(function GoogleAuthProvider() {
  this.addScope = vi.fn();
  this.setCustomParameters = vi.fn();
});
