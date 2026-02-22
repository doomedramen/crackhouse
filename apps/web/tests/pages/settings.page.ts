import { Page, Locator, expect } from "@playwright/test";

/**
 * Settings Page Object
 * Encapsulates interactions with the settings page
 */
export class SettingsPage {
  readonly page: Page;

  // Page elements
  readonly heading: Locator;
  readonly content: Locator;

  // Form elements (adjust based on actual settings page content)
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page elements
    this.heading = page.getByRole("heading", { name: /settings/i });
    this.content = page.locator("main");

    // Buttons
    this.saveButton = page.getByRole("button", { name: /save/i });
    this.cancelButton = page.getByRole("button", { name: /cancel/i });
  }

  async goto() {
    await this.page.goto("/settings");
    await this.page.waitForLoadState("networkidle");
  }

  async isVisible(): Promise<boolean> {
    return this.content.isVisible();
  }

  async waitForLoad() {
    await expect(this.content).toBeVisible({ timeout: 10000 });
  }

  async isOnSettingsPage(): Promise<boolean> {
    return this.page.url().includes("/settings");
  }
}
