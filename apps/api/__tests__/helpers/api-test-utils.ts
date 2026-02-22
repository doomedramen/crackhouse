import { Hono } from "hono";
import type { User } from "better-auth/types";
import type { HonoAuthContext } from "../../src/types/auth";
import { globalErrorHandler } from "../../src/lib/error-handler";

/**
 * Response type for API requests
 */
export interface ApiResponse<T = any> {
  status: number;
  data: T;
  headers: Headers;
}

/**
 * Creates a test app with mocked authentication
 * Sets up the user context before each request
 */
export function createTestAppWithAuth(
  routes: any,
  testUser: { id: string; email: string; name: string; role: string },
): Hono {
  const app = new Hono();

  // Mock authentication middleware - sets user context before routes execute
  app.use("*", async (c, next) => {
    // Set the user object that authenticate middleware expects
    c.set("user", {
      id: testUser.id,
      email: testUser.email,
      name: testUser.name,
      role: testUser.role,
    } as User);

    // Set the auth context that routes expect
    c.set("userId", testUser.id);
    c.set("userRole", testUser.role);
    c.set("userEmail", testUser.email);

    await next();
  });

  // Mount the routes
  app.route("/", routes);

  // Add global error handler at the end
  app.onError(globalErrorHandler);

  return app;
}

/**
 * Creates a test app without authentication (for testing auth failures)
 */
export function createTestAppWithoutAuth(routes: any): Hono {
  const app = new Hono();
  app.route("/", routes);
  app.onError(globalErrorHandler);
  return app;
}

/**
 * Makes a GET request to the test app
 */
export async function getRequest<T = any>(
  app: Hono,
  path: string,
  headers: Record<string, string> = {},
): Promise<ApiResponse<T>> {
  const response = await app.request(path, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

  return parseResponse<T>(response);
}

/**
 * Makes a POST request to the test app
 */
export async function postRequest<T = any>(
  app: Hono,
  path: string,
  body: any,
  headers: Record<string, string> = {},
): Promise<ApiResponse<T>> {
  const response = await app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  return parseResponse<T>(response);
}

/**
 * Makes a PUT request to the test app
 */
export async function putRequest<T = any>(
  app: Hono,
  path: string,
  body: any,
  headers: Record<string, string> = {},
): Promise<ApiResponse<T>> {
  const response = await app.request(path, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  return parseResponse<T>(response);
}

/**
 * Makes a DELETE request to the test app
 */
export async function deleteRequest<T = any>(
  app: Hono,
  path: string,
  headers: Record<string, string> = {},
): Promise<ApiResponse<T>> {
  const response = await app.request(path, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

  return parseResponse<T>(response);
}

/**
 * Makes a PATCH request to the test app
 */
export async function patchRequest<T = any>(
  app: Hono,
  path: string,
  body: any,
  headers: Record<string, string> = {},
): Promise<ApiResponse<T>> {
  const response = await app.request(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  return parseResponse<T>(response);
}

/**
 * Parses the response from a Hono app
 */
async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  let data: T;

  try {
    data = JSON.parse(text);
  } catch {
    // If not JSON, return raw text
    data = text as T;
  }

  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}

/**
 * Makes a FormData POST request for file uploads
 */
export async function postFormData<T = any>(
  app: Hono,
  path: string,
  formData: FormData,
  headers: Record<string, string> = {},
): Promise<ApiResponse<T>> {
  const response = await app.request(path, {
    method: "POST",
    headers: {
      // Don't set Content-Type for FormData - let the browser set it with boundary
      ...headers,
    },
    body: formData,
  });

  return parseResponse<T>(response);
}

/**
 * Creates a test user object for mocking authentication
 */
export function createTestUserObject(user: {
  id: string;
  email: string;
  name?: string;
  role?: string;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || "Test User",
    role: user.role || "user",
  };
}

/**
 * Creates a mock File object for testing file uploads
 */
export function createMockFile(
  name: string,
  content: string,
  mimeType: string = "text/plain",
): File {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  return new File([bytes], name, { type: mimeType });
}
