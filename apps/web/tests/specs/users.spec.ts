import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaUI } from '../helpers/auth';
import { UsersTabPage } from '../pages/users-tab.page';
import { DashboardPage } from '../pages/dashboard.page';

/**
 * Users Tab E2E Tests
 * Tests for user management viewing and interactions
 */
test.describe('Users Tab', () => {
  let dashboard: DashboardPage;
  let usersTab: UsersTabPage;

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    dashboard = new DashboardPage(page);
    usersTab = new UsersTabPage(page);
  });

  test.describe('Tab Navigation', () => {
    test('should display users tab on dashboard', async ({ page }) => {
      await expect(usersTab.tab).toBeVisible();
    });

    test('should navigate to users tab when clicked', async ({ page }) => {
      await usersTab.navigateToTab();
      await expect(usersTab.content).toBeVisible();
    });

    test('should show tab count badge', async ({ page }) => {
      const tabText = await usersTab.tab.textContent();
      expect(tabText).toMatch(/users/i);
      const countBadge = usersTab.tab.locator('.bg-muted');
      await expect(countBadge).toBeVisible();
    });
  });

  test.describe('Users Content Display', () => {
    test.beforeEach(async ({ page }) => {
      await usersTab.navigateToTab();
      await usersTab.waitForLoaded();
    });

    test('should display users table or empty state', async ({ page }) => {
      const hasTable = await usersTab.usersTable.isVisible().catch(() => false);
      const hasEmptyState = await usersTab.hasNoUsers();

      expect(hasTable || hasEmptyState).toBe(true);
    });

    test('should display create user button', async ({ page }) => {
      await expect(usersTab.createUserButton).toBeVisible();
    });

    test('should have create user button disabled', async ({ page }) => {
      await expect(usersTab.createUserButton).toBeDisabled();
    });
  });

  test.describe('Users Table', () => {
    test.beforeEach(async ({ page }) => {
      await usersTab.navigateToTab();
      await usersTab.waitForLoaded();
    });

    test('should display user rows when users exist', async ({ page }) => {
      const userCount = await usersTab.getUserCount();
      if (userCount === 0) {
        test.skip();
        return;
      }

      expect(userCount).toBeGreaterThan(0);
    });

    test('should display role badges for users', async ({ page }) => {
      const userCount = await usersTab.getUserCount();
      if (userCount === 0) {
        test.skip();
        return;
      }

      // Each row should have a role badge (admin or user)
      const firstRow = usersTab.tableRows.first();
      const roleBadge = firstRow.locator('.rounded-full');
      await expect(roleBadge).toBeVisible();
    });

    test('should display role text in badges', async ({ page }) => {
      const userCount = await usersTab.getUserCount();
      if (userCount === 0) {
        test.skip();
        return;
      }

      // Check that role badges contain "admin" or "user" text
      const badges = usersTab.content.locator('.rounded-full');
      const badgeCount = await badges.count();
      expect(badgeCount).toBeGreaterThan(0);

      for (let i = 0; i < badgeCount; i++) {
        const badgeText = await badges.nth(i).textContent();
        expect(badgeText?.toLowerCase()).toMatch(/admin|user/);
      }
    });

    test('should display Edit buttons in user rows', async ({ page }) => {
      const userCount = await usersTab.getUserCount();
      if (userCount === 0) {
        test.skip();
        return;
      }

      const firstRow = usersTab.tableRows.first();
      const editButton = firstRow.getByRole('button', { name: /edit/i });
      await expect(editButton).toBeVisible();
      await expect(editButton).toBeDisabled();
    });

    test('should display Delete buttons in user rows', async ({ page }) => {
      const userCount = await usersTab.getUserCount();
      if (userCount === 0) {
        test.skip();
        return;
      }

      const firstRow = usersTab.tableRows.first();
      const deleteButton = firstRow.getByRole('button', { name: /delete/i });
      await expect(deleteButton).toBeVisible();
      await expect(deleteButton).toBeDisabled();
    });

    test('should display table column headers', async ({ page }) => {
      const userCount = await usersTab.getUserCount();
      if (userCount === 0) {
        test.skip();
        return;
      }

      const headers = ['Email', 'Role', 'Created', 'Last Updated', 'Actions'];
      for (const header of headers) {
        const th = usersTab.content.locator('th', { hasText: new RegExp(header, 'i') });
        await expect(th).toBeVisible();
      }
    });
  });
});
