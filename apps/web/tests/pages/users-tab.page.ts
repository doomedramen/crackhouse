import { Page, Locator, expect } from '@playwright/test';

/**
 * Users Tab Page Object
 * Encapsulates interactions with the users tab
 */
export class UsersTabPage {
  readonly page: Page;

  // Tab element
  readonly tab: Locator;
  readonly content: Locator;

  // Action buttons
  readonly createUserButton: Locator;

  // Table elements
  readonly usersTable: Locator;
  readonly tableRows: Locator;

  // Empty state
  readonly emptyState: Locator;

  // Loading
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    this.page = page;

    // Tab navigation
    this.tab = page.locator('[data-testid="users-tab"]');
    this.content = page.locator('[data-testid="users-content"]');

    // Action buttons
    this.createUserButton = this.content.getByRole('button', { name: /create user/i });

    // Table
    this.usersTable = this.content.locator('table');
    this.tableRows = this.content.locator('table tbody tr');

    // Empty state
    this.emptyState = this.content.getByText(/no users found/i);

    // Loading
    this.loadingIndicator = this.content.locator('.animate-spin');
  }

  async navigateToTab() {
    await this.tab.click();
    await this.page.waitForLoadState('networkidle');
    await expect(this.content).toBeVisible({ timeout: 10000 });
  }

  async waitForLoaded() {
    await expect(this.loadingIndicator).not.toBeVisible({ timeout: 15000 });
  }

  async getUserCount(): Promise<number> {
    if (await this.emptyState.isVisible().catch(() => false)) {
      return 0;
    }
    return this.tableRows.count();
  }

  async hasNoUsers(): Promise<boolean> {
    return this.emptyState.isVisible().catch(() => false);
  }

  async getRoleBadges(): Promise<Locator> {
    return this.content.locator('.rounded-full');
  }
}
