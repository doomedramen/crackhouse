import { cleanDatabase } from "./helpers/database";

/**
 * Global setup for Playwright tests
 * Runs AFTER webServer starts (Playwright's execution order).
 *
 * Container lifecycle (start/stop) is managed separately via:
 *   pnpm test:e2e:start  - Start containers + run migrations + seed config
 *   pnpm test:e2e:stop   - Stop containers and clean up
 *
 * This only cleans test data to ensure a fresh state before each test run.
 */
export default async function globalSetup() {
  // Verify containers are running
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL not set. Run `pnpm test:e2e:start` first to start containers."
    );
  }

  console.log("🧹 Cleaning test database...");

  try {
    await cleanDatabase();
    console.log("✅ Test environment ready");
  } catch (error) {
    console.error("❌ Failed to set up test environment:", error);
    throw error;
  }
}
