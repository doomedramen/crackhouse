import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaUI } from '../helpers/auth';
import { ResultsTabPage } from '../pages/results-tab.page';
import { DashboardPage } from '../pages/dashboard.page';

/**
 * Results Tab E2E Tests
 * Tests for results viewing, filtering, stats, and export functionality
 */
test.describe('Results Tab', () => {
  let dashboard: DashboardPage;
  let resultsTab: ResultsTabPage;

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    dashboard = new DashboardPage(page);
    resultsTab = new ResultsTabPage(page);
  });

  test.describe('Tab Navigation', () => {
    test('should display results tab on dashboard', async ({ page }) => {
      await expect(resultsTab.tab).toBeVisible();
    });

    test('should navigate to results tab when clicked', async ({ page }) => {
      await resultsTab.navigateToTab();
      await expect(resultsTab.content).toBeVisible();
    });

    test('should show tab count badge', async ({ page }) => {
      const tabText = await resultsTab.tab.textContent();
      expect(tabText).toMatch(/results/i);
      const countBadge = resultsTab.tab.locator('.bg-muted');
      await expect(countBadge).toBeVisible();
    });
  });

  test.describe('Results Content Display', () => {
    test.beforeEach(async ({ page }) => {
      await resultsTab.navigateToTab();
      await resultsTab.waitForLoaded();
    });

    test('should display Total Results stats label', async ({ page }) => {
      await expect(resultsTab.totalResultsLabel).toBeVisible();
    });

    test('should display Cracked Networks stats label', async ({ page }) => {
      await expect(resultsTab.crackedNetworksLabel).toBeVisible();
    });

    test('should display Results by Type stats label', async ({ page }) => {
      await expect(resultsTab.resultsByTypeLabel).toBeVisible();
    });

    test('should display type filter dropdown', async ({ page }) => {
      await expect(resultsTab.typeFilter).toBeVisible();
    });

    test('should display Cracked Only button', async ({ page }) => {
      await expect(resultsTab.crackedOnlyButton).toBeVisible();
    });

    test('should display Export CSV button', async ({ page }) => {
      await expect(resultsTab.exportCsvButton).toBeVisible();
    });

    test('should display results table or empty state', async ({ page }) => {
      const hasTable = await resultsTab.resultsTable.isVisible().catch(() => false);
      const hasEmptyState = await resultsTab.hasNoResults();

      expect(hasTable || hasEmptyState).toBe(true);
    });
  });

  test.describe('Empty State', () => {
    test.beforeEach(async ({ page }) => {
      await resultsTab.navigateToTab();
      await resultsTab.waitForLoaded();
    });

    test('should show appropriate empty state content when no results', async ({ page }) => {
      const hasResults = (await resultsTab.getResultCount()) > 0;
      if (hasResults) {
        test.skip();
        return;
      }

      await expect(resultsTab.emptyState).toBeVisible();
      await expect(resultsTab.emptyStateMessage).toBeVisible();
    });
  });

  test.describe('Filter Interactions', () => {
    test.beforeEach(async ({ page }) => {
      await resultsTab.navigateToTab();
      await resultsTab.waitForLoaded();
    });

    test('should toggle Cracked Only filter', async ({ page }) => {
      await resultsTab.toggleCrackedOnly();
      // Button should have changed state (active class)
      await expect(resultsTab.crackedOnlyButton).toBeVisible();
    });

    test('should change type filter', async ({ page }) => {
      await resultsTab.filterByType('password');
      const selectedValue = await resultsTab.typeFilter.inputValue();
      expect(selectedValue).toBe('password');
    });

    test('should reset type filter to all', async ({ page }) => {
      await resultsTab.filterByType('password');
      await resultsTab.filterByType('');
      const selectedValue = await resultsTab.typeFilter.inputValue();
      expect(selectedValue).toBe('');
    });
  });

  test.describe('Populated State', () => {
    test.beforeEach(async ({ page }) => {
      await resultsTab.navigateToTab();
      await resultsTab.waitForLoaded();
    });

    test('should display table rows when results exist', async ({ page }) => {
      const resultCount = await resultsTab.getResultCount();
      if (resultCount === 0) {
        test.skip();
        return;
      }

      await expect(resultsTab.resultsTable).toBeVisible();
      expect(await resultsTab.tableRows.count()).toBeGreaterThan(0);
    });

    test('should display result type labels in table rows', async ({ page }) => {
      const resultCount = await resultsTab.getResultCount();
      if (resultCount === 0) {
        test.skip();
        return;
      }

      // Each row should have a type badge (Cracked, Handshake, or Error)
      const firstRow = resultsTab.tableRows.first();
      const typeBadge = firstRow.locator('.rounded-full');
      await expect(typeBadge).toBeVisible();
    });
  });
});
