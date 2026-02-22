import { Hono } from "hono";
import { auth } from "../../src/lib/auth";
import type { User, Session } from "better-auth/types";
import type { HonoAuthContext } from "../../src/types/auth";

/**
 * Create a mock request with headers
 */
export function createMockRequest(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {},
) {
  return {
    method,
    url: `http://localhost${path}`,
    headers: new Headers(headers),
    body: body ? JSON.stringify(body) : undefined,
  } as Request;
}

/**
 * Create a test context with user authentication
 */
export function createTestContext(
  app: Hono,
  user?: User | null,
  session?: Session | null,
) {
  const mockRequest = new Request("http://localhost/test", {
    headers:
      user && session
        ? {
            Cookie: `better-auth.session_token=${session.token}`,
          }
        : {},
  });

  // Create a mock context
  const context = {
    req: {
      header: (name: string) => mockRequest.headers.get(name),
      json: async () => ({}),
      query: () => ({}),
      param: (name: string) => "",
      path: () => "/test",
      method: "GET",
      url: "http://localhost/test",
    } as any,
    set: (key: string, value: any) => {},
    get: (key: string) => {
      if (key === "user") return user || null;
      if (key === "session") return session || null;
      if (key === "userId") return user?.id || null;
      if (key === "userRole") return (user as any)?.role || "user";
      if (key === "userEmail") return user?.email || null;
      return null;
    },
    json: (data: any, status?: number) => {
      return {
        data,
        status: status || 200,
      };
    },
    text: (text: string, status?: number) => {
      return {
        text,
        status: status || 200,
      };
    },
    status: (status: number) => ({
      json: (data: any) => ({ data, status }),
    }),
    header: (name: string, value: string) => {},
  };

  return context;
}

/**
 * Create authenticated request headers using Better Auth session
 */
export async function createAuthenticatedHeaders(
  userId: string,
  userEmail: string,
  userRole: "user" | "admin" | "superuser" = "user",
): Promise<Record<string, string>> {
  // In a real test, we would create a Better Auth session
  // For now, return mock headers that will work with our test middleware
  return {
    "x-test-user-id": userId,
    "x-test-user-email": userEmail,
    "x-test-user-role": userRole,
  };
}

/**
 * Test API response helper
 */
export async function testRequest(
  app: Hono,
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>,
  user?: { id: string; email: string; role: "user" | "admin" | "superuser" },
) {
  const url = `http://localhost${path}`;
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  // Add test user headers if provided
  if (user) {
    requestHeaders["x-test-user-id"] = user.id;
    requestHeaders["x-test-user-email"] = user.email;
    requestHeaders["x-test-user-role"] = user.role;
  }

  const request = new Request(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const response = await app.fetch(request);
  const responseData = await response.json();

  return {
    status: response.status,
    data: responseData,
    headers: response.headers,
  };
}

/**
 * Helper to create a mock Better Auth session
 */
export function createMockSession(user: {
  id: string;
  email: string;
  name?: string;
  role?: "user" | "admin" | "superuser";
}) {
  const sessionToken = `test-session-${user.id}-${Date.now()}`;

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name || "Test User",
      emailVerified: true,
      image: null,
      role: user.role || "user",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    session: {
      id: `session-${user.id}`,
      userId: user.id,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    sessionToken,
  };
}

/**
 * Format date for API responses
 */
export function formatDate(date: Date): string {
  return date.toISOString();
}

/**
 * Create a valid UUID v4
 */
export function createUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Common test assertions
 */
export const assertions = {
  expectSuccess(response: { status: number; data: any }) {
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Expected success but got status ${response.status}: ${JSON.stringify(response.data)}`,
      );
    }
  },

  expectError(response: { status: number; data: any }, expectedStatus: number) {
    if (response.status !== expectedStatus) {
      throw new Error(
        `Expected status ${expectedStatus} but got ${response.status}: ${JSON.stringify(response.data)}`,
      );
    }
  },

  expectUnauthorized(response: { status: number; data: any }) {
    this.expectError(response, 401);
    if (!response.data?.error?.toLowerCase().includes("unauthorized")) {
      throw new Error(
        `Expected unauthorized error but got: ${JSON.stringify(response.data)}`,
      );
    }
  },

  expectForbidden(response: { status: number; data: any }) {
    this.expectError(response, 403);
    if (
      !response.data?.error?.toLowerCase().includes("access denied") &&
      !response.data?.error?.toLowerCase().includes("forbidden")
    ) {
      throw new Error(
        `Expected forbidden error but got: ${JSON.stringify(response.data)}`,
      );
    }
  },

  expectNotFound(response: { status: number; data: any }) {
    this.expectError(response, 404);
    if (!response.data?.error?.toLowerCase().includes("not found")) {
      throw new Error(
        `Expected not found error but got: ${JSON.stringify(response.data)}`,
      );
    }
  },

  expectValidationError(response: { status: number; data: any }) {
    this.expectError(response, 400);
    if (!response.data?.error) {
      throw new Error(
        `Expected validation error but got: ${JSON.stringify(response.data)}`,
      );
    }
  },
};

/**
 * Test data generators
 */
export const testData = {
  user: (
    overrides: Partial<{
      id: string;
      email: string;
      name: string;
      role: "user" | "admin" | "superuser";
    }> = {},
  ) => ({
    id: overrides.id || createUUID(),
    email: overrides.email || `test-${Date.now()}@example.com`,
    name: overrides.name || "Test User",
    role: overrides.role || ("user" as const),
  }),

  network: (
    overrides: Partial<{
      bssid: string;
      ssid: string;
      encryption: string;
    }> = {},
  ) => ({
    bssid:
      overrides.bssid ||
      `AA:BB:CC:DD:EE:${Math.floor(Math.random() * 99)
        .toString()
        .padStart(2, "0")}`,
    ssid: overrides.ssid || `TestNetwork-${Date.now()}`,
    encryption: overrides.encryption || "WPA2",
    channel: 6,
    frequency: 2412,
    signalStrength: -50,
  }),

  dictionary: (
    overrides: Partial<{ name: string; filename: string }> = {},
  ) => ({
    name: overrides.name || `Test Dictionary ${Date.now()}`,
    filename: overrides.filename || `test-dict-${Date.now()}.txt`,
  }),

  job: (overrides: Partial<{ name: string; description: string }> = {}) => ({
    name: overrides.name || `Test Job ${Date.now()}`,
    description: overrides.description || "Test job description",
  }),
};

/**
 * Mock the Better Auth getSession for testing
 */
export function mockBetterAuthSession(user: any, session: any) {
  // This will be used to mock Better Auth's getSession method
  return {
    user,
    session,
  };
}

/**
 * Reset all mocks
 */
export function resetMocks() {
  vi.clearAllMocks();
}
