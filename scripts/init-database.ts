#!/usr/bin/env tsx

/**
 * Database initialization script for CrackHouse
 * This script sets up the database schema and creates the initial superuser
 */

import { runMigrations } from "../apps/api/src/db/migrate";
import { createSuperUser } from "../apps/api/src/db/seed-superuser";

async function initializeDatabase() {
  console.log("🚀 Initializing CrackHouse database...");

  try {
    // Step 1: Run database migrations
    console.log("\n📋 Step 1: Running database migrations...");
    await runMigrations();

    // Step 2: Create superuser
    console.log("\n👤 Step 2: Creating superuser...");
    await createSuperUser();

    console.log("\n✅ Database initialization completed successfully!");
    console.log("🎉 CrackHouse is now ready to use!");
  } catch (error) {
    console.error("\n❌ Database initialization failed:", error);
    process.exit(1);
  }
}

// Run the initialization
if (require.main === module) {
  initializeDatabase().catch((error) => {
    console.error("Initialization failed:", error);
    process.exit(1);
  });
}

export { initializeDatabase };
