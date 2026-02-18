import { Page, Locator, expect } from '@playwright/test';

/**
 * Jobs Tab Page Object
 * Encapsulates interactions with the jobs tab
 */
export class JobsTabPage {
  readonly page: Page;

  // Tab element
  readonly tab: Locator;

  // Tab content - scoped to the jobs-tab-content container
  readonly content: Locator;

  // Action buttons
  readonly createJobButton: Locator;

  // Table elements
  readonly jobsTable: Locator;
  readonly tableRows: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;

    // Tab navigation - use data-testid for the tab button
    this.tab = page.locator('[data-testid="jobs-tab"]');
    // Content scoped to the jobs tab content area
    this.content = page.locator('[data-testid="jobs-tab-content"]');

    // Action buttons - "create job" button in the jobs tab content
    this.createJobButton = this.content.locator('[data-testid="create-job-button"]');

    // Table - scoped to jobs tab content
    this.jobsTable = this.content.locator('table').first();
    this.tableRows = this.content.locator('table tbody tr');
    this.emptyState = this.content.locator('[data-testid="jobs-empty-state"]');
  }

  async navigateToTab() {
    await this.page.waitForLoadState('domcontentloaded');
    await this.tab.click();
    // Wait for the jobs tab content to render - avoid networkidle as running jobs cause continuous activity
    await expect(this.content).toBeVisible({ timeout: 10000 });
  }

  async isActive(): Promise<boolean> {
    const tabClass = await this.tab.getAttribute('class');
    return tabClass?.includes('border-primary') ?? false;
  }

  async waitForLoaded() {
    // Wait for the API to respond and content to render
    // Either a table (has jobs), empty state (no jobs), or error state should appear
    // Use Playwright's .or() API for reliable compound matching
    const table = this.content.locator('table');
    const emptyState = this.content.locator('[data-testid="jobs-empty-state"]');
    // Error state renders WITHOUT jobs-tab-content wrapper, so scope to page
    const errorState = this.page.locator('.text-destructive').first();

    await expect(table.or(emptyState).or(errorState)).toBeVisible({ timeout: 15000 });
  }

  async getJobCount(): Promise<number> {
    if (await this.emptyState.isVisible().catch(() => false)) {
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
      const statusCell = row.locator('td').nth(1);
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
    return this.emptyState.isVisible().catch(() => false);
  }
}
