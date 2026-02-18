import { test, expect } from '@playwright/test';
import { TEST_USER, TEST_ADMIN, loginViaUI, logout, ensureTestUserExists } from '../helpers/auth';

/**
 * Authentication E2E Tests
 * Tests sign-in, sign-out, and protected route access
 */
test.describe('Authentication', () => {
  test.describe('Sign In Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/sign-in');
      await page.waitForLoadState('networkidle');
    });

    test('should display branding title', async ({ page }) => {
      const brandingTitle = page.locator('[data-testid="branding-title"]');
      await expect(brandingTitle).toBeVisible();
      await expect(brandingTitle).toHaveText('CrackHouse');
    });

    test('should display sign-in form container', async ({ page }) => {
      const formContainer = page.locator('[data-testid="signin-form-container"]');
      await expect(formContainer).toBeVisible();
    });

    test('should display email input with data-testid', async ({ page }) => {
      const emailInput = page.locator('[data-testid="signin-email-input"]');
      await expect(emailInput).toBeVisible();
      await expect(emailInput).toHaveAttribute('type', 'email');
    });

    test('should display password input with data-testid', async ({ page }) => {
      const passwordInput = page.locator('[data-testid="signin-password-input"]');
      await expect(passwordInput).toBeVisible();
      await expect(passwordInput).toHaveAttribute('type', 'password');
    });

    test('should display submit button with data-testid', async ({ page }) => {
      const submitButton = page.locator('[data-testid="signin-submit-button"]');
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toBeEnabled();
    });

    test('should display forgot password link', async ({ page }) => {
      const forgotLink = page.locator('[data-testid="forgot-password-link"]');
      await expect(forgotLink).toBeVisible();
      await expect(forgotLink).toHaveAttribute('href', '/forgot-password');
    });

    test('should display sign-up link', async ({ page }) => {
      const signupLink = page.locator('[data-testid="signup-link"]');
      await expect(signupLink).toBeVisible();
      await expect(signupLink).toHaveAttribute('href', '/sign-up');
    });

    test('should sign in with valid credentials using data-testid locators', async ({ page }) => {
      // Ensure user exists before attempting login
      await ensureTestUserExists(TEST_USER);

      const emailInput = page.locator('[data-testid="signin-email-input"]');
      const passwordInput = page.locator('[data-testid="signin-password-input"]');
      const submitButton = page.locator('[data-testid="signin-submit-button"]');

      await emailInput.fill(TEST_USER.email);
      await passwordInput.fill(TEST_USER.password);

      await Promise.all([
        page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 15000 }),
        submitButton.click(),
      ]);

      await expect(page).not.toHaveURL(/sign-in/);
    });

    test('should show error with invalid credentials', async ({ page }) => {
      const emailInput = page.locator('[data-testid="signin-email-input"]');
      const passwordInput = page.locator('[data-testid="signin-password-input"]');
      const submitButton = page.locator('[data-testid="signin-submit-button"]');

      await emailInput.fill('invalid@example.com');
      await passwordInput.fill('wrongpassword');
      await submitButton.click();
      await page.waitForLoadState('networkidle');

      // Should stay on sign-in page or show error message
      const stillOnSignIn = page.url().includes('/sign-in');
      const errorMessage = page.locator('[data-testid="signin-error-message"]');
      const hasError = await errorMessage.isVisible().catch(() => false);

      expect(stillOnSignIn || hasError).toBe(true);
    });

    test('should navigate to sign-up page from sign-in', async ({ page }) => {
      const signupLink = page.locator('[data-testid="signup-link"]');
      await expect(signupLink).toBeVisible();

      await Promise.all([
        page.waitForURL(/sign-up/),
        signupLink.click(),
      ]);

      expect(page.url()).toContain('/sign-up');
    });
  });

  test.describe('Sign Up Page', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/sign-up');
      await page.waitForLoadState('networkidle');
    });

    test('should display branding title on sign-up', async ({ page }) => {
      const brandingTitle = page.locator('[data-testid="branding-title"]');
      await expect(brandingTitle).toBeVisible();
      await expect(brandingTitle).toHaveText('CrackHouse');
    });

    test('should display sign-up form container', async ({ page }) => {
      const formContainer = page.locator('[data-testid="signup-form-container"]');
      await expect(formContainer).toBeVisible();
    });

    test('should display name input', async ({ page }) => {
      const nameInput = page.locator('[data-testid="signup-name-input"]');
      await expect(nameInput).toBeVisible();
      await expect(nameInput).toHaveAttribute('type', 'text');
    });

    test('should display email input', async ({ page }) => {
      const emailInput = page.locator('[data-testid="signup-email-input"]');
      await expect(emailInput).toBeVisible();
      await expect(emailInput).toHaveAttribute('type', 'email');
    });

    test('should display password input', async ({ page }) => {
      const passwordInput = page.locator('[data-testid="signup-password-input"]');
      await expect(passwordInput).toBeVisible();
      await expect(passwordInput).toHaveAttribute('type', 'password');
    });

    test('should display submit button', async ({ page }) => {
      const submitButton = page.locator('[data-testid="signup-submit-button"]');
      await expect(submitButton).toBeVisible();
      await expect(submitButton).toBeEnabled();
    });

    test('should display sign-in link', async ({ page }) => {
      const signinLink = page.locator('[data-testid="signin-link"]');
      await expect(signinLink).toBeVisible();
      await expect(signinLink).toHaveAttribute('href', '/sign-in');
    });

    test('should navigate to sign-in from sign-up', async ({ page }) => {
      const signinLink = page.locator('[data-testid="signin-link"]');
      await expect(signinLink).toBeVisible();

      await Promise.all([
        page.waitForURL(/sign-in/),
        signinLink.click(),
      ]);

      expect(page.url()).toContain('/sign-in');
    });

    test('should fill all sign-up form fields', async ({ page }) => {
      const nameInput = page.locator('[data-testid="signup-name-input"]');
      const emailInput = page.locator('[data-testid="signup-email-input"]');
      const passwordInput = page.locator('[data-testid="signup-password-input"]');

      await nameInput.fill('Test User');
      await emailInput.fill('test@example.com');
      await passwordInput.fill('password123');

      await expect(nameInput).toHaveValue('Test User');
      await expect(emailInput).toHaveValue('test@example.com');
      await expect(passwordInput).toHaveValue('password123');
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to sign-in when accessing settings unauthenticated', async ({ page }) => {
      await page.context().clearCookies();

      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/sign-in');
    });

    test('should access settings when authenticated', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await expect(page).not.toHaveURL(/sign-in/, { timeout: 10000 });

      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/settings');
    });
  });

  test.describe('Sign Out', () => {
    test('should sign out successfully', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await expect(page).not.toHaveURL(/sign-in/);

      await logout(page);

      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/sign-in');
    });
  });
});
