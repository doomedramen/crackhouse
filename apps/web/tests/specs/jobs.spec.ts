import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaUI } from '../helpers/auth';
import { JobsTabPage } from '../pages/jobs-tab.page';
import { CreateJobModalPage } from '../pages/create-job-modal.page';
import { DashboardPage } from '../pages/dashboard.page';

/**
 * Jobs Tab E2E Tests
 * Tests for job viewing, creation, and monitoring functionality
 */
test.describe('Jobs Tab', () => {
  let dashboard: DashboardPage;
  let jobsTab: JobsTabPage;

  test.beforeEach(async ({ page, context }) => {
    // Reset page state by clearing storage and cookies
    await context.clearCookies();
    await context.clearPermissions();
    // Wait a bit for state to clear
    await page.waitForTimeout(100);

    // Navigate to root first to clear any React state
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Login and navigate to dashboard
    await loginViaUI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // Extra wait to ensure React has fully initialized
    await page.waitForTimeout(500);

    dashboard = new DashboardPage(page);
    jobsTab = new JobsTabPage(page);
  });

  test.describe('Tab Navigation', () => {
    test('should display jobs tab on dashboard', async ({ page }) => {
      await expect(jobsTab.tab).toBeVisible();
    });

    test('should navigate to jobs tab when clicked', async ({ page }) => {
      await jobsTab.navigateToTab();
      // Verify jobs tab content is visible (jobs-tab component is rendered)
      await expect(page.locator('[data-testid="jobs-tab-content"]')).toBeVisible();
    });

    test('should show tab count badge', async ({ page }) => {
      const tabText = await jobsTab.tab.textContent();
      expect(tabText).toMatch(/job/i);
      // Count badge should be visible
      const countBadge = jobsTab.tab.locator('.bg-muted');
      await expect(countBadge).toBeVisible();
    });
  });

  test.describe('Jobs List Display', () => {
    test.beforeEach(async ({ page }) => {
      await jobsTab.navigateToTab();
      await jobsTab.waitForLoaded();
    });

    test('should display jobs table or empty state', async ({ page }) => {
      const hasJobs = (await jobsTab.getJobCount()) > 0;
      const hasEmptyState = await jobsTab.hasNoJobs();

      expect(hasJobs || hasEmptyState).toBe(true);
    });

    test('should display create job button', async ({ page }) => {
      await expect(jobsTab.createJobButton).toBeVisible();
    });

    test('should show table headers when jobs exist', async ({ page }) => {
      const jobCount = await jobsTab.getJobCount();

      if (jobCount === 0) {
        // Empty state should show create job call-to-action
        const emptyStateText = await page.getByText(/create your first cracking job/i).isVisible();
        expect(emptyStateText).toBe(true);
        return;
      }

      // If jobs exist, table headers should be present
      const headers = ['Name', 'Status', 'Progress', 'Attack Mode', 'Networks', 'Dictionaries'];
      for (const header of headers) {
        await expect(page.getByRole('columnheader', { name: new RegExp(header, 'i') })).toBeVisible();
      }
    });
  });

  test.describe('Create Job Modal', () => {
    let createJobModal: CreateJobModalPage;

    test.beforeEach(async ({ page }) => {
      await jobsTab.navigateToTab();
      await jobsTab.waitForLoaded();
      createJobModal = new CreateJobModalPage(page);
    });

    test('should open create job modal when button is clicked', async ({ page }) => {
      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      await expect(createJobModal.modal).toBeVisible();
    });

    test('should display attack mode selector', async ({ page }) => {
      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      await expect(createJobModal.attackModeSelect).toBeVisible();
    });

    test('should display networks selection section', async ({ page }) => {
      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      // Networks section should be visible
      const networksLabel = page.getByText(/networks/i).first();
      await expect(networksLabel).toBeVisible();
    });

    test('should display dictionaries selection section', async ({ page }) => {
      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      // Dictionaries section should be visible
      const dictionariesLabel = page.getByText(/dictionaries/i).first();
      await expect(dictionariesLabel).toBeVisible();
    });

    test('should have disabled create button initially', async ({ page }) => {
      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      // Button should be disabled until selections are made
      const isEnabled = await createJobModal.isCreateButtonEnabled();
      expect(isEnabled).toBe(false);
    });

    test('should close modal when cancel is clicked', async ({ page }) => {
      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      await createJobModal.close();

      await expect(createJobModal.modal).not.toBeVisible();
    });

    test('should show message when no networks available', async ({ page }) => {
      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      const hasNetworks = await createJobModal.hasAvailableNetworks();
      if (!hasNetworks) {
        const noNetworksMessage = page.getByText(/no networks available/i);
        await expect(noNetworksMessage).toBeVisible();
      }
    });

    test('should show message when no dictionaries available', async ({ page }) => {
      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      const hasDictionaries = await createJobModal.hasAvailableDictionaries();
      if (!hasDictionaries) {
        const noDictionariesMessage = page.getByText(/no dictionaries available/i);
        await expect(noDictionariesMessage).toBeVisible();
      }
    });
  });

  test.describe('Job Details', () => {
    test.beforeEach(async ({ page }) => {
      await jobsTab.navigateToTab();
      await jobsTab.waitForLoaded();
    });

    test('should open job details when job name is clicked', async ({ page }) => {
      const jobCount = await jobsTab.getJobCount();

      if (jobCount === 0) {
        test.skip();
        return;
      }

      // Click on the first job
      const firstJobName = jobsTab.tableRows.first().locator('button').first();
      await firstJobName.click();

      // Job detail modal should open
      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5000 });
    });
  });
});
