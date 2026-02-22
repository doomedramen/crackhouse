import { Page, Locator, expect } from "@playwright/test";

/**
 * Dashboard Page Object
 * Encapsulates interactions with the main dashboard
 */
export class DashboardPage {
  readonly page: Page;

  // Header elements
  readonly uploadButton: Locator;
  readonly createJobButton: Locator;
  readonly avatarDropdown: Locator;
  readonly themeToggle: Locator;

  // Tab navigation
  readonly networksTab: Locator;
  readonly dictionariesTab: Locator;
  readonly jobsTab: Locator;
  readonly resultsTab: Locator;
  readonly usersTab: Locator;
  readonly adminTab: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header elements - use specific data-testid to avoid ambiguity
    this.uploadButton = page.locator('[data-testid="header-upload-button"]');
    this.createJobButton = page.locator(
      '[data-testid="header-create-job-button"]',
    );
    // Avatar is the clickable trigger, dropdown is the menu content
    this.avatarDropdown = page.locator('[data-testid="user-menu"]');
    this.themeToggle = page
      .locator('[data-testid="theme-toggle"]')
      .or(page.getByRole("button", { name: /theme|dark|light/i }));

    // Tab navigation - using data-value attribute or text
    this.networksTab = page.getByRole("tab", { name: /network/i });
    this.dictionariesTab = page.getByRole("tab", { name: /dictionar/i });
    this.jobsTab = page.getByRole("tab", { name: /job/i });
    this.resultsTab = page.getByRole("tab", { name: /result/i });
    this.usersTab = page.getByRole("tab", { name: /user/i });
    this.adminTab = page.getByRole("tab", { name: /admin/i });
  }

  async goto() {
    await this.page.goto("/");
    await this.page.waitForLoadState("networkidle");
  }

  async clickUpload() {
    await this.uploadButton.click();
  }

  async clickCreateJob() {
    await this.createJobButton.click();
  }

  async goToNetworksTab() {
    await this.networksTab.click();
    await this.page.waitForLoadState("networkidle");
  }

  async goToDictionariesTab() {
    await this.dictionariesTab.click();
    await this.page.waitForLoadState("networkidle");
  }

  async goToJobsTab() {
    await this.jobsTab.click();
    await this.page.waitForLoadState("networkidle");
  }

  async goToResultsTab() {
    await this.resultsTab.click();
    await this.page.waitForLoadState("networkidle");
  }

  async goToUsersTab() {
    await this.usersTab.click();
    await this.page.waitForLoadState("networkidle");
  }

  async goToAdminTab() {
    await this.adminTab.click();
    await this.page.waitForLoadState("networkidle");
  }

  async isTabActive(tabName: string): Promise<boolean> {
    const tab = this.page.getByRole("tab", { name: new RegExp(tabName, "i") });
    const ariaSelected = await tab.getAttribute("aria-selected");
    return ariaSelected === "true";
  }

  async getActiveTabName(): Promise<string | null> {
    const activeTab = this.page.locator('[role="tab"][aria-selected="true"]');
    return activeTab.textContent();
  }

  async openUserMenu() {
    await this.avatarDropdown.click();
    // Wait for dropdown to be visible
    await expect(
      this.page.locator('[data-testid="avatar-dropdown"]'),
    ).toBeVisible({ timeout: 5000 });
  }

  async goToSettings() {
    await this.openUserMenu();
    const settingsLink = this.page.locator('[data-testid="settings-link"]');
    await expect(settingsLink).toBeVisible({ timeout: 5000 });

    // Click and wait for navigation to settings
    await Promise.all([
      this.page.waitForURL(/settings/, { timeout: 10000 }),
      settingsLink.click(),
    ]);
    await this.page.waitForLoadState("networkidle");
  }

  async signOut() {
    await this.openUserMenu();
    const logoutButton = this.page.getByRole("menuitem", { name: /log out/i });
    await expect(logoutButton).toBeVisible({ timeout: 5000 });

    // Click and wait for redirect to sign-in
    await Promise.all([
      this.page.waitForURL(/sign-in/, { timeout: 10000 }),
      logoutButton.click(),
    ]);
    await this.page.waitForLoadState("networkidle");
  }
}
