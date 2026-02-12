import { test, expect } from '@playwright/test';

test.describe('Authentication E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login modal when clicking login button', async ({ page }) => {
    // Click the login/signup button (adjust selector based on your app)
    await page.click('[data-testid="open-auth-modal"]');

    // Modal should be visible
    await expect(page.locator('text=Üdvözlünk!')).toBeVisible();
    await expect(page.locator('text=Lépj be a fiókodba')).toBeVisible();
  });

  test('should switch between login and signup modes', async ({ page }) => {
    await page.click('[data-testid="open-auth-modal"]');

    // Should start in login mode
    await expect(page.locator('text=Üdvözlünk!')).toBeVisible();

    // Click signup tab
    await page.click('button:has-text("Regisztráció")');

    // Should switch to signup mode
    await expect(page.locator('text=Csatlakozz!')).toBeVisible();
    await expect(page.locator('text=Hozz létre egy új fiókot')).toBeVisible();

    // Should show name field
    await expect(page.locator('input[placeholder="Kiss János"]')).toBeVisible();

    // Click login tab
    await page.click('button:has-text("Bejelentkezés")');

    // Should switch back to login mode
    await expect(page.locator('text=Üdvözlünk!')).toBeVisible();
  });

  test('should validate email format in real-time', async ({ page }) => {
    await page.click('[data-testid="open-auth-modal"]');

    const emailInput = page.locator('input[type="email"]');

    // Type invalid email
    await emailInput.fill('invalid-email');

    // Should show error
    await expect(page.locator('text=Érvénytelen email formátum')).toBeVisible();

    // Type valid email
    await emailInput.fill('valid@email.com');

    // Error should disappear
    await expect(page.locator('text=Érvénytelen email formátum')).not.toBeVisible();
  });

  test('should validate password requirements during signup', async ({ page }) => {
    await page.click('[data-testid="open-auth-modal"]');

    // Switch to signup mode
    await page.click('button:has-text("Regisztráció")');

    const passwordInput = page.locator('input[type="password"]').first();

    // Type weak password
    await passwordInput.fill('weak');

    // Should show validation errors
    await expect(page.locator('text=Minimum 8 karakter')).toBeVisible();
    await expect(page.locator('text=Legalább egy nagybetű')).toBeVisible();
    await expect(page.locator('text=Legalább egy speciális karakter')).toBeVisible();

    // Type strong password
    await passwordInput.fill('StrongPass123!@#');

    // Validation messages should turn green (success state)
    // Note: You might need to adjust this based on your CSS classes
    await expect(page.locator('text=Minimum 8 karakter')).toHaveClass(/text-green/);
  });

  test('should toggle password visibility', async ({ page }) => {
    await page.click('[data-testid="open-auth-modal"]');

    const passwordInput = page.locator('input[placeholder="••••••••"]');
    const toggleButton = page.locator('button').filter({ has: page.locator('svg') }).nth(1); // Eye icon button

    // Should start as password type
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click toggle
    await toggleButton.click();

    // Should change to text type
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click toggle again
    await toggleButton.click();

    // Should change back to password
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should show forgot password screen', async ({ page }) => {
    await page.click('[data-testid="open-auth-modal"]');

    // Click forgot password link
    await page.click('text=Elfelejtett jelszó?');

    // Should show forgot password screen
    await expect(page.locator('text=Elfelejtett jelszó')).toBeVisible();
    await expect(
      page.locator('text=Add meg az email címedet és küldünk egy visszaállító linket')
    ).toBeVisible();

    // Should have back button
    const backButton = page.locator('button').first();
    await backButton.click();

    // Should return to login screen
    await expect(page.locator('text=Üdvözlünk!')).toBeVisible();
  });

  test('should close modal when clicking close button', async ({ page }) => {
    await page.click('[data-testid="open-auth-modal"]');

    // Modal should be visible
    await expect(page.locator('text=Üdvözlünk!')).toBeVisible();

    // Click close button (X icon)
    await page.click('button').first(); // Close button

    // Modal should be closed
    await expect(page.locator('text=Üdvözlünk!')).not.toBeVisible();
  });

  test('should close modal when clicking backdrop', async ({ page }) => {
    await page.click('[data-testid="open-auth-modal"]');

    // Modal should be visible
    await expect(page.locator('text=Üdvözlünk!')).toBeVisible();

    // Click backdrop (outside modal)
    await page.click('body', { position: { x: 10, y: 10 } });

    // Modal should be closed
    await expect(page.locator('text=Üdvözlünk!')).not.toBeVisible();
  });

  test('should attempt signup with valid data', async ({ page }) => {
    await page.click('[data-testid="open-auth-modal"]');

    // Switch to signup mode
    await page.click('button:has-text("Regisztráció")');

    // Fill form
    await page.fill('input[placeholder="Kiss János"]', 'E2E Test User');
    await page.fill('input[type="email"]', 'e2etest@example.com');
    await page.locator('input[type="password"]').first().fill('TestPass123!@#');
    await page.locator('input[type="password"]').nth(1).fill('TestPass123!@#');

    // Submit button should be enabled
    const submitButton = page.locator('button:has-text("Regisztráció")');
    await expect(submitButton).not.toBeDisabled();

    // Click submit
    await submitButton.click();

    // Should show loading state
    await expect(page.locator('text=Feldolgozás...')).toBeVisible();

    // Wait for response
    // Note: In real test, you'd want to mock the backend or use test database
  });

  test('should attempt login with valid data', async ({ page }) => {
    await page.click('[data-testid="open-auth-modal"]');

    // Fill login form
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'TestPass123!@#');

    // Submit button should be enabled
    const submitButton = page.locator('button:has-text("Bejelentkezés")');
    await expect(submitButton).not.toBeDisabled();

    // Click submit
    await submitButton.click();

    // Should show loading state
    await expect(page.locator('text=Feldolgozás...')).toBeVisible();
  });

  test('should handle Google sign-in button click', async ({ page }) => {
    await page.click('[data-testid="open-auth-modal"]');

    // Find Google sign-in button
    const googleButton = page.locator('button:has-text("Folytatás Google-lel")');

    // Button should be visible
    await expect(googleButton).toBeVisible();

    // Click Google button
    await googleButton.click();

    // Note: Testing actual Google OAuth flow requires special setup
    // In real tests, you'd mock the Google OAuth response
  });
});

