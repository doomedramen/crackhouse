import { Page, BrowserContext, expect } from "@playwright/test";
import {
  waitForDebounce,
  waitForAuthCookies,
  TEST_TIMEOUTS,
} from "./wait-helpers";

/**
 * Auth helpers for E2E tests
 * Provides utilities for authentication flows
 */

// Test user credentials
export const TEST_USER = {
  email: "e2e-test@example.com",
  password: "TestPassword123!",
  name: "E2E Test User",
  role: "user",
};

export const TEST_ADMIN = {
  email: "e2e-admin@example.com",
  password: "AdminPassword123!",
  name: "E2E Admin User",
  role: "admin",
};

const createdUsers = new Set<string>();

/**
 * Ensure a test user exists (creates via API if needed)
 * This is idempotent - safe to call multiple times
 */
export async function ensureTestUserExists(user: {
  email: string;
  password: string;
  name: string;
  role?: string;
}): Promise<void> {
  // Skip if already created in this test run
  if (createdUsers.has(user.email)) {
    return;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  try {
    // Try to create user via API
    // Include Origin header for Better Auth CORS validation
    const response = await fetch(`${apiUrl}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        name: user.name,
      }),
    });

    if (response.ok) {
      createdUsers.add(user.email);
      console.log(`  Created user: ${user.email}`);

      // Update role if needed
      if (user.role && user.role !== "user") {
        const postgres = (await import("postgres")).default;
        const DATABASE_URL =
          process.env.DATABASE_URL ||
          "postgresql://postgres:password@localhost:5432/autopwn_test";
        const sql = postgres(DATABASE_URL, { max: 1 });
        await sql`UPDATE users SET role = ${user.role} WHERE email = ${user.email}`;
        await sql.end();
      }
    } else if (response.status === 400 || response.status === 409) {
      // User likely already exists, that's fine
      createdUsers.add(user.email);
    } else {
      const error = await response.text();
      console.warn(`  Warning: Could not create user ${user.email}: ${error}`);
    }
  } catch (error) {
    console.warn(`  Warning: Failed to create user ${user.email}:`, error);
  }
}

/**
 * Login via the UI
 * Automatically ensures the test user exists before attempting login
 */
export async function loginViaUI(
  page: Page,
  email: string,
  password: string,
  name?: string,
) {
  // Ensure user exists before trying to log in
  const userName = name || email.split("@")[0] || "Test User";
  await ensureTestUserExists({
    email,
    password,
    name: userName,
    role: email === TEST_ADMIN.email ? "admin" : "user",
  });

  // Use baseURL from page or fall back to localhost
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  await page.goto(`${baseUrl}/sign-in`);
  await page.waitForLoadState("networkidle");

  // Fill in credentials
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);

  // Submit the form and wait for redirect
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
      timeout: 15000,
    }),
    page.getByRole("button", { name: /sign in/i }).click(),
  ]);

  // Wait for page to be fully loaded
  await page.waitForLoadState("networkidle");

  // Wait for cookies to be fully set
  await waitForAuthCookies(page);

  // Verify we're not on sign-in page (login succeeded)
  const currentUrl = page.url();
  if (currentUrl.includes("/sign-in")) {
    throw new Error(`Login failed for ${email} - still on sign-in page`);
  }
}

/**
 * Login and save authentication state to a file
 */
export async function loginAndSaveState(
  page: Page,
  context: BrowserContext,
  email: string,
  password: string,
  storageStatePath: string,
) {
  await loginViaUI(page, email, password);

  // Verify we're logged in by checking we're not on sign-in page
  const url = page.url();
  if (url.includes("/sign-in")) {
    throw new Error(`Login failed for ${email} - still on sign-in page`);
  }

  // Save authentication state
  await context.storageState({ path: storageStatePath });
  console.log(`✅ Saved auth state for ${email} to ${storageStatePath}`);
}

/**
 * Logout via the UI
 */
export async function logout(page: Page) {
  // First, navigate to dashboard to ensure we're on a page with the navigation
  await page.goto("/");
  // Wait for the dashboard to be loaded - don't use networkidle as it's flaky when already idle
  await expect(page.locator('[data-testid="dashboard"]')).toBeVisible({
    timeout: 10000,
  });

  // Click on user avatar to open dropdown
  const avatar = page.locator('[data-testid="user-menu"]');

  if (await avatar.isVisible({ timeout: 5000 })) {
    await avatar.click();

    // Wait for dropdown content to appear
    const dropdown = page.locator('[data-testid="avatar-dropdown"]');
    await expect(dropdown).toBeVisible({ timeout: 5000 });

    // Click the logout menu item
    const logoutButton = page.getByRole("menuitem", { name: /log out/i });
    await expect(logoutButton).toBeVisible({ timeout: 5000 });
    await logoutButton.click();

    // Wait for redirect to sign-in page
    await page.waitForURL(/sign-in/, { timeout: 10000 });
  } else {
    // Fallback: clear cookies to log out
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 5000 });
  }
}

/**
 * Check if user is authenticated by checking for auth-specific elements
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  // Navigate to a protected page
  await page.goto("/settings");
  // Wait for navigation to complete
  await waitForDebounce(page, 500);

  // If we stay on settings, we're authenticated
  return !page.url().includes("/sign-in");
}

/**
 * Wait for auth to be ready (cookies set, session established)
 */
export async function waitForAuth(page: Page, timeout = TEST_TIMEOUTS.default) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await isAuthenticated(page)) {
      return true;
    }
    await waitForDebounce(page, 500);
  }

  return false;
}
