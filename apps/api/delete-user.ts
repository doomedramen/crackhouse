import { db } from "./src/db";
import { users, accounts } from "./src/db/schema";
import { eq } from "drizzle-orm";

async function deleteUser() {
  try {
    // Delete existing test user
    await db.delete(accounts).where(eq(accounts.providerId, "credential"));
    await db.delete(users).where(eq(users.email, "admin@crackhouse.local"));
    console.log("✅ Deleted existing test user");
  } catch (error) {
    console.error("❌ Error deleting user:", error);
  }
}

deleteUser();
