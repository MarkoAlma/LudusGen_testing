import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ✅ Create a shared callback holder that can be updated
let sharedAuthStateCallback = null;
let sharedUnsubscribe = vi.fn();

// ✅ MINDEN MOCK TELJESEN INLINE - DUPLIKÁLVA, DE NEM MEGOSZTVA!
// ❌ NINCS helper függvény, NINCS változó referencia a vi.mock() hívásokban!

vi.mock('firebase/auth', () => {
  // This function will be called by the actual code
  const onAuthStateChangedImpl = (auth, callback) => {
    sharedAuthStateCallback = callback;
    return sharedUnsubscribe;
  };
  
  const authInstance = {
    name: '[DEFAULT]',
    app: { options: {}, name: '[DEFAULT]' },
    config: { apiKey: 'mock-api-key' },
    currentUser: null,
    _isInitialized: true,
    _deleted: false,
    // Add all the methods that the component uses
    onAuthStateChanged: (callback) => onAuthStateChangedImpl(null, callback),
    signOut: vi.fn(() => Promise.resolve()),
    signInWithEmailAndPassword: vi.fn(),
    signInWithCustomToken: vi.fn(),
    signInWithPopup: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  };

  return {
    getAuth: vi.fn(() => authInstance),
    // This is what gets imported and called from the component
    onAuthStateChanged: vi.fn(onAuthStateChangedImpl),
    signInWithEmailAndPassword: vi.fn(),
    signInWithCustomToken: vi.fn(),
    signInWithPopup: vi.fn(),
    signInWithCredential: vi.fn(),
    signOut: vi.fn(() => Promise.resolve()),
    sendPasswordResetEmail: vi.fn(),
    GoogleAuthProvider: vi.fn().mockImplementation(() => ({
      addScope: vi.fn(),
      setCustomParameters: vi.fn(),
    })),
    getModularInstance: vi.fn(() => authInstance),
    _castAuth: vi.fn((auth) => auth),
    _getProvider: vi.fn(),
    _getInstance: vi.fn((instance) => instance || authInstance),
  };
});

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock('../../LudusGen_frontend/src/firebase/firebaseApp', () => {
  // Use the same shared callback
  const mockAuth = {
    name: '[DEFAULT]',
    app: { options: {}, name: '[DEFAULT]' },
    config: { apiKey: 'mock-api-key' },
    currentUser: null,
    _isInitialized: true,
    _deleted: false,
    // Add all the methods that the component uses on the auth object
    onAuthStateChanged: (callback) => {
      sharedAuthStateCallback = callback;
      return sharedUnsubscribe;
    },
    signOut: vi.fn(() => Promise.resolve()),
    signInWithEmailAndPassword: vi.fn(),
    signInWithCustomToken: vi.fn(),
    signInWithPopup: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
  };

  return {
    auth: mockAuth,
    db: {},
  };
});

vi.mock('axios');

import { renderHook, act, waitFor } from '@testing-library/react';
import axios from 'axios';
import React from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';

import MyUserProvider, { MyUserContext } from '../../LudusGen_frontend/src/context/MyUserProvider.jsx';
import {
  createMockAuthUser,
  createFirebaseError,
} from '../mocks';

