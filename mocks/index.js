import { vi } from 'vitest';

// Mock Firebase Admin
export const mockFirebaseAdmin = {
    auth: vi.fn(() => ({
        createUser: vi.fn(),
        getUserByEmail: vi.fn(),
        getUser: vi.fn(),
        verifyIdToken: vi.fn(),
        createCustomToken: vi.fn(),
        generateEmailVerificationLink: vi.fn(),
        deleteUser: vi.fn(),
    })),
    firestore: vi.fn(() => ({
        collection: vi.fn(() => ({
            doc: vi.fn(() => ({
                get: vi.fn(() => ({
                    exists: true,
                    data: () => mockFirestoreUserData,  // ✅ JAVÍTVA
                })),
                set: vi.fn(),
            })),
        })),
        FieldValue: {
            serverTimestamp: vi.fn(() => new Date()),
            delete: vi.fn(() => 'DELETE'),
        },
    })),
    credential: {
        cert: vi.fn(),
    },
    initializeApp: vi.fn(),
};

// Mock Speakeasy
export const mockSpeakeasy = {
    generateSecret: vi.fn(() => ({
        base32: 'MOCK_SECRET_BASE32',
        otpauth_url: 'otpauth://totp/LudusGen?secret=MOCK_SECRET_BASE32',
    })),
    totp: {
        verify: vi.fn(),
        generate: vi.fn(() => '123456'),
    },
    otpauthURL: vi.fn(() => 'otpauth://totp/LudusGen?secret=MOCK_SECRET_BASE32'),
};

// Mock QRCode
export const mockQRCode = {
    toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,MOCK_QR_CODE')),
};

// Mock Nodemailer
export const mockTransporter = {
    sendMail: vi.fn(() => Promise.resolve({ messageId: 'mock-message-id' })),
    verify: vi.fn((callback) => callback(null, true)),
};

export const mockNodemailer = {
    createTransport: vi.fn(() => mockTransporter),
    getTestMessageUrl: vi.fn(() => 'https://ethereal.email/message/mock'),
};

// Mock Cloudinary
export const mockCloudinary = {
    config: vi.fn(),
    uploader: {
        upload_stream: vi.fn(),
        destroy: vi.fn(() => Promise.resolve({ result: 'ok' })),
    },
};

// Mock User Data
export const mockUserData = {
    uid: 'test-user-123',
    email: 'test@example.com',
    displayName: 'Test User',
    emailVerified: true,
    photoURL: null,
    providerData: [{ providerId: 'password' }],
};

export const mockFirestoreUserData = {
    email: 'test@example.com',
    name: 'Test User',
    displayName: 'Test User',
    createdAt: { toDate: () => new Date() },
    twoFA: {
        enabled: false,
        secret: null,
        backupCodes: [],
    },
};

export const mockUser2FAEnabled = {
    ...mockFirestoreUserData,
    twoFA: {
        enabled: true,
        secret: 'MOCK_SECRET_BASE32',
        backupCodes: ['BACKUP1', 'BACKUP2', 'BACKUP3'],
    },
};

// Mock Request/Response
export const mockRequest = (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
});

export const mockResponse = () => {
    const res = {
        status: vi.fn(() => res),
        json: vi.fn(() => res),
        send: vi.fn(() => res),
    };
    return res;
};

export const mockNext = vi.fn();

// Mock Axios Response
export const mockAxiosResponse = (data, status = 200) => ({
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {},
});

export const mockAxiosError = (message, status = 500) => {
    const error = new Error(message);
    error.response = {
        data: { success: false, message },
        status,
        statusText: 'Error',
    };
    return error;
};

// Mock Firebase Client Auth
export const mockFirebaseAuth = {
    currentUser: null,
    onAuthStateChanged: vi.fn((callback) => {
        // Store callback for later use in tests
        mockFirebaseAuth._authCallback = callback;
        return vi.fn(); // unsubscribe function
    }),
    signInWithEmailAndPassword: vi.fn(),
    signInWithCustomToken: vi.fn(),
    signInWithPopup: vi.fn(),
    signOut: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
};

// Mock Context Value
export const mockUserContext = {
    user: null,
    signUpUser: vi.fn(),
    logoutUser: vi.fn(),
    signInUser: vi.fn(),
    signInWith2FA: vi.fn(),
    signInWithGoogle: vi.fn(),
    msg: {},
    setMsg: vi.fn(),
    setUser: vi.fn(),
    updateUser: vi.fn(),
    isAuthOpen: false,
    setIsAuthOpen: vi.fn(),
    showNavbar: true,
    setShowNavbar: vi.fn(),
    is2FAEnabled: false,
    loading2FA: false,
    resetPassword: vi.fn(),
    refresh2FAStatus: vi.fn(),
    loadUserFromFirestore: vi.fn(),
};

// Helper to create mock authenticated user
export const createMockAuthUser = (overrides = {}) => ({
    ...mockUserData,
    getIdToken: vi.fn(() => Promise.resolve('mock-id-token')),
    reload: vi.fn(() => Promise.resolve()),
    ...overrides,
});

// Helper to create mock Firebase error
export const createFirebaseError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
};

// ✅ HELPER FUNCTIONS to create specific mock scenarios

/**
 * Creates a Firestore mock that returns specific user data
 * @param {Object} userData - Custom user data to return
 */
export const createFirestoreMock = (userData = mockFirestoreUserData) => {
    return vi.fn(() => ({
        collection: vi.fn(() => ({
            doc: vi.fn(() => ({
                get: vi.fn(() => ({
                    exists: true,
                    data: () => userData,
                })),
                set: vi.fn(),
                update: vi.fn(),
            })),
        })),
        FieldValue: {
            serverTimestamp: vi.fn(() => new Date()),
            delete: vi.fn(() => 'DELETE'),
        },
    }));
};

/**
 * Creates mock data for a user with 2FA enabled
 * @param {Object} overrides - Properties to override
 */
export const createMock2FAUser = (overrides = {}) => ({
    ...mockFirestoreUserData,
    twoFA: {
        enabled: true,
        secret: 'EXISTING_SECRET',
        backupCodes: ['BACKUP_CODE_123', 'BACKUP_CODE_456', 'BACKUP_CODE_789'],
    },
    ...overrides,
});

/**
 * Creates a mock request with missing fields
 */
export const createInvalidRequest = () => mockRequest({
    body: {
        // Intentionally missing required fields
    }
});