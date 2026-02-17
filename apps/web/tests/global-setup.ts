import { startTestContainers, setTestEnvVars, type TestContainers } from '@workspace/testcontainers';
import { cleanDatabase, seedConfig } from './helpers/database';

// Store containers on globalThis so global-teardown can stop them
declare global {
  var __TEST_CONTAINERS__: TestContainers | undefined;
}

/**
 * Global setup for Playwright tests
 * Runs once before all tests, BEFORE servers start
 *
 * Order: globalSetup → webServer → tests → globalTeardown
 * Environment variables set here are inherited by webServer child processes.
 */
export default async function globalSetup() {
  console.log('Starting test containers...');

  // Start Postgres + Redis via Testcontainers
  const { containers, ports } = await startTestContainers();
  setTestEnvVars(ports);

  // Store for teardown
  globalThis.__TEST_CONTAINERS__ = containers;

  console.log('Setting up test environment (pre-server)...');

  try {
    // Seed config values first (API needs these to start)
    await seedConfig();

    // Clean the test database (preserves config)
    await cleanDatabase();

    console.log('Pre-server setup complete');
  } catch (error) {
    console.error('Failed to set up test environment:', error);
    throw error;
  }
}
