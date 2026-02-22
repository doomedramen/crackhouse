import { Context, Next } from "hono";
import {
  createAuthenticationError,
  createAuthorizationError,
} from "../lib/error-handler";
import { logger } from "../lib/logger";
import type { User } from "better-auth/types";
import type { HonoAuthContext } from "../types/auth";

export interface AuthContext {
  userId: string;
  userRole: "user" | "admin" | "superuser";
  userEmail: string;
}

/**
 * Authentication middleware to protect API routes
 * Uses session and user from Hono context (set by middleware in index.ts)
 */
export const authenticate = async (c: Context<HonoAuthContext>, next: Next) => {
  try {
    // Get user from context (set by middleware in index.ts)
    const user: User | null = c.get("user");

    if (!user) {
      return c.json(
        {
          success: false,
          error: "Unauthorized - Please login to access this resource",
          code: "AUTH_REQUIRED",
        },
        401,
      );
    }

    // Store user information in context
    const authContext: AuthContext = {
      userId: user.id,
      userRole: (user.role as "user" | "admin" | "superuser") || "user",
      userEmail: user.email,
    };

    // Store user context in Hono's context
    c.set("auth", authContext);
    c.set("userId", authContext.userId);
    c.set("userRole", authContext.userRole);
    c.set("userEmail", authContext.userEmail);

    await next();
  } catch (error) {
    const authError = createAuthenticationError(
      "Authentication failed",
      "AUTH_ERROR",
    );
    logger.error(
      "Authentication middleware error",
      "authentication",
      error instanceof Error ? error : new Error(String(error)),
      {
        errorType: authError.constructor.name,
        code: authError.code,
      },
    );

    // Re-throw to be handled by global error handler
    throw authError;
  }
};

/**
 * Admin-only middleware - must be used after authenticate
 * Note: Superuser also has admin privileges
 */
export const requireAdmin = async (c: Context<HonoAuthContext>, next: Next) => {
  const userRole = c.get("userRole") as string;
  const userId = c.get("userId");

  if (userRole !== "admin" && userRole !== "superuser") {
    const adminError = createAuthorizationError(
      "Access denied - Admin privileges required",
    );
    logger.security("admin_access_denied", "medium", {
      userId,
      userRole,
      attemptedResource: c.req.url,
    });

    // Re-throw to be handled by global error handler
    throw adminError;
  }

  await next();
};

/**
 * Superuser-only middleware - must be used after authenticate
 */
export const requireSuperuser = async (
  c: Context<HonoAuthContext>,
  next: Next,
) => {
  const userRole = c.get("userRole") as string;
  const userId = c.get("userId");

  if (userRole !== "superuser") {
    const superuserError = createAuthorizationError(
      "Access denied - Superuser privileges required",
    );
    logger.security("superuser_access_denied", "high", {
      userId,
      userRole,
      attemptedResource: c.req.url,
    });

    // Re-throw to be handled by global error handler
    throw superuserError;
  }

  await next();
};

/**
 * Optional authentication middleware - doesn't block unauthenticated users
 * but sets auth context if user is logged in
 */
export const optionalAuth = async (c: Context<HonoAuthContext>, next: Next) => {
  try {
    // Get user from context (set by middleware in index.ts)
    const user: User | null = c.get("user");

    if (user) {
      const authContext: AuthContext = {
        userId: user.id,
        userRole: (user.role as "user" | "admin" | "superuser") || "user",
        userEmail: user.email,
      };

      c.set("auth", authContext);
      c.set("userId", authContext.userId);
      c.set("userRole", authContext.userRole);
      c.set("userEmail", authContext.userEmail);
    } else {
      // Set null values if no session exists
      c.set("auth", undefined);
      c.set("userId", null);
      c.set("userRole", null);
      c.set("userEmail", null);
    }
  } catch (error) {
    // Optional auth - don't fail the request if auth fails
    logger.debug(
      "Optional authentication failed",
      "authentication",
      error instanceof Error ? error : new Error(String(error)),
    );
    // Set null values if there's an error
    c.set("auth", undefined);
    c.set("userId", null);
    c.set("userRole", null);
    c.set("userEmail", null);
  }

  await next();
};

/**
 * Helper function to get user ID from context
 */
export const getUserId = (c: Context<HonoAuthContext>): string => {
  return c.get("userId") || "";
};

/**
 * Helper function to check if user is admin or superuser
 */
export const isAdmin = (c: Context<HonoAuthContext>): boolean => {
  const userRole = c.get("userRole");
  return userRole === "admin" || userRole === "superuser";
};

/**
 * Helper function to check if user is superuser
 */
export const isSuperuser = (c: Context<HonoAuthContext>): boolean => {
  return c.get("userRole") === "superuser";
};

/**
 * Helper function to require specific role
 */
export const requireRole = (role: "user" | "admin" | "superuser") => {
  return async (c: Context<HonoAuthContext>, next: Next) => {
    const userRole = c.get("userRole");

    if (!userRole) {
      return c.json(
        {
          success: false,
          error: "Authentication required",
          code: "AUTH_REQUIRED",
        },
        401,
      );
    }

    // Admin can access everything, superuser can access everything
    const hasPermission =
      userRole === "admin" || userRole === "superuser" || userRole === role;

    if (!hasPermission) {
      return c.json(
        {
          success: false,
          error: `Access denied. Required role: ${role}`,
          code: "INSUFFICIENT_PERMISSIONS",
        },
        403,
      );
    }

    await next();
  };
};

// Export common middleware aliases
export const authMiddleware = authenticate;

/**
 * Helper function to get auth context
 */
export const getAuthContext = (
  c: Context<HonoAuthContext>,
): AuthContext | undefined => {
  return c.get("auth");
};
