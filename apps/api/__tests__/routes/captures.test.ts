import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { capturesRoutes } from "../../src/routes/captures";
import {
  createTestAppWithAuth,
  createTestAppWithoutAuth,
  getRequest,
  deleteRequest,
  createTestUserObject,
  createMockFile,
} from "../helpers/api-test-utils";
import { v4 as uuidv4 } from "uuid";
import { getTestDb, testHelpers, cleanDatabase } from "../setup";

// Mock only side effects, not the service
vi.mock("../../src/lib/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/logger")>();
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

// Mock audit service (side effect)
vi.mock("../../src/services/audit.service", () => ({
  auditService: {
    logEvent: vi.fn(() => Promise.resolve()),
  },
}));

describe("Captures API Routes - Real DB Tests", () => {
  let db: ReturnType<typeof getTestDb>;
  let testUserId: string;
  let adminUserId: string;

  beforeEach(async () => {
    db = getTestDb();
    await cleanDatabase();

    const testUser = await testHelpers.createUser({
      email: `test-${uuidv4()}@example.com`,
      name: "Test User",
    });
    testUserId = testUser.id;

    const adminUser = await testHelpers.createAdmin({
      email: `admin-${uuidv4()}@example.com`,
      name: "Admin User",
    });
    adminUserId = adminUser.id;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET / - List captures", () => {
    it("should return empty list when no captures exist", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(capturesRoutes, testUser);
      const { status, data } = await getRequest(app, "/");

      expect(status).toBe(200);
      expect(data.data).toEqual([]);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.total).toBe(0);
    });

    it("should return captures for authenticated user", async () => {
      // Create a capture for this user
      await testHelpers.createCapture(testUserId, {
        filename: "test-capture.pcap",
        status: "completed",
        networkCount: 3,
      });

      // Create a capture for another user (should not be visible)
      const otherUser = await testHelpers.createUser();
      await testHelpers.createCapture(otherUser.id, {
        filename: "other-capture.pcap",
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(capturesRoutes, testUser);
      const { status, data } = await getRequest(app, "/");

      expect(status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].filename).toBe("test-capture.pcap");
      expect(data.data[0].userId).toBe(testUserId);
    });

    it("should support pagination", async () => {
      // Create multiple captures
      for (let i = 0; i < 5; i++) {
        await testHelpers.createCapture(testUserId, {
          filename: `capture-${i}.pcap`,
        });
      }

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(capturesRoutes, testUser);
      const { status, data } = await getRequest(app, "/?page=1&limit=2");

      expect(status).toBe(200);
      expect(data.data).toHaveLength(2);
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(2);
      expect(data.pagination.total).toBe(5);
      expect(data.pagination.totalPages).toBe(3);
      expect(data.pagination.hasNext).toBe(true);
    });

    it("should filter by status", async () => {
      await testHelpers.createCapture(testUserId, {
        filename: "completed.pcap",
        status: "completed",
      });
      await testHelpers.createCapture(testUserId, {
        filename: "pending.pcap",
        status: "pending",
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(capturesRoutes, testUser);
      const { status, data } = await getRequest(app, "/?status=completed");

      expect(status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].status).toBe("completed");
    });

    it("should support search by filename", async () => {
      await testHelpers.createCapture(testUserId, {
        filename: "test-network.pcap",
      });
      await testHelpers.createCapture(testUserId, {
        filename: "other-file.pcap",
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(capturesRoutes, testUser);
      const { status, data } = await getRequest(app, "/?search=network");

      expect(status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].filename).toContain("network");
    });

    it("should return all captures to admin", async () => {
      await testHelpers.createCapture(testUserId, {
        filename: "user-capture.pcap",
      });

      const adminUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(capturesRoutes, adminUser);
      const { status, data } = await getRequest(app, "/");

      expect(status).toBe(200);
      expect(data.data).toHaveLength(1);
    });

    it("should return 401 for unauthenticated request", async () => {
      const app = createTestAppWithoutAuth(capturesRoutes);
      const { status, data } = await getRequest(app, "/");

      expect(status).toBe(401);
    });
  });

  describe("GET /:id - Get capture details", () => {
    it("should return capture details for owner", async () => {
      const capture = await testHelpers.createCapture(testUserId, {
        filename: "test-capture.pcap",
        status: "completed",
        networkCount: 3,
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(capturesRoutes, testUser);
      const { status, data } = await getRequest(app, `/${capture.id}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(capture.id);
      expect(data.data.filename).toBe("test-capture.pcap");
    });

    it("should return 403 when user tries to access another users capture", async () => {
      const otherUser = await testHelpers.createUser();
      const capture = await testHelpers.createCapture(otherUser.id, {
        filename: "other-capture.pcap",
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(capturesRoutes, testUser);
      const { status, data } = await getRequest(app, `/${capture.id}`);

      expect(status).toBe(403);
      expect(data.success).toBe(false);
    });

    it("should allow admin to access any capture", async () => {
      const otherUser = await testHelpers.createUser();
      const capture = await testHelpers.createCapture(otherUser.id, {
        filename: "other-capture.pcap",
      });

      const adminUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(capturesRoutes, adminUser);
      const { status, data } = await getRequest(app, `/${capture.id}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should return 404 for non-existent capture", async () => {
      const fakeId = uuidv4();
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(capturesRoutes, testUser);
      const { status, data } = await getRequest(app, `/${fakeId}`);

      expect(status).toBe(404);
      expect(data.success).toBe(false);
    });

    it("should return 401 for unauthenticated request", async () => {
      const app = createTestAppWithoutAuth(capturesRoutes);
      const { status } = await getRequest(app, `/${uuidv4()}`);

      expect(status).toBe(401);
    });
  });

  describe("DELETE /:id - Delete a capture", () => {
    it("should delete capture owned by user", async () => {
      const capture = await testHelpers.createCapture(testUserId, {
        filename: "test-capture.pcap",
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(capturesRoutes, testUser);
      const { status, data } = await deleteRequest(app, `/${capture.id}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Capture deleted successfully");
    });

    it("should actually delete from database", async () => {
      const capture = await testHelpers.createCapture(testUserId, {
        filename: "test-capture.pcap",
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(capturesRoutes, testUser);

      // Delete the capture
      await deleteRequest(app, `/${capture.id}`);

      // Verify it's gone from DB
      const result = await db.query.captures.findFirst({
        where: (captures, { eq }) => eq(captures.id, capture.id),
      });
      expect(result).toBeUndefined();
    });

    it("should allow admin to delete any capture", async () => {
      const otherUser = await testHelpers.createUser();
      const capture = await testHelpers.createCapture(otherUser.id, {
        filename: "other-capture.pcap",
      });

      const adminUser = createTestUserObject({
        id: adminUserId,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(capturesRoutes, adminUser);
      const { status, data } = await deleteRequest(app, `/${capture.id}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should return 403 when user tries to delete another users capture", async () => {
      const otherUser = await testHelpers.createUser();
      const capture = await testHelpers.createCapture(otherUser.id, {
        filename: "other-capture.pcap",
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(capturesRoutes, testUser);
      const { status, data } = await deleteRequest(app, `/${capture.id}`);

      expect(status).toBe(403);
      expect(data.success).toBe(false);
    });

    it("should return 404 for non-existent capture", async () => {
      const fakeId = uuidv4();
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(capturesRoutes, testUser);
      const { status, data } = await deleteRequest(app, `/${fakeId}`);

      expect(status).toBe(404);
      expect(data.success).toBe(false);
    });

    it("should return 401 for unauthenticated request", async () => {
      const app = createTestAppWithoutAuth(capturesRoutes);
      const { status } = await deleteRequest(app, `/${uuidv4()}`);

      expect(status).toBe(401);
    });
  });
});
