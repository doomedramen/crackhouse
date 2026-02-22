import { Hono } from "hono";
import type { User, Session } from "better-auth/types";
import type { HonoAuthContext } from "../../src/types/auth";

/**
 * Create a mock request with authentication context
 * This bypasses the Better Auth middleware for testing
 */
export function createAuthenticatedApp(
  app: Hono,
  user: { id: string; email: string; name?: string; role?: string },
): Hono {
  // Create a wrapper app that sets the user context before calling the actual app
  const wrapper = new Hono();

  wrapper.use("*", async (c, next) => {
    // Set the user context directly
    c.set("user", {
      id: user.id,
      email: user.email,
      name: user.name || "Test User",
      emailVerified: true,
      image: null,
      role: user.role || "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User);
    c.set("session", {
      id: "test-session-id",
      userId: user.id,
      token: "test-session-token",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Session);
    c.set("userId", user.id);
    c.set("userRole", user.role || "user");
    c.set("userEmail", user.email);

    // Apply security and db middleware with test context
    await next();
  });

  // Mount the actual app
  wrapper.route("/", app);

  return wrapper;
}

/**
 * Create test headers for authenticated requests
 */
export function createAuthHeaders(
  userId: string,
  role: string = "user",
): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("x-test-user-id", userId);
  headers.set("x-test-user-role", role);
  return headers;
}

/**
 * Mock the Better Auth API getSession method
 */
export function mockGetSession(user: any, session: any) {
  return vi.fn(() =>
    Promise.resolve({
      user,
      session,
    }),
  );
}
