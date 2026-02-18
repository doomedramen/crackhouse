import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaUI } from '../helpers/auth';
import { NetworksTabPage } from '../pages/networks-tab.page';
import { DashboardPage } from '../pages/dashboard.page';
import { UploadModalPage } from '../pages/upload-modal.page';

/**
 * Networks Tab E2E Tests
 * Tests for network viewing, filtering, selection, and upload functionality
 */
test.describe('Networks Tab', () => {
  let dashboard: DashboardPage;
  let networksTab: NetworksTabPage;

  test.beforeEach(async ({ page }) => {
    // Login and navigate to dashboard
    await loginViaUI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    dashboard = new DashboardPage(page);
    networksTab = new NetworksTabPage(page);
  });

  test.describe('Tab Navigation', () => {
    test('should display networks tab on dashboard', async ({ page }) => {
      // Networks tab should be visible
      await expect(networksTab.tab).toBeVisible();
    });

    test('should navigate to networks tab when clicked', async ({ page }) => {
      await networksTab.navigateToTab();
      await expect(networksTab.content).toBeVisible();
    });

    test('should show tab count badge', async ({ page }) => {
      // Tab should show count badge
      const tabText = await networksTab.tab.textContent();
      expect(tabText).toMatch(/networks/i);
      // Count badge should be visible
      const countBadge = networksTab.tab.locator('.bg-muted');
      await expect(countBadge).toBeVisible();
    });
  });

  test.describe('Networks List Display', () => {
    test.beforeEach(async ({ page }) => {
      await networksTab.navigateToTab();
      await networksTab.waitForLoaded();
    });

    test('should display networks table or empty state', async ({ page }) => {
      // Either table or empty state should be visible
      const hasTable = await networksTab.networksTable.isVisible();
      const hasEmptyState = await networksTab.hasNoNetworks();

      expect(hasTable || hasEmptyState).toBe(true);
    });

    test('should display upload PCAP button', async ({ page }) => {
      await expect(networksTab.uploadPcapButton).toBeVisible();
    });

    test('should display search input', async ({ page }) => {
      await expect(networksTab.searchInput).toBeVisible();
    });

    test('should display filter dropdowns', async ({ page }) => {
      await expect(networksTab.statusFilter).toBeVisible();
      await expect(networksTab.encryptionFilter).toBeVisible();
    });
  });

  test.describe('Search and Filtering', () => {
    test.beforeEach(async ({ page }) => {
      await networksTab.navigateToTab();
      await networksTab.waitForLoaded();
    });

    test('should allow entering search term', async ({ page }) => {
      await networksTab.searchNetworks('TestNetwork');
      const value = await networksTab.searchInput.inputValue();
      expect(value).toBe('TestNetwork');
    });

    test('should filter by status', async ({ page }) => {
      await networksTab.filterByStatus('ready');
      const selectedValue = await networksTab.statusFilter.inputValue();
      expect(selectedValue).toBe('ready');
    });

    test('should filter by encryption', async ({ page }) => {
      await networksTab.filterByEncryption('WPA2');
      const selectedValue = await networksTab.encryptionFilter.inputValue();
      expect(selectedValue).toBe('WPA2');
    });

    test('should reset filters to show all', async ({ page }) => {
      // Apply filters
      await networksTab.filterByStatus('ready');
      await networksTab.filterByEncryption('WPA2');

      // Reset filters
      await networksTab.filterByStatus('all');
      await networksTab.filterByEncryption('all');

      const statusValue = await networksTab.statusFilter.inputValue();
      const encryptionValue = await networksTab.encryptionFilter.inputValue();

      expect(statusValue).toBe('all');
      expect(encryptionValue).toBe('all');
    });
  });

  test.describe('Network Selection', () => {
    test.beforeEach(async ({ page }) => {
      await networksTab.navigateToTab();
      await networksTab.waitForLoaded();
    });

    test('should display select all button', async ({ page }) => {
      await expect(networksTab.selectAllButton).toBeVisible();
    });

    test('should show selection actions when networks are selected', async ({ page }) => {
      const networkCount = await networksTab.getNetworkCount();

      // Skip test if no networks to select
      if (networkCount === 0) {
        test.skip();
        return;
      }

      // Select all networks
      await networksTab.selectAllNetworks();

      // Clear selection and delete selected buttons should appear
      await expect(networksTab.clearSelectionButton).toBeVisible();
      await expect(networksTab.deleteSelectedButton).toBeVisible();
    });

    test('should clear selection when clear button is clicked', async ({ page }) => {
      const networkCount = await networksTab.getNetworkCount();

      if (networkCount === 0) {
        test.skip();
        return;
      }

      // Select all
      await networksTab.selectAllNetworks();
      await expect(networksTab.clearSelectionButton).toBeVisible();

      // Clear selection
      await networksTab.clearSelection();

      // Clear button should be hidden
      await expect(networksTab.clearSelectionButton).not.toBeVisible();
    });
  });

  test.describe('Networks Content via data-testid', () => {
    test.beforeEach(async ({ page }) => {
      await networksTab.navigateToTab();
      await networksTab.waitForLoaded();
    });

    test('should display networks content container', async ({ page }) => {
      const content = page.locator('[data-testid="networks-content"]');
      await expect(content).toBeVisible();
    });

    test('should display table within networks content', async ({ page }) => {
      const content = page.locator('[data-testid="networks-content"]');
      const table = content.locator('table');
      const emptyState = page.getByText(/no networks found/i);

      const hasTable = await table.isVisible().catch(() => false);
      const hasEmpty = await emptyState.isVisible().catch(() => false);
      expect(hasTable || hasEmpty).toBe(true);
    });

    test('should display table body rows when networks exist', async ({ page }) => {
      const networkCount = await networksTab.getNetworkCount();
      if (networkCount === 0) {
        test.skip();
        return;
      }

      const content = page.locator('[data-testid="networks-content"]');
      const rows = content.locator('table tbody tr');
      expect(await rows.count()).toBeGreaterThan(0);
    });

    test('should display search input with placeholder', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="scan networks"]');
      await expect(searchInput).toBeVisible();
    });

    test('should interact with search input', async ({ page }) => {
      const searchInput = page.locator('input[placeholder*="scan networks"]');
      await searchInput.fill('TestNetwork');
      const value = await searchInput.inputValue();
      expect(value).toBe('TestNetwork');
      // Clear for other tests
      await searchInput.clear();
    });

    test('should display empty state text when no networks match', async ({ page }) => {
      // Search for something that definitely won't match
      await networksTab.searchNetworks('zzz_nonexistent_network_zzz');
      const emptyState = page.getByText(/no networks found/i);
      await expect(emptyState).toBeVisible({ timeout: 5000 });
      // Clear search
      await networksTab.searchInput.clear();
    });
  });

  test.describe('Upload PCAP Modal', () => {
    test.beforeEach(async ({ page }) => {
      await networksTab.navigateToTab();
      await networksTab.waitForLoaded();
    });

    test('should open upload modal when upload button is clicked', async ({ page }) => {
      await networksTab.openUploadModal();

      const uploadModal = new UploadModalPage(page);
      await expect(uploadModal.modal).toBeVisible();
    });

    test('should default to PCAP tab when opened from networks', async ({ page }) => {
      await networksTab.openUploadModal();

      const uploadModal = new UploadModalPage(page);
      await uploadModal.waitForOpen();

      // PCAP tab should be active
      const pcapTab = uploadModal.pcapTab;
      await expect(pcapTab).toHaveAttribute('data-state', 'active');
    });
  });
});
