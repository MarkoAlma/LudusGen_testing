import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import axios from 'axios';
import {
  firebaseAuthMock,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from '../mocks/firebase-auth.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import MyUserProvider, { MyUserContext } from '../../LudusGen_frontend/src/context/MyUserProvider.jsx';

function createAuthUser(overrides = {}) {
  return {
    uid: 'user-123',
    email: 'test@example.com',
    emailVerified: true,
    displayName: 'Firebase User',
    getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
    ...overrides,
  };
}

function renderUserContext() {
  const wrapper = ({ children }) => <MyUserProvider>{children}</MyUserProvider>;
  return renderHook(() => React.useContext(MyUserContext), { wrapper });
}

describe('MyUserProvider context', () => {
  beforeEach(() => {
    firebaseAuthMock.reset();

    axios.get.mockImplementation((url) => {
      if (String(url).includes('/api/get-user/')) {
        return Promise.resolve({
          data: {
            success: true,
            user: {
              displayName: 'Stored User',
              name: 'Stored User',
              credits: 3524,
              twoFA: { enabled: false },
            },
          },
        });
      }

      if (String(url).includes('/api/check-2fa-status')) {
        return Promise.resolve({
          data: {
            success: true,
            is2FAEnabled: false,
          },
        });
      }

      return Promise.resolve({ data: { success: true } });
    });

    axios.post.mockResolvedValue({ data: { success: true } });
  });

  it('starts with no user and registers the Firebase auth listener', async () => {
    const { result } = renderUserContext();

    await waitFor(() => {
      expect(result.current).not.toBeNull();
      expect(onAuthStateChanged).toHaveBeenCalledTimes(1);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.authLoading).toBe(true);
  });

  it('loads verified users from the backend and refreshes 2FA status', async () => {
    const currentUser = createAuthUser();
    const { result } = renderUserContext();

    await waitFor(() => expect(firebaseAuthMock.authStateCallback).toBeTypeOf('function'));

    await act(async () => {
      await firebaseAuthMock.authStateCallback(currentUser);
    });

    await waitFor(() => {
      expect(result.current.user.displayName).toBe('Stored User');
      expect(result.current.user.credits).toBe(3524);
      expect(result.current.is2FAEnabled).toBe(false);
      expect(result.current.authLoading).toBe(false);
    });

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/get-user/user-123'),
      expect.objectContaining({
        headers: { Authorization: 'Bearer mock-id-token' },
      })
    );
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/check-2fa-status'),
      expect.any(Object)
    );
  });

  it('signs out users whose email address is not verified', async () => {
    const currentUser = createAuthUser({ emailVerified: false });
    const { result } = renderUserContext();

    await waitFor(() => expect(firebaseAuthMock.authStateCallback).toBeTypeOf('function'));

    await act(async () => {
      await firebaseAuthMock.authStateCallback(currentUser);
    });

    expect(signOut).toHaveBeenCalledWith(firebaseAuthMock.auth);
    expect(result.current.user).toBeNull();
    expect(result.current.msg.err).toBe('Nincs megerősítve az email!');
  });

  it('registers new users through the backend API', async () => {
    const setLoading = vi.fn();
    const { result } = renderUserContext();

    await act(async () => {
      await result.current.signUpUser('new@example.com', 'StrongPass123!', 'New User', setLoading);
    });

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/register-user'),
      {
        email: 'new@example.com',
        password: 'StrongPass123!',
        displayName: 'New User',
      }
    );
    expect(result.current.msg.katt).toContain('aktiváló');
    expect(setLoading).toHaveBeenCalledWith(false);
  });

  it('signs in users without 2FA through Firebase email/password auth', async () => {
    const setLoading = vi.fn();
    const authUser = createAuthUser();
    signInWithEmailAndPassword.mockResolvedValue({ user: authUser });
    axios.post.mockResolvedValueOnce({ data: { success: true, requires2FA: false } });
    const { result } = renderUserContext();

    let signInResult;
    await act(async () => {
      signInResult = await result.current.signInUser('test@example.com', 'StrongPass123!', setLoading);
    });

    expect(signInResult).toEqual({ requires2FA: false });
    expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
      firebaseAuthMock.auth,
      'test@example.com',
      'StrongPass123!'
    );
    expect(result.current.msg.signIn).toBe(true);
  });

  it('validates passwords before returning a 2FA requirement', async () => {
    const setLoading = vi.fn();
    axios.post
      .mockResolvedValueOnce({ data: { success: true, requires2FA: true } })
      .mockResolvedValueOnce({ data: { success: true } });
    const { result } = renderUserContext();

    let signInResult;
    await act(async () => {
      signInResult = await result.current.signInUser('twofa@example.com', 'StrongPass123!', setLoading);
    });

    expect(signInResult).toEqual({ requires2FA: true });
    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/api/check-2fa-required'),
      { email: 'twofa@example.com' }
    );
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/api/validate-password'),
      { email: 'twofa@example.com', password: 'StrongPass123!' }
    );
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  it('signs in with custom token after successful 2FA verification', async () => {
    signInWithCustomToken.mockResolvedValue({});
    const { result } = renderUserContext();

    let signInResult;
    await act(async () => {
      signInResult = await result.current.signInWith2FA('custom-token');
    });

    expect(signInResult).toEqual({ success: true });
    expect(signInWithCustomToken).toHaveBeenCalledWith(firebaseAuthMock.auth, 'custom-token');
    expect(result.current.msg.signIn).toBe(true);
  });

  it('handles Google sign-in without 2FA', async () => {
    const googleUser = createAuthUser({ email: 'google@example.com' });
    signInWithPopup.mockResolvedValue({ user: googleUser });
    axios.post.mockResolvedValueOnce({ data: { success: true, requires2FA: false } });
    const { result } = renderUserContext();

    let signInResult;
    await act(async () => {
      signInResult = await result.current.signInWithGoogle();
    });

    expect(signInResult).toEqual({ requires2FA: false });
    expect(GoogleAuthProvider).toHaveBeenCalledTimes(1);
    expect(signInWithPopup).toHaveBeenCalledWith(firebaseAuthMock.auth, expect.any(Object));
    expect(result.current.isAuthOpen).toBe(false);
  });

  it('logs out and clears the local user state', async () => {
    const currentUser = createAuthUser();
    const { result } = renderUserContext();

    await waitFor(() => expect(firebaseAuthMock.authStateCallback).toBeTypeOf('function'));
    await act(async () => {
      await firebaseAuthMock.authStateCallback(currentUser);
    });

    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      await result.current.logoutUser();
    });

    expect(signOut).toHaveBeenCalledWith(firebaseAuthMock.auth);
    expect(result.current.user).toBeNull();
    expect(result.current.is2FAEnabled).toBe(false);
  });

  it('requests password reset through the backend', async () => {
    const { result } = renderUserContext();

    await act(async () => {
      await result.current.resetPassword('reset@example.com');
    });

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/forgot-password'),
      { email: 'reset@example.com' }
    );
    expect(result.current.msg.resetSent).toContain('kiküldtük');
  });

  it('updates the local user state', async () => {
    const currentUser = createAuthUser();
    const { result } = renderUserContext();

    await waitFor(() => expect(firebaseAuthMock.authStateCallback).toBeTypeOf('function'));
    await act(async () => {
      await firebaseAuthMock.authStateCallback(currentUser);
    });

    await act(async () => {
      result.current.updateUser({ bio: 'Updated bio' });
    });

    expect(result.current.user.bio).toBe('Updated bio');
  });

  it('refreshes the credit balance from the backend', async () => {
    const currentUser = createAuthUser();
    firebaseAuthMock.auth.currentUser = currentUser;
    const { result } = renderUserContext();

    await waitFor(() => expect(firebaseAuthMock.authStateCallback).toBeTypeOf('function'));
    await act(async () => {
      await firebaseAuthMock.authStateCallback(currentUser);
    });

    axios.get.mockResolvedValueOnce({
      data: {
        success: true,
        user: { credits: 5000 },
      },
    });

    await act(async () => {
      await result.current.refreshCredits();
    });

    expect(result.current.user.credits).toBe(5000);
  });
});
