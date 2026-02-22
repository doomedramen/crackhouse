import { Page, Locator, expect } from "@playwright/test";
import * as path from "path";
import { waitForDebounce, TEST_TIMEOUTS } from "../helpers/wait-helpers";

/**
 * Upload Modal Page Object
 * Encapsulates interactions with the upload modal
 */
export class UploadModalPage {
  readonly page: Page;

  // Modal elements
  readonly modal: Locator;
  readonly closeButton: Locator;

  // Tab navigation
  readonly pcapTab: Locator;
  readonly dictionaryTab: Locator;

  // Upload area
  readonly dropzone: Locator;
  readonly fileInput: Locator;

  // Buttons
  readonly uploadButton: Locator;
  readonly cancelButton: Locator;

  // Success/Error messages
  readonly pcapSuccessMessage: Locator;
  readonly dictionarySuccessMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Modal container - use data-testid
    this.modal = page.locator('[data-testid="upload-modal"]');
    this.closeButton = page.locator('[data-testid="upload-modal-close"]');

    // Tabs within the modal - use button with text
    this.pcapTab = this.modal
      .locator('button[role="tab"]')
      .filter({ hasText: /captures/i });
    this.dictionaryTab = this.modal
      .locator('button[role="tab"]')
      .filter({ hasText: /dictionaries/i });

    // Upload elements
    this.dropzone = this.modal.locator(".border-dashed");
    this.fileInput = this.modal.locator('input[type="file"]');

    // Action buttons
    this.uploadButton = this.modal
      .getByRole("button", { name: /upload/i })
      .last();
    this.cancelButton = this.modal.getByRole("button", { name: /cancel/i });

    // Success messages
    this.pcapSuccessMessage = page.locator(
      '[data-testid="upload-success-pcap"]',
    );
    this.dictionarySuccessMessage = page.locator(
      '[data-testid="upload-success-dictionary"]',
    );
  }

  async isVisible(): Promise<boolean> {
    return this.modal.isVisible();
  }

  async waitForOpen() {
    await expect(this.modal).toBeVisible({ timeout: 5000 });
  }

  async close() {
    await this.closeButton.click();
    await expect(this.modal).not.toBeVisible();
  }

  async selectPcapTab() {
    await this.pcapTab.click();
  }

  async selectDictionaryTab() {
    await this.dictionaryTab.click();
  }

  /**
   * Upload a file using the file input
   */
  async uploadFile(filePath: string) {
    // Make sure the file input is available
    const input = this.page.locator('input[type="file"]').first();
    await input.setInputFiles(filePath);
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(filePaths: string[]) {
    const input = this.page.locator('input[type="file"]').first();
    await input.setInputFiles(filePaths);
  }

  /**
   * Click the upload button and wait for completion
   */
  async submitUpload() {
    await this.uploadButton.click();
    // Wait for upload to complete or error - uploads can take time
    await waitForDebounce(this.page, TEST_TIMEOUTS.default);
  }

  /**
   * Get the count of files added
   */
  async getFileCount(): Promise<number> {
    const fileItems = this.modal.locator(
      '.uppy-Dashboard-Item, [data-testid="file-item"]',
    );
    return fileItems.count();
  }

  /**
   * Check if upload was successful
   */
  async isUploadSuccessful(): Promise<boolean> {
    const successMessage = this.page.getByText(/success|uploaded|complete/i);
    return successMessage.isVisible().catch(() => false);
  }

  /**
   * Get error message if upload failed
   */
  async getErrorMessage(): Promise<string | null> {
    const errorElement = this.modal.locator(
      '.uppy-Informer-message, [data-testid="error-message"]',
    );
    if (await errorElement.isVisible()) {
      return errorElement.textContent();
    }
    return null;
  }
}