describe('MyUserProvider Context Tests', () => {
  let mockCurrentUser;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCurrentUser = createMockAuthUser();
    
    // Reset shared variables
    sharedAuthStateCallback = null;
    sharedUnsubscribe = vi.fn();

    axios.get.mockResolvedValue({
      data: {
        success: true,
        user: {
          email: 'test@example.com',
          displayName: 'Test User',
          twoFA: { enabled: false },
        },
        is2FAEnabled: false,
      },
    });

    axios.post.mockResolvedValue({
      data: { success: true },
    });
  });

  afterEach(() => {
    sharedAuthStateCallback = null;
    sharedUnsubscribe = null;
    mockCurrentUser = null;
  });

  describe('Initial State', () => {
    it('should initialize with null user', async () => {
      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
      });

      expect(result.current.user).toBeNull();
    });

    it('should set up auth state listener on mount', async () => {
      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(onAuthStateChanged).toHaveBeenCalled();
      });
    });
  });

  describe('Auth State Changes', () => {
    it('should update user when auth state changes to logged in', async () => {
      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(sharedAuthStateCallback).toBeDefined();
      });

      await act(async () => {
        sharedAuthStateCallback(mockCurrentUser);
      });

      await waitFor(() => {
        expect(axios.get).toHaveBeenCalledWith(
          expect.stringContaining('/api/get-user/'),
          expect.any(Object)
        );
      });
    });

    it('should sign out user with unverified email', async () => {
      const unverifiedUser = createMockAuthUser({
        emailVerified: false,
      });

      signOut.mockResolvedValue();

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(sharedAuthStateCallback).toBeDefined();
      });

      await act(async () => {
        sharedAuthStateCallback(unverifiedUser);
      });

      await waitFor(() => {
        expect(signOut).toHaveBeenCalled();
      });
    });

    it('should set user to null when signing out', async () => {
      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(sharedAuthStateCallback).toBeDefined();
      });

      await act(async () => {
        sharedAuthStateCallback(null);
      });

      await waitFor(() => {
        expect(result.current.user).toBeNull();
      });
    });
  });

  describe('signUpUser', () => {
    it('should successfully register a new user', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Registration successful',
        },
      });

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.signUpUser).toBeDefined();
      });

      const setLoading = vi.fn();

      await act(async () => {
        await result.current.signUpUser(
          'newuser@example.com',
          'Test123!@#',
          'New User',
          setLoading
        );
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/register-user'),
        {
          email: 'newuser@example.com',
          password: 'Test123!@#',
          displayName: 'New User',
        }
      );
      expect(setLoading).toHaveBeenCalledWith(false);
    });

    it('should handle registration errors', async () => {
      axios.post.mockRejectedValueOnce({
        response: {
          data: {
            success: false,
            message: 'Email already exists',
          },
        },
      });

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.signUpUser).toBeDefined();
      });

      const setLoading = vi.fn();

      await act(async () => {
        await result.current.signUpUser(
          'existing@example.com',
          'Test123!@#',
          'User',
          setLoading
        );
      });

      expect(setLoading).toHaveBeenCalledWith(false);
      expect(result.current.msg.incorrectSignUp).toBeDefined();
    });
  });

  describe('signInUser', () => {
    it('should sign in user without 2FA', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          requires2FA: false,
        },
      });

      signInWithEmailAndPassword.mockResolvedValue({
        user: mockCurrentUser,
      });

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.signInUser).toBeDefined();
      });

      const setLoading = vi.fn();

      let signInResult;
      await act(async () => {
        signInResult = await result.current.signInUser(
          'test@example.com',
          'Test123!@#',
          setLoading
        );
      });

      expect(signInResult.requires2FA).toBe(false);
      expect(signInWithEmailAndPassword).toHaveBeenCalled();
    });

    it('should return requires2FA true when 2FA is enabled', async () => {
      axios.post
        .mockResolvedValueOnce({
          data: {
            success: true,
            requires2FA: true,
          },
        })
        .mockResolvedValueOnce({
          data: {
            success: true,
          },
        });

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.signInUser).toBeDefined();
      });

      const setLoading = vi.fn();

      let signInResult;
      await act(async () => {
        signInResult = await result.current.signInUser(
          'test@example.com',
          'Test123!@#',
          setLoading
        );
      });

      expect(signInResult.requires2FA).toBe(true);
      expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('should handle invalid password', async () => {
      axios.post.mockResolvedValueOnce({
        data: { requires2FA: false },
      });

      signInWithEmailAndPassword.mockRejectedValue(
        createFirebaseError('auth/wrong-password', 'Wrong password')
      );

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.signInUser).toBeDefined();
      });

      const setLoading = vi.fn();

      await act(async () => {
        await result.current.signInUser('test@example.com', 'WrongPass', setLoading);
      });

      expect(result.current.msg.incorrectSignIn).toBeDefined();
    });

    it('should reject unverified email on sign in', async () => {
      axios.post.mockResolvedValueOnce({
        data: { requires2FA: false },
      });

      const unverifiedUser = createMockAuthUser({
        emailVerified: false,
      });

      signInWithEmailAndPassword.mockResolvedValue({
        user: unverifiedUser,
      });

      signOut.mockResolvedValue();

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.signInUser).toBeDefined();
      });

      const setLoading = vi.fn();

      await act(async () => {
        await result.current.signInUser('test@example.com', 'Test123!@#', setLoading);
      });

      expect(signOut).toHaveBeenCalled();
      expect(result.current.msg.err).toBeDefined();
    });
  });

  describe('signInWith2FA', () => {
    it('should successfully sign in with custom token', async () => {
      signInWithCustomToken.mockResolvedValue({
        user: mockCurrentUser,
      });

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.signInWith2FA).toBeDefined();
      });

      let signInResult;
      await act(async () => {
        signInResult = await result.current.signInWith2FA('custom-token-123');
      });

      expect(signInWithCustomToken).toHaveBeenCalled();
      expect(signInResult.success).toBe(true);
    });

    it('should handle 2FA sign in errors', async () => {
      signInWithCustomToken.mockRejectedValue(
        createFirebaseError('auth/invalid-custom-token', 'Invalid custom token')
      );

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.signInWith2FA).toBeDefined();
      });

      let signInResult;
      await act(async () => {
        signInResult = await result.current.signInWith2FA('invalid-token');
      });

      expect(signInResult.success).toBe(false);
    });
  });

  describe('signInWithGoogle', () => {
    it('should successfully sign in with Google without 2FA', async () => {
      const googleUser = createMockAuthUser({
        email: 'google@example.com',
        displayName: 'Google User',
      });

      signInWithPopup.mockResolvedValue({
        user: googleUser,
      });

      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          requires2FA: false,
        },
      });

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.signInWithGoogle).toBeDefined();
      });

      let signInResult;
      await act(async () => {
        signInResult = await result.current.signInWithGoogle();
      });

      expect(signInWithPopup).toHaveBeenCalled();
      expect(signInResult.requires2FA).toBe(false);
    });

    it('should handle Google sign in with 2FA required', async () => {
      const googleUser = createMockAuthUser({
        email: 'google@example.com',
        emailVerified: true,
      });

      signInWithPopup.mockResolvedValue({
        user: googleUser,
      });

      axios.post
        .mockResolvedValueOnce({
          data: {
            success: true,
            requires2FA: true,
          },
        })
        .mockResolvedValueOnce({
          data: {
            success: true,
            sessionId: 'google-session-123',
          },
        });

      signOut.mockResolvedValue();

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.signInWithGoogle).toBeDefined();
      });

      let signInResult;
      await act(async () => {
        signInResult = await result.current.signInWithGoogle();
      });

      expect(signInResult.requires2FA).toBe(true);
      expect(signInResult.sessionId).toBe('google-session-123');
      expect(signOut).toHaveBeenCalled();
    });

    it('should handle Google popup cancellation', async () => {
      signInWithPopup.mockRejectedValue(
        createFirebaseError('auth/popup-closed-by-user', 'Popup closed')
      );

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.signInWithGoogle).toBeDefined();
      });

      let signInResult;
      await act(async () => {
        signInResult = await result.current.signInWithGoogle();
      });

      expect(result.current.msg.incorrectSignIn).toBeDefined();
    });
  });

  describe('logoutUser', () => {
    it('should successfully log out user', async () => {
      signOut.mockResolvedValue();

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.logoutUser).toBeDefined();
      });

      await act(async () => {
        await result.current.logoutUser();
      });

      expect(signOut).toHaveBeenCalled();
      expect(result.current.user).toBeNull();
    });

    it('should handle logout errors', async () => {
      signOut.mockRejectedValue(new Error('Logout failed'));

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.logoutUser).toBeDefined();
      });

      await act(async () => {
        try {
          await result.current.logoutUser();
        } catch (error) {
          // Expected error
        }
      });

      expect(signOut).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should send password reset email', async () => {
      sendPasswordResetEmail.mockResolvedValue();

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.resetPassword).toBeDefined();
      });

      await act(async () => {
        await result.current.resetPassword('test@example.com');
      });

      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.anything(),
        'test@example.com',
        expect.any(Object)
      );
    });

    it('should handle password reset errors', async () => {
      sendPasswordResetEmail.mockRejectedValue(
        createFirebaseError('auth/user-not-found', 'User not found')
      );

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.resetPassword).toBeDefined();
      });

      await act(async () => {
        await result.current.resetPassword('nonexistent@example.com');
      });

      expect(result.current.msg.incorrectResetPwEmail).toBeDefined();
    });
  });

  describe('updateUser', () => {
    it('should update user state locally', async () => {
      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(sharedAuthStateCallback).toBeDefined();
      });

      await act(async () => {
        sharedAuthStateCallback(mockCurrentUser);
      });

      await act(() => {
        result.current.updateUser({
          displayName: 'Updated Name',
          bio: 'New bio',
        });
      });

      await waitFor(() => {
        expect(result.current.user.displayName).toBe('Updated Name');
        expect(result.current.user.bio).toBe('New bio');
      });
    });
  });

  describe('loadUserFromFirestore', () => {
    it('should load user data from Firestore', async () => {
      const currentUser = createMockAuthUser();

      axios.get.mockResolvedValue({
        data: {
          success: true,
          user: {
            email: 'test@example.com',
            displayName: 'Firestore User',
            bio: 'User bio',
            twoFA: { enabled: false },
          },
        },
      });

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.loadUserFromFirestore).toBeDefined();
      });

      await act(async () => {
        await result.current.loadUserFromFirestore(currentUser);
      });

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining(`/api/get-user/${currentUser.uid}`),
        expect.any(Object)
      );
    });

    it('should handle Firestore load errors', async () => {
      const currentUser = createMockAuthUser();

      axios.get.mockRejectedValue({
        response: {
          status: 404,
          data: { message: 'User not found' },
        },
      });

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current).not.toBeNull();
        expect(result.current.loadUserFromFirestore).toBeDefined();
      });

      await act(async () => {
        await result.current.loadUserFromFirestore(currentUser);
      });

      expect(axios.get).toHaveBeenCalled();
    });
  });

  describe('refresh2FAStatus', () => {
    it('should fetch and update 2FA status', async () => {
      const currentUser = createMockAuthUser();

      axios.get
        .mockResolvedValueOnce({
          data: {
            success: true,
            user: { email: 'test@example.com', displayName: 'Test User' },
          },
        })
        .mockResolvedValueOnce({
          data: {
            success: true,
            is2FAEnabled: true,
          },
        })
        .mockResolvedValue({
          data: {
            success: true,
            is2FAEnabled: true,
          },
        });

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(sharedAuthStateCallback).toBeDefined();
      });

      await act(async () => {
        sharedAuthStateCallback(currentUser);
      });

      await act(async () => {
        await result.current.refresh2FAStatus();
      });

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/check-2fa-status'),
        expect.any(Object)
      );
    });

    it('should handle 2FA status fetch errors', async () => {
      const currentUser = createMockAuthUser();

      axios.get.mockRejectedValue(new Error('Network error'));

      const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
      
      const { result } = renderHook(
        () => React.useContext(MyUserContext),
        { wrapper }
      );

      await waitFor(() => {
        expect(sharedAuthStateCallback).toBeDefined();
      });

      await act(async () => {
        sharedAuthStateCallback(currentUser);
      });

      await act(async () => {
        await result.current.refresh2FAStatus();
      });

      expect(result.current.is2FAEnabled).toBe(false);
    });
  });
});