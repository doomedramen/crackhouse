import { migrate } from "drizzle-orm/postgres-js/migrator";
import { migrationDb } from "./index";

import { fileURLToPath } from "url";
import { dirname, join } from "path";

async function runMigrations() {
  console.log("🔍 Running database migrations...");

  try {
    // Get the directory name of the current file
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Construct the absolute path to the migrations folder from this file
    const migrationsPath = join(__dirname, "migrations");

    // Run existing migration files
    await migrate(migrationDb, { migrationsFolder: migrationsPath });
    console.log("✅ Database migrations completed successfully!");
  } catch (error) {
    console.error("❌ Error running migrations:", error);
    throw error;
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations().catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
}

export { runMigrations };
