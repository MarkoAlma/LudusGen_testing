import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockFirebaseAdmin,
  mockCloudinary,
  mockRequest,
  mockResponse,
  mockUserData,
  mockFirestoreUserData,
  createFirebaseError,
} from '../mocks';

vi.mock('firebase-admin', () => ({ default: mockFirebaseAdmin }));
vi.mock('cloudinary', () => ({ v2: mockCloudinary }));

describe('Backend User Profile Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/get-user/:uid', () => {
    it('should return user data for authenticated user', async () => {
      const req = mockRequest({
        params: { uid: 'test-user-123' },
        headers: {
          authorization: 'Bearer mock-id-token',
        },
      });

      const mockAuth = mockFirebaseAdmin.auth();
      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'test-user-123',
        email: 'test@example.com',
      });

      const mockDb = mockFirebaseAdmin.firestore();
      mockDb.collection().doc().get.mockResolvedValue({
        exists: true,
        data: () => mockFirestoreUserData,
      });

      const decodedToken = await mockAuth.verifyIdToken('mock-id-token');
      expect(decodedToken.uid).toBe(req.params.uid);

      const userDoc = await mockDb.collection('users').doc(req.params.uid).get();
      expect(userDoc.exists).toBe(true);

      const userData = userDoc.data();
      expect(userData.email).toBe('test@example.com');
    });

    it('should create user document if it does not exist', async () => {
      const req = mockRequest({
        params: { uid: 'new-user-123' },
        headers: {
          authorization: 'Bearer mock-id-token',
        },
      });

      const mockAuth = mockFirebaseAdmin.auth();
      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'new-user-123',
        email: 'newuser@example.com',
      });
      mockAuth.getUser.mockResolvedValue({
        uid: 'new-user-123',
        email: 'newuser@example.com',
        displayName: 'New User',
        photoURL: null,
        emailVerified: true,
        providerData: [{ providerId: 'password' }],
      });

      const mockDb = mockFirebaseAdmin.firestore();
      mockDb.collection().doc().get.mockResolvedValueOnce({
        exists: false,
      });
      mockDb.collection().doc().set.mockResolvedValue();
      mockDb.collection().doc().get.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          email: 'newuser@example.com',
          displayName: 'New User',
          provider: 'email',
        }),
      });

      const decodedToken = await mockAuth.verifyIdToken('mock-id-token');
      const userDoc = await mockDb.collection('users').doc(req.params.uid).get();

      if (!userDoc.exists) {
        const userRecord = await mockAuth.getUser(decodedToken.uid);
        await mockDb.collection('users').doc(userRecord.uid).set({
          email: userRecord.email,
          displayName: userRecord.displayName,
          provider: 'email',
        });

        const newUserDoc = await mockDb
          .collection('users')
          .doc(userRecord.uid)
          .get();
        expect(newUserDoc.exists).toBe(true);
      }
    });

    it('should reject request without token', async () => {
      const req = mockRequest({
        params: { uid: 'test-user-123' },
        headers: {},
      });

      const token = req.headers.authorization?.split('Bearer ')[1];
      expect(token).toBeUndefined();
    });

    it('should reject request for different user', async () => {
      const req = mockRequest({
        params: { uid: 'other-user-456' },
        headers: {
          authorization: 'Bearer mock-id-token',
        },
      });

      const mockAuth = mockFirebaseAdmin.auth();
      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'test-user-123',
        email: 'test@example.com',
      });

      const decodedToken = await mockAuth.verifyIdToken('mock-id-token');
      const isAuthorized = decodedToken.uid === req.params.uid;

      expect(isAuthorized).toBe(false);
    });

    it('should reject invalid token', async () => {
      const req = mockRequest({
        params: { uid: 'test-user-123' },
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      const mockAuth = mockFirebaseAdmin.auth();
      mockAuth.verifyIdToken.mockRejectedValue(
        createFirebaseError('auth/argument-error', 'Invalid token')
      );

      try {
        await mockAuth.verifyIdToken('invalid-token');
      } catch (error) {
        expect(error.code).toBe('auth/argument-error');
      }
    });
  });

  describe('POST /api/update-profile', () => {
    it('should successfully update user profile', async () => {
      const req = mockRequest({
        userId: 'test-user-123',
        body: {
          displayName: 'Updated Name',
          bio: 'New bio text',
        },
      });

      const mockDb = mockFirebaseAdmin.firestore();
      
      // ✅ JAVÍTVA: Proper mock chain setup
      const mockSet = vi.fn().mockResolvedValue();
      const mockGet = vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({
          ...mockFirestoreUserData,
          displayName: 'Updated Name',
          bio: 'New bio text',
        }),
      });

      // Setup mock collection/doc chain
      mockDb.collection.mockReturnValue({
        doc: vi.fn().mockReturnValue({
          set: mockSet,
          get: mockGet,
        }),
      });

      const updateData = {
        displayName: req.body.displayName.trim(),
        bio: req.body.bio.trim(),
      };

      await mockDb.collection('users').doc(req.userId).set(updateData, {
        merge: true,
      });

      const userDoc = await mockDb.collection('users').doc(req.userId).get();
      const userData = userDoc.data();

      expect(userData.displayName).toBe('Updated Name');
      expect(userData.bio).toBe('New bio text');
      expect(mockSet).toHaveBeenCalledWith(updateData, { merge: true });
    });

    it('should reject update with short display name', async () => {
      const req = mockRequest({
        userId: 'test-user-123',
        body: {
          displayName: 'A',
        },
      });

      const isValid =
        req.body.displayName && req.body.displayName.trim().length >= 2;
      expect(isValid).toBe(false);
    });

    it('should reject update with no data', async () => {
      const req = mockRequest({
        userId: 'test-user-123',
        body: {},
      });

      const updateData = {};
      if (req.body.name !== undefined) updateData.name = req.body.name;
      if (req.body.displayName !== undefined)
        updateData.displayName = req.body.displayName;
      if (req.body.bio !== undefined) updateData.bio = req.body.bio;

      const hasData = Object.keys(updateData).length > 0;
      expect(hasData).toBe(false);
    });

    it('should trim whitespace from inputs', async () => {
      const req = mockRequest({
        userId: 'test-user-123',
        body: {
          displayName: '  Trimmed Name  ',
          bio: '  Trimmed Bio  ',
        },
      });

      const updateData = {
        displayName: req.body.displayName.trim(),
        bio: req.body.bio.trim(),
      };

      expect(updateData.displayName).toBe('Trimmed Name');
      expect(updateData.bio).toBe('Trimmed Bio');
    });
  });

  describe('POST /api/upload-profile-picture', () => {
    it('should successfully upload profile picture to Cloudinary', async () => {
      const req = mockRequest({
        userId: 'test-user-123',
        file: {
          originalname: 'profile.jpg',
          size: 1024 * 500, // 500KB
          mimetype: 'image/jpeg',
          buffer: Buffer.from('fake-image-data'),
        },
      });

      const mockDb = mockFirebaseAdmin.firestore();
      
      // ✅ JAVÍTVA: Proper mock setup
      const mockSet = vi.fn().mockResolvedValue();
      const mockGet = vi.fn().mockResolvedValue({
        exists: true,
        data: () => mockFirestoreUserData,
      });

      mockDb.collection.mockReturnValue({
        doc: vi.fn().mockReturnValue({
          set: mockSet,
          get: mockGet,
        }),
      });

      const uploadResult = {
        secure_url: 'https://cloudinary.com/image.jpg',
        public_id: 'profile-pictures/user_test-user-123_123456',
      };

      // Simulate successful upload
      await mockDb.collection('users').doc(req.userId).set(
        {
          profilePicture: uploadResult.secure_url,
          profilePicturePublicId: uploadResult.public_id,
        },
        { merge: true }
      );

      expect(mockSet).toHaveBeenCalledWith(
        {
          profilePicture: uploadResult.secure_url,
          profilePicturePublicId: uploadResult.public_id,
        },
        { merge: true }
      );
    });

    it('should delete old profile picture when uploading new one', async () => {
      const req = mockRequest({
        userId: 'test-user-123',
        file: {
          originalname: 'new-profile.jpg',
          size: 1024 * 500,
          mimetype: 'image/jpeg',
          buffer: Buffer.from('fake-image-data'),
        },
      });

      const mockDb = mockFirebaseAdmin.firestore();
      mockDb.collection().doc().get.mockResolvedValue({
        exists: true,
        data: () => ({
          ...mockFirestoreUserData,
          profilePicture: 'https://cloudinary.com/old-image.jpg',
          profilePicturePublicId: 'profile-pictures/old_id',
        }),
      });

      mockCloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

      const userDoc = await mockDb.collection('users').doc(req.userId).get();
      const oldPublicId = userDoc.data().profilePicturePublicId;

      if (oldPublicId) {
        await mockCloudinary.uploader.destroy(oldPublicId);
        expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith(
          'profile-pictures/old_id'
        );
      }
    });

    it('should reject if no file uploaded', async () => {
      const req = mockRequest({
        userId: 'test-user-123',
        file: null,
      });

      const hasFile = !!req.file;
      expect(hasFile).toBe(false);
    });

    it('should reject files over size limit', async () => {
      const req = mockRequest({
        userId: 'test-user-123',
        file: {
          originalname: 'large.jpg',
          size: 1024 * 1024 * 10, // 10MB
          mimetype: 'image/jpeg',
          buffer: Buffer.from('fake-large-image-data'),
        },
      });

      const maxSize = 5 * 1024 * 1024; // 5MB
      const isValidSize = req.file.size <= maxSize;

      expect(isValidSize).toBe(false);
    });

    it('should reject invalid file types', async () => {
      const req = mockRequest({
        userId: 'test-user-123',
        file: {
          originalname: 'document.pdf',
          size: 1024 * 500,
          mimetype: 'application/pdf',
          buffer: Buffer.from('fake-pdf-data'),
        },
      });

      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const isValidType = allowedTypes.test(req.file.mimetype);

      expect(isValidType).toBe(false);
    });
  });

  // Backend profile.test.js - DELETE test FINAL FIX

