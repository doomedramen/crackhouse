import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { getTestDb, cleanDatabase, testHelpers } from "../setup";
import { usersRoutes } from "../../src/routes/users";
import {
  createTestAppWithAuth,
  createTestAppWithoutAuth,
  getRequest,
  postRequest,
  patchRequest,
  deleteRequest,
  createTestUserObject,
} from "../helpers/api-test-utils";
import { v4 as uuidv4 } from "uuid";

// Mock the logger - preserve actual error classes
vi.mock("../../src/lib/logger", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/logger")>(
    "../../src/lib/logger",
  );
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      security: vi.fn(),
    },
  };
});

// Mock the audit service
vi.mock("../../src/services/audit.service", () => ({
  auditService: {
    logEvent: vi.fn(() => Promise.resolve()),
  },
}));

describe("Users API Routes", () => {
  let db: ReturnType<typeof getTestDb>;
  let regularUserId: string;
  let adminUserId: string;
  let superUserId: string;

  beforeEach(async () => {
    db = getTestDb();
    await cleanDatabase();

    // Create test users for different roles
    const regularUser = await testHelpers.createUser({
      email: `regular-${uuidv4()}@example.com`,
      name: "Regular User",
      role: "user",
    });
    regularUserId = regularUser.id;

    const adminUser = await testHelpers.createAdmin({
      email: `admin-${uuidv4()}@example.com`,
      name: "Admin User",
    });
    adminUserId = adminUser.id;

    const superUser = await testHelpers.createSuperuser({
      email: `super-${uuidv4()}@example.com`,
      name: "Super User",
    });
    superUserId = superUser.id;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET / - Get all users", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(usersRoutes);
      const response = await getRequest(app, "/");

      expect(response.status).toBe(401);
    });

    it("should return 403 when authenticated as regular user", async () => {
      const testUser = createTestUserObject({
        id: regularUserId,
        email: "regular@example.com",
        name: "Regular User",
        role: "user",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await getRequest(app, "/");

      expect(response.status).toBe(403);
    });

    it("should return all users when authenticated as admin", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await getRequest(app, "/");

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeInstanceOf(Array);
      expect(response.data.data.length).toBeGreaterThanOrEqual(3);
      expect(response.data.count).toBeGreaterThanOrEqual(3);
    });

    it("should return all users when authenticated as superuser", async () => {
      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await getRequest(app, "/");

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeInstanceOf(Array);
      expect(response.data.count).toBeGreaterThanOrEqual(3);
    });

    it("should not include password hashes in response", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await getRequest(app, "/");

      expect(response.status).toBe(200);
      response.data.data.forEach((user: any) => {
        expect(user).not.toHaveProperty("password");
      });
    });

    it("should include user fields: id, email, name, role, emailVerified, image, createdAt, updatedAt", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await getRequest(app, "/");

      expect(response.status).toBe(200);
      const firstUser = response.data.data[0];
      expect(firstUser).toHaveProperty("id");
      expect(firstUser).toHaveProperty("email");
      expect(firstUser).toHaveProperty("name");
      expect(firstUser).toHaveProperty("role");
      expect(firstUser).toHaveProperty("emailVerified");
      expect(firstUser).toHaveProperty("createdAt");
      expect(firstUser).toHaveProperty("updatedAt");
    });
  });

  describe("GET /:id - Get single user", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(usersRoutes);
      const response = await getRequest(app, `/${regularUserId}`);

      expect(response.status).toBe(401);
    });

    it("should allow user to view their own profile", async () => {
      const testUser = createTestUserObject({
        id: regularUserId,
        email: "regular@example.com",
        name: "Regular User",
        role: "user",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await getRequest(app, `/${regularUserId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.id).toBe(regularUserId);
      expect(response.data.data.email).toContain("regular-");
    });

    it("should allow admin to view any user profile", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await getRequest(app, `/${regularUserId}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.id).toBe(regularUserId);
    });

    it("should deny regular user from viewing another user profile", async () => {
      const anotherUser = await testHelpers.createUser({
        email: `another-${uuidv4()}@example.com`,
        name: "Another User",
      });

      const testUser = createTestUserObject({
        id: regularUserId,
        email: "regular@example.com",
        name: "Regular User",
        role: "user",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await getRequest(app, `/${anotherUser.id}`);

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe("Access denied");
    });

    it("should return 404 for non-existent user", async () => {
      const fakeId = uuidv4();
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await getRequest(app, `/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe("User not found");
    });

    it("should not include password in response", async () => {
      const testUser = createTestUserObject({
        id: regularUserId,
        email: "regular@example.com",
        name: "Regular User",
        role: "user",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await getRequest(app, `/${regularUserId}`);

      expect(response.status).toBe(200);
      expect(response.data.data).not.toHaveProperty("password");
    });
  });

  describe("POST / - Create new user", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(usersRoutes);
      const response = await postRequest(app, "/", {
        email: "new@example.com",
        password: "password123",
        name: "New User",
      });

      expect(response.status).toBe(401);
    });

    it("should return 403 when authenticated as regular user", async () => {
      const testUser = createTestUserObject({
        id: regularUserId,
        email: "regular@example.com",
        name: "Regular User",
        role: "user",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await postRequest(app, "/", {
        email: `new-${uuidv4()}@example.com`,
        password: "password123",
        name: "New User",
      });

      expect(response.status).toBe(403);
    });

    it("should create user with valid data as admin", async () => {
      const newEmail = `new-${uuidv4()}@example.com`;
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await postRequest(app, "/", {
        email: newEmail,
        password: "password123",
        name: "New User",
        role: "user",
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.message).toBe("User created successfully");
      expect(response.data.data.email).toBe(newEmail);
      expect(response.data.data.name).toBe("New User");
      expect(response.data.data.role).toBe("user");
      expect(response.data.data).toHaveProperty("id");
      expect(response.data.data.emailVerified).toBe(true);
    });

    it("should create admin user as admin", async () => {
      const newEmail = `admin-${uuidv4()}@example.com`;
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await postRequest(app, "/", {
        email: newEmail,
        password: "password123",
        name: "New Admin",
        role: "admin",
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.role).toBe("admin");
    });

    it("should deny admin from creating superuser", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await postRequest(app, "/", {
        email: `super-${uuidv4()}@example.com`,
        password: "password123",
        name: "New Super",
        role: "superuser",
      });

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe(
        "Only superusers can create superuser accounts",
      );
    });

    it("should allow superuser to create superuser", async () => {
      const newEmail = `super-${uuidv4()}@example.com`;
      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await postRequest(app, "/", {
        email: newEmail,
        password: "password123",
        name: "New Super",
        role: "superuser",
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.role).toBe("superuser");
    });

    it("should return 409 for duplicate email", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const existingEmail = (
        await db.query.users.findFirst({
          where: (users: any, { eq }: any) => eq(users.id, regularUserId),
        })
      )?.email;

      const response = await postRequest(app, "/", {
        email: existingEmail,
        password: "password123",
        name: "Duplicate User",
      });

      expect(response.status).toBe(409);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe("User with this email already exists");
    });

    it("should validate email format", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await postRequest(app, "/", {
        email: "not-an-email",
        password: "password123",
        name: "Invalid Email User",
      });

      expect(response.status).toBe(400);
    });

    it("should validate password minimum length", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await postRequest(app, "/", {
        email: `test-${uuidv4()}@example.com`,
        password: "short",
        name: "Short Password User",
      });

      expect(response.status).toBe(400);
    });

    it("should default role to user when not specified", async () => {
      const newEmail = `default-${uuidv4()}@example.com`;
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await postRequest(app, "/", {
        email: newEmail,
        password: "password123",
        name: "Default Role User",
      });

      expect(response.status).toBe(200);
      expect(response.data.data.role).toBe("user");
    });

    it("should use email username as default name when not provided", async () => {
      const newEmail = `noname-${uuidv4()}@example.com`;
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await postRequest(app, "/", {
        email: newEmail,
        password: "password123",
      });

      expect(response.status).toBe(200);
      // Name is derived from email before @ symbol
      expect(response.data.data.name).toBeDefined();
    });
  });

  describe("PATCH /:id - Update user", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(usersRoutes);
      const response = await patchRequest(app, `/${regularUserId}`, {
        name: "Updated Name",
      });

      expect(response.status).toBe(401);
    });

    it("should allow user to update their own name", async () => {
      const testUser = createTestUserObject({
        id: regularUserId,
        email: "regular@example.com",
        name: "Regular User",
        role: "user",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${regularUserId}`, {
        name: "Updated Name",
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.name).toBe("Updated Name");
    });

    it("should deny user from updating their own role", async () => {
      const testUser = createTestUserObject({
        id: regularUserId,
        email: "regular@example.com",
        name: "Regular User",
        role: "user",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${regularUserId}`, {
        role: "admin",
      });

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe(
        "Only administrators can change user roles",
      );
    });

    it("should deny user from updating their own email", async () => {
      const testUser = createTestUserObject({
        id: regularUserId,
        email: "regular@example.com",
        name: "Regular User",
        role: "user",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${regularUserId}`, {
        email: "newemail@example.com",
      });

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
    });

    it("should deny user from updating another user", async () => {
      const anotherUser = await testHelpers.createUser({
        email: `another-${uuidv4()}@example.com`,
        name: "Another User",
      });

      const testUser = createTestUserObject({
        id: regularUserId,
        email: "regular@example.com",
        name: "Regular User",
        role: "user",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${anotherUser.id}`, {
        name: "Hacked Name",
      });

      expect(response.status).toBe(403);
    });

    it("should allow admin to update any user name", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${regularUserId}`, {
        name: "Admin Updated Name",
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.name).toBe("Admin Updated Name");
    });

    it("should allow admin to update user email", async () => {
      const newEmail = `updated-${uuidv4()}@example.com`;
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${regularUserId}`, {
        email: newEmail,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.email).toBe(newEmail);
    });

    it("should allow admin to update user role to admin", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${regularUserId}`, {
        role: "admin",
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.role).toBe("admin");
    });

    it("should deny admin from updating role to superuser", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${regularUserId}`, {
        role: "superuser",
      });

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe(
        "Only superusers can modify superuser accounts",
      );
    });

    it("should allow superuser to update role to superuser", async () => {
      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${regularUserId}`, {
        role: "superuser",
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.role).toBe("superuser");
    });

    it("should allow superuser to demote another superuser", async () => {
      const anotherSuper = await testHelpers.createSuperuser({
        email: `super2-${uuidv4()}@example.com`,
        name: "Another Super",
      });

      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${anotherSuper.id}`, {
        role: "admin",
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.role).toBe("admin");
    });

    it("should allow admin to update emailVerified status", async () => {
      const unverifiedUser = await testHelpers.createUser({
        email: `unverified-${uuidv4()}@example.com`,
        name: "Unverified User",
        emailVerified: false,
      });

      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${unverifiedUser.id}`, {
        emailVerified: true,
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.emailVerified).toBe(true);
    });

    it("should update multiple fields at once", async () => {
      const newEmail = `multi-${uuidv4()}@example.com`;
      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${regularUserId}`, {
        name: "Multi Update",
        email: newEmail,
        role: "admin",
        emailVerified: true,
      });

      expect(response.status).toBe(200);
      expect(response.data.data.name).toBe("Multi Update");
      expect(response.data.data.email).toBe(newEmail);
      expect(response.data.data.role).toBe("admin");
      expect(response.data.data.emailVerified).toBe(true);
    });

    it("should return 404 for non-existent user", async () => {
      const fakeId = uuidv4();
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${fakeId}`, {
        name: "Updated",
      });

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe("User not found");
    });

    it("should validate email format when updating email", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await patchRequest(app, `/${regularUserId}`, {
        email: "not-an-email",
      });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /:id - Delete user", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(usersRoutes);
      const response = await deleteRequest(app, `/${regularUserId}`);

      expect(response.status).toBe(401);
    });

    it("should return 403 when authenticated as regular user", async () => {
      const testUser = createTestUserObject({
        id: regularUserId,
        email: "regular@example.com",
        name: "Regular User",
        role: "user",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await deleteRequest(app, `/${regularUserId}`);

      expect(response.status).toBe(403);
    });

    it("should return 403 when authenticated as admin", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await deleteRequest(app, `/${regularUserId}`);

      expect(response.status).toBe(403);
    });

    it("should allow superuser to delete regular user", async () => {
      const userToDelete = await testHelpers.createUser({
        email: `delete-${uuidv4()}@example.com`,
        name: "To Delete",
      });

      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await deleteRequest(app, `/${userToDelete.id}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.message).toBe("User deleted successfully");

      // Verify user is deleted
      const deleted = await db.query.users.findFirst({
        where: (users: any, { eq }: any) => eq(users.id, userToDelete.id),
      });
      expect(deleted).toBeUndefined();
    });

    it("should allow superuser to delete admin", async () => {
      const adminToDelete = await testHelpers.createAdmin({
        email: `admin-delete-${uuidv4()}@example.com`,
        name: "Admin To Delete",
      });

      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await deleteRequest(app, `/${adminToDelete.id}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it("should prevent deleting self", async () => {
      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await deleteRequest(app, `/${superUserId}`);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe("You cannot delete your own account");
    });

    it("should prevent deleting last superuser", async () => {
      // Create a new superuser as the requester
      const soleSuper = await testHelpers.createSuperuser({
        email: `sole-${uuidv4()}@example.com`,
        name: "Sole Super",
      });

      const testUser = createTestUserObject({
        id: soleSuper.id,
        email: "sole@example.com",
        name: "Sole Super",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await deleteRequest(app, `/${soleSuper.id}`);

      expect(response.status).toBe(400);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe("You cannot delete your own account");
    });

    it("should allow deleting superuser if others exist", async () => {
      const superToDelete = await testHelpers.createSuperuser({
        email: `super-del-${uuidv4()}@example.com`,
        name: "Super To Delete",
      });

      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await deleteRequest(app, `/${superToDelete.id}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it("should return 404 for non-existent user", async () => {
      const fakeId = uuidv4();
      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await deleteRequest(app, `/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
      expect(response.data.error).toBe("User not found");
    });

    it("should cascade delete to sessions", async () => {
      const userToDelete = await testHelpers.createUser({
        email: `session-${uuidv4()}@example.com`,
        name: "User With Sessions",
      });

      await testHelpers.createSession(userToDelete.id);

      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      await deleteRequest(app, `/${userToDelete.id}`);

      // Verify session is deleted via cascade
      const sessions = await db.query.sessions.findMany({
        where: (sessions: any, { eq }: any) =>
          eq(sessions.userId, userToDelete.id),
      });
      expect(sessions).toHaveLength(0);
    });

    it("should cascade delete to accounts", async () => {
      const userToDelete = await testHelpers.createUser({
        email: `account-${uuidv4()}@example.com`,
        name: "User With Account",
      });

      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      await deleteRequest(app, `/${userToDelete.id}`);

      // Verify account is deleted via cascade
      const accounts = await db.query.accounts.findMany({
        where: (accounts: any, { eq }: any) =>
          eq(accounts.userId, userToDelete.id),
      });
      expect(accounts).toHaveLength(0);
    });
  });

  describe("User Role Filtering", () => {
    it("should filter users by role when fetched via GET all", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await getRequest(app, "/");

      expect(response.status).toBe(200);
      const admins = response.data.data.filter((u: any) => u.role === "admin");
      const regulars = response.data.data.filter((u: any) => u.role === "user");
      const supers = response.data.data.filter(
        (u: any) => u.role === "superuser",
      );

      expect(admins.length).toBeGreaterThanOrEqual(1);
      expect(regulars.length).toBeGreaterThanOrEqual(1);
      expect(supers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Input Validation", () => {
    it("should reject invalid email format on create", async () => {
      const invalidEmails = [
        "not-an-email",
        "@example.com",
        "user@",
        "user @example.com",
      ];

      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);

      for (const email of invalidEmails) {
        const response = await postRequest(app, "/", {
          email,
          password: "password123",
          name: "Test",
        });
        expect(response.status).toBe(400);
      }
    });

    it("should reject passwords shorter than 8 characters", async () => {
      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);

      const shortPasswords = ["short", "1234567", ""];

      for (const password of shortPasswords) {
        const response = await postRequest(app, "/", {
          email: `test-${uuidv4()}@example.com`,
          password,
          name: "Test",
        });
        expect(response.status).toBe(400);
      }
    });

    it("should reject invalid role values", async () => {
      const testUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);

      const response = await postRequest(app, "/", {
        email: `test-${uuidv4()}@example.com`,
        password: "password123",
        name: "Test",
        role: "invalid-role",
      });

      expect(response.status).toBe(400);
    });
  });

  describe("User Timestamps", () => {
    it("should return createdAt and updatedAt in user responses", async () => {
      const testUser = createTestUserObject({
        id: regularUserId,
        email: "regular@example.com",
        name: "Regular User",
        role: "user",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);
      const response = await getRequest(app, `/${regularUserId}`);

      expect(response.status).toBe(200);
      expect(response.data.data).toHaveProperty("createdAt");
      expect(response.data.data).toHaveProperty("updatedAt");
      expect(new Date(response.data.data.createdAt)).toBeInstanceOf(Date);
      expect(new Date(response.data.data.updatedAt)).toBeInstanceOf(Date);
    });

    it("should update updatedAt timestamp after update", async () => {
      const testUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(usersRoutes, testUser);

      // Get original user
      const beforeResponse = await getRequest(app, `/${regularUserId}`);
      const beforeUpdatedAt = new Date(
        beforeResponse.data.data.updatedAt,
      ).getTime();

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update user
      await patchRequest(app, `/${regularUserId}`, {
        name: "Updated Name",
      });

      // Get updated user
      const afterResponse = await getRequest(app, `/${regularUserId}`);
      const afterUpdatedAt = new Date(
        afterResponse.data.data.updatedAt,
      ).getTime();

      expect(afterUpdatedAt).toBeGreaterThanOrEqual(beforeUpdatedAt);
    });
  });
});
