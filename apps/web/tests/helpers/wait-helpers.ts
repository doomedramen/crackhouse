import { Page, Locator, expect } from '@playwright/test';

/**
 * Test timeout constants in milliseconds
 * Use these instead of magic numbers in tests
 */
export const TEST_TIMEOUTS = {
  /** Short wait: 100ms - minimal delay */
  short: 100,

  /** Default wait: 1 second */
  default: 1_000,

  /** Medium wait: 5 seconds */
  medium: 5_000,

  /** Long wait: 15 seconds */
  long: 15_000,

  /** Extended wait: 30 seconds */
  extended: 30_000,

  /** API response timeout: 10 seconds */
  api: 10_000,

  /** Page load timeout: 15 seconds */
  pageLoad: 15_000,

  /** Modal animation timeout: 5 seconds */
  modal: 5_000,
} as const;

/**
 * Wait for a page to be ready after navigation
 * Replaces arbitrary waitForTimeout calls
 */
export async function waitForPageReady(
  page: Page,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? TEST_TIMEOUTS.pageLoad;

  // Wait for the page to be in a ready state
  await page.waitForLoadState('domcontentloaded', { timeout });

  // Wait for any pending network activity to settle
  // But don't wait for networkidle as it can hang with WebSocket connections
  await page.waitForFunction(
    () => document.readyState === 'complete',
    { timeout }
  ).catch(() => {
    // Ignore if document is already in a good state
  });
}

/**
 * Wait for a specific condition to be true
 * More reliable than arbitrary timeouts
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  options?: { timeout?: number; interval?: number }
): Promise<void> {
  const timeout = options?.timeout ?? TEST_TIMEOUTS.long;
  const interval = options?.interval ?? 100;

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Wait for an element to be stable (not animating)
 * Useful for modals and transitions
 */
export async function waitForElementStable(
  locator: Locator,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? TEST_TIMEOUTS.modal;

  // Wait for element to be visible and attached
  await expect(locator).toBeVisible({ timeout });

  // Wait for any animations to complete
  await locator.waitFor({ state: 'visible', timeout });
}

/**
 * Wait for an element to appear or disappear
 */
export async function waitForElementState(
  locator: Locator,
  state: 'visible' | 'hidden' | 'attached' | 'detached',
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? TEST_TIMEOUTS.default;
  await locator.waitFor({ state, timeout });
}

/**
 * Wait for table to have rows or show empty state
 * Better than arbitrary waitForTimeout after data operations
 */
export async function waitForTableData(
  tableLocator: Locator,
  emptyStateLocator: Locator,
  options?: { timeout?: number }
): Promise<'hasData' | 'empty'> {
  const timeout = options?.timeout ?? TEST_TIMEOUTS.long;

  try {
    // Try to find either rows or empty state
    await expect(tableLocator.or(emptyStateLocator)).toBeVisible({ timeout });

    // Check which one is visible
    const hasTable = await tableLocator.isVisible().catch(() => false);
    return hasTable ? 'hasData' : 'empty';
  } catch {
    throw new Error(`Table data did not load within ${timeout}ms`);
  }
}

/**
 * Wait for API response after triggering an action
 * More reliable than waiting for UI state changes
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? TEST_TIMEOUTS.api;

  await page.waitForResponse(
    response => {
      const url = response.url();
      if (typeof urlPattern === 'string') {
        return url.includes(urlPattern);
      }
      return urlPattern.test(url);
    },
    { timeout }
  );
}

/**
 * Clear browser state and wait for it to take effect
 * Replaces context.clearCookies() + waitForTimeout pattern
 */
export async function clearBrowserState(
  page: Page,
  context?: { clearCookies: () => Promise<void>; clearPermissions: () => Promise<void> }
): Promise<void> {
  if (context) {
    await context.clearCookies();
    await context.clearPermissions();
  }

  // Clear localStorage and sessionStorage
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {
    // Ignore if page is not in a valid state
  });
}

/**
 * Wait for a modal to be fully open (visible and not animating)
 */
export async function waitForModalOpen(
  modalLocator: Locator,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? TEST_TIMEOUTS.modal;

  // Wait for modal to be visible
  await expect(modalLocator).toBeVisible({ timeout });

  // Small delay for animation to complete
  await modalLocator.page().waitForTimeout(50);
}

/**
 * Wait for a modal to be fully closed
 */
export async function waitForModalClose(
  modalLocator: Locator,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? TEST_TIMEOUTS.modal;

  await expect(modalLocator).not.toBeVisible({ timeout });
}
