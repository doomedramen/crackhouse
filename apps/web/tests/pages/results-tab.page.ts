import { Page, Locator, expect } from '@playwright/test';

/**
 * Results Tab Page Object
 * Encapsulates interactions with the results tab
 */
export class ResultsTabPage {
  readonly page: Page;

  // Tab element
  readonly tab: Locator;
  readonly content: Locator;

  // Stats cards
  readonly totalResultsLabel: Locator;
  readonly crackedNetworksLabel: Locator;
  readonly resultsByTypeLabel: Locator;

  // Filter controls
  readonly typeFilter: Locator;
  readonly crackedOnlyButton: Locator;
  readonly exportCsvButton: Locator;

  // Table elements
  readonly resultsTable: Locator;
  readonly tableRows: Locator;

  // Empty state
  readonly emptyState: Locator;
  readonly emptyStateMessage: Locator;

  // Pagination
  readonly previousButton: Locator;
  readonly nextButton: Locator;

  // Loading
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    this.page = page;

    // Tab navigation
    this.tab = page.locator('[data-testid="results-tab"]');
    this.content = page.locator('[data-testid="results-content"]');

    // Stats cards - use text selectors within the content area
    this.totalResultsLabel = this.content.getByText('Total Results');
    this.crackedNetworksLabel = this.content.getByText('Cracked Networks');
    this.resultsByTypeLabel = this.content.getByText('Results by Type');

    // Filter controls
    this.typeFilter = this.content.locator('select');
    this.crackedOnlyButton = this.content.getByText('Cracked Only');
    this.exportCsvButton = this.content.getByRole('button', { name: /export csv/i });

    // Table
    this.resultsTable = this.content.locator('table');
    this.tableRows = this.content.locator('table tbody tr');

    // Empty state
    this.emptyState = this.content.getByText(/no results found/i);
    this.emptyStateMessage = this.content.getByText(/run cracking jobs to generate results/i);

    // Pagination
    this.previousButton = this.content.getByRole('button', { name: /previous/i });
    this.nextButton = this.content.getByRole('button', { name: /next/i });

    // Loading
    this.loadingIndicator = this.content.locator('.animate-spin');
  }

  async navigateToTab() {
    await this.tab.click();
    await this.page.waitForLoadState('networkidle');
    await expect(this.content).toBeVisible({ timeout: 10000 });
  }

  async waitForLoaded() {
    // Wait for loading to finish - either table, empty state, or stats appear
    await expect(this.loadingIndicator).not.toBeVisible({ timeout: 15000 });
  }

  async getResultCount(): Promise<number> {
    if (await this.emptyState.isVisible().catch(() => false)) {
      return 0;
    }
    return this.tableRows.count();
  }

  async hasNoResults(): Promise<boolean> {
    return this.emptyState.isVisible().catch(() => false);
  }

  async toggleCrackedOnly() {
    await this.crackedOnlyButton.click();
  }

  async filterByType(type: '' | 'password' | 'handshake' | 'error') {
    await this.typeFilter.selectOption(type);
    await this.page.waitForTimeout(300);
  }
}
