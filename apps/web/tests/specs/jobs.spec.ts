import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaUI } from '../helpers/auth';
import { JobsTabPage } from '../pages/jobs-tab.page';
import { CreateJobModalPage } from '../pages/create-job-modal.page';
import {
  uploadDictionary,
  uploadPcap,
  createJob,
  blockWebSockets,
} from '../helpers/setup-helpers';
import {
  clearBrowserState,
  waitForTableData,
  TEST_TIMEOUTS,
} from '../helpers/wait-helpers';

/**
 * Jobs Tab E2E Tests
 *
 * Structure:
 * 1. Tab Navigation & Empty State — no data setup, beforeEach login
 * 2. Jobs List & Details — serial, ONE setup: dict + PCAP + job
 * 3. Create Job Modal — serial, ONE setup: dict + PCAP only (no job)
 *    Includes end-to-end job creation through the UI
 */

test.describe('Jobs Tab', () => {
  // ─── Block 1: Tab Navigation & Empty State ───────────────────────
  // No data setup needed. Each test logs in fresh.
  test.describe('Tab Navigation & Empty State', () => {
    let jobsTab: JobsTabPage;

    test.beforeEach(async ({ page, context }) => {
      await clearBrowserState(page, context);
      await blockWebSockets(page);

      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await expect(page.locator('[data-testid="dashboard"]')).toBeVisible({ timeout: TEST_TIMEOUTS.pageLoad });

      jobsTab = new JobsTabPage(page);
    });

    test('should display jobs tab and navigate to it', async ({ page }) => {
      // Tab is visible on dashboard
      await expect(jobsTab.tab).toBeVisible();

      // Can navigate to it
      await jobsTab.navigateToTab();
      await expect(page.locator('[data-testid="jobs-tab-content"]')).toBeVisible();
    });

    test('should display empty state when no jobs exist', async ({ page }) => {
      await jobsTab.navigateToTab();
      await jobsTab.waitForLoaded();

      const jobCount = await jobsTab.getJobCount();
      if (jobCount > 0) {
        // If jobs already exist from other test runs, skip this test
        test.skip();
        return;
      }

      await expect(jobsTab.emptyState).toBeVisible();
    });
  });

  // ─── Block 2: Jobs List & Details ────────────────────────────────
  // Serial: ONE setup creates dict + PCAP + job, then all tests run
  // against that shared state without resetting.
  test.describe('Jobs List & Details', () => {
    test.describe.configure({ mode: 'serial' });

    let jobsTab: JobsTabPage;

    test('setup: login, upload dict, PCAP, create job', async ({ page, context }) => {
      test.setTimeout(180000);

      await clearBrowserState(page, context);
      await blockWebSockets(page);

      // Login
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await expect(page.locator('[data-testid="dashboard"]')).toBeVisible({ timeout: TEST_TIMEOUTS.pageLoad });

      // Upload dictionary
      const dict = await uploadDictionary(context);

      // Upload PCAP and get networks
      const { networks } = await uploadPcap(context, page);
      expect(networks.length).toBeGreaterThan(0);

      const network = networks.find(n => n.hasHandshake) ?? networks[0]!;

      // Create job via API
      const jobId = await createJob(context, [network.id], [dict.id]);
      expect(jobId).toBeTruthy();

      // Reload to pick up new data
      await page.reload();
      await expect(page.locator('[data-testid="dashboard"]')).toBeVisible({ timeout: TEST_TIMEOUTS.pageLoad });

      jobsTab = new JobsTabPage(page);
      await jobsTab.navigateToTab();
      await jobsTab.waitForLoaded();

      const jobCount = await jobsTab.getJobCount();
      expect(jobCount).toBeGreaterThan(0);
    });

    test('should display jobs table with correct structure', async ({ page }) => {
      jobsTab = new JobsTabPage(page);

      // Create job button visible
      await expect(jobsTab.createJobButton).toBeVisible();

      // Table headers present
      const headers = ['Name', 'Status', 'Progress', 'Attack Mode', 'Networks', 'Dictionaries'];
      for (const header of headers) {
        await expect(page.getByRole('columnheader', { name: new RegExp(header, 'i') })).toBeVisible();
      }
    });

    test('should display job row with status and attack mode', async ({ page }) => {
      jobsTab = new JobsTabPage(page);

      const firstRow = jobsTab.tableRows.first();
      const rowText = await firstRow.textContent();

      // Row should contain a status
      const hasStatus = /completed|running|paused|cancelled|failed|pending/i.test(rowText || '');
      expect(hasStatus).toBe(true);

      // Row should contain an attack mode
      const hasAttackMode = /straight|combination|brute-force|mask|hybrid|handshake|pmkid/i.test(rowText || '');
      expect(hasAttackMode).toBe(true);
    });

    test('should open job details dialog', async ({ page }) => {
      jobsTab = new JobsTabPage(page);

      const firstJobName = jobsTab.tableRows.first().locator('button').first();
      await firstJobName.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
    });
  });

  // ─── Block 3: Create Job Modal ───────────────────────────────────
  // Serial: ONE setup uploads dict + PCAP (no job), then tests exercise
  // the modal. The final test creates a job end-to-end through the UI.
  test.describe('Create Job Modal', () => {
    test.describe.configure({ mode: 'serial' });

    let jobsTab: JobsTabPage;
    let createJobModal: CreateJobModalPage;

    test('setup: login, upload dict and PCAP', async ({ page, context }) => {
      test.setTimeout(180000);

      await clearBrowserState(page, context);
      await blockWebSockets(page);

      // Login
      await loginViaUI(page, TEST_USER.email, TEST_USER.password);
      await page.goto('/');
      await expect(page.locator('[data-testid="dashboard"]')).toBeVisible({ timeout: TEST_TIMEOUTS.pageLoad });

      // Upload dictionary and PCAP (no job creation)
      await uploadDictionary(context);
      const { networks } = await uploadPcap(context, page);
      expect(networks.length).toBeGreaterThan(0);

      // Reload to pick up new data
      await page.reload();
      await expect(page.locator('[data-testid="dashboard"]')).toBeVisible({ timeout: TEST_TIMEOUTS.pageLoad });

      jobsTab = new JobsTabPage(page);
      await jobsTab.navigateToTab();
      await jobsTab.waitForLoaded();
    });

    test('should open modal with all form elements', async ({ page }) => {
      jobsTab = new JobsTabPage(page);
      createJobModal = new CreateJobModalPage(page);

      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      // Modal visible via data-testid
      await expect(createJobModal.modal).toBeVisible();

      // Attack mode selector
      await expect(createJobModal.attackModeSelect).toBeVisible();

      // Networks section
      const networksLabel = page.getByText(/networks/i).first();
      await expect(networksLabel).toBeVisible();

      // Dictionaries section
      const dictionariesLabel = page.getByText(/dictionaries/i).first();
      await expect(dictionariesLabel).toBeVisible();

      // Create button visible but disabled (nothing selected yet)
      await expect(createJobModal.createButton).toBeVisible();
      const isEnabled = await createJobModal.isCreateButtonEnabled();
      expect(isEnabled).toBe(false);

      // Close for next test
      await createJobModal.close();
    });

    test('should show available networks and dictionaries', async ({ page }) => {
      jobsTab = new JobsTabPage(page);
      createJobModal = new CreateJobModalPage(page);

      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      const hasNetworks = await createJobModal.hasAvailableNetworks();
      expect(hasNetworks).toBe(true);

      const hasDictionaries = await createJobModal.hasAvailableDictionaries();
      expect(hasDictionaries).toBe(true);

      await createJobModal.close();
    });

    test('should close modal when cancel is clicked', async ({ page }) => {
      jobsTab = new JobsTabPage(page);
      createJobModal = new CreateJobModalPage(page);

      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      await createJobModal.close();
      await expect(createJobModal.modal).not.toBeVisible();
    });

    test('should create a job through the modal', async ({ page }) => {
      test.setTimeout(60000);

      jobsTab = new JobsTabPage(page);
      createJobModal = new CreateJobModalPage(page);

      // Record current job count
      const initialJobCount = await jobsTab.getJobCount();

      // Open modal
      await jobsTab.openCreateJobModal();
      await createJobModal.waitForOpen();

      // Select first network and first dictionary
      await createJobModal.selectNetworkByIndex(0);
      await createJobModal.selectDictionaryByIndex(0);

      // Create button should now be enabled
      const isEnabled = await createJobModal.isCreateButtonEnabled();
      expect(isEnabled).toBe(true);

      // Submit
      await createJobModal.submitJob();

      // Modal should close
      await createJobModal.waitForClosed();

      // Wait for table to update — job count should increase
      // waitForLoaded already handles waiting for API response and rendering
      await jobsTab.waitForLoaded();

      const newJobCount = await jobsTab.getJobCount();
      expect(newJobCount).toBeGreaterThan(initialJobCount);
    });
  });
});
