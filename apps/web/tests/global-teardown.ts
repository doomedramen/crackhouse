import { stopTestContainers } from '@workspace/testcontainers';
import { cleanDatabase } from './helpers/database';

/**
 * Global teardown for Playwright tests
 * Runs once after all tests
 */
export default async function globalTeardown() {
  console.log('Tearing down test environment...');

  try {
    // Clean the test database after all tests
    await cleanDatabase();
  } catch (error) {
    console.error('Failed to clean up test database:', error);
    // Don't throw - teardown errors shouldn't fail the test run
  }

  // Stop test containers
  const containers = globalThis.__TEST_CONTAINERS__;
  if (containers) {
    await stopTestContainers(containers);
    globalThis.__TEST_CONTAINERS__ = undefined;
  }

  console.log('Test environment cleaned up');
}
