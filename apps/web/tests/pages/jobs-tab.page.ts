import { Page, Locator, expect } from '@playwright/test';

/**
 * Jobs Tab Page Object
 * Encapsulates interactions with the jobs tab
 */
export class JobsTabPage {
  readonly page: Page;

  // Tab element
  readonly tab: Locator;

  // Tab content
  readonly content: Locator;

  // Action buttons
  readonly createJobButton: Locator;

  // Table elements
  readonly jobsTable: Locator;
  readonly tableRows: Locator;
  readonly emptyState: Locator;
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    this.page = page;

    // Tab navigation - use button role with name pattern since tabs are buttons
    this.tab = page.getByRole('button', { name: /^jobs/i });
    this.content = page.locator('main'); // Jobs content is in main
    // Action buttons - "create job" button in main content area (not header)
    this.createJobButton = page.locator('main').getByRole('button', { name: /create job/i });

    // Table - look for any table in the page
    this.jobsTable = page.locator('table').first();
    this.tableRows = page.locator('table tbody tr');
    this.emptyState = page.getByText(/no.*job/i);
    this.loadingIndicator = page.locator('.animate-spin');
  }

  async navigateToTab() {
    // Ensure we're on a page with a jobs tab
    await this.page.waitForLoadState('domcontentloaded');

    await this.tab.click();

    // Wait for the jobs tab to become active (has border-primary class)
    await expect(this.tab).toHaveAttribute('class', /border-primary/i, { timeout: 5000 });

    // Wait for network to settle
    await this.page.waitForLoadState('networkidle', { timeout: 10000 });

    // Verify that we're on the jobs tab by checking jobs tab content
    const jobsTabContent = this.page.locator('[data-testid="jobs-tab-content"]');
    await expect(jobsTabContent).toBeVisible({ timeout: 10000 });
  }

  async isActive(): Promise<boolean> {
    const tabClass = await this.tab.getAttribute('class');
    return tabClass?.includes('border-primary') ?? false;
  }

  async waitForLoaded() {
    // Wait for either table or empty state to be visible
    // This is more reliable than waiting for loading indicator to disappear
    await expect(async () => {
      const hasTable = await this.content.locator('table').isVisible().catch(() => false);
      const hasEmpty = await this.emptyState.isVisible().catch(() => false);
      if (!hasTable && !hasEmpty) {
        throw new Error('Jobs tab not loaded: neither table nor empty state visible');
      }
    }).toPass({ timeout: 15000 });
  }

  async getJobCount(): Promise<number> {
    await this.waitForLoaded();
    if (await this.emptyState.isVisible()) {
      return 0;
    }
    return this.tableRows.count();
  }

  async getJobByName(name: string): Promise<Locator | null> {
    const rows = this.tableRows;
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent();
      if (text?.includes(name)) {
        return row;
      }
    }
    return null;
  }

  async getJobStatus(name: string): Promise<string | null> {
    const row = await this.getJobByName(name);
    if (row) {
      const statusCell = row.locator('td').nth(1); // Status is second column
      return statusCell.textContent();
    }
    return null;
  }

  async getJobProgress(name: string): Promise<number | null> {
    const row = await this.getJobByName(name);
    if (row) {
      const progressBar = row.locator('[role="progressbar"]');
      const ariaValueNow = await progressBar.getAttribute('aria-valuenow');
      return ariaValueNow ? parseFloat(ariaValueNow) : null;
    }
    return null;
  }

  async openJobDetails(name: string) {
    const row = await this.getJobByName(name);
    if (row) {
      const jobNameLink = row.locator('button').first();
      await jobNameLink.click();
    }
  }

  async openCreateJobModal() {
    await this.createJobButton.click();
  }

  async hasNoJobs(): Promise<boolean> {
    return this.emptyState.isVisible();
  }
}
