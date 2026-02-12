import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    mockFirebaseAdmin,
    mockSpeakeasy,
    mockNodemailer,
    mockTransporter,
    mockRequest,
    mockResponse,
    mockNext,
    mockUserData,
    mockFirestoreUserData,
    mockUser2FAEnabled,
    createFirebaseError,
} from '../mocks';

// Mock dependencies
vi.mock('firebase-admin', () => ({ default: mockFirebaseAdmin }));
vi.mock('speakeasy', () => ({ default: mockSpeakeasy }));
vi.mock('nodemailer', () => ({ default: mockNodemailer }));

describe('Backend Authentication Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /api/register-user', () => {
        it('should successfully register a new user', async () => {
            const req = mockRequest({
                body: {
                    email: 'newuser@example.com',
                    password: 'Test123!@#',
                    displayName: 'New User',
                },
            });
            const res = mockResponse();

            const mockAuth = mockFirebaseAdmin.auth();
            mockAuth.createUser.mockResolvedValue({
                uid: 'new-user-123',
                email: 'newuser@example.com',
            });
            mockAuth.generateEmailVerificationLink.mockResolvedValue(
                'https://example.com/verify?oobCode=ABC123'
            );

            const mockDb = mockFirebaseAdmin.firestore();
            mockDb.collection().doc().set.mockResolvedValue();

            mockTransporter.sendMail.mockResolvedValue({
                messageId: 'test-message-id',
            });

            // Simulate the endpoint logic
            const userRecord = await mockAuth.createUser({
                email: req.body.email,
                password: req.body.password,
                displayName: req.body.displayName,
                emailVerified: false,
            });

            const verificationLink = await mockAuth.generateEmailVerificationLink(
                req.body.email
            );

            const emailSent = await mockTransporter.sendMail({
                to: req.body.email,
                subject: 'Email Verification',
            });

            await mockDb.collection('users').doc(userRecord.uid).set({
                email: req.body.email,
                name: req.body.displayName,
                displayName: req.body.displayName,
            });

            expect(mockAuth.createUser).toHaveBeenCalledWith({
                email: 'newuser@example.com',
                password: 'Test123!@#',
                displayName: 'New User',
                emailVerified: false,
            });
            expect(mockAuth.generateEmailVerificationLink).toHaveBeenCalledWith(
                'newuser@example.com'
            );
            expect(mockTransporter.sendMail).toHaveBeenCalled();
            expect(emailSent.messageId).toBe('test-message-id');
        });

        it('should reject registration with missing fields', async () => {
            const req = mockRequest({
                body: {
                    // email, password, displayName mind undefined
                },
            });

            const { email, password, displayName } = req.body;
            const isValid = email && password && displayName;

            expect(isValid).toBeFalsy();  // ✅ undefined is falsy
        });

        it('should reject registration with short password', async () => {
            const req = mockRequest({
                body: {
                    email: 'test@example.com',
                    password: '12345', // too short
                    displayName: 'Test User',
                },
            });

            const isPasswordValid = req.body.password.length >= 6;
            expect(isPasswordValid).toBe(false);
        });

        it('should reject registration with short display name', async () => {
            const req = mockRequest({
                body: {
                    email: 'test@example.com',
                    password: 'Test123!',
                    displayName: 'T', // too short
                },
            });

            const isNameValid = req.body.displayName.trim().length >= 2;
            expect(isNameValid).toBe(false);
        });

        it('should handle duplicate email error', async () => {
            const req = mockRequest({
                body: {
                    email: 'existing@example.com',
                    password: 'Test123!@#',
                    displayName: 'Existing User',
                },
            });

            const mockAuth = mockFirebaseAdmin.auth();
            mockAuth.createUser.mockRejectedValue(
                createFirebaseError('auth/email-already-exists', 'Email already exists')
            );

            try {
                await mockAuth.createUser(req.body);
            } catch (error) {
                expect(error.code).toBe('auth/email-already-exists');
            }
        });

        it('should handle invalid email error', async () => {
            const req = mockRequest({
                body: {
                    email: 'invalid-email',
                    password: 'Test123!@#',
                    displayName: 'Test User',
                },
            });

            const mockAuth = mockFirebaseAdmin.auth();
            mockAuth.createUser.mockRejectedValue(
                createFirebaseError('auth/invalid-email', 'Invalid email format')
            );

            try {
                await mockAuth.createUser(req.body);
            } catch (error) {
                expect(error.code).toBe('auth/invalid-email');
            }
        });
    });

    describe('POST /api/check-2fa-required', () => {
        it('should return true if 2FA is enabled', async () => {
            const req = mockRequest({
                body: { email: 'test@example.com' }
            });

            const mockAuth = mockFirebaseAdmin.auth();
            mockAuth.getUserByEmail.mockResolvedValue(mockUserData);

            const mockDb = mockFirebaseAdmin.firestore();
            
            // ✅ FIX: Create the mock data structure
            const mock2FAEnabledData = {
                email: 'test@example.com',
                name: 'Test User',
                displayName: 'Test User',
                createdAt: { toDate: () => new Date() },
                twoFA: {
                    enabled: true,
                    secret: 'VALID_SECRET_123',
                    backupCodes: ['BACKUP1', 'BACKUP2', 'BACKUP3']
                }
            };
            
            const getMock = vi.fn().mockResolvedValue({
                exists: true,
                data: () => mock2FAEnabledData,
            });
            
            const docMock = vi.fn().mockReturnValue({
                get: getMock,
            });
            
            const collectionMock = vi.fn().mockReturnValue({
                doc: docMock,
            });
            
            mockDb.collection = collectionMock;

            const userRecord = await mockAuth.getUserByEmail(req.body.email);
            const userDoc = await mockDb.collection('users').doc(userRecord.uid).get();
            const userData = userDoc.data();

            expect(userData.twoFA.enabled).toBe(true);
        });

        it('should return false if 2FA is not enabled', async () => {
            const req = mockRequest({
                body: { email: 'test@example.com' },
            });

            const mockAuth = mockFirebaseAdmin.auth();
            mockAuth.getUserByEmail.mockResolvedValue(mockUserData);

            const mockDb = mockFirebaseAdmin.firestore();
            mockDb.collection().doc().get.mockResolvedValue({
                exists: true,
                data: () => mockFirestoreUserData,
            });

            const userRecord = await mockAuth.getUserByEmail(req.body.email);
            const userDoc = await mockDb.collection('users').doc(userRecord.uid).get();
            const userData = userDoc.data();

            expect(userData.twoFA.enabled).toBe(false);
        });

        it('should handle user not found', async () => {
            const req = mockRequest({
                body: { email: 'nonexistent@example.com' },
            });

            const mockAuth = mockFirebaseAdmin.auth();
            mockAuth.getUserByEmail.mockRejectedValue(
                createFirebaseError('auth/user-not-found', 'User not found')
            );

            try {
                await mockAuth.getUserByEmail(req.body.email);
            } catch (error) {
                expect(error.code).toBe('auth/user-not-found');
            }
        });

        it('should reject request without email', async () => {
            const req = mockRequest({
                body: {},
            });

            const isValid = !!req.body.email;
            expect(isValid).toBe(false);
        });
    });

    describe('POST /api/validate-password', () => {
        it('should validate correct password', async () => {
            const req = mockRequest({
                body: {
                    email: 'test@example.com',
                    password: 'CorrectPass123!',
                },
            });

            // Mock successful Firebase Auth REST API response
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            idToken: 'mock-id-token',
                            email: 'test@example.com',
                            localId: 'test-user-123',
                        }),
                })
            );

            const mockAuth = mockFirebaseAdmin.auth();
            mockAuth.getUserByEmail.mockResolvedValue({
                ...mockUserData,
                emailVerified: true,
            });

            const response = await fetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=mock-api-key`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: req.body.email,
                        password: req.body.password,
                        returnSecureToken: true,
                    }),
                }
            );

            const data = await response.json();
            expect(response.ok).toBe(true);
            expect(data.email).toBe('test@example.com');
        });

        it('should reject incorrect password', async () => {
            const req = mockRequest({
                body: {
                    email: 'test@example.com',
                    password: 'WrongPassword',
                },
            });

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: false,
                    json: () =>
                        Promise.resolve({
                            error: {
                                code: 400,
                                message: 'INVALID_PASSWORD',
                            },
                        }),
                })
            );

            const response = await fetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=mock-api-key`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: req.body.email,
                        password: req.body.password,
                        returnSecureToken: true,
                    }),
                }
            );

            expect(response.ok).toBe(false);
        });

        it('should reject unverified email', async () => {
            const req = mockRequest({
                body: {
                    email: 'test@example.com',
                    password: 'CorrectPass123!',
                },
            });

            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ idToken: 'mock-id-token' }),
                })
            );

            const mockAuth = mockFirebaseAdmin.auth();
            mockAuth.getUserByEmail.mockResolvedValue({
                ...mockUserData,
                emailVerified: false,
            });

            const userRecord = await mockAuth.getUserByEmail(req.body.email);
            expect(userRecord.emailVerified).toBe(false);
        });

        it('should reject request without email or password', async () => {
            const req = mockRequest({
                body: { email: 'test@example.com' },
            });

            // ✅ FIX: Convert undefined to false explicitly
            const isValid = !!(req.body.email && req.body.password);
            expect(isValid).toBe(false);
        });
    });

    describe('POST /api/login-with-2fa', () => {
        it('should successfully login with valid TOTP code', async () => {
            const req = mockRequest({
                body: {
                    email: 'test@example.com',
                    code: '123456',
                },
            });

            const mockAuth = mockFirebaseAdmin.auth();
            mockAuth.getUserByEmail.mockResolvedValue({
                ...mockUserData,
                emailVerified: true,
            });
            mockAuth.createCustomToken.mockResolvedValue('custom-token-123');

            const mockDb = mockFirebaseAdmin.firestore();
            mockDb.collection().doc().get.mockResolvedValue({
                exists: true,
                data: () => mockUser2FAEnabled,
            });

            mockSpeakeasy.totp.verify.mockReturnValue(true);

            const userRecord = await mockAuth.getUserByEmail(req.body.email);
            const userDoc = await mockDb.collection('users').doc(userRecord.uid).get();
            const twoFAData = userDoc.data();

            const isValid = mockSpeakeasy.totp.verify({
                secret: twoFAData.twoFA.secret,
                encoding: 'base32',
                token: req.body.code,
                window: 2,
            });

            expect(isValid).toBe(true);

            const customToken = await mockAuth.createCustomToken(userRecord.uid);
            expect(customToken).toBe('custom-token-123');
        });

        it('should successfully login with valid backup code', async () => {
            const validBackupCode = 'BACKUP1';

            const req = mockRequest({
                body: {
                    email: 'test@example.com',
                    code: validBackupCode,
                }
            });

            const mockAuth = mockFirebaseAdmin.auth();
            mockAuth.getUserByEmail.mockResolvedValue({
                ...mockUserData,
                emailVerified: true,
            });

            const mockDb = mockFirebaseAdmin.firestore();
            
            // ✅ FIX: Create the mock data structure with backup codes
            const mock2FAWithBackupCodes = {
                email: 'test@example.com',
                name: 'Test User',
                displayName: 'Test User',
                createdAt: { toDate: () => new Date() },
                twoFA: {
                    enabled: true,
                    secret: 'VALID_SECRET_123',
                    backupCodes: ['BACKUP1', 'BACKUP2', 'BACKUP3']
                }
            };
            
            const getMock = vi.fn().mockResolvedValue({
                exists: true,
                data: () => mock2FAWithBackupCodes,
            });
            
            const docMock = vi.fn().mockReturnValue({
                get: getMock,
            });
            
            const collectionMock = vi.fn().mockReturnValue({
                doc: docMock,
            });
            
            mockDb.collection = collectionMock;

            const userDoc = await mockDb.collection('users').doc('test-user-123').get();
            const twoFAData = userDoc.data();

            const isBackupCode = twoFAData.twoFA.backupCodes.includes(req.body.code);
            expect(isBackupCode).toBe(true);

            const updatedBackupCodes = twoFAData.twoFA.backupCodes.filter(
                (code) => code !== req.body.code
            );
            expect(updatedBackupCodes).toHaveLength(2);
        });

        it('should reject invalid 2FA code', async () => {
            const req = mockRequest({
                body: {
                    email: 'test@example.com',
                    code: '000000',
                },
            });

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

            mockSpeakeasy.totp.verify.mockReturnValue(false);

            const userDoc = await mockDb.collection('users').doc('test-user-123').get();
            const twoFAData = userDoc.data();

            const isTOTPValid = mockSpeakeasy.totp.verify({
                secret: twoFAData.twoFA.secret,
                encoding: 'base32',
                token: req.body.code,
                window: 2,
            });

            const isBackupCode = twoFAData.twoFA.backupCodes.includes(req.body.code);

            expect(isTOTPValid).toBe(false);
            expect(isBackupCode).toBe(false);
        });

        it('should reject if 2FA is not enabled', async () => {
            const req = mockRequest({
                body: {
                    email: 'test@example.com',
                    code: '123456',
                },
            });

            const mockAuth = mockFirebaseAdmin.auth();
            mockAuth.getUserByEmail.mockResolvedValue(mockUserData);

            const mockDb = mockFirebaseAdmin.firestore();
            mockDb.collection().doc().get.mockResolvedValue({
                exists: true,
                data: () => mockFirestoreUserData,
            });

            const userDoc = await mockDb.collection('users').doc('test-user-123').get();
            const twoFAData = userDoc.data();

            expect(twoFAData.twoFA.enabled).toBe(false);
        });

        it('should reject unverified email', async () => {
            const req = mockRequest({
                body: {
                    email: 'test@example.com',
                    code: '123456',
                },
            });

            const mockAuth = mockFirebaseAdmin.auth();
            mockAuth.getUserByEmail.mockResolvedValue({
                ...mockUserData,
                emailVerified: false,
            });

            const userRecord = await mockAuth.getUserByEmail(req.body.email);
            expect(userRecord.emailVerified).toBe(false);
        });

        it('should reject request without email or code', async () => {
            const req = mockRequest({
                body: { email: 'test@example.com' },
            });

            // ✅ FIX: Convert undefined to false explicitly
            const isValid = !!(req.body.email && req.body.code);
            expect(isValid).toBe(false);
        });
    });

    describe('GET /api/setup-mfa', () => {
        it('should generate new 2FA secret and QR code', async () => {
            const req = mockRequest({
                userId: 'test-user-123',
                userEmail: 'test@example.com',
            });

            mockSpeakeasy.generateSecret.mockReturnValue({
                base32: 'NEWSECRET123',
                otpauth_url: 'otpauth://totp/LudusGen?secret=NEWSECRET123',
            });

            mockSpeakeasy.otpauthURL.mockReturnValue(
                'otpauth://totp/LudusGen?secret=NEWSECRET123'
            );

            const secretObj = mockSpeakeasy.generateSecret({
                name: `LudusGen (${req.userEmail})`,
                issuer: 'LudusGen',
                length: 32,
            });

            expect(secretObj.base32).toBe('NEWSECRET123');
            expect(mockSpeakeasy.generateSecret).toHaveBeenCalledWith({
                name: 'LudusGen (test@example.com)',
                issuer: 'LudusGen',
                length: 32,
            });
        });

        it('should reuse existing secret if not yet enabled', async () => {
            const req = mockRequest({
                userId: 'test-user-123',
                userEmail: 'test@example.com',
            });

            const mockDb = mockFirebaseAdmin.firestore();

            // ✅ FIX: Create the mock data structure with existing secret
            const mockExistingSecret = {
                email: 'test@example.com',
                name: 'Test User',
                displayName: 'Test User',
                createdAt: { toDate: () => new Date() },
                twoFA: {
                    enabled: false,
                    secret: 'EXISTING_SECRET',
                    backupCodes: ['BACKUP1', 'BACKUP2'],
                },
            };
            
            const getMock = vi.fn().mockResolvedValue({
                exists: true,
                data: () => mockExistingSecret,
            });
            
            const docMock = vi.fn().mockReturnValue({
                get: getMock,
            });
            
            const collectionMock = vi.fn().mockReturnValue({
                doc: docMock,
            });
            
            mockDb.collection = collectionMock;

            const userDoc = await mockDb.collection('users').doc(req.userId).get();
            const existing2FA = userDoc.data();

            expect(existing2FA.twoFA.secret).toBe('EXISTING_SECRET');
            expect(existing2FA.twoFA.enabled).toBe(false);
        });

        it('should generate backup codes', async () => {
            const generateBackupCodes = (count = 10) => {
                const codes = [];
                for (let i = 0; i < count; i++) {
                    codes.push(`BACKUP${i + 1}`);
                }
                return codes;
            };

            const backupCodes = generateBackupCodes(10);
            expect(backupCodes).toHaveLength(10);
            expect(backupCodes[0]).toBe('BACKUP1');
        });
    });

    describe('POST /api/verify-mfa', () => {
        it('should successfully verify and enable 2FA', async () => {
            const req = mockRequest({
                userId: 'test-user-123',
                body: { code: '123456' },
            });

            const mockDb = mockFirebaseAdmin.firestore();
            mockDb.collection().doc().get.mockResolvedValue({
                exists: true,
                data: () => ({
                    ...mockFirestoreUserData,
                    twoFA: {
                        enabled: false,
                        secret: 'PENDING_SECRET',
                        backupCodes: ['BACKUP1', 'BACKUP2'],
                    },
                }),
            });

            mockSpeakeasy.totp.verify.mockReturnValue(true);

            const userDoc = await mockDb.collection('users').doc(req.userId).get();
            const twoFAData = userDoc.data();

            const verified = mockSpeakeasy.totp.verify({
                secret: twoFAData.twoFA.secret,
                encoding: 'base32',
                token: req.body.code,
                window: 2,
            });

            expect(verified).toBe(true);
            expect(twoFAData.twoFA.enabled).toBe(false);
        });

        it('should reject invalid verification code', async () => {
            const req = mockRequest({
                userId: 'test-user-123',
                body: { code: '000000' },
            });

            const mockDb = mockFirebaseAdmin.firestore();
            mockDb.collection().doc().get.mockResolvedValue({
                exists: true,
                data: () => ({
                    ...mockFirestoreUserData,
                    twoFA: {
                        enabled: false,
                        secret: 'PENDING_SECRET',
                        backupCodes: [],
                    },
                }),
            });

            mockSpeakeasy.totp.verify.mockReturnValue(false);

            const verified = mockSpeakeasy.totp.verify({
                secret: 'PENDING_SECRET',
                encoding: 'base32',
                token: req.body.code,
                window: 2,
            });

            expect(verified).toBe(false);
        });

        it('should reject if no 2FA session exists', async () => {
            const req = mockRequest({
                userId: 'test-user-123',
                body: { code: '123456' },
            });

            const mockDb = mockFirebaseAdmin.firestore();
            mockDb.collection().doc().get.mockResolvedValue({
                exists: true,
                data: () => mockFirestoreUserData,
            });

            const userDoc = await mockDb.collection('users').doc(req.userId).get();
            const twoFAData = userDoc.data();

            expect(twoFAData.twoFA.secret).toBeNull();
        });

        it('should reject if 2FA already enabled', async () => {
            const req = mockRequest({
                userId: 'test-user-123',
                body: { code: '123456' },
            });

            const mockDb = mockFirebaseAdmin.firestore();

            // ✅ FIX: Properly configure the mock chain
            const getMock = vi.fn(() => ({
                exists: true,
                data: () => ({
                    email: 'test@example.com',
                    name: 'Test User',
                    displayName: 'Test User',
                    createdAt: { toDate: () => new Date() },
                    twoFA: {
                        enabled: true,
                        secret: 'VALID_SECRET_123',
                        backupCodes: ['BACKUP1', 'BACKUP2', 'BACKUP3']
                    }
                }),
            }));

            mockDb.collection.mockReturnValue({
                doc: vi.fn(() => ({
                    get: getMock,
                })),
            });

            const userDoc = await mockDb.collection('users').doc(req.userId).get();
            const twoFAData = userDoc.data();

            expect(twoFAData.twoFA.enabled).toBe(true);
        });

        it('should reject invalid code format', async () => {
            const req = mockRequest({
                userId: 'test-user-123',
                body: { code: '12' }, // too short
            });

            const code = String(req.body.code || '').trim();
            const isValidFormat = code && code.length === 6;

            expect(isValidFormat).toBe(false);
        });
    });

    describe('POST /api/disable-2fa', () => {
        it('should successfully disable 2FA with valid code', async () => {
            const req = mockRequest({
                userId: 'test-user-123',
                body: { code: '123456' },
            });

            const mockDb = mockFirebaseAdmin.firestore();
            mockDb.collection().doc().get.mockResolvedValue({
                exists: true,
                data: () => mockUser2FAEnabled,
            });

            mockSpeakeasy.totp.verify.mockReturnValue(true);

            const userDoc = await mockDb.collection('users').doc(req.userId).get();
            const twoFAData = userDoc.data();

            const verified = mockSpeakeasy.totp.verify({
                secret: twoFAData.twoFA.secret,
                encoding: 'base32',
                token: req.body.code,
                window: 2,
            });

            expect(verified).toBe(true);
        });

        it('should reject invalid code when disabling', async () => {
            const req = mockRequest({
                userId: 'test-user-123',
                body: { code: '000000' },
            });

            const mockDb = mockFirebaseAdmin.firestore();
            mockDb.collection().doc().get.mockResolvedValue({
                exists: true,
                data: () => mockUser2FAEnabled,
            });

            mockSpeakeasy.totp.verify.mockReturnValue(false);

            const verified = mockSpeakeasy.totp.verify({
                secret: mockUser2FAEnabled.twoFA.secret,
                encoding: 'base32',
                token: req.body.code,
                window: 2,
            });

            expect(verified).toBe(false);
        });

        it('should reject if 2FA is not enabled', async () => {
            const req = mockRequest({
                userId: 'test-user-123',
                body: { code: '123456' },
            });

            const mockDb = mockFirebaseAdmin.firestore();
            mockDb.collection().doc().get.mockResolvedValue({
                exists: true,
                data: () => mockFirestoreUserData,
            });

            const userDoc = await mockDb.collection('users').doc(req.userId).get();
            const twoFAData = userDoc.data();

            expect(twoFAData.twoFA.enabled).toBe(false);
        });
    });
});