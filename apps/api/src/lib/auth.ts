import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, sql } from "drizzle-orm";
import { env } from "@/config/env";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { emailService } from "@/lib/email";
import { logger } from "@/lib/logger";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      account: schema.accounts,
      session: schema.sessions,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true in production
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url, token }, request) => {
      await emailService.sendPasswordResetEmail(user.email, url);
    },
    onPasswordReset: async ({ user }, request) => {
      logger.info("User password reset", "auth", { email: user.email });
    },
    // Make first user who signs up a superuser
    onSignUp: async ({ user }, request) => {
      // Check if this is the first user in the system
      const userCount = await db
        .select({ count: sql`count(*)` })
        .from(schema.users);
      const isFirstUser = Number(userCount[0]?.count || 0) === 1;

      if (isFirstUser) {
        // Make this user a superuser
        await db
          .update(schema.users)
          .set({ role: "admin" })
          .where(eq(schema.users.id, user.id));
        logger.info("First user made superuser", "auth", { email: user.email });
      }
    },
  },
  socialProviders: {
    // Add social providers if needed
  },
  session: {
    expiresIn: 7 * 24 * 60 * 60, // 7 days
    updateAge: 24 * 60 * 60, // 1 day
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: {
      sameSite: "lax", // Use 'lax' for same-origin, more reliable
      secure: env.NODE_ENV === "production",
    },
  },
  // Include custom fields in the session
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
      },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  emailVerification: {
    sendOnSignUp: false, // We'll handle this manually for now
    sendVerificationEmail: async ({ user, url, token }, request) => {
      await emailService.sendVerificationEmail(user.email, url);
    },
  },
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    env.NODE_ENV === "production" ? "https://your-production-domain.com" : null,
  ].filter(Boolean),
});
