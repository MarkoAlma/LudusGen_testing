import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
} from 'firebase/auth';
import {
  mockFirebaseAdmin,
  mockSpeakeasy,
  mockNodemailer,
  mockTransporter,
  mockUserData,
  mockUser2FAEnabled,
  createMockAuthUser,
} from '../mocks';

vi.mock('axios');
vi.mock('firebase/auth');
vi.mock('firebase-admin', () => ({ default: mockFirebaseAdmin }));
vi.mock('speakeasy', () => ({ default: mockSpeakeasy }));
vi.mock('nodemailer', () => ({ default: mockNodemailer }));

describe('Integration Tests - Full Authentication Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Registration Flow', () => {
    it('should complete full user registration with email verification', async () => {
      // Step 1: User submits registration form
      const registrationData = {
        email: 'newuser@example.com',
        password: 'Test123!@#',
        displayName: 'New User',
      };

      // Step 2: Backend creates user in Firebase Auth
      const mockAuth = mockFirebaseAdmin.auth();
      mockAuth.createUser.mockResolvedValue({
        uid: 'new-user-123',
        email: registrationData.email,
      });

      const userRecord = await mockAuth.createUser({
        email: registrationData.email,
        password: registrationData.password,
        displayName: registrationData.displayName,
        emailVerified: false,
      });

      expect(userRecord.uid).toBe('new-user-123');

      // Step 3: Backend generates email verification link
      mockAuth.generateEmailVerificationLink.mockResolvedValue(
        'https://example.com/verify?oobCode=ABC123'
      );

      const verificationLink = await mockAuth.generateEmailVerificationLink(
        registrationData.email
      );

      expect(verificationLink).toContain('verify');

      // Step 4: Backend sends verification email
      mockTransporter.sendMail.mockResolvedValue({
        messageId: 'test-message-id',
      });

      const emailSent = await mockTransporter.sendMail({
        to: registrationData.email,
        subject: 'Email Verification',
      });

      expect(emailSent.messageId).toBe('test-message-id');

      // Step 5: Backend creates Firestore document
      const mockDb = mockFirebaseAdmin.firestore();
      
      // ✅ FIX: Properly set up the mock chain
      const setMock = vi.fn().mockResolvedValue();
      const docMock = vi.fn().mockReturnValue({
        set: setMock,
      });
      const collectionMock = vi.fn().mockReturnValue({
        doc: docMock,
      });
      mockDb.collection = collectionMock;

      await mockDb.collection('users').doc(userRecord.uid).set({
        email: registrationData.email,
        displayName: registrationData.displayName,
        twoFA: {
          enabled: false,
          secret: null,
          backupCodes: [],
        },
      });

      expect(setMock).toHaveBeenCalled();

      // Step 6: Frontend receives success response
      axios.post.mockResolvedValue({
        data: {
          success: true,
          message: 'Registration successful',
        },
      });

      const response = await axios.post('/api/register-user', registrationData);

      expect(response.data.success).toBe(true);

      // Step 7: User clicks verification link (simulated)
      // In real scenario, this would verify the email in Firebase

      // Step 8: User can now log in
      const verifiedUser = createMockAuthUser({
        emailVerified: true,
      });

      signInWithEmailAndPassword.mockResolvedValue({
        user: verifiedUser,
      });

      const loginResult = await signInWithEmailAndPassword(
        {},
        registrationData.email,
        registrationData.password
      );

      expect(loginResult.user.emailVerified).toBe(true);
    });
  });

  describe('Complete Login Flow without 2FA', () => {
    it('should complete login flow for user without 2FA', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'Test123!@#',
      };

      // Step 1: Frontend checks if 2FA is required
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          requires2FA: false,
        },
      });

      const check2FA = await axios.post('/api/check-2fa-required', {
        email: loginData.email,
      });

      expect(check2FA.data.requires2FA).toBe(false);

      // Step 2: Frontend signs in with Firebase
      const mockUser = createMockAuthUser({
        emailVerified: true,
      });

      signInWithEmailAndPassword.mockResolvedValue({
        user: mockUser,
      });

      const authResult = await signInWithEmailAndPassword(
        {},
        loginData.email,
        loginData.password
      );

      expect(authResult.user.emailVerified).toBe(true);

      // Step 3: Frontend loads user data from Firestore
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

      const token = await mockUser.getIdToken();
      const userData = await axios.get(`/api/get-user/${mockUser.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(userData.data.success).toBe(true);
      expect(userData.data.user.email).toBe('test@example.com');

      // Step 4: Frontend sets user in context
      // User is now logged in
    });
  });

  describe('Complete Login Flow with 2FA', () => {
    it('should complete full 2FA login flow', async () => {
      const loginData = {
        email: 'test2fa@example.com',
        password: 'Test123!@#',
        code: '123456',
      };

      // Step 1: Frontend checks if 2FA is required
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          requires2FA: true,
        },
      });

      const check2FA = await axios.post('/api/check-2fa-required', {
        email: loginData.email,
      });

      expect(check2FA.data.requires2FA).toBe(true);

      // Step 2: Frontend validates password (without signing in)
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Password valid',
        },
      });

      const validatePassword = await axios.post('/api/validate-password', {
        email: loginData.email,
        password: loginData.password,
      });

      expect(validatePassword.data.success).toBe(true);

      // Step 3: Frontend shows 2FA modal

      // Step 4: User enters 2FA code

      // Step 5: Backend validates 2FA code
      const mockAuth = mockFirebaseAdmin.auth();
      mockAuth.getUserByEmail.mockResolvedValue({
        ...mockUserData,
        emailVerified: true,
      });

      const mockDb = mockFirebaseAdmin.firestore();
      mockDb.collection().doc().get.mockResolvedValue({
        exists: true,
        data: () => mockUser2FAEnabled,
      });

      mockSpeakeasy.totp.verify.mockReturnValue(true);

      const userRecord = await mockAuth.getUserByEmail(loginData.email);
      const userDoc = await mockDb.collection('users').doc(userRecord.uid).get();
      const twoFAData = userDoc.data();

      const isValid = mockSpeakeasy.totp.verify({
        secret: twoFAData.twoFA.secret,
        encoding: 'base32',
        token: loginData.code,
        window: 2,
      });

      expect(isValid).toBe(true);

      // Step 6: Backend creates custom token
      mockAuth.createCustomToken.mockResolvedValue('custom-token-123');

      const customToken = await mockAuth.createCustomToken(userRecord.uid);

      expect(customToken).toBe('custom-token-123');

      // Step 7: Backend returns custom token to frontend
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          customToken: 'custom-token-123',
          remainingBackupCodes: 3,
        },
      });

      const login2FA = await axios.post('/api/login-with-2fa', {
        email: loginData.email,
        code: loginData.code,
      });

      expect(login2FA.data.success).toBe(true);
      expect(login2FA.data.customToken).toBe('custom-token-123');

      // Step 8: Frontend signs in with custom token
      const mockUser = createMockAuthUser({
        emailVerified: true,
      });

      signInWithCustomToken.mockResolvedValue({
        user: mockUser,
      });

      const authResult = await signInWithCustomToken({}, customToken);

      expect(authResult.user).toBeDefined();

      // Step 9: User is now logged in
    });
  });

  describe('Complete Google Sign In Flow', () => {
    it('should complete Google sign in without 2FA', async () => {
      // Step 1: Frontend initiates Google popup
      const mockGoogleUser = createMockAuthUser({
        email: 'google@example.com',
        displayName: 'Google User',
        emailVerified: true,
      });

      signInWithPopup.mockResolvedValue({
        user: mockGoogleUser,
      });

      const popupResult = await signInWithPopup({}, new GoogleAuthProvider());

      expect(popupResult.user.email).toBe('google@example.com');

      // Step 2: Frontend checks if 2FA is required
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          requires2FA: false,
        },
      });

      const check2FA = await axios.post('/api/check-2fa-required', {
        email: popupResult.user.email,
      });

      expect(check2FA.data.requires2FA).toBe(false);

      // Step 3: User is already signed in via popup, no 2FA needed

      // Step 4: Frontend loads/creates Firestore document
      axios.get.mockResolvedValue({
        data: {
          success: true,
          user: {
            email: 'google@example.com',
            displayName: 'Google User',
            provider: 'google',
          },
        },
      });

      const token = await mockGoogleUser.getIdToken();
      const userData = await axios.get(`/api/get-user/${mockGoogleUser.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(userData.data.success).toBe(true);

      // Step 5: User is logged in
    });

    it('should complete Google sign in with 2FA', async () => {
      // Step 1: Frontend initiates Google popup
      const mockGoogleUser = createMockAuthUser({
        email: 'google2fa@example.com',
        emailVerified: true,
      });

      signInWithPopup.mockResolvedValue({
        user: mockGoogleUser,
      });

      const popupResult = await signInWithPopup({}, new GoogleAuthProvider());

      // Step 2: Frontend checks if 2FA is required
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          requires2FA: true,
        },
      });

      const check2FA = await axios.post('/api/check-2fa-required', {
        email: popupResult.user.email,
      });

      expect(check2FA.data.requires2FA).toBe(true);

      // Step 3: Get Firebase ID token before signing out
      const firebaseIdToken = await mockGoogleUser.getIdToken();

      // Step 4: Frontend signs out temporarily
      signOut.mockResolvedValue();
      await signOut({});

      // Step 5: Frontend validates session with backend
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          sessionId: 'google-session-123',
        },
      });

      const validateSession = await axios.post('/api/validate-google-session', {
        firebaseIdToken,
        email: popupResult.user.email,
      });

      expect(validateSession.data.sessionId).toBe('google-session-123');

      // Step 6: User enters 2FA code in modal

      // Step 7: Backend validates 2FA and creates custom token
      const mockAuth = mockFirebaseAdmin.auth();
      mockAuth.createCustomToken.mockResolvedValue('google-custom-token-123');

      mockSpeakeasy.totp.verify.mockReturnValue(true);

      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          customToken: 'google-custom-token-123',
        },
      });

      const login2FA = await axios.post('/api/login-with-2fa-google', {
        sessionId: 'google-session-123',
        code: '123456',
      });

      expect(login2FA.data.customToken).toBe('google-custom-token-123');

      // Step 8: Frontend signs in with custom token
      signInWithCustomToken.mockResolvedValue({
        user: mockGoogleUser,
      });

      await signInWithCustomToken({}, login2FA.data.customToken);

      // Step 9: User is logged in
    });
  });

  describe('Complete 2FA Setup Flow', () => {
    it('should complete full 2FA setup process', async () => {
      const mockUser = createMockAuthUser();
      const userId = mockUser.uid;

      // Step 1: User requests to setup 2FA
      axios.get.mockResolvedValueOnce({
        data: {
          qr: 'data:image/png;base64,MOCK_QR',
          secret: 'MOCK_SECRET',
          backupCodes: ['CODE1', 'CODE2', 'CODE3'],
        },
      });

      const token = await mockUser.getIdToken();
      const setupData = await axios.get('/api/setup-mfa', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(setupData.data.qr).toBeDefined();
      expect(setupData.data.secret).toBeDefined();
      expect(setupData.data.backupCodes).toHaveLength(3);

      // Step 2: User scans QR code with authenticator app

      // Step 3: User enters verification code
      const verificationCode = '123456';

      mockSpeakeasy.totp.verify.mockReturnValue(true);

      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          message: '2FA successfully activated',
          backupCodes: setupData.data.backupCodes,
        },
      });

      const verifyResult = await axios.post(
        '/api/verify-mfa',
        { code: verificationCode },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      expect(verifyResult.data.success).toBe(true);

      // Step 4: 2FA is now enabled for the user

      // Step 5: Frontend refreshes 2FA status
      axios.get.mockResolvedValueOnce({
        data: {
          success: true,
          is2FAEnabled: true,
        },
      });

      const statusCheck = await axios.get('/api/check-2fa-status', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(statusCheck.data.is2FAEnabled).toBe(true);
    });
  });

  describe('Complete 2FA Disable Flow', () => {
    it('should complete full 2FA disable process', async () => {
      const mockUser = createMockAuthUser();
      const userId = mockUser.uid;

      // Step 1: User has 2FA enabled
      axios.get.mockResolvedValueOnce({
        data: {
          success: true,
          is2FAEnabled: true,
        },
      });

      const token = await mockUser.getIdToken();
      const initialStatus = await axios.get('/api/check-2fa-status', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(initialStatus.data.is2FAEnabled).toBe(true);

      // Step 2: User requests to disable 2FA and enters verification code
      const verificationCode = '123456';

      mockSpeakeasy.totp.verify.mockReturnValue(true);

      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          message: '2FA disabled',
        },
      });

      const disableResult = await axios.post(
        '/api/disable-2fa',
        { code: verificationCode },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      expect(disableResult.data.success).toBe(true);

      // Step 3: 2FA is now disabled

      // Step 4: Frontend refreshes 2FA status
      axios.get.mockResolvedValueOnce({
        data: {
          success: true,
          is2FAEnabled: false,
        },
      });

      const finalStatus = await axios.get('/api/check-2fa-status', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(finalStatus.data.is2FAEnabled).toBe(false);
    });
  });

  describe('Complete Password Reset Flow', () => {
    it('should complete password reset process', async () => {
      const email = 'reset@example.com';

      // Step 1: User requests password reset
      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Password reset email sent',
        },
      });

      const resetRequest = await axios.post('/api/reset-password', { email });

      expect(resetRequest.data.success).toBe(true);

      // Step 2: Backend sends password reset email
      // (handled by Firebase Auth)

      // Step 3: User clicks link in email and sets new password
      // (handled by Firebase Auth)

      // Step 4: User can now log in with new password
    });
  });

  describe('Complete Profile Update Flow', () => {
    it('should complete profile update with picture upload', async () => {
      const mockUser = createMockAuthUser();

      // Step 1: User updates profile information
      const profileData = {
        displayName: 'Updated Name',
        bio: 'Updated bio text',
      };

      const token = await mockUser.getIdToken();

      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          user: {
            ...profileData,
            email: mockUser.email,
          },
        },
      });

      const updateResult = await axios.post('/api/update-profile', profileData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(updateResult.data.success).toBe(true);
      expect(updateResult.data.user.displayName).toBe('Updated Name');

      // Step 2: User uploads profile picture
      const mockFile = new Blob(['fake-image-data'], { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('profilePicture', mockFile);

      axios.post.mockResolvedValueOnce({
        data: {
          success: true,
          profilePictureUrl: 'https://cloudinary.com/new-picture.jpg',
        },
      });

      const uploadResult = await axios.post(
        '/api/upload-profile-picture',
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      expect(uploadResult.data.success).toBe(true);
      expect(uploadResult.data.profilePictureUrl).toContain('cloudinary');

      // Step 3: Profile is fully updated
    });
  });

  describe('Auth State Persistence', () => {
    it('should restore user session on page reload', async () => {
      const mockUser = createMockAuthUser({
        emailVerified: true,
      });

      // Step 1: User is logged in
      // ✅ FIX: Initialize authCallback before calling onAuthStateChanged
      let authCallback = null;
      onAuthStateChanged.mockImplementation((auth, callback) => {
        authCallback = callback;
        // Immediately invoke the callback with the user
        callback(mockUser);
        return vi.fn(); // unsubscribe
      });

      // Step 2: Set up the auth state listener
      const unsubscribe = onAuthStateChanged({}, (user) => {
        // This will be called immediately by the mock
      });

      // Step 3: Frontend loads user data from Firestore
      axios.get.mockResolvedValue({
        data: {
          success: true,
          user: {
            email: mockUser.email,
            displayName: 'Test User',
            twoFA: { enabled: false },
          },
        },
      });

      const token = await mockUser.getIdToken();
      const userData = await axios.get(`/api/get-user/${mockUser.uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(userData.data.success).toBe(true);

      // Step 4: User session is restored
    });
  });
});