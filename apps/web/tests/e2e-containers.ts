/**
 * E2E container management script
 *
 * Commands:
 *   pnpm test:e2e:start  - Start containers, write .env.e2e.local
 *   pnpm test:e2e:stop   - Stop containers, remove .env.e2e.local
 *   pnpm test:e2e:status - Check if containers are running
 *
 * This allows Playwright to run with standard commands since containers
 * stay running between test runs (UI mode, headed mode, etc.)
 */

import {
  startTestContainers,
  stopTestContainers,
  type TestContainers,
  type TestPorts,
} from "@workspace/testcontainers";
import { writeFileSync, unlinkSync, existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ENV_FILE = resolve(__dirname, ".env.e2e.local");
const STATE_FILE = resolve(__dirname, ".e2e-containers.json");
const migrationsFolder = resolve(
  __dirname,
  "../../../apps/api/src/db/migrations",
);

const command = process.argv[2];

async function start() {
  // Check if containers are already running
  if (existsSync(ENV_FILE) && existsSync(STATE_FILE)) {
    try {
      const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      // Verify containers are actually accessible by checking the database connection
      const testUrl = `postgresql://postgres:password@localhost:${state.postgresPort}/crackhouse_test`;
      const testSql = postgres(testUrl, { max: 1, connect_timeout: 2 });
      await testSql`SELECT 1`;
      await testSql.end();

      console.log("✅ E2E containers already running");
      console.log(`   Env file: ${ENV_FILE}`);
      return;
    } catch {
      console.log("⚠️ Stale state file found, cleaning up...");
      if (existsSync(ENV_FILE)) unlinkSync(ENV_FILE);
      if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE);
    }
  }

  console.log("🚀 Starting E2E containers...");

  const { containers, ports } = await startTestContainers();

  // Small delay to ensure containers are fully ready
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Set environment variables for this process
  const databaseUrl = `postgresql://postgres:password@localhost:${ports.postgresPort}/crackhouse_test`;
  const redisUrl = `redis://localhost:${ports.redisPort}`;

  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.REDIS_HOST = "localhost";
  process.env.REDIS_PORT = String(ports.redisPort);

  // Write env file for Playwright to load
  const envContent = [
    `DATABASE_URL=${databaseUrl}`,
    `REDIS_URL=${redisUrl}`,
    `REDIS_HOST=localhost`,
    `REDIS_PORT=${ports.redisPort}`,
  ].join("\n");

  writeFileSync(ENV_FILE, envContent + "\n");
  console.log(`📝 Wrote env file: ${ENV_FILE}`);

  // Store container info for cleanup (we'll use ports to find them)
  const stateContent = JSON.stringify({
    postgresPort: ports.postgresPort,
    redisPort: ports.redisPort,
    startedAt: new Date().toISOString(),
  });
  writeFileSync(STATE_FILE, stateContent);
  console.log(`📝 Wrote state file: ${STATE_FILE}`);

  // Run migrations
  console.log("📦 Running database migrations...");
  const migrationSql = postgres(databaseUrl, { max: 1 });
  await migrate(drizzle(migrationSql), { migrationsFolder });
  await migrationSql.end();
  console.log("✅ Migrations completed");

  // Seed config
  console.log("⚙️ Seeding config values...");
  const { seedConfig } = await import("./helpers/database.js");
  await seedConfig();
  console.log("✅ Config seeded");

  console.log("\n✅ E2E containers ready!");
  console.log("   Run `pnpm test:e2e` to start testing");
  console.log("   Run `pnpm test:e2e:stop` when done");
}

async function stop() {
  if (!existsSync(STATE_FILE)) {
    console.log("ℹ️ No running containers found (no state file)");
    return;
  }

  console.log("🛑 Stopping E2E containers...");

  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    console.log(`   Postgres port: ${state.postgresPort}`);
    console.log(`   Redis port: ${state.redisPort}`);

    // We need to recreate containers from the ports to stop them
    // Since testcontainers doesn't persist container references,
    // we'll use docker CLI to stop containers by port mapping
    const { execSync } = await import("child_process");

    try {
      // Find and stop containers by port mapping
      const postgresContainer = execSync(
        `docker ps -q --filter "publish=${state.postgresPort}"`,
        { encoding: "utf-8" },
      ).trim();
      const redisContainer = execSync(
        `docker ps -q --filter "publish=${state.redisPort}"`,
        { encoding: "utf-8" },
      ).trim();

      if (postgresContainer) {
        execSync(`docker stop ${postgresContainer}`, { encoding: "utf-8" });
        console.log("   Stopped Postgres container");
      }
      if (redisContainer) {
        execSync(`docker stop ${redisContainer}`, { encoding: "utf-8" });
        console.log("   Stopped Redis container");
      }
    } catch (e) {
      console.log(
        "   Note: Could not stop via docker CLI, containers may have already stopped",
      );
    }
  } catch (e) {
    console.log("   Warning: Could not read state file");
  }

  // Clean up files
  if (existsSync(ENV_FILE)) {
    unlinkSync(ENV_FILE);
    console.log("   Removed env file");
  }
  if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
    console.log("   Removed state file");
  }

  console.log("✅ E2E containers stopped");
}

async function status() {
  console.log("📊 E2E Container Status\n");

  if (!existsSync(ENV_FILE)) {
    console.log("   Status: Not running");
    console.log("   Run `pnpm test:e2e:start` to start containers");
    return;
  }

  console.log("   Status: Running");
  console.log(`   Env file: ${ENV_FILE}`);

  if (existsSync(STATE_FILE)) {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    console.log(`   Postgres port: ${state.postgresPort}`);
    console.log(`   Redis port: ${state.redisPort}`);
    console.log(`   Started at: ${state.startedAt}`);
  }

  console.log("\n   Run `pnpm test:e2e:stop` to stop containers");
}

async function main() {
  switch (command) {
    case "start":
      await start();
      break;
    case "stop":
      await stop();
      break;
    case "status":
      await status();
      break;
    default:
      console.log("Usage: tsx e2e-containers.ts [start|stop|status]");
      console.log("");
      console.log("Commands:");
      console.log("  start  - Start containers and write .env.e2e.local");
      console.log("  stop   - Stop containers and clean up files");
      console.log("  status - Check if containers are running");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
