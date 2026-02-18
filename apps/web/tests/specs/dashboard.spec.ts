import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaUI } from '../helpers/auth';
import { DashboardPage } from '../pages/dashboard.page';

/**
 * Dashboard E2E Tests
 * Tests authenticated dashboard functionality, header, stats cards, theme toggle, user menu
 */
test.describe('Dashboard', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    dashboard = new DashboardPage(page);
  });

  test.describe('Dashboard Container', () => {
    test('should display dashboard container', async ({ page }) => {
      const dashboardEl = page.locator('[data-testid="dashboard"]');
      await expect(dashboardEl).toBeVisible();
    });

    test('should display header', async ({ page }) => {
      const header = page.locator('[data-testid="header"]');
      await expect(header).toBeVisible();
    });

    test('should not be redirected to sign-in', async ({ page }) => {
      await expect(page).not.toHaveURL(/sign-in/);
    });
  });

  test.describe('Stats Cards', () => {
    test('should display stats cards container', async ({ page }) => {
      const statsContainer = page.locator('[data-testid="stats-cards-container"]');
      await expect(statsContainer).toBeVisible();
    });

    test('should display networks stat card', async ({ page }) => {
      const card = page.locator('[data-testid="stat-card-networks"]');
      await expect(card).toBeVisible();
    });

    test('should display dictionaries stat card', async ({ page }) => {
      const card = page.locator('[data-testid="stat-card-dictionaries"]');
      await expect(card).toBeVisible();
    });

    test('should display active jobs stat card', async ({ page }) => {
      const card = page.locator('[data-testid="stat-card-active-jobs"]');
      await expect(card).toBeVisible();
    });

    test('should display success rate stat card', async ({ page }) => {
      const card = page.locator('[data-testid="stat-card-success-rate"]');
      await expect(card).toBeVisible();
    });

    test('should display storage used stat card', async ({ page }) => {
      const card = page.locator('[data-testid="stat-card-storage-used"]');
      await expect(card).toBeVisible();
    });

    test('should display cracked stat card', async ({ page }) => {
      const card = page.locator('[data-testid="stat-card-cracked"]');
      await expect(card).toBeVisible();
    });
  });

  test.describe('Theme Toggle', () => {
    test('should display theme toggle button', async ({ page }) => {
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await expect(themeToggle).toBeVisible();
    });

    test('should click theme toggle', async ({ page }) => {
      const themeToggle = page.locator('[data-testid="theme-toggle"]');
      await expect(themeToggle).toBeVisible();
      await themeToggle.click();
      // Toggle should still be visible after click
      await expect(themeToggle).toBeVisible();
    });
  });

  test.describe('User Menu', () => {
    test('should display user menu trigger', async ({ page }) => {
      const userMenu = page.locator('[data-testid="user-menu"]');
      await expect(userMenu).toBeVisible();
    });

    test('should open avatar dropdown when user menu clicked', async ({ page }) => {
      const userMenu = page.locator('[data-testid="user-menu"]');
      await userMenu.click();

      const dropdown = page.locator('[data-testid="avatar-dropdown"]');
      await expect(dropdown).toBeVisible({ timeout: 5000 });
    });

    test('should display settings link in dropdown', async ({ page }) => {
      const userMenu = page.locator('[data-testid="user-menu"]');
      await userMenu.click();

      const dropdown = page.locator('[data-testid="avatar-dropdown"]');
      await expect(dropdown).toBeVisible({ timeout: 5000 });

      const settingsLink = page.locator('[data-testid="settings-link"]');
      await expect(settingsLink).toBeVisible();
    });

    test('should display menu role element when dropdown opened', async ({ page }) => {
      const userMenu = page.locator('[data-testid="user-menu"]');
      await userMenu.click();

      await expect(page.locator('[data-testid="avatar-dropdown"]')).toBeVisible({ timeout: 5000 });

      // The dropdown menu should have role="menu"
      const menu = page.locator('[role="menu"]');
      await expect(menu).toBeVisible();
    });

    test('should close dropdown when pressing Escape', async ({ page }) => {
      const userMenu = page.locator('[data-testid="user-menu"]');
      await userMenu.click();

      const dropdown = page.locator('[data-testid="avatar-dropdown"]');
      await expect(dropdown).toBeVisible({ timeout: 5000 });

      // Press Escape to close the dropdown
      await page.keyboard.press('Escape');
      await expect(dropdown).not.toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Tab Navigation', () => {
    test('should display networks tab', async ({ page }) => {
      const networksTab = page.locator('[data-testid="networks-tab"]');
      await expect(networksTab).toBeVisible();
    });

    test('should display dictionaries tab', async ({ page }) => {
      const dictionariesTab = page.locator('[data-testid="dictionaries-tab"]');
      await expect(dictionariesTab).toBeVisible();
    });

    test('should display jobs tab', async ({ page }) => {
      const jobsTab = page.locator('[data-testid="jobs-tab"]');
      await expect(jobsTab).toBeVisible();
    });

    test('should display results tab', async ({ page }) => {
      const resultsTab = page.locator('[data-testid="results-tab"]');
      await expect(resultsTab).toBeVisible();
    });

    test('should display users tab', async ({ page }) => {
      const usersTab = page.locator('[data-testid="users-tab"]');
      await expect(usersTab).toBeVisible();
    });

    test('should allow navigation between tabs using data-testid', async ({ page }) => {
      const tabs = ['networks', 'dictionaries', 'jobs', 'results', 'users'];

      for (const tabName of tabs) {
        const tab = page.locator(`[data-testid="${tabName}-tab"]`);
        if (await tab.isVisible()) {
          await tab.click();
          await page.waitForLoadState('networkidle');

          const content = page.locator(`[data-testid="${tabName}-content"]`);
          await expect(content).toBeVisible({ timeout: 10000 });
        }
      }
    });
  });

  test.describe('Header Buttons', () => {
    test('should display upload button in header', async ({ page }) => {
      const uploadButton = page.locator('[data-testid="header-upload-button"]');
      await expect(uploadButton).toBeVisible();
    });

    test('should display create job button in header', async ({ page }) => {
      const createJobButton = page.locator('[data-testid="header-create-job-button"]');
      await expect(createJobButton).toBeVisible();
    });
  });
});
