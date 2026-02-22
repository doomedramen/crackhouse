import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/config/env";

// Lazy database connections to allow environment to be configured before connecting
let migrationClientInstance: any = null;
let queryClientInstance: any = null;
let dbInstance: any = null;
let migrationDbInstance: any = null;

function getMigrationClient() {
  if (!migrationClientInstance) {
    migrationClientInstance = postgres(env.DATABASE_URL, {
      max: 1,
      connect_timeout: 10, // 10 seconds timeout
      connection: {
        application_name: "crackhouse-migration",
      },
    });
  }
  return migrationClientInstance;
}

function getQueryClient() {
  if (!queryClientInstance) {
    queryClientInstance = postgres(env.DATABASE_URL, {
      connect_timeout: 10, // 10 seconds timeout
      connection: {
        application_name: "crackhouse-app",
      },
    });
  }
  return queryClientInstance;
}

// Connection for migrations
function getMigrationDb() {
  if (!migrationDbInstance) {
    migrationDbInstance = drizzle(getMigrationClient(), { schema });
  }
  return migrationDbInstance;
}

// Connection for queries
function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getQueryClient(), { schema });
  }
  return dbInstance;
}

export const db = getDb();
export const migrationDb = getMigrationDb();

export { schema };
