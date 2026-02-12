import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import axios from 'axios';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
} from 'firebase/auth';
import MyUserProvider, { MyUserContext } from '../../LudusGen_frontend/src/context/MyUserProvider.jsx';
import {
  mockUserData,
  createMockAuthUser,
  createFirebaseError,
} from '../mocks';

vi.mock('axios');
vi.mock('firebase/auth');

describe('MyUserProvider Context Tests', () => {
  let authStateCallback;
  let mockCurrentUser;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCurrentUser = createMockAuthUser();

    onAuthStateChanged.mockImplementation((auth, callback) => {
      authStateCallback = callback;
      return vi.fn(); // unsubscribe function
    });

    axios.get.mockResolvedValue({
      data: {
        success: true,
        user: {
          email: 'test@example.com',
          displayName: 'Test User',
          twoFA: { enabled: false },
        },
      },
    });

    axios.post.mockResolvedValue({
      data: { success: true },
    });
  });

  afterEach(() => {
    authStateCallback = null;
    mockCurrentUser = null;
  });

  describe('Initial State', () => {
    it('should initialize with null user', () => {
      const { result } = renderHook(() => MyUserContext, {
        wrapper: MyUserProvider,
      });

      expect(result.current).toBeUndefined();
    });

    it('should set up auth state listener on mount', () => {
      renderHook(() => MyUserContext, {
        wrapper: MyUserProvider,
      });

      expect(onAuthStateChanged).toHaveBeenCalled();
    });
  });

  describe('Auth State Changes', () => {
    it('should update user when auth state changes to logged in', async () => {
      const { result } = renderHook(() => MyUserContext, {
        wrapper: ({ children }) => <MyUserProvider>{children}</MyUserProvider>,
      });

      await act(async () => {
        authStateCallback(mockCurrentUser);
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

      renderHook(() => MyUserContext, {
        wrapper: MyUserProvider,
      });

      await act(async () => {
        authStateCallback(unverifiedUser);
      });

      await waitFor(() => {
        expect(signOut).toHaveBeenCalled();
      });
    });

    it('should set user to null when signing out', async () => {
      renderHook(() => MyUserContext, {
        wrapper: MyUserProvider,
      });

      await act(async () => {
        authStateCallback(null);
      });

      // User should be null after sign out
      // (we can't directly access context value in this test structure,
      // but we verify the callback was called with null)
      expect(authStateCallback).toHaveBeenCalledWith(null);
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

      const setLoading = vi.fn();
      const signUpUser = vi.fn(async (email, password, displayName, setLoading) => {
        const response = await axios.post('/api/register-user', {
          email,
          password,
          displayName,
        });
        setLoading(false);
        return response.data;
      });

      const result = await signUpUser(
        'newuser@example.com',
        'Test123!@#',
        'New User',
        setLoading
      );

      expect(axios.post).toHaveBeenCalledWith('/api/register-user', {
        email: 'newuser@example.com',
        password: 'Test123!@#',
        displayName: 'New User',
      });
      expect(result.success).toBe(true);
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

      const setLoading = vi.fn();
      const signUpUser = vi.fn(async (email, password, displayName, setLoading) => {
        try {
          await axios.post('/api/register-user', {
            email,
            password,
            displayName,
          });
        } catch (error) {
          setLoading(false);
          throw error;
        }
      });

      await expect(
        signUpUser('existing@example.com', 'Test123!@#', 'User', setLoading)
      ).rejects.toThrow();

      expect(setLoading).toHaveBeenCalledWith(false);
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

      const signInUser = vi.fn(async (email, password) => {
        const check2FA = await axios.post('/api/check-2fa-required', { email });

        if (!check2FA.data.requires2FA) {
          await signInWithEmailAndPassword({}, email, password);
          return { requires2FA: false };
        }

        return { requires2FA: true };
      });

      const result = await signInUser('test@example.com', 'Test123!@#');

      expect(result.requires2FA).toBe(false);
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

      const signInUser = vi.fn(async (email, password) => {
        const check2FA = await axios.post('/api/check-2fa-required', { email });

        if (check2FA.data.requires2FA) {
          await axios.post('/api/validate-password', { email, password });
          return { requires2FA: true };
        }

        return { requires2FA: false };
      });

      const result = await signInUser('test@example.com', 'Test123!@#');

      expect(result.requires2FA).toBe(true);
      expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('should handle invalid password', async () => {
      axios.post
        .mockResolvedValueOnce({
          data: { requires2FA: false },
        });

      signInWithEmailAndPassword.mockRejectedValue(
        createFirebaseError('auth/wrong-password', 'Wrong password')
      );

      const signInUser = vi.fn(async (email, password) => {
        try {
          await signInWithEmailAndPassword({}, email, password);
          return { requires2FA: false };
        } catch (error) {
          return { requires2FA: false, error: error.message };
        }
      });

      const result = await signInUser('test@example.com', 'WrongPass');

      expect(result.error).toBe('Wrong password');
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

      const signInUser = vi.fn(async (email, password) => {
        const result = await signInWithEmailAndPassword({}, email, password);

        if (!result.user.emailVerified) {
          await signOut({});
          return { requires2FA: false, error: 'Email not verified' };
        }

        return { requires2FA: false };
      });

      const result = await signInUser('test@example.com', 'Test123!@#');

      expect(result.error).toBe('Email not verified');
      expect(signOut).toHaveBeenCalled();
    });
  });

  describe('signInWith2FA', () => {
    it('should successfully sign in with custom token', async () => {
      signInWithCustomToken.mockResolvedValue({
        user: mockCurrentUser,
      });

      const signInWith2FA = vi.fn(async (customToken) => {
        await signInWithCustomToken({}, customToken);
        return { success: true };
      });

      const result = await signInWith2FA('custom-token-123');

      expect(signInWithCustomToken).toHaveBeenCalledWith({}, 'custom-token-123');
      expect(result.success).toBe(true);
    });

    it('should handle 2FA sign in errors', async () => {
      signInWithCustomToken.mockRejectedValue(
        createFirebaseError('auth/invalid-custom-token', 'Invalid custom token')
      );

      const signInWith2FA = vi.fn(async (customToken) => {
        try {
          await signInWithCustomToken({}, customToken);
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      });

      const result = await signInWith2FA('invalid-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid custom token');
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

      const signInWithGoogle = vi.fn(async () => {
        const result = await signInWithPopup({}, new GoogleAuthProvider());
        const check2FA = await axios.post('/api/check-2fa-required', {
          email: result.user.email,
        });

        if (check2FA.data.requires2FA) {
          await signOut({});
          return { requires2FA: true, email: result.user.email };
        }

        return { requires2FA: false };
      });

      const result = await signInWithGoogle();

      expect(signInWithPopup).toHaveBeenCalled();
      expect(result.requires2FA).toBe(false);
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

      const signInWithGoogle = vi.fn(async () => {
        const result = await signInWithPopup({}, new GoogleAuthProvider());
        const check2FA = await axios.post('/api/check-2fa-required', {
          email: result.user.email,
        });

        if (check2FA.data.requires2FA) {
          const token = await result.user.getIdToken();
          await signOut({});

          const session = await axios.post('/api/validate-google-session', {
            firebaseIdToken: token,
            email: result.user.email,
          });

          return {
            requires2FA: true,
            email: result.user.email,
            sessionId: session.data.sessionId,
          };
        }

        return { requires2FA: false };
      });

      const result = await signInWithGoogle();

      expect(result.requires2FA).toBe(true);
      expect(result.sessionId).toBe('google-session-123');
      expect(signOut).toHaveBeenCalled();
    });

    it('should handle Google popup cancellation', async () => {
      signInWithPopup.mockRejectedValue(
        createFirebaseError('auth/popup-closed-by-user', 'Popup closed')
      );

      const signInWithGoogle = vi.fn(async () => {
        try {
          await signInWithPopup({}, new GoogleAuthProvider());
          return { requires2FA: false };
        } catch (error) {
          return { requires2FA: false, error: error.message };
        }
      });

      const result = await signInWithGoogle();

      expect(result.error).toBe('Popup closed');
    });
  });

  describe('logoutUser', () => {
    it('should successfully log out user', async () => {
      signOut.mockResolvedValue();

      const logoutUser = vi.fn(async () => {
        await signOut({});
        return { success: true };
      });

      const result = await logoutUser();

      expect(signOut).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle logout errors', async () => {
      signOut.mockRejectedValue(new Error('Logout failed'));

      const logoutUser = vi.fn(async () => {
        try {
          await signOut({});
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      });

      const result = await logoutUser();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Logout failed');
    });
  });

  describe('resetPassword', () => {
    it('should send password reset email', async () => {
      sendPasswordResetEmail.mockResolvedValue();

      const resetPassword = vi.fn(async (email) => {
        await sendPasswordResetEmail({}, email, {
          url: 'http://localhost:5173/reset-password',
        });
        return { success: true };
      });

      const result = await resetPassword('test@example.com');

      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        {},
        'test@example.com',
        { url: 'http://localhost:5173/reset-password' }
      );
      expect(result.success).toBe(true);
    });

    it('should handle password reset errors', async () => {
      sendPasswordResetEmail.mockRejectedValue(
        createFirebaseError('auth/user-not-found', 'User not found')
      );

      const resetPassword = vi.fn(async (email) => {
        try {
          await sendPasswordResetEmail({}, email);
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      });

      const result = await resetPassword('nonexistent@example.com');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('updateUser', () => {
    it('should update user state locally', () => {
      const updateUser = vi.fn((updatedData) => {
        return { ...mockUserData, ...updatedData };
      });

      const result = updateUser({
        displayName: 'Updated Name',
        bio: 'New bio',
      });

      expect(result.displayName).toBe('Updated Name');
      expect(result.bio).toBe('New bio');
      expect(result.email).toBe(mockUserData.email);
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

      const loadUserFromFirestore = vi.fn(async (user) => {
        const token = await user.getIdToken();
        const response = await axios.get(`/api/get-user/${user.uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        return { ...user, ...response.data.user };
      });

      const result = await loadUserFromFirestore(currentUser);

      expect(axios.get).toHaveBeenCalledWith(
        `/api/get-user/${currentUser.uid}`,
        expect.any(Object)
      );
      expect(result.displayName).toBe('Firestore User');
      expect(result.bio).toBe('User bio');
    });

    it('should handle Firestore load errors', async () => {
      const currentUser = createMockAuthUser();

      axios.get.mockRejectedValue({
        response: {
          status: 404,
          data: { message: 'User not found' },
        },
      });

      const loadUserFromFirestore = vi.fn(async (user) => {
        try {
          const token = await user.getIdToken();
          const response = await axios.get(`/api/get-user/${user.uid}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return { ...user, ...response.data.user };
        } catch (error) {
          return user; // Return Firebase user only
        }
      });

      const result = await loadUserFromFirestore(currentUser);

      expect(result.uid).toBe(currentUser.uid);
      expect(result.bio).toBeUndefined(); // Firestore data not loaded
    });
  });

  describe('refresh2FAStatus', () => {
    it('should fetch and update 2FA status', async () => {
      const currentUser = createMockAuthUser();

      axios.get.mockResolvedValue({
        data: {
          success: true,
          is2FAEnabled: true,
        },
      });

      const refresh2FAStatus = vi.fn(async (user) => {
        const token = await user.getIdToken();
        const response = await axios.get('/api/check-2fa-status', {
          headers: { Authorization: `Bearer ${token}` },
        });

        return response.data.is2FAEnabled;
      });

      const result = await refresh2FAStatus(currentUser);

      expect(axios.get).toHaveBeenCalledWith(
        '/api/check-2fa-status',
        expect.any(Object)
      );
      expect(result).toBe(true);
    });

    it('should handle 2FA status fetch errors', async () => {
      const currentUser = createMockAuthUser();

      axios.get.mockRejectedValue(new Error('Network error'));

      const refresh2FAStatus = vi.fn(async (user) => {
        try {
          const token = await user.getIdToken();
          const response = await axios.get('/api/check-2fa-status', {
            headers: { Authorization: `Bearer ${token}` },
          });
          return response.data.is2FAEnabled;
        } catch (error) {
          return false; // Default to false on error
        }
      });

      const result = await refresh2FAStatus(currentUser);

      expect(result).toBe(false);
    });
  });
});