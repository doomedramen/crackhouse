import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { configRoutes } from "../../src/routes/config";
import {
  createTestAppWithAuth,
  createTestAppWithoutAuth,
  getRequest,
  patchRequest,
  postRequest,
} from "../helpers/api-test-utils";
import { v4 as uuidv4 } from "uuid";
import { getTestDb, testHelpers, cleanDatabase } from "../setup";
import * as schema from "../../src/db/schema";

// Mock only side effects
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

// Mock config service - we'll mock the service methods
vi.mock("../../src/services/config.service", () => ({
  configService: {
    getAll: vi.fn(() =>
      Promise.resolve([
        {
          id: "max_pcap_size",
          value: 524288000,
          category: "general",
          type: "number",
          description: "Max PCAP file size",
        },
        {
          id: "hashcat_mode",
          value: 22000,
          category: "general",
          type: "number",
          description: "Hashcat mode",
        },
      ]),
    ),
    getById: vi.fn((id: string) => {
      if (id === "max_pcap_size") {
        return Promise.resolve({
          id: "max_pcap_size",
          value: 524288000,
          category: "general",
          type: "number",
        });
      }
      return Promise.resolve(null);
    }),
    validate: vi.fn((id: string, value: any) => {
      if (id === "invalid_config") {
        return Promise.resolve({ valid: false, error: "Invalid config key" });
      }
      return Promise.resolve({ valid: true });
    }),
    update: vi.fn((id: string, value: any, userId: string) => {
      return Promise.resolve({ id, value, updated: true });
    }),
    reload: vi.fn(() => Promise.resolve()),
  },
}));

describe("Config API Routes - Real DB Tests", () => {
  let db: ReturnType<typeof getTestDb>;
  let testUserId: string;
  let superUserId: string;

  beforeEach(async () => {
    db = getTestDb();
    await cleanDatabase();

    const testUser = await testHelpers.createUser({
      email: `test-${uuidv4()}@example.com`,
      name: "Test User",
    });
    testUserId = testUser.id;

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

  describe("GET / - Get all config values", () => {
    it("should return all config to superuser", async () => {
      const superUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(configRoutes, superUser);
      const { status, data } = await getRequest(app, "/");

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeInstanceOf(Array);
      expect(data.data.length).toBeGreaterThan(0);
    });

    it("should return 403 for unauthenticated request (requireSuperuser middleware)", async () => {
      const app = createTestAppWithoutAuth(configRoutes);
      const { status } = await getRequest(app, "/");

      expect(status).toBe(403);
    });

    it("should return 403 for regular user", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(configRoutes, testUser);
      const { status, data } = await getRequest(app, "/");

      expect(status).toBe(403);
      expect(data.success).toBe(false);
    });

    it("should return 403 for admin (not superuser)", async () => {
      const adminUser = await testHelpers.createAdmin();
      const admin = createTestUserObject({
        id: adminUser.id,
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
      });
      const app = createTestAppWithAuth(configRoutes, admin);
      const { status, data } = await getRequest(app, "/");

      expect(status).toBe(403);
      expect(data.success).toBe(false);
    });
  });

  describe("GET /:id - Get a single config value", () => {
    it("should return config value to superuser", async () => {
      const superUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(configRoutes, superUser);
      const { status, data } = await getRequest(app, "/max_pcap_size");

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe("max_pcap_size");
    });

    it("should return 404 for non-existent config", async () => {
      const superUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(configRoutes, superUser);
      const { status, data } = await getRequest(app, "/nonexistent_config");

      expect(status).toBe(404);
      expect(data.success).toBe(false);
    });

    it("should return 403 for unauthenticated request (requireSuperuser middleware)", async () => {
      const app = createTestAppWithoutAuth(configRoutes);
      const { status } = await getRequest(app, "/max_pcap_size");

      expect(status).toBe(403);
    });

    it("should return 403 for regular user", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(configRoutes, testUser);
      const { status, data } = await getRequest(app, "/max_pcap_size");

      expect(status).toBe(403);
      expect(data.success).toBe(false);
    });
  });

  describe("PATCH / - Batch update config values", () => {
    it("should update multiple config values as superuser", async () => {
      const superUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(configRoutes, superUser);
      const updates = [
        { id: "max_pcap_size", value: 104857600 },
        { id: "hashcat_mode", value: 2500 },
      ];
      const { status, data } = await patchRequest(app, "/", { updates });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.updated).toBeDefined();
      expect(data.data.count).toBe(2);
    });

    it("should return 400 for invalid config value", async () => {
      const superUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(configRoutes, superUser);
      const updates = [{ id: "invalid_config", value: "bad_value" }];
      const { status, data } = await patchRequest(app, "/", { updates });

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.data.failed).toBeDefined();
    });

    it("should return 403 for unauthenticated request (requireSuperuser middleware)", async () => {
      const app = createTestAppWithoutAuth(configRoutes);
      const { status } = await patchRequest(app, "/", { updates: [] });

      expect(status).toBe(403);
    });

    it("should return 403 for regular user", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(configRoutes, testUser);
      const { status, data } = await patchRequest(app, "/", { updates: [] });

      expect(status).toBe(403);
      expect(data.success).toBe(false);
    });
  });

  describe("POST /reload - Reload config from database", () => {
    it("should reload config as superuser", async () => {
      const superUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(configRoutes, superUser);
      const { status, data } = await postRequest(app, "/reload");

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe("Config reloaded successfully");
    });

    it("should return 403 for unauthenticated request (requireSuperuser middleware)", async () => {
      const app = createTestAppWithoutAuth(configRoutes);
      const { status } = await postRequest(app, "/reload");

      expect(status).toBe(403);
    });

    it("should return 403 for regular user", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(configRoutes, testUser);
      const { status, data } = await postRequest(app, "/reload");

      expect(status).toBe(403);
      expect(data.success).toBe(false);
    });
  });

  describe("POST /validate - Validate config values", () => {
    it("should validate config values as superuser", async () => {
      const superUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(configRoutes, superUser);
      const updates = [{ id: "max_pcap_size", value: 104857600 }];
      const { status, data } = await postRequest(app, "/validate", { updates });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeInstanceOf(Array);
      expect(data.data[0].valid).toBe(true);
    });

    it("should return validation errors for invalid values", async () => {
      const superUser = createTestUserObject({
        id: superUserId,
        email: "super@example.com",
        name: "Super User",
        role: "superuser",
      });
      const app = createTestAppWithAuth(configRoutes, superUser);
      const updates = [{ id: "invalid_config", value: "bad_value" }];
      const { status, data } = await postRequest(app, "/validate", { updates });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data[0].valid).toBe(false);
      expect(data.data[0].error).toBeDefined();
    });

    it("should return 403 for unauthenticated request (requireSuperuser middleware)", async () => {
      const app = createTestAppWithoutAuth(configRoutes);
      const { status } = await postRequest(app, "/validate", { updates: [] });

      expect(status).toBe(403);
    });

    it("should return 403 for regular user", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(configRoutes, testUser);
      const { status, data } = await postRequest(app, "/validate", {
        updates: [],
      });

      expect(status).toBe(403);
      expect(data.success).toBe(false);
    });
  });
});

function createTestUserObject(user: {
  id: string;
  email: string;
  name: string;
  role: string;
}) {
  return user;
}
