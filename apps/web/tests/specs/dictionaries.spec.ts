import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaUI } from '../helpers/auth';
import { DictionariesTabPage } from '../pages/dictionaries-tab.page';
import { DashboardPage } from '../pages/dashboard.page';
import { UploadModalPage } from '../pages/upload-modal.page';

/**
 * Dictionaries Tab E2E Tests
 * Tests for dictionary viewing, validation, and upload functionality
 */
test.describe('Dictionaries Tab', () => {
  let dashboard: DashboardPage;
  let dictionariesTab: DictionariesTabPage;

  test.beforeEach(async ({ page }) => {
    // Login and navigate to dashboard
    await loginViaUI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    dashboard = new DashboardPage(page);
    dictionariesTab = new DictionariesTabPage(page);
  });

  test.describe('Tab Navigation', () => {
    test('should display dictionaries tab on dashboard', async ({ page }) => {
      await expect(dictionariesTab.tab).toBeVisible();
    });

    test('should navigate to dictionaries tab when clicked', async ({ page }) => {
      await dictionariesTab.navigateToTab();
      await expect(dictionariesTab.content).toBeVisible();
    });

    test('should show tab count badge', async ({ page }) => {
      const tabText = await dictionariesTab.tab.textContent();
      expect(tabText).toMatch(/dictionar/i);
      // Count badge should be visible
      const countBadge = dictionariesTab.tab.locator('.bg-muted');
      await expect(countBadge).toBeVisible();
    });
  });

  test.describe('Dictionaries List Display', () => {
    test.beforeEach(async ({ page }) => {
      await dictionariesTab.navigateToTab();
      await dictionariesTab.waitForLoaded();
    });

    test('should display dictionaries table or empty state', async ({ page }) => {
      const hasTable = await dictionariesTab.dictionariesTable.isVisible();
      const hasEmptyState = await dictionariesTab.hasNoDictionaries();

      expect(hasTable || hasEmptyState).toBe(true);
    });

    test('should display upload dictionary button', async ({ page }) => {
      await expect(dictionariesTab.uploadButton).toBeVisible();
    });

    test('should display generate dictionary button', async ({ page }) => {
      await expect(dictionariesTab.generateButton).toBeVisible();
    });

    test('should display merge dictionaries button', async ({ page }) => {
      await expect(dictionariesTab.mergeButton).toBeVisible();
    });
  });

  test.describe('Dictionary Actions', () => {
    test.beforeEach(async ({ page }) => {
      await dictionariesTab.navigateToTab();
      await dictionariesTab.waitForLoaded();
    });

    test('should have action buttons for each dictionary row', async ({ page }) => {
      const dictionaryCount = await dictionariesTab.getDictionaryCount();

      if (dictionaryCount === 0) {
        test.skip();
        return;
      }

      // Check that action buttons exist in table rows
      const firstRow = dictionariesTab.tableRows.first();
      const statsButton = firstRow.locator('button[title="View Statistics"]');
      const validateButton = firstRow.locator('button[title="Validate Dictionary"]');
      const deleteButton = firstRow.locator('button[title="Delete Dictionary"]');

      await expect(statsButton).toBeVisible();
      await expect(validateButton).toBeVisible();
      await expect(deleteButton).toBeVisible();
    });
  });

  test.describe('Upload Dictionary Modal', () => {
    test.beforeEach(async ({ page }) => {
      await dictionariesTab.navigateToTab();
      await dictionariesTab.waitForLoaded();
    });

    test('should open upload modal when upload button is clicked', async ({ page }) => {
      await dictionariesTab.openUploadModal();

      const uploadModal = new UploadModalPage(page);
      await expect(uploadModal.modal).toBeVisible();
    });

    test('should default to dictionary tab when opened from dictionaries', async ({ page }) => {
      await dictionariesTab.openUploadModal();

      const uploadModal = new UploadModalPage(page);
      await uploadModal.waitForOpen();

      // Dictionary tab should be active
      const dictionaryTab = uploadModal.dictionaryTab;
      await expect(dictionaryTab).toHaveAttribute('data-state', 'active');
    });
  });

  test.describe('Generate Dictionary Modal', () => {
    test.beforeEach(async ({ page }) => {
      await dictionariesTab.navigateToTab();
      await dictionariesTab.waitForLoaded();
    });

    test('should open generate modal when generate button is clicked', async ({ page }) => {
      await dictionariesTab.openGenerateModal();

      // Modal should be visible
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();
    });
  });

  test.describe('Merge Dictionaries Modal', () => {
    test.beforeEach(async ({ page }) => {
      await dictionariesTab.navigateToTab();
      await dictionariesTab.waitForLoaded();
    });

    test('should open merge modal when merge button is clicked', async ({ page }) => {
      await dictionariesTab.openMergeModal();

      // Modal should be visible
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();
    });
  });

  test.describe('Dictionaries Content via data-testid', () => {
    test.beforeEach(async ({ page }) => {
      await dictionariesTab.navigateToTab();
      await dictionariesTab.waitForLoaded();
    });

    test('should display dictionaries content container', async ({ page }) => {
      const content = page.locator('[data-testid="dictionaries-content"]');
      await expect(content).toBeVisible();
    });

    test('should display table body rows when dictionaries exist', async ({ page }) => {
      const dictCount = await dictionariesTab.getDictionaryCount();
      if (dictCount === 0) {
        test.skip();
        return;
      }

      const content = page.locator('[data-testid="dictionaries-content"]');
      const rows = content.locator('table tbody tr');
      expect(await rows.count()).toBeGreaterThan(0);
    });

    test('should display status labels for dictionaries', async ({ page }) => {
      const dictCount = await dictionariesTab.getDictionaryCount();
      if (dictCount === 0) {
        test.skip();
        return;
      }

      // Each dictionary row should have a status displayed
      const firstRow = dictionariesTab.tableRows.first();
      const statusText = await firstRow.textContent();
      // Status should contain one of the expected values
      const hasStatus = /uploaded|generated|ready|processing|failed/i.test(statusText || '');
      expect(hasStatus).toBe(true);
    });

    test('should display dictionaries upload button via data-testid', async ({ page }) => {
      const uploadButton = page.locator('[data-testid="dictionaries-upload-button"]');
      await expect(uploadButton).toBeVisible();
    });
  });
});
