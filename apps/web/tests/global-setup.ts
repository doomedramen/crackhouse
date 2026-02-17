import { cleanDatabase } from './helpers/database';

/**
 * Global setup for Playwright tests
 * Runs AFTER webServer starts (Playwright's execution order).
 *
 * Testcontainers, migrations, and config seeding are handled by
 * the launch-e2e.ts wrapper script BEFORE Playwright starts.
 *
 * This only cleans test data to ensure a fresh state.
 */
export default async function globalSetup() {
  console.log('Cleaning test database...');

  try {
    await cleanDatabase();
    console.log('Test environment ready');
  } catch (error) {
    console.error('Failed to set up test environment:', error);
    throw error;
  }
}
