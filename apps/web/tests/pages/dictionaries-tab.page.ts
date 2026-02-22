import { Page, Locator, expect } from "@playwright/test";

/**
 * Dictionaries Tab Page Object
 * Encapsulates interactions with the dictionaries tab
 */
export class DictionariesTabPage {
  readonly page: Page;

  // Tab element
  readonly tab: Locator;
  readonly content: Locator;

  // Action buttons
  readonly uploadButton: Locator;
  readonly generateButton: Locator;
  readonly mergeButton: Locator;

  // Table elements
  readonly dictionariesTable: Locator;
  readonly tableRows: Locator;
  readonly emptyState: Locator;
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    this.page = page;

    // Tab navigation
    this.tab = page.locator('[data-testid="dictionaries-tab"]');
    this.content = page.locator('[data-testid="dictionaries-content"]');

    // Action buttons
    this.uploadButton = page.locator(
      '[data-testid="dictionaries-upload-button"]',
    );
    this.generateButton = page.getByRole("button", {
      name: /generate dictionary/i,
    });
    this.mergeButton = page.getByRole("button", {
      name: /merge dictionaries/i,
    });

    // Table
    this.dictionariesTable = page.locator("table");
    this.tableRows = page.locator("table tbody tr");
    this.emptyState = page.getByText(/no dictionaries found/i);
    this.loadingIndicator = page.locator(".animate-spin");
  }

  async navigateToTab() {
    await this.tab.click();
    await this.page.waitForLoadState("networkidle");
    await expect(this.content).toBeVisible({ timeout: 10000 });
  }

  async isActive(): Promise<boolean> {
    const tabClass = await this.tab.getAttribute("class");
    return tabClass?.includes("border-primary") ?? false;
  }

  async waitForLoaded() {
    await expect(this.loadingIndicator).not.toBeVisible({ timeout: 15000 });
  }

  async getDictionaryCount(): Promise<number> {
    if (await this.emptyState.isVisible()) {
      return 0;
    }
    return this.tableRows.count();
  }

  async getDictionaryByName(name: string): Promise<Locator | null> {
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

  async validateDictionary(name: string) {
    const row = await this.getDictionaryByName(name);
    if (row) {
      const validateButton = row.locator('button[title="Validate Dictionary"]');
      await validateButton.click();
    }
  }

  async deleteDictionary(name: string) {
    const row = await this.getDictionaryByName(name);
    if (row) {
      const deleteButton = row.locator('button[title="Delete Dictionary"]');
      await deleteButton.click();
    }
  }

  async viewStatistics(name: string) {
    const row = await this.getDictionaryByName(name);
    if (row) {
      const statsButton = row.locator('button[title="View Statistics"]');
      await statsButton.click();
    }
  }

  async openUploadModal() {
    await this.uploadButton.click();
  }

  async openGenerateModal() {
    await this.generateButton.click();
  }

  async openMergeModal() {
    await this.mergeButton.click();
  }

  async hasNoDictionaries(): Promise<boolean> {
    return this.emptyState.isVisible();
  }
}
