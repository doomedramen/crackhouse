import { test, expect } from '@playwright/test';
import { TEST_USER, TEST_ADMIN, loginViaUI } from '../helpers/auth';
import { DashboardPage } from '../pages/dashboard.page';
import { NetworksTabPage } from '../pages/networks-tab.page';
import { DictionariesTabPage } from '../pages/dictionaries-tab.page';
import { JobsTabPage } from '../pages/jobs-tab.page';
import { UploadModalPage } from '../pages/upload-modal.page';
import { CreateJobModalPage } from '../pages/create-job-modal.page';

/**
 * End-to-End Workflow Tests
 * Tests complete user workflows from start to finish
 */
test.describe('Complete User Workflows', () => {
  test.describe('Dashboard Navigation Workflow', () => {
    test('should navigate through all main tabs', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const dashboard = new DashboardPage(page);

      // Navigate to Networks tab (default)
      const networksTab = new NetworksTabPage(page);
      await expect(networksTab.content).toBeVisible();

      // Navigate to Dictionaries
      const dictionariesTab = new DictionariesTabPage(page);
      await dictionariesTab.navigateToTab();
      await expect(dictionariesTab.content).toBeVisible();

      // Navigate to Jobs
      const jobsTab = new JobsTabPage(page);
      await jobsTab.navigateToTab();
      await expect(jobsTab.content).toBeVisible();

      // Navigate to Results
      const resultsTab = page.locator('[data-testid="results-tab"]');
      await resultsTab.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-testid="results-content"]')).toBeVisible();

      // Navigate to Users (if visible)
      const usersTab = page.locator('[data-testid="users-tab"]');
      if (await usersTab.isVisible()) {
        await usersTab.click();
        await page.waitForLoadState('networkidle');
        await expect(page.locator('[data-testid="users-content"]')).toBeVisible();
      }
    });
  });

  test.describe('Upload Workflow', () => {
    test('should open upload modal from header', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const dashboard = new DashboardPage(page);
      await dashboard.clickUpload();

      const uploadModal = new UploadModalPage(page);
      await expect(uploadModal.modal).toBeVisible();
    });

    test('should switch between upload types', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const dashboard = new DashboardPage(page);
      await dashboard.clickUpload();

      const uploadModal = new UploadModalPage(page);
      await uploadModal.waitForOpen();

      // Switch to dictionary tab
      await uploadModal.selectDictionaryTab();
      await expect(uploadModal.dictionaryTab).toHaveAttribute('data-state', 'active');

      // Switch to PCAP tab
      await uploadModal.selectPcapTab();
      await expect(uploadModal.pcapTab).toHaveAttribute('data-state', 'active');
    });
  });

  test.describe('Create Job Workflow', () => {
    test('should open create job modal from header', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const dashboard = new DashboardPage(page);
      await dashboard.clickCreateJob();

      const createJobModal = new CreateJobModalPage(page);
      await expect(createJobModal.modal).toBeVisible();
    });

    test('should open create job modal from jobs tab', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const jobsTab = new JobsTabPage(page);
      await jobsTab.navigateToTab();
      await jobsTab.openCreateJobModal();

      const createJobModal = new CreateJobModalPage(page);
      await expect(createJobModal.modal).toBeVisible();
    });

    test('should show validation error when trying to create job without selections', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const dashboard = new DashboardPage(page);
      await dashboard.clickCreateJob();

      const createJobModal = new CreateJobModalPage(page);
      await createJobModal.waitForOpen();

      // Create button should be disabled
      const isEnabled = await createJobModal.isCreateButtonEnabled();
      expect(isEnabled).toBe(false);
    });
  });

  test.describe('Settings Workflow', () => {
    test('should navigate to settings from user menu', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const dashboard = new DashboardPage(page);
      await dashboard.goToSettings();

      expect(page.url()).toContain('/settings');
    });
  });

  test.describe('Logout Workflow', () => {
    test('should logout from user menu', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const dashboard = new DashboardPage(page);
      await dashboard.signOut();

      // Should be redirected to sign-in page
      await page.waitForLoadState('networkidle');

      // Verify logged out by trying to access protected route
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      expect(page.url()).toContain('/sign-in');
    });
  });

  test.describe('Tab State Persistence', () => {
    test('should show correct tab count badges', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Check that each tab has a count badge
      const tabs = ['networks', 'dictionaries', 'jobs', 'results', 'users'];

      for (const tab of tabs) {
        const tabElement = page.locator(`[data-testid="${tab}-tab"]`);
        if (await tabElement.isVisible()) {
          const badge = tabElement.locator('.bg-muted');
          await expect(badge).toBeVisible();
        }
      }
    });
  });

  test.describe('Theme Toggle', () => {
    test('should have theme toggle button', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const dashboard = new DashboardPage(page);
      await expect(dashboard.themeToggle).toBeVisible();
    });
  });

  test.describe('Admin User Workflow', () => {
    test('should show admin tab for admin users', async ({ page }) => {
      await loginViaUI(page, TEST_ADMIN.email, TEST_ADMIN.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Admin tab should be visible
      const adminTab = page.locator('[data-testid="admin-tab"]');
      await expect(adminTab).toBeVisible();
    });

    test('admin should be able to navigate to admin panel', async ({ page }) => {
      await loginViaUI(page, TEST_ADMIN.email, TEST_ADMIN.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const adminTab = page.locator('[data-testid="admin-tab"]');
      if (await adminTab.isVisible()) {
        await adminTab.click();
        await page.waitForLoadState('networkidle');

        const adminContent = page.locator('[data-testid="admin-content"]');
        await expect(adminContent).toBeVisible();
      }
    });

    test('admin panel should display Config sub-tab by default', async ({ page }) => {
      await loginViaUI(page, TEST_ADMIN.email, TEST_ADMIN.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const adminTab = page.locator('[data-testid="admin-tab"]');
      await adminTab.click();
      await page.waitForLoadState('networkidle');

      const adminContent = page.locator('[data-testid="admin-content"]');
      await expect(adminContent).toBeVisible();

      // Config button should be visible and active
      const configButton = adminContent.getByRole('button', { name: /config/i });
      await expect(configButton).toBeVisible();
    });

    test('admin panel should display Health sub-tab', async ({ page }) => {
      await loginViaUI(page, TEST_ADMIN.email, TEST_ADMIN.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const adminTab = page.locator('[data-testid="admin-tab"]');
      await adminTab.click();
      await page.waitForLoadState('networkidle');

      const adminContent = page.locator('[data-testid="admin-content"]');
      await expect(adminContent).toBeVisible();

      const healthButton = adminContent.getByRole('button', { name: /health/i });
      await expect(healthButton).toBeVisible();
      await healthButton.click();
      await page.waitForLoadState('networkidle');
    });

    test('admin panel should display Audit Logs sub-tab', async ({ page }) => {
      await loginViaUI(page, TEST_ADMIN.email, TEST_ADMIN.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const adminTab = page.locator('[data-testid="admin-tab"]');
      await adminTab.click();
      await page.waitForLoadState('networkidle');

      const adminContent = page.locator('[data-testid="admin-content"]');
      await expect(adminContent).toBeVisible();

      const auditButton = adminContent.getByRole('button', { name: /audit logs/i });
      await expect(auditButton).toBeVisible();
      await auditButton.click();
      await page.waitForLoadState('networkidle');
    });

    test('admin panel should display Quick Actions sub-tab', async ({ page }) => {
      await loginViaUI(page, TEST_ADMIN.email, TEST_ADMIN.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const adminTab = page.locator('[data-testid="admin-tab"]');
      await adminTab.click();
      await page.waitForLoadState('networkidle');

      const adminContent = page.locator('[data-testid="admin-content"]');
      await expect(adminContent).toBeVisible();

      const actionsButton = adminContent.getByRole('button', { name: /quick actions/i });
      await expect(actionsButton).toBeVisible();
      await actionsButton.click();
      await page.waitForLoadState('networkidle');
    });

    test('admin panel should navigate through all sub-tabs', async ({ page }) => {
      await loginViaUI(page, TEST_ADMIN.email, TEST_ADMIN.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const adminTab = page.locator('[data-testid="admin-tab"]');
      await adminTab.click();
      await page.waitForLoadState('networkidle');

      const adminContent = page.locator('[data-testid="admin-content"]');
      await expect(adminContent).toBeVisible();

      const subTabs = ['Config', 'Health', 'Audit Logs', 'Quick Actions'];
      for (const subTabName of subTabs) {
        const subTab = adminContent.getByRole('button', { name: new RegExp(subTabName, 'i') });
        await expect(subTab).toBeVisible();
        await subTab.click();
        await page.waitForLoadState('networkidle');
      }
    });
  });

  test.describe('Regular User Workflow', () => {
    test('should not show admin tab for regular users', async ({ page }) => {
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Admin tab should not be visible for regular user
      const adminTab = page.locator('[data-testid="admin-tab"]');
      await expect(adminTab).not.toBeVisible();
    });
  });
});
