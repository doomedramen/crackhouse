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

    // Block WebSocket upgrade requests to prevent connection flooding
    // The WS server runs on port 3002 but the URL replacement logic may not work
    // during tests, causing thousands of failed reconnection attempts
    await page.route(/\?userId=/, route => route.abort());

    // Login and navigate to dashboard
    await loginViaUI(page, TEST_USER.email, TEST_USER.password);
    // Navigate fresh to clear any stale React state
    await page.goto('/');
    // Wait for dashboard to render
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible({ timeout: 15000 });

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

      // Content should be visible even if loading fails
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

    test('should display create-job-modal via data-testid', async ({ page }) => {
      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      const modal = page.locator('[data-testid="create-job-modal"]');
      await expect(modal).toBeVisible();
    });

    test('should display attack mode selector within modal', async ({ page }) => {
      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      // Attack mode selector should be visible
      const modal = page.locator('[data-testid="create-job-modal"]');
      const attackMode = modal.locator('button').filter({ hasText: /handshake|pmkid/i });
      await expect(attackMode).toBeVisible();
    });

    test('should display create consolidated job button', async ({ page }) => {
      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      const createButton = page.locator('[data-testid="create-job-modal"]').getByRole('button', { name: /create consolidated job/i });
      await expect(createButton).toBeVisible();
      // Should be disabled initially (no selections made)
      await expect(createButton).toBeDisabled();
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

  test.describe('Jobs Content via data-testid', () => {
    test.beforeEach(async ({ page }) => {
      await jobsTab.navigateToTab();
      await jobsTab.waitForLoaded();
    });

    test('should display jobs-tab-content container', async ({ page }) => {
      const jobsContent = page.locator('[data-testid="jobs-tab-content"]');
      await expect(jobsContent).toBeVisible();
    });

    test('should display create-job-button via data-testid', async ({ page }) => {
      const createButton = page.locator('[data-testid="create-job-button"]');
      await expect(createButton).toBeVisible();
    });

    test('should display jobs empty state when no jobs', async ({ page }) => {
      const hasJobs = (await jobsTab.getJobCount()) > 0;
      if (hasJobs) {
        test.skip();
        return;
      }

      const emptyState = page.locator('[data-testid="jobs-empty-state"]');
      await expect(emptyState).toBeVisible();
    });

    test('should display job status labels when jobs exist', async ({ page }) => {
      const jobCount = await jobsTab.getJobCount();
      if (jobCount === 0) {
        test.skip();
        return;
      }

      // Each job row should have a status
      const firstRow = jobsTab.tableRows.first();
      const statusText = await firstRow.textContent();
      const hasStatus = /completed|running|paused|cancelled|failed|pending/i.test(statusText || '');
      expect(hasStatus).toBe(true);
    });

    test('should display attack mode labels when jobs exist', async ({ page }) => {
      const jobCount = await jobsTab.getJobCount();
      if (jobCount === 0) {
        test.skip();
        return;
      }

      const firstRow = jobsTab.tableRows.first();
      const rowText = await firstRow.textContent();
      const hasAttackMode = /straight|combination|brute-force|mask|hybrid|handshake|pmkid/i.test(rowText || '');
      expect(hasAttackMode).toBe(true);
    });

    test('should have clickable job name buttons when jobs exist', async ({ page }) => {
      const jobCount = await jobsTab.getJobCount();
      if (jobCount === 0) {
        test.skip();
        return;
      }

      const firstRow = jobsTab.tableRows.first();
      const button = firstRow.locator('button').first();
      await expect(button).toBeVisible();
    });
  });
});
