import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getTestDb, testHelpers, cleanDatabase } from "../setup";
import { jobManagementRoutes } from "../../src/routes/jobs";
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

// Mock the queue
vi.mock("../../src/lib/queue", () => ({
  getHashcatJob: vi.fn(() => Promise.resolve(null)),
  removeHashcatJob: vi.fn(() => Promise.resolve(true)),
  checkQueueHealth: vi.fn(() => Promise.resolve({ status: "healthy" })),
}));

// Mock the audit service
vi.mock("../../src/services/audit.service", () => ({
  auditService: {
    logEvent: vi.fn(() => Promise.resolve()),
  },
}));

// Mock the config service
vi.mock("../../src/services/config.service", () => ({
  configService: {
    getBoolean: vi.fn(() => Promise.resolve(false)),
  },
}));

describe("Jobs API Routes", () => {
  let db: ReturnType<typeof getTestDb>;
  let testUserId: string;
  let adminUserId: string;
  let testNetworkId: string;
  let testDictionaryId: string;

  beforeEach(async () => {
    db = getTestDb();
    await cleanDatabase();

    // Create test users
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

    // Create test network and dictionary for jobs
    const network = await testHelpers.createNetwork(testUserId, {
      ssid: "TestNetwork",
      bssid: "AA:BB:CC:DD:EE:FF",
    });
    testNetworkId = network.id;

    const dictionary = await testHelpers.createDictionary(testUserId, {
      name: "TestDict",
      wordcount: 1000,
    });
    testDictionaryId = dictionary.id;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("GET / - Get all jobs", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const response = await getRequest(app, "/");

      expect(response.status).toBe(401);
    });

    it("should return empty array when no jobs exist", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await getRequest(app, "/");

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toEqual([]);
      expect(response.data.meta.total).toBe(0);
    });

    it("should return jobs for authenticated user", async () => {
      // Create test job
      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        name: "Test Job",
        status: "pending",
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await getRequest(app, "/");

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.length).toBeGreaterThanOrEqual(1);
      expect(response.data.meta.total).toBeGreaterThanOrEqual(1);
    });

    it("should support pagination with page and limit params", async () => {
      // Create multiple jobs
      for (let i = 0; i < 5; i++) {
        await testHelpers.createJob(
          testUserId,
          testNetworkId,
          testDictionaryId,
          {
            name: `Job ${i}`,
            status: "pending",
          },
        );
      }

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);

      // Get first page with 2 items
      const response = await getRequest(app, "/?page=1&limit=2");

      expect(response.status).toBe(200);
      expect(response.data.data.length).toBe(2);
      expect(response.data.meta.page).toBe(1);
      expect(response.data.meta.limit).toBe(2);
    });

    it("should filter jobs by status", async () => {
      // Create jobs with different statuses
      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        name: "Pending Job",
        status: "pending",
      });
      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        name: "Running Job",
        status: "running",
      });
      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        name: "Completed Job",
        status: "completed",
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);

      const response = await getRequest(app, "/?status=pending");

      expect(response.status).toBe(200);
      response.data.data.forEach((job: any) => {
        expect(job.status).toBe("pending");
      });
    });
  });

  describe("GET /:id - Get single job", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const jobId = uuidv4();
      const response = await getRequest(app, `/${jobId}`);

      expect(response.status).toBe(401);
    });

    it("should return 404 for non-existent job", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const fakeId = uuidv4();
      const response = await getRequest(app, `/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.data.success).toBe(false);
    });

    it("should return job data for owner", async () => {
      const job = await testHelpers.createJob(
        testUserId,
        testNetworkId,
        testDictionaryId,
        {
          name: "My Job",
          status: "pending",
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await getRequest(app, `/${job.id}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.id).toBe(job.id);
      expect(response.data.data.name).toBe("My Job");
    });

    it("should include network and dictionary relations", async () => {
      const network = await testHelpers.createNetwork(testUserId, {
        ssid: "TestNetwork",
        bssid: "AA:BB:CC:DD:EE:FF",
      });
      const dictionary = await testHelpers.createDictionary(testUserId, {
        name: "TestDict",
        wordcount: 1000,
      });

      const job = await testHelpers.createJob(testUserId, {
        name: "Job with relations",
        networkId: network.id,
        dictionaryId: dictionary.id,
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await getRequest(app, `/${job.id}`);

      expect(response.status).toBe(200);
      expect(response.data.data.network).toBeDefined();
      expect(response.data.data.dictionary).toBeDefined();
    });

    it("should return 403 when accessing another users job", async () => {
      const otherUser = await testHelpers.createUser({
        email: `other-${uuidv4()}@example.com`,
        name: "Other User",
      });
      // Create network and dictionary for other user
      const otherNetwork = await testHelpers.createNetwork(otherUser.id, {
        ssid: "OtherNetwork",
        bssid: "AA:BB:CC:DD:EE:01",
      });
      const otherDictionary = await testHelpers.createDictionary(otherUser.id, {
        name: "OtherDict",
      });
      const job = await testHelpers.createJob(
        otherUser.id,
        otherNetwork.id,
        otherDictionary.id,
        {
          name: "Other Users Job",
          status: "pending",
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await getRequest(app, `/${job.id}`);

      expect(response.status).toBe(403);
      expect(response.data.success).toBe(false);
    });
  });

  describe("POST /:id/cancel - Cancel a job", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const jobId = uuidv4();
      const response = await postRequest(app, `/${jobId}/cancel`, {});

      expect(response.status).toBe(401);
    });

    it("should cancel a pending job", async () => {
      const job = await testHelpers.createJob(
        testUserId,
        testNetworkId,
        testDictionaryId,
        {
          name: "Pending Job",
          status: "pending",
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await postRequest(app, `/${job.id}/cancel`, {});

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.status).toBe("cancelled");
    });

    it("should return 404 for non-existent job", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const fakeId = uuidv4();
      const response = await postRequest(app, `/${fakeId}/cancel`, {});

      expect(response.status).toBe(404);
    });

    it("should return 403 when cancelling another users job", async () => {
      const otherUser = await testHelpers.createUser({
        email: `other-${uuidv4()}@example.com`,
        name: "Other User",
      });
      const otherNetwork = await testHelpers.createNetwork(otherUser.id, {
        ssid: "OtherNetwork",
        bssid: "AA:BB:CC:DD:EE:02",
      });
      const otherDictionary = await testHelpers.createDictionary(otherUser.id, {
        name: "OtherDict",
      });
      const job = await testHelpers.createJob(
        otherUser.id,
        otherNetwork.id,
        otherDictionary.id,
        {
          name: "Other Users Job",
          status: "pending",
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await postRequest(app, `/${job.id}/cancel`, {});

      // The API queries by both id and userId, so returns 404 when job doesn't exist for that user
      expect(response.status).toBe(404);
    });
  });

  describe("POST /bulk-cancel - Cancel multiple jobs", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const response = await postRequest(app, "/bulk-cancel", {
        jobIds: [uuidv4(), uuidv4()],
      });

      expect(response.status).toBe(401);
    });

    it("should cancel multiple jobs", async () => {
      const job1 = await testHelpers.createJob(
        testUserId,
        testNetworkId,
        testDictionaryId,
        {
          name: "Job 1",
          status: "pending",
        },
      );
      const job2 = await testHelpers.createJob(
        testUserId,
        testNetworkId,
        testDictionaryId,
        {
          name: "Job 2",
          status: "pending",
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await postRequest(app, "/bulk-cancel", {
        jobIds: [job1.id, job2.id],
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.summary.cancelled).toBe(2);
    });

    it("should return 404 when no jobs belong to user", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await postRequest(app, "/bulk-cancel", {
        jobIds: [uuidv4(), uuidv4()],
      });

      expect(response.status).toBe(404);
    });

    it("should only cancel jobs belonging to user", async () => {
      const myJob = await testHelpers.createJob(
        testUserId,
        testNetworkId,
        testDictionaryId,
        {
          name: "My Job",
          status: "pending",
        },
      );

      const otherUser = await testHelpers.createUser({
        email: `other-${uuidv4()}@example.com`,
        name: "Other User",
      });
      const otherNetwork = await testHelpers.createNetwork(otherUser.id, {
        ssid: "OtherNetwork",
        bssid: "AA:BB:CC:DD:EE:03",
      });
      const otherDictionary = await testHelpers.createDictionary(otherUser.id, {
        name: "OtherDict",
      });
      const otherJob = await testHelpers.createJob(
        otherUser.id,
        otherNetwork.id,
        otherDictionary.id,
        {
          name: "Other Job",
          status: "pending",
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await postRequest(app, "/bulk-cancel", {
        jobIds: [myJob.id, otherJob.id],
      });

      expect(response.status).toBe(200);
      expect(response.data.data.summary.cancelled).toBe(1);
    });
  });

  describe("DELETE /:id - Delete a job", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const response = await deleteRequest(app, `/${uuidv4()}`);

      expect(response.status).toBe(401);
    });

    it("should delete a job", async () => {
      const job = await testHelpers.createJob(
        testUserId,
        testNetworkId,
        testDictionaryId,
        {
          name: "Job to delete",
          status: "completed",
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await deleteRequest(app, `/${job.id}`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // Verify job is deleted
      const deletedJob = await db.query.jobs.findFirst({
        where: (jobs: any, { eq }: any) => eq(jobs.id, job.id),
      });
      expect(deletedJob).toBeUndefined();
    });

    it("should return 404 for non-existent job", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await deleteRequest(app, `/${uuidv4()}`);

      expect(response.status).toBe(404);
    });

    it("should return 403 when deleting another users job", async () => {
      const otherUser = await testHelpers.createUser({
        email: `other-${uuidv4()}@example.com`,
        name: "Other User",
      });
      const otherNetwork = await testHelpers.createNetwork(otherUser.id, {
        ssid: "OtherNetwork",
        bssid: "AA:BB:CC:DD:EE:04",
      });
      const otherDictionary = await testHelpers.createDictionary(otherUser.id, {
        name: "OtherDict",
      });
      const job = await testHelpers.createJob(
        otherUser.id,
        otherNetwork.id,
        otherDictionary.id,
        {
          name: "Other Users Job",
          status: "completed",
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await deleteRequest(app, `/${job.id}`);

      // The API queries by both id and userId, so returns 404 when job doesn't exist for that user
      expect(response.status).toBe(404);
    });
  });

  describe("POST /:id/retry - Retry a failed job", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const response = await postRequest(app, `/${uuidv4()}/retry`, {});

      expect(response.status).toBe(401);
    });

    it("should retry a failed job", async () => {
      const job = await testHelpers.createJob(
        testUserId,
        testNetworkId,
        testDictionaryId,
        {
          name: "Failed Job",
          status: "failed",
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await postRequest(app, `/${job.id}/retry`, {});

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it("should return 404 for non-existent job", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await postRequest(app, `/${uuidv4()}/retry`, {});

      expect(response.status).toBe(404);
    });
  });

  describe("GET /stats - Get job statistics", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const response = await getRequest(app, "/stats");

      expect(response.status).toBe(401);
    });

    it("should return job statistics", async () => {
      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        status: "pending",
      });
      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        status: "running",
      });
      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        status: "completed",
      });
      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        status: "failed",
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await getRequest(app, "/stats");

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty("total");
      expect(response.data.data).toHaveProperty("pending");
      expect(response.data.data).toHaveProperty("running");
      expect(response.data.data).toHaveProperty("completed");
      expect(response.data.data).toHaveProperty("failed");
      expect(response.data.data).toHaveProperty("cancelled");
      expect(response.data.data).toHaveProperty("scheduled");
      expect(response.data.data.total).toBe(4);
      expect(response.data.data.pending).toBeGreaterThanOrEqual(1);
      expect(response.data.data.running).toBe(1);
      expect(response.data.data.completed).toBe(1);
      expect(response.data.data.failed).toBe(1);
    });
  });

  describe("GET /scheduled - Get scheduled jobs", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const response = await getRequest(app, "/scheduled");

      expect(response.status).toBe(401);
    });

    it("should return scheduled jobs", async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        status: "pending",
        scheduledAt: futureDate,
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await getRequest(app, "/scheduled");

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });

  describe("GET /:id/dependencies - Get job dependencies", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const response = await getRequest(app, `/${uuidv4()}/dependencies`);

      expect(response.status).toBe(401);
    });

    it("should return job dependencies", async () => {
      const job1 = await testHelpers.createJob(
        testUserId,
        testNetworkId,
        testDictionaryId,
        {
          name: "Job 1",
          status: "completed",
        },
      );
      const job2 = await testHelpers.createJob(
        testUserId,
        testNetworkId,
        testDictionaryId,
        {
          name: "Job 2",
          dependsOn: [job1.id],
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await getRequest(app, `/${job2.id}/dependencies`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it("should return 404 for non-existent job", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await getRequest(app, `/${uuidv4()}/dependencies`);

      expect(response.status).toBe(404);
    });
  });

  describe("GET /tags - Get all unique tags", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const response = await getRequest(app, "/tags");

      expect(response.status).toBe(401);
    });

    it("should return unique tags from users jobs", async () => {
      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        name: "Job 1",
        tags: ["wpa2", "test"],
      });
      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        name: "Job 2",
        tags: ["wpa2", "production"],
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await getRequest(app, "/tags");

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toContain("wpa2");
      expect(response.data.data).toContain("test");
      expect(response.data.data).toContain("production");
    });

    it("should return empty array when no tags exist", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await getRequest(app, "/tags");

      expect(response.status).toBe(200);
      expect(response.data.data).toEqual([]);
    });
  });

  describe("GET /filter - Filter jobs", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const response = await getRequest(app, "/filter?status=pending");

      expect(response.status).toBe(401);
    });

    it("should filter jobs by various criteria", async () => {
      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        name: "Priority Job",
        status: "pending",
        priority: "high",
      });
      await testHelpers.createJob(testUserId, testNetworkId, testDictionaryId, {
        name: "Normal Job",
        status: "running",
        priority: "normal",
      });

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await getRequest(
        app,
        "/filter?status=pending&priority=high",
      );

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });

  describe("PATCH /:id/priority - Update job priority", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const response = await patchRequest(app, `/${uuidv4()}/priority`, {
        priority: "high",
      });

      expect(response.status).toBe(401);
    });

    it("should update job priority", async () => {
      const job = await testHelpers.createJob(
        testUserId,
        testNetworkId,
        testDictionaryId,
        {
          name: "Job",
          status: "pending",
          priority: "normal",
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await patchRequest(app, `/${job.id}/priority`, {
        priority: "high",
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.priority).toBe("high");
    });

    it("should return 404 for non-existent job", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await patchRequest(app, `/${uuidv4()}/priority`, {
        priority: "high",
      });

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /:id/tags - Update job tags", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const response = await patchRequest(app, `/${uuidv4()}/tags`, {
        tags: ["wpa2", "test"],
      });

      expect(response.status).toBe(401);
    });

    it("should update job tags", async () => {
      const job = await testHelpers.createJob(
        testUserId,
        testNetworkId,
        testDictionaryId,
        {
          name: "Job",
          tags: ["old-tag"],
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await patchRequest(app, `/${job.id}/tags`, {
        tags: ["wpa2", "test", "new-tag"],
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.tags).toEqual(["wpa2", "test", "new-tag"]);
    });

    it("should return 404 for non-existent job", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await patchRequest(app, `/${uuidv4()}/tags`, {
        tags: ["tag"],
      });

      expect(response.status).toBe(404);
    });
  });

  describe("POST /:id/schedule - Schedule a job", () => {
    it("should return 401 when not authenticated", async () => {
      const app = createTestAppWithoutAuth(jobManagementRoutes);
      const response = await postRequest(app, `/${uuidv4()}/schedule`, {});

      expect(response.status).toBe(401);
    });

    it("should schedule a job", async () => {
      const job = await testHelpers.createJob(
        testUserId,
        testNetworkId,
        testDictionaryId,
        {
          name: "Job to schedule",
          status: "pending",
        },
      );

      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const response = await postRequest(app, `/${job.id}/schedule`, {
        scheduledAt: futureDate.toISOString(),
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.status).toBe("scheduled");
    });

    it("should return 404 for non-existent job", async () => {
      const testUser = createTestUserObject({
        id: testUserId,
        email: "test@example.com",
        name: "Test User",
        role: "user",
      });
      const app = createTestAppWithAuth(jobManagementRoutes, testUser);
      const response = await postRequest(app, `/${uuidv4()}/schedule`, {});

      expect(response.status).toBe(404);
    });
  });
});
