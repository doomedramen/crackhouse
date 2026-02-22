import { Page, Locator, expect } from "@playwright/test";
import { waitForDebounce, waitForTableData } from "../helpers/wait-helpers";

/**
 * Networks Tab Page Object
 * Encapsulates interactions with the networks tab
 */
export class NetworksTabPage {
  readonly page: Page;

  // Tab element
  readonly tab: Locator;
  readonly content: Locator;

  // Action buttons
  readonly uploadPcapButton: Locator;
  readonly selectAllButton: Locator;
  readonly clearSelectionButton: Locator;
  readonly deleteSelectedButton: Locator;

  // Filters
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly encryptionFilter: Locator;

  // Table elements
  readonly networksTable: Locator;
  readonly tableRows: Locator;
  readonly emptyState: Locator;
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    this.page = page;

    // Tab navigation
    this.tab = page.locator('[data-testid="networks-tab"]');
    this.content = page.locator('[data-testid="networks-content"]');

    // Action buttons
    this.uploadPcapButton = page.locator(
      '[data-testid="networks-upload-pcap-button"]',
    );
    this.selectAllButton = page.getByRole("button", { name: /select all/i });
    this.clearSelectionButton = page.getByRole("button", {
      name: /clear selection/i,
    });
    this.deleteSelectedButton = page.getByRole("button", {
      name: /delete selected/i,
    });

    // Filters
    this.searchInput = page.locator('input[placeholder*="scan networks"]');
    this.statusFilter = page
      .locator("select")
      .filter({ hasText: /all statuses/i });
    this.encryptionFilter = page
      .locator("select")
      .filter({ hasText: /all encryptions/i });

    // Table
    this.networksTable = page.locator("table");
    this.tableRows = page.locator("table tbody tr");
    this.emptyState = page.getByText(/no networks found/i);
    this.loadingIndicator = page.locator(".animate-spin");
  }

  async navigateToTab() {
    await this.tab.click();
    await this.page.waitForLoadState("networkidle");
    // Wait for either the table, empty state, or loading to be visible
    await expect(this.content).toBeVisible({ timeout: 10000 });
  }

  async isActive(): Promise<boolean> {
    const tabClass = await this.tab.getAttribute("class");
    return tabClass?.includes("border-primary") ?? false;
  }

  async waitForLoaded() {
    // Wait for loading to finish
    await expect(this.loadingIndicator).not.toBeVisible({ timeout: 15000 });
  }

  async searchNetworks(query: string) {
    await this.searchInput.fill(query);
    await waitForDebounce(this.page);
  }

  async filterByStatus(status: "all" | "ready" | "processing" | "failed") {
    await this.statusFilter.selectOption(status);
    await waitForDebounce(this.page);
  }

  async filterByEncryption(
    encryption: "all" | "OPEN" | "WPA" | "WPA2" | "WPA3" | "WEP",
  ) {
    await this.encryptionFilter.selectOption(encryption);
    await waitForDebounce(this.page);
  }

  async getNetworkCount(): Promise<number> {
    if (await this.emptyState.isVisible()) {
      return 0;
    }
    return this.tableRows.count();
  }

  async selectNetwork(index: number) {
    const row = this.tableRows.nth(index);
    const checkbox = row.locator('[type="checkbox"]');
    await checkbox.check();
  }

  async selectAllNetworks() {
    await this.selectAllButton.click();
  }

  async clearSelection() {
    if (await this.clearSelectionButton.isVisible()) {
      await this.clearSelectionButton.click();
    }
  }

  async deleteSelected() {
    await this.deleteSelectedButton.click();
  }

  async getNetworkBySsid(ssid: string): Promise<Locator | null> {
    const rows = this.tableRows;
    const count = await rows.count();

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent();
      if (text?.includes(ssid)) {
        return row;
      }
    }
    return null;
  }

  async openUploadModal() {
    await this.uploadPcapButton.click();
  }

  async hasNoNetworks(): Promise<boolean> {
    return this.emptyState.isVisible();
  }
}
