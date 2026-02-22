import { Page, Locator, expect } from "@playwright/test";
import { TEST_TIMEOUTS } from "../helpers/wait-helpers";

/**
 * Create Job Modal Page Object
 * Encapsulates interactions with the create job modal
 */
export class CreateJobModalPage {
  readonly page: Page;

  // Modal elements
  readonly modal: Locator;
  readonly title: Locator;

  // Form elements
  readonly attackModeSelect: Locator;
  readonly networksSection: Locator;
  readonly dictionariesSection: Locator;

  // Action buttons
  readonly createButton: Locator;
  readonly cancelButton: Locator;

  // Error message
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Modal
    this.modal = page.locator('[data-testid="create-job-modal"]');
    this.title = this.modal.locator('[class*="DialogTitle"]');

    // Form elements
    this.attackModeSelect = this.modal
      .locator("button")
      .filter({ hasText: /handshake|pmkid/i });
    this.networksSection = this.modal
      .locator("div")
      .filter({ hasText: /networks/i })
      .first();
    this.dictionariesSection = this.modal
      .locator("div")
      .filter({ hasText: /dictionaries/i })
      .first();

    // Buttons
    this.createButton = this.modal.getByRole("button", { name: /create job/i });
    this.cancelButton = this.modal.getByRole("button", { name: /cancel/i });

    // Error
    this.errorMessage = this.modal.locator(".bg-destructive");
  }

  async isVisible(): Promise<boolean> {
    return this.modal.isVisible();
  }

  async waitForOpen() {
    await expect(this.modal).toBeVisible({ timeout: TEST_TIMEOUTS.modal });
  }

  async close() {
    await this.cancelButton.click();
    await expect(this.modal).not.toBeVisible();
  }

  async selectAttackMode(mode: "handshake" | "pmkid") {
    await this.attackModeSelect.click();
    const option = this.page.getByRole("option", {
      name: new RegExp(mode, "i"),
    });
    await option.click();
  }

  async selectNetwork(ssid: string) {
    // Network selection is now a radio button (single selection)
    const radio = this.modal
      .locator("label")
      .filter({ hasText: ssid })
      .locator('[type="radio"]');
    await radio.check();
  }

  async selectNetworkByIndex(index: number) {
    // Network selection is now a radio button (single selection)
    const radios = this.modal.locator('[id^="network-"][type="radio"]');
    await radios.nth(index).check();
  }

  async selectDictionary(name: string) {
    const checkbox = this.modal
      .locator("label")
      .filter({ hasText: name })
      .locator('[type="checkbox"]');
    await checkbox.check();
  }

  async selectDictionaryByIndex(index: number) {
    const checkboxes = this.modal.locator('[id^="dictionary-"]');
    await checkboxes.nth(index).check();
  }

  async hasSelectedNetwork(): Promise<boolean> {
    const selectedRadio = this.modal.locator(
      '[id^="network-"][type="radio"]:checked',
    );
    return selectedRadio.count().then((count) => count > 0);
  }

  async getSelectedDictionariesCount(): Promise<number> {
    const label = this.modal.getByText(/dictionaries \(\d+ selected\)/i);
    const text = await label.textContent();
    const match = text?.match(/\((\d+) selected\)/);
    return match && match[1] ? parseInt(match[1], 10) : 0;
  }

  async hasAvailableNetworks(): Promise<boolean> {
    const noNetworksMessage = this.modal.getByText(/no networks available/i);
    return !(await noNetworksMessage.isVisible());
  }

  async hasAvailableDictionaries(): Promise<boolean> {
    const noDictionariesMessage = this.modal.getByText(
      /no dictionaries available/i,
    );
    return !(await noDictionariesMessage.isVisible());
  }

  async waitForClosed() {
    await expect(this.modal).not.toBeVisible({ timeout: TEST_TIMEOUTS.api });
  }

  async submitJob() {
    await this.createButton.click();
    // Wait for modal to close on success or error message to appear
    await Promise.race([
      this.waitForClosed(),
      expect(this.errorMessage)
        .toBeVisible({ timeout: TEST_TIMEOUTS.api })
        .catch(() => {}),
    ]);
  }

  async getErrorMessage(): Promise<string | null> {
    if (await this.errorMessage.isVisible()) {
      return this.errorMessage.textContent();
    }
    return null;
  }

  async isCreateButtonEnabled(): Promise<boolean> {
    const disabled = await this.createButton.getAttribute("disabled");
    return disabled === null;
  }
}
