/**
 * E2E test launcher — starts testcontainers, runs migrations, then runs Playwright.
 *
 * This script exists because Playwright starts webServer BEFORE globalSetup.
 * We need DATABASE_URL / REDIS_* set in the environment before Playwright
 * spawns the API + web servers.
 *
 * Flow:
 *   1. Start Postgres + Redis containers (testcontainers)
 *   2. Set DATABASE_URL / REDIS_* env vars
 *   3. Run database migrations
 *   4. Seed config values
 *   5. Run Playwright as a child process (inherits env)
 *   6. Stop containers after Playwright exits
 */

import { startTestContainers, stopTestContainers, setTestEnvVars } from '@workspace/testcontainers';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const migrationsFolder = resolve(__dirname, '../../../apps/api/src/db/migrations');

async function main() {
  const { containers, ports } = await startTestContainers();
  setTestEnvVars(ports);

  const databaseUrl = process.env.DATABASE_URL!;

  // Run database migrations directly (avoid the API's db:migrate which hangs due to open connections)
  console.log('Running database migrations...');
  const migrationSql = postgres(databaseUrl, { max: 1 });
  await migrate(drizzle(migrationSql), { migrationsFolder });
  await migrationSql.end();
  console.log('Migrations completed.');

  // Seed config values (API needs these to start)
  console.log('Seeding config values...');
  const { seedConfig } = await import('./helpers/database.js');
  await seedConfig();
  console.log('Config seeded.');

  try {
    // Forward all CLI args to Playwright
    const args = process.argv.slice(2).join(' ');
    const command = `npx playwright test ${args}`;

    console.log(`Running: ${command}`);

    execSync(command, {
      stdio: 'inherit',
      env: process.env,
      cwd: process.cwd(),
    });
  } catch (error: any) {
    // execSync throws on non-zero exit code — propagate it
    process.exitCode = error.status ?? 1;
  } finally {
    await stopTestContainers(containers);
  }
}

main();
