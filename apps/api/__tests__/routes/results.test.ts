import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resultsRoutes } from "../../src/routes/results";
import {
  createTestAppWithAuth,
  createTestAppWithoutAuth,
  getRequest,
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

describe("Results API Routes - Real DB Tests", () => {
  let db: ReturnType<typeof getTestDb>;
  let testUserId: string;
  let _adminUserId: string;

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
    _adminUserId = adminUser.id;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET / - List results with filtering", () => {
    it("should return empty list when no results exist", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, "/");

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual([]);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.total).toBe(0);
    });

    it("should return results for authenticated user", async () => {
      // Create a network, dictionary, and job for this user
      const network = await testHelpers.createNetwork(testUserId, {
        bssid: "AA:BB:CC:DD:EE:FF",
      });
      const dictionary = await testHelpers.createDictionary(testUserId);
      const job = await testHelpers.createJob(testUserId, {
        networkId: network.id,
        dictionaryId: dictionary.id,
      });

      // Create a job result
      await db.insert(schema.jobResults).values({
        jobId: job.id,
        type: "handshake",
        data: { bssid: network.bssid },
      });

      // Create another user with results (should not be visible)
      const otherUser = await testHelpers.createUser();
      const otherNetwork = await testHelpers.createNetwork(otherUser.id);
      const otherDict = await testHelpers.createDictionary(otherUser.id);
      const otherJob = await testHelpers.createJob(otherUser.id, {
        networkId: otherNetwork.id,
        dictionaryId: otherDict.id,
      });
      await db.insert(schema.jobResults).values({
        jobId: otherJob.id,
        type: "handshake",
        data: { bssid: otherNetwork.bssid },
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, "/");

      expect(status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].jobId).toBe(job.id);
      expect(data.pagination.total).toBe(1);
    });

    it("should filter by jobId", async () => {
      const network = await testHelpers.createNetwork(testUserId);
      const dictionary = await testHelpers.createDictionary(testUserId);
      const job1 = await testHelpers.createJob(testUserId, {
        networkId: network.id,
        dictionaryId: dictionary.id,
      });
      const job2 = await testHelpers.createJob(testUserId, {
        networkId: network.id,
        dictionaryId: dictionary.id,
      });

      await db.insert(schema.jobResults).values({
        jobId: job1.id,
        type: "handshake",
        data: { test: "1" },
      });
      await db.insert(schema.jobResults).values({
        jobId: job2.id,
        type: "password",
        data: { test: "2" },
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, `/?jobId=${job1.id}`);

      expect(status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].jobId).toBe(job1.id);
    });

    it("should filter by type", async () => {
      const network = await testHelpers.createNetwork(testUserId);
      const dictionary = await testHelpers.createDictionary(testUserId);
      const job = await testHelpers.createJob(testUserId, {
        networkId: network.id,
        dictionaryId: dictionary.id,
      });

      await db.insert(schema.jobResults).values({
        jobId: job.id,
        type: "handshake",
        data: { test: "handshake" },
      });
      await db.insert(schema.jobResults).values({
        jobId: job.id,
        type: "password",
        data: { test: "password" },
      });
      await db.insert(schema.jobResults).values({
        jobId: job.id,
        type: "error",
        data: { test: "error" },
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, "/?type=password");

      expect(status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].type).toBe("password");
    });

    it("should filter by networkId", async () => {
      const network1 = await testHelpers.createNetwork(testUserId, {
        bssid: "AA:BB:CC:DD:EE:FF",
      });
      const network2 = await testHelpers.createNetwork(testUserId, {
        bssid: "11:22:33:44:55:66",
      });
      const dictionary = await testHelpers.createDictionary(testUserId);
      const job1 = await testHelpers.createJob(testUserId, {
        networkId: network1.id,
        dictionaryId: dictionary.id,
      });
      const job2 = await testHelpers.createJob(testUserId, {
        networkId: network2.id,
        dictionaryId: dictionary.id,
      });

      await db.insert(schema.jobResults).values({
        jobId: job1.id,
        type: "handshake",
        data: { bssid: network1.bssid },
      });
      await db.insert(schema.jobResults).values({
        jobId: job2.id,
        type: "handshake",
        data: { bssid: network2.bssid },
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(
        app,
        `/?networkId=${network1.id}`,
      );

      expect(status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].job.networkId).toBe(network1.id);
    });

    it("should support pagination with limit and offset", async () => {
      const network = await testHelpers.createNetwork(testUserId);
      const dictionary = await testHelpers.createDictionary(testUserId);
      const job = await testHelpers.createJob(testUserId, {
        networkId: network.id,
        dictionaryId: dictionary.id,
      });

      // Create 5 results
      for (let i = 0; i < 5; i++) {
        await db.insert(schema.jobResults).values({
          jobId: job.id,
          type: "handshake",
          data: { index: i },
        });
      }

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, "/?limit=2&offset=0");

      expect(status).toBe(200);
      expect(data.data).toHaveLength(2);
      expect(data.pagination.limit).toBe(2);
      expect(data.pagination.offset).toBe(0);
      expect(data.pagination.total).toBe(5);
      expect(data.pagination.hasMore).toBe(true);
    });

    it("should return 401 for unauthenticated request", async () => {
      const app = createTestAppWithoutAuth(resultsRoutes);
      const { status } = await getRequest(app, "/");

      expect(status).toBe(401);
    });
  });

  describe("GET /by-job/:jobId - Get results for a specific job", () => {
    it("should return results for owned job", async () => {
      const network = await testHelpers.createNetwork(testUserId);
      const dictionary = await testHelpers.createDictionary(testUserId);
      const job = await testHelpers.createJob(testUserId, {
        networkId: network.id,
        dictionaryId: dictionary.id,
      });

      await db.insert(schema.jobResults).values({
        jobId: job.id,
        type: "handshake",
        data: { test: "data" },
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, `/by-job/${job.id}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.count).toBe(1);
    });

    it("should return empty results for job with no results", async () => {
      const network = await testHelpers.createNetwork(testUserId);
      const dictionary = await testHelpers.createDictionary(testUserId);
      const job = await testHelpers.createJob(testUserId, {
        networkId: network.id,
        dictionaryId: dictionary.id,
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, `/by-job/${job.id}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
      expect(data.count).toBe(0);
    });

    it("should return 403 when user tries to access another users job results", async () => {
      const otherUser = await testHelpers.createUser();
      const network = await testHelpers.createNetwork(otherUser.id);
      const dictionary = await testHelpers.createDictionary(otherUser.id);
      const job = await testHelpers.createJob(otherUser.id, {
        networkId: network.id,
        dictionaryId: dictionary.id,
      });

      await db.insert(schema.jobResults).values({
        jobId: job.id,
        type: "handshake",
        data: { test: "data" },
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, `/by-job/${job.id}`);

      expect(status).toBe(403);
      expect(data.success).toBe(false);
    });

    it("should return 404 for non-existent job", async () => {
      const fakeJobId = uuidv4();
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, `/by-job/${fakeJobId}`);

      expect(status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe("GET /by-network/:networkId - Get results for a specific network", () => {
    it("should return results for owned network", async () => {
      const network = await testHelpers.createNetwork(testUserId, {
        bssid: "AA:BB:CC:DD:EE:FF",
      });
      const dictionary = await testHelpers.createDictionary(testUserId);
      const job = await testHelpers.createJob(testUserId, {
        networkId: network.id,
        dictionaryId: dictionary.id,
      });

      await db.insert(schema.jobResults).values({
        jobId: job.id,
        type: "password",
        data: { password: "test123" },
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(
        app,
        `/by-network/${network.id}`,
      );

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.network.id).toBe(network.id);
      expect(data.network.ssid).toBe(network.ssid);
    });

    it("should return 403 when user tries to access another users network results", async () => {
      const otherUser = await testHelpers.createUser();
      const network = await testHelpers.createNetwork(otherUser.id, {
        bssid: "AA:BB:CC:DD:EE:FF",
      });
      const dictionary = await testHelpers.createDictionary(otherUser.id);
      const job = await testHelpers.createJob(otherUser.id, {
        networkId: network.id,
        dictionaryId: dictionary.id,
      });

      await db.insert(schema.jobResults).values({
        jobId: job.id,
        type: "handshake",
        data: { test: "data" },
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(
        app,
        `/by-network/${network.id}`,
      );

      expect(status).toBe(403);
      expect(data.success).toBe(false);
    });

    it("should return 404 for non-existent network", async () => {
      const fakeNetworkId = uuidv4();
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(
        app,
        `/by-network/${fakeNetworkId}`,
      );

      expect(status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe("GET /:id - Get a single result by ID", () => {
    it("should return result for owner", async () => {
      const network = await testHelpers.createNetwork(testUserId);
      const dictionary = await testHelpers.createDictionary(testUserId);
      const job = await testHelpers.createJob(testUserId, {
        networkId: network.id,
        dictionaryId: dictionary.id,
      });

      const [result] = await db
        .insert(schema.jobResults)
        .values({
          jobId: job.id,
          type: "password",
          data: { password: "secret123" },
        })
        .returning();

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, `/${result.id}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(result.id);
      expect(data.data.type).toBe("password");
    });

    it("should return 404 for non-existent result", async () => {
      const fakeResultId = uuidv4();
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, `/${fakeResultId}`);

      expect(status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe("GET /passwords/cracked - Get cracked passwords", () => {
    it("should return only password type results", async () => {
      const network = await testHelpers.createNetwork(testUserId);
      const dictionary = await testHelpers.createDictionary(testUserId);
      const job = await testHelpers.createJob(testUserId, {
        networkId: network.id,
        dictionaryId: dictionary.id,
      });

      await db.insert(schema.jobResults).values({
        jobId: job.id,
        type: "password",
        data: { password: "test123" },
      });
      await db.insert(schema.jobResults).values({
        jobId: job.id,
        type: "handshake",
        data: { bssid: network.bssid },
      });
      await db.insert(schema.jobResults).values({
        jobId: job.id,
        type: "error",
        data: { message: "failed" },
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, "/passwords/cracked");

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].type).toBe("password");
      expect(data.count).toBe(1);
    });

    it("should return empty list when no cracked passwords", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, "/passwords/cracked");

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
      expect(data.count).toBe(0);
    });
  });

  describe("GET /stats - Get results statistics", () => {
    it("should return statistics for user", async () => {
      const network1 = await testHelpers.createNetwork(testUserId, {
        bssid: "AA:BB:CC:DD:EE:FF",
      });
      const network2 = await testHelpers.createNetwork(testUserId, {
        bssid: "11:22:33:44:55:66",
      });
      const dictionary = await testHelpers.createDictionary(testUserId);
      const job1 = await testHelpers.createJob(testUserId, {
        networkId: network1.id,
        dictionaryId: dictionary.id,
      });
      const job2 = await testHelpers.createJob(testUserId, {
        networkId: network2.id,
        dictionaryId: dictionary.id,
      });

      // Create various types of results
      await db.insert(schema.jobResults).values({
        jobId: job1.id,
        type: "password",
        data: { password: "pass1" },
      });
      await db.insert(schema.jobResults).values({
        jobId: job2.id,
        type: "password",
        data: { password: "pass2" },
      });
      await db.insert(schema.jobResults).values({
        jobId: job1.id,
        type: "handshake",
        data: { bssid: network1.bssid },
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, "/stats");

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.byType).toBeDefined();
      expect(data.data.byType.password).toBe(2);
      expect(data.data.byType.handshake).toBe(1);
      expect(data.data.crackedNetworks).toBe(2);
      expect(data.data.totalNetworks).toBe(2);
      expect(data.data.crackRate).toBe(100);
    });

    it("should return zero stats for user with no activity", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(resultsRoutes, testUser);
      const { status, data } = await getRequest(app, "/stats");

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.byType).toEqual({});
      expect(data.data.crackedNetworks).toBe(0);
      expect(data.data.totalNetworks).toBe(0);
      expect(data.data.crackRate).toBe(0);
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