test.describe('2FA E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Assume user is logged in
    // You'd need to implement actual login or use stored auth state
  });

  test('should open 2FA setup modal from settings', async ({ page }) => {
    // Navigate to settings
    await page.goto('/settings');

    // Click enable 2FA button
    await page.click('[data-testid="enable-2fa-button"]');

    // Should show QR code
    await expect(page.locator('[data-testid="qr-code"]')).toBeVisible();

    // Should show backup codes
    await expect(page.locator('[data-testid="backup-codes"]')).toBeVisible();
  });

  test('should verify 2FA code', async ({ page }) => {
    await page.goto('/settings');
    await page.click('[data-testid="enable-2fa-button"]');

    // Enter verification code
    const codeInput = page.locator('[data-testid="2fa-code-input"]');
    await codeInput.fill('123456');

    // Click verify button
    await page.click('button:has-text("Ellenőrzés")');

    // Should show success message
    await expect(page.locator('text=2FA sikeresen aktiválva')).toBeVisible();
  });

  test('should require 2FA code during login', async ({ page }) => {
    // Attempt to login with 2FA-enabled account
    await page.goto('/');
    await page.click('[data-testid="open-auth-modal"]');

    await page.fill('input[type="email"]', 'test2fa@example.com');
    await page.fill('input[type="password"]', 'TestPass123!@#');

    await page.click('button:has-text("Bejelentkezés")');

    // Should show 2FA modal
    await expect(page.locator('[data-testid="2fa-modal"]')).toBeVisible();

    // Enter 2FA code
    await page.fill('[data-testid="2fa-code-input"]', '123456');

    // Submit
    await page.click('button:has-text("Bejelentkezés")');

    // Should redirect to dashboard or home
  });
});

test.describe('Profile Management E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Assume user is logged in
  });

  test('should update user profile', async ({ page }) => {
    await page.goto('/profile');

    // Update display name
    const nameInput = page.locator('[data-testid="display-name-input"]');
    await nameInput.fill('Updated Name');

    // Update bio
    const bioInput = page.locator('[data-testid="bio-input"]');
    await bioInput.fill('This is my updated bio');

    // Click save button
    await page.click('button:has-text("Mentés")');

    // Should show success message
    await expect(page.locator('text=Profil sikeresen frissítve')).toBeVisible();
  });

  test('should upload profile picture', async ({ page }) => {
    await page.goto('/profile');

    // Click upload button or file input
    const fileInput = page.locator('input[type="file"]');

    // Set file for upload
    await fileInput.setInputFiles({
      name: 'profile.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-data'),
    });

    // Should show preview or upload button
    await page.click('button:has-text("Feltöltés")');

    // Should show success message
    await expect(page.locator('text=Profilkép sikeresen feltöltve')).toBeVisible();
  });

  test('should delete profile picture', async ({ page }) => {
    await page.goto('/profile');

    // Click delete button (assume picture exists)
    await page.click('[data-testid="delete-profile-picture"]');

    // Confirm deletion
    await page.click('button:has-text("Törlés")');

    // Should show success message
    await expect(page.locator('text=Profilkép sikeresen törölve')).toBeVisible();
  });
});

test.describe('Mobile Responsiveness E2E Tests', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size

  test('should render login modal correctly on mobile', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="open-auth-modal"]');

    // Modal should be visible and properly sized
    const modal = page.locator('text=Üdvözlünk!').locator('..');
    await expect(modal).toBeVisible();

    // Should be readable and not cut off
    const boundingBox = await modal.boundingBox();
    expect(boundingBox.width).toBeLessThanOrEqual(375);
  });

  test('should handle form inputs on mobile', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="open-auth-modal"]');

    // Fill form on mobile
    await page.fill('input[type="email"]', 'mobile@test.com');
    await page.fill('input[type="password"]', 'MobilePass123!');

    // Inputs should work properly
    await expect(page.locator('input[type="email"]')).toHaveValue('mobile@test.com');
  });
});