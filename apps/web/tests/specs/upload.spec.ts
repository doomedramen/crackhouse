import { test, expect } from '@playwright/test';
import { TEST_USER, loginViaUI } from '../helpers/auth';
import { UploadModalPage } from '../pages/upload-modal.page';
import { DashboardPage } from '../pages/dashboard.page';
import { createTestDictionary, createTestPcap, cleanupTestFiles } from '../fixtures/test-files';

/**
 * Upload Flow E2E Tests
 * Tests for PCAP and dictionary upload functionality
 */
test.describe('Upload Flow', () => {
  let dashboard: DashboardPage;
  let uploadModal: UploadModalPage;

  test.beforeAll(() => {
    // Create test fixtures
    createTestDictionary('test-dictionary.txt');
    createTestPcap('test-capture.pcap');
  });

  test.afterAll(() => {
    // Cleanup test fixtures
    cleanupTestFiles();
  });

  test.beforeEach(async ({ page }) => {
    // Login and navigate to dashboard
    await loginViaUI(page, TEST_USER.email, TEST_USER.password);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    dashboard = new DashboardPage(page);
    uploadModal = new UploadModalPage(page);
  });

  test.describe('Upload Modal', () => {
    test('should open upload modal from header button', async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();

      await expect(uploadModal.modal).toBeVisible();
    });

    test('should display tab navigation for PCAP and Dictionary', async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();

      await expect(uploadModal.pcapTab).toBeVisible();
      await expect(uploadModal.dictionaryTab).toBeVisible();
    });

    test('should switch between PCAP and Dictionary tabs', async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();

      // Click dictionary tab
      await uploadModal.selectDictionaryTab();
      await expect(uploadModal.dictionaryTab).toHaveAttribute('data-state', 'active');

      // Click PCAP tab
      await uploadModal.selectPcapTab();
      await expect(uploadModal.pcapTab).toHaveAttribute('data-state', 'active');
    });

    test('should close modal when close button is clicked', async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();

      await uploadModal.close();

      await expect(uploadModal.modal).not.toBeVisible();
    });
  });

  test.describe('PCAP Upload Tab', () => {
    test.beforeEach(async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();
      await uploadModal.selectPcapTab();
    });

    test('should display PCAP upload instructions', async ({ page }) => {
      const title = page.getByText(/network captures/i);
      await expect(title).toBeVisible();
    });

    test('should display dropzone for PCAP files', async ({ page }) => {
      const dropzone = page.getByText(/drop files here/i);
      await expect(dropzone).toBeVisible();
    });

    test('should have file input for PCAP files', async ({ page }) => {
      const fileInput = page.locator('[data-testid="file-input-pcap"]');
      await expect(fileInput).toBeAttached();
    });

    test('should display upload button (disabled initially)', async ({ page }) => {
      const uploadButton = page.locator('[data-testid="upload-button-pcap"]');
      await expect(uploadButton).toBeVisible();
      await expect(uploadButton).toBeDisabled();
    });
  });

  test.describe('Dictionary Upload Tab', () => {
    test.beforeEach(async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();
      await uploadModal.selectDictionaryTab();
    });

    test('should display dictionary upload instructions', async ({ page }) => {
      const title = page.getByText(/password dictionaries/i);
      await expect(title).toBeVisible();
    });

    test('should display dropzone for dictionary files', async ({ page }) => {
      const dropzone = page.getByText(/drop files here/i);
      await expect(dropzone).toBeVisible();
    });

    test('should have file input for dictionary files', async ({ page }) => {
      const fileInput = page.locator('[data-testid="file-input-dictionary"]');
      await expect(fileInput).toBeAttached();
    });

    test('should display upload button (disabled initially)', async ({ page }) => {
      const uploadButton = page.locator('[data-testid="upload-button-dictionary"]');
      await expect(uploadButton).toBeVisible();
      await expect(uploadButton).toBeDisabled();
    });
  });

  test.describe('File Selection', () => {
    test('should enable upload button when PCAP file is selected', async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();
      await uploadModal.selectPcapTab();

      // Add file using file input
      const testPcapPath = createTestPcap('upload-test.pcap');
      await uploadModal.uploadFile(testPcapPath);

      // Upload button should be enabled
      const uploadButton = page.locator('[data-testid="upload-button-pcap"]');
      await expect(uploadButton).toBeEnabled({ timeout: 5000 });
    });

    test('should enable upload button when dictionary file is selected', async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();
      await uploadModal.selectDictionaryTab();

      // Add file using file input
      const testDictPath = createTestDictionary('upload-test-dict.txt');
      await uploadModal.uploadFile(testDictPath);

      // Upload button should be enabled
      const uploadButton = page.locator('[data-testid="upload-button-dictionary"]');
      await expect(uploadButton).toBeEnabled({ timeout: 5000 });
    });

    test('should display selected file information', async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();
      await uploadModal.selectPcapTab();

      const testPcapPath = createTestPcap('display-test.pcap');
      await uploadModal.uploadFile(testPcapPath);

      // File should be listed in selected files
      const selectedFiles = page.locator('[data-testid="selected-files-pcap"]');
      await expect(selectedFiles).toBeVisible({ timeout: 5000 });
    });

    test('should display individual file item after PCAP selection', async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();
      await uploadModal.selectPcapTab();

      const testPcapPath = createTestPcap('item-test.pcap');
      await uploadModal.uploadFile(testPcapPath);

      // File item should be visible with data-testid pattern
      const selectedFiles = page.locator('[data-testid="selected-files-pcap"]');
      await expect(selectedFiles).toBeVisible({ timeout: 5000 });

      // Individual file items start with file-item-pcap-
      const fileItems = page.locator('[data-testid^="file-item-pcap-"]');
      await expect(fileItems.first()).toBeVisible({ timeout: 5000 });
    });

    test('should display file size information', async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();
      await uploadModal.selectPcapTab();

      const testPcapPath = createTestPcap('size-test.pcap');
      await uploadModal.uploadFile(testPcapPath);

      const selectedFiles = page.locator('[data-testid="selected-files-pcap"]');
      await expect(selectedFiles).toBeVisible({ timeout: 5000 });

      // File size should be displayed (bytes/KB/MB)
      const fileText = await selectedFiles.textContent();
      const hasSize = /\d+\s*(bytes|KB|MB|B)/i.test(fileText || '');
      expect(hasSize).toBe(true);
    });
  });

  test.describe('Upload Modal Close', () => {
    test('should close upload modal via close button data-testid', async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();

      const closeButton = page.locator('[data-testid="upload-modal-close"]');
      await expect(closeButton).toBeVisible();
      await closeButton.click();

      await expect(uploadModal.modal).not.toBeVisible();
    });
  });

  test.describe('File Input Elements', () => {
    test('should have PCAP file input element', async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();
      await uploadModal.selectPcapTab();

      const fileInput = page.locator('[data-testid="file-input-pcap"]');
      await expect(fileInput).toBeAttached();
    });

    test('should have dictionary file input element', async ({ page }) => {
      await dashboard.clickUpload();
      await uploadModal.waitForOpen();
      await uploadModal.selectDictionaryTab();

      const fileInput = page.locator('[data-testid="file-input-dictionary"]');
      await expect(fileInput).toBeAttached();
    });
  });
});