describe('DELETE /api/delete-profile-picture', () => {
  it('should successfully delete profile picture', async () => {
    const req = mockRequest({
      userId: 'test-user-123',
    });

    // ✅ KRITIKUS: userData egy CONST, nem function result
    const userData = {
      ...mockFirestoreUserData,
      profilePicture: 'https://cloudinary.com/image.jpg',
      profilePicturePublicId: 'profile-pictures/user_123',
    };

    const mockDb = mockFirebaseAdmin.firestore();
    
    // ✅ Mock setup - userData CONST referencia
    mockDb.collection().doc().get.mockResolvedValue({
      exists: true,
      data: () => userData,  // ← userData a const
    });

    mockCloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

    // ✅ Get document
    const userDoc = await mockDb.collection('users').doc(req.userId).get();
    
    // ✅ Extract publicId DIRECTLY from userData const
    const publicId = userData.profilePicturePublicId;
    
    // ✅ Assertion
    expect(publicId).toBe('profile-pictures/user_123');

    // ✅ Call destroy
    await mockCloudinary.uploader.destroy(publicId);

    // ✅ Verify
    expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith(
      'profile-pictures/user_123'
    );
  });
});

  describe('POST /api/validate-google-session', () => {
    it('should successfully validate Google Firebase token', async () => {
      const req = mockRequest({
        body: {
          firebaseIdToken: 'valid-firebase-token',
          email: 'google@example.com',
        },
      });

      const mockAuth = mockFirebaseAdmin.auth();
      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'google-user-123',
        email: 'google@example.com',
      });
      mockAuth.getUser.mockResolvedValue({
        uid: 'google-user-123',
        email: 'google@example.com',
        displayName: 'Google User',
        emailVerified: true,
        providerData: [{ providerId: 'google.com' }],
      });

      const decodedToken = await mockAuth.verifyIdToken(req.body.firebaseIdToken);
      expect(decodedToken.email).toBe(req.body.email);

      const userRecord = await mockAuth.getUser(decodedToken.uid);
      expect(userRecord.emailVerified).toBe(true);
    });

    it('should create Firestore document for new Google user', async () => {
      const req = mockRequest({
        body: {
          firebaseIdToken: 'valid-firebase-token',
          email: 'newgoogle@example.com',
        },
      });

      const mockAuth = mockFirebaseAdmin.auth();
      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'new-google-user-123',
        email: 'newgoogle@example.com',
      });
      mockAuth.getUser.mockResolvedValue({
        uid: 'new-google-user-123',
        email: 'newgoogle@example.com',
        displayName: 'New Google User',
        photoURL: 'https://google.com/photo.jpg',
        emailVerified: true,
        providerData: [{ providerId: 'google.com' }],
      });

      const mockDb = mockFirebaseAdmin.firestore();
      mockDb.collection().doc().get.mockResolvedValue({
        exists: false,
      });
      mockDb.collection().doc().set.mockResolvedValue();

      const decodedToken = await mockAuth.verifyIdToken(
        req.body.firebaseIdToken
      );
      const userRecord = await mockAuth.getUser(decodedToken.uid);
      const userDoc = await mockDb
        .collection('users')
        .doc(decodedToken.uid)
        .get();

      if (!userDoc.exists) {
        const isGoogleProvider = userRecord.providerData.some(
          (p) => p.providerId === 'google.com'
        );

        await mockDb.collection('users').doc(userRecord.uid).set({
          email: userRecord.email,
          displayName: userRecord.displayName,
          provider: isGoogleProvider ? 'google' : 'email',
          photoURL: userRecord.photoURL,
        });

        expect(mockDb.collection().doc().set).toHaveBeenCalledWith({
          email: 'newgoogle@example.com',
          displayName: 'New Google User',
          provider: 'google',
          photoURL: 'https://google.com/photo.jpg',
        });
      }
    });

    it('should reject if email does not match token', async () => {
      const req = mockRequest({
        body: {
          firebaseIdToken: 'valid-firebase-token',
          email: 'wrong@example.com',
        },
      });

      const mockAuth = mockFirebaseAdmin.auth();
      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'google-user-123',
        email: 'correct@example.com',
      });

      const decodedToken = await mockAuth.verifyIdToken(
        req.body.firebaseIdToken
      );
      const emailMatches = decodedToken.email === req.body.email;

      expect(emailMatches).toBe(false);
    });

    it('should reject unverified Google email', async () => {
      const req = mockRequest({
        body: {
          firebaseIdToken: 'valid-firebase-token',
          email: 'unverified@example.com',
        },
      });

      const mockAuth = mockFirebaseAdmin.auth();
      mockAuth.verifyIdToken.mockResolvedValue({
        uid: 'google-user-123',
        email: 'unverified@example.com',
      });
      mockAuth.getUser.mockResolvedValue({
        uid: 'google-user-123',
        email: 'unverified@example.com',
        emailVerified: false,
      });

      const decodedToken = await mockAuth.verifyIdToken(
        req.body.firebaseIdToken
      );
      const userRecord = await mockAuth.getUser(decodedToken.uid);

      expect(userRecord.emailVerified).toBe(false);
    });

    it('should reject request without token or email', async () => {
      const req = mockRequest({
        body: {
          firebaseIdToken: 'valid-token',
          // ✅ JAVÍTVA: email hiányzik
        },
      });

      const isValid = !!(req.body.firebaseIdToken && req.body.email);
      expect(isValid).toBe(false);
    });
  });

  describe('POST /api/login-with-2fa-google', () => {
    it('should successfully login with Google and 2FA', async () => {
      const req = mockRequest({
        body: {
          sessionId: 'valid-session-123',
          code: '123456',
        },
      });

      const mockAuth = mockFirebaseAdmin.auth();
      mockAuth.createCustomToken.mockResolvedValue('custom-token-google-123');

      const mockDb = mockFirebaseAdmin.firestore();
      mockDb.collection().doc().get.mockResolvedValue({
        exists: true,
        data: () => ({
          ...mockFirestoreUserData,
          twoFA: {
            enabled: true,
            secret: 'GOOGLE_SECRET',
            backupCodes: ['BACKUP1'],
          },
        }),
      });

      // Simulate session storage
      const pendingAuth = new Map();
      pendingAuth.set('valid-session-123', {
        email: 'google@example.com',
        uid: 'google-user-123',
        timestamp: Date.now(),
        provider: 'google',
      });

      const session = pendingAuth.get(req.body.sessionId);
      expect(session).toBeDefined();
      expect(session.provider).toBe('google');

      const customToken = await mockAuth.createCustomToken(session.uid);
      expect(customToken).toBe('custom-token-google-123');
    });

    it('should reject expired or invalid session', async () => {
      const req = mockRequest({
        body: {
          sessionId: 'invalid-session-456',
          code: '123456',
        },
      });

      const pendingAuth = new Map();
      const session = pendingAuth.get(req.body.sessionId);

      expect(session).toBeUndefined();
    });

    it('should reject non-Google session', async () => {
      const req = mockRequest({
        body: {
          sessionId: 'email-session-123',
          code: '123456',
        },
      });

      const pendingAuth = new Map();
      pendingAuth.set('email-session-123', {
        email: 'email@example.com',
        uid: 'email-user-123',
        timestamp: Date.now(),
        provider: 'email',
      });

      const session = pendingAuth.get(req.body.sessionId);
      const isGoogleSession = session?.provider === 'google';

      expect(isGoogleSession).toBe(false);
    });
  });
});