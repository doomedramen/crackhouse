import { describe, it, expect, beforeEach, vi } from "vitest";
import { healthRoutes } from "../../src/routes/health";

// Mock the health check service
vi.mock("../../src/services/health-check.service", () => ({
  healthCheckService: {
    performHealthCheck: vi.fn(() =>
      Promise.resolve({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: 10000,
        checks: {
          database: {
            status: "healthy",
            message: "Database connection successful",
            latency: 5,
          },
          redis: {
            status: "degraded",
            message: "Redis connection issue",
            latency: 10,
          },
          workers: {
            status: "healthy",
            message: "Workers operational",
            details: { activeJobs: 0 },
          },
          disk: {
            status: "healthy",
            message: "Disk usage at 50.0%",
            usedBytes: 500000000000,
            totalBytes: 1000000000000,
            usedPercentage: 50,
            thresholdPercentage: 90,
          },
        },
      }),
    ),
    getSummary: vi.fn(() => ({
      startTime: new Date(),
      uptime: 10000,
      uptimeFormatted: "0d 2h 46m 40s",
    })),
  },
}));

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

// Mock CORS middleware
vi.mock("../../src/middleware/cors", () => ({
  publicApiCORS: async (c: any, next: any) => await next(),
}));

// Helper function to make requests and parse responses
async function makeRequest(
  app: any,
  path: string,
): Promise<{ status: number; data: any }> {
  const response = await app.request(path);
  const text = await response.text();
  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return {
    status: response.status,
    data,
  };
}

describe("Health Routes", () => {
  let app: any;

  beforeEach(() => {
    // Create a fresh app for each test
    app = new (require("hono").Hono)();
    app.route("/", healthRoutes);

    vi.clearAllMocks();
  });

  describe("GET / (basic health check)", () => {
    it("should return basic health check", async () => {
      const { status, data } = await makeRequest(app, "/");

      expect(status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.timestamp).toBeDefined();
      expect(data.service).toBe("crackhouse-api");
      expect(data.version).toBe("1.0.0");
      expect(data.environment).toBeDefined();
    });

    it("should include correct service name", async () => {
      const { data } = await makeRequest(app, "/");

      expect(data.service).toBe("crackhouse-api");
    });

    it("should return a valid ISO timestamp", async () => {
      const { data } = await makeRequest(app, "/");

      expect(() => new Date(data.timestamp)).not.toThrow();
      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("GET /api/v1/health", () => {
    it("should return detailed health check", async () => {
      const { status, data } = await makeRequest(app, "/api/v1/health");

      expect(status).toBe(200);
      expect(data.status).toBeDefined();
      expect(data.timestamp).toBeDefined();
      expect(data.uptime).toBeDefined();
      expect(data.checks).toBeDefined();
    });

    it("should return 200 when health status is healthy", async () => {
      const { healthCheckService } =
        await import("../../src/services/health-check.service");
      (healthCheckService as any).performHealthCheck.mockResolvedValue({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: 10000,
        checks: {
          database: { status: "healthy", message: "OK" },
          redis: { status: "healthy", message: "OK" },
          workers: { status: "healthy", message: "OK" },
          disk: { status: "healthy", message: "OK" },
        },
      });

      const { status } = await makeRequest(app, "/api/v1/health");
      expect(status).toBe(200);
    });

    it("should return 200 when health status is degraded", async () => {
      const { healthCheckService } =
        await import("../../src/services/health-check.service");
      (healthCheckService as any).performHealthCheck.mockResolvedValue({
        status: "degraded",
        timestamp: new Date().toISOString(),
        uptime: 10000,
        checks: {
          database: { status: "healthy", message: "OK" },
          redis: { status: "degraded", message: "Slow" },
          workers: { status: "healthy", message: "OK" },
          disk: { status: "healthy", message: "OK" },
        },
      });

      const { status } = await makeRequest(app, "/api/v1/health");
      expect(status).toBe(200);
    });

    it("should return 503 when health status is unhealthy", async () => {
      const { healthCheckService } =
        await import("../../src/services/health-check.service");
      (healthCheckService as any).performHealthCheck.mockResolvedValue({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        uptime: 10000,
        checks: {
          database: { status: "unhealthy", message: "Connection failed" },
          redis: { status: "healthy", message: "OK" },
          workers: { status: "healthy", message: "OK" },
          disk: { status: "healthy", message: "OK" },
        },
      });

      const { status } = await makeRequest(app, "/api/v1/health");
      expect(status).toBe(503);
    });

    it("should include all health checks in response", async () => {
      const { data } = await makeRequest(app, "/api/v1/health");

      expect(data.checks).toHaveProperty("database");
      expect(data.checks).toHaveProperty("redis");
      expect(data.checks).toHaveProperty("workers");
      expect(data.checks).toHaveProperty("disk");
    });
  });

  describe("GET /api/v1/health/summary", () => {
    it("should return service summary", async () => {
      const { status, data } = await makeRequest(app, "/api/v1/health/summary");

      expect(status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.timestamp).toBeDefined();
      expect(data.summary).toBeDefined();
    });

    it("should include uptime information", async () => {
      const { data } = await makeRequest(app, "/api/v1/health/summary");

      expect(data.summary).toHaveProperty("uptime");
      expect(data.summary).toHaveProperty("uptimeFormatted");
      expect(data.summary).toHaveProperty("startTime");
      expect(typeof data.summary.uptime).toBe("number");
      expect(typeof data.summary.uptimeFormatted).toBe("string");
    });
  });

  describe("GET /api/v1/health/database", () => {
    it("should return database health status", async () => {
      const { healthCheckService } =
        await import("../../src/services/health-check.service");
      (healthCheckService as any).performHealthCheck.mockRestore();
      (healthCheckService as any).performHealthCheck.mockResolvedValue({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: 10000,
        checks: {
          database: {
            status: "healthy",
            message: "Database connection successful",
            latency: 5,
          },
          redis: { status: "degraded", message: "Slow" },
          workers: { status: "healthy", message: "OK" },
          disk: { status: "healthy", message: "OK" },
        },
      });

      const { status, data } = await makeRequest(
        app,
        "/api/v1/health/database",
      );

      expect(status).toBe(200);
      expect(data.status).toBeDefined();
      expect(data.timestamp).toBeDefined();
      expect(data.database).toBeDefined();
      expect(data.database).toHaveProperty("status");
    });

    it("should return healthy status when database is accessible", async () => {
      const { healthCheckService } =
        await import("../../src/services/health-check.service");
      (healthCheckService as any).performHealthCheck.mockResolvedValue({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: 10000,
        checks: {
          database: { status: "healthy", message: "OK" },
          redis: { status: "healthy", message: "OK" },
          workers: { status: "healthy", message: "OK" },
          disk: { status: "healthy", message: "OK" },
        },
      });

      const { data } = await makeRequest(app, "/api/v1/health/database");

      expect(data.database.status).toBe("healthy");
    });
  });

  describe("GET /api/v1/health/redis", () => {
    it("should return redis health status", async () => {
      const { status, data } = await makeRequest(app, "/api/v1/health/redis");

      expect(status).toBe(200);
      expect(data.status).toBeDefined();
      expect(data.timestamp).toBeDefined();
      expect(data.redis).toBeDefined();
    });
  });

  describe("GET /api/v1/health/disk", () => {
    it("should return disk health status", async () => {
      const { status, data } = await makeRequest(app, "/api/v1/health/disk");

      expect(status).toBe(200);
      expect(data.status).toBeDefined();
      expect(data.timestamp).toBeDefined();
      expect(data.disk).toBeDefined();
      expect(data.disk).toHaveProperty("status");
      expect(data.disk).toHaveProperty("message");
    });
  });

  describe("GET /api/v1/health/workers", () => {
    it("should return workers health status", async () => {
      const { status, data } = await makeRequest(app, "/api/v1/health/workers");

      expect(status).toBe(200);
      expect(data.status).toBeDefined();
      expect(data.timestamp).toBeDefined();
      expect(data.workers).toBeDefined();
    });
  });

  describe("Error handling", () => {
    it("should handle health check service errors gracefully", async () => {
      const { healthCheckService } =
        await import("../../src/services/health-check.service");
      (healthCheckService as any).performHealthCheck.mockRejectedValue(
        new Error("Health check failed"),
      );

      const { status, data } = await makeRequest(app, "/api/v1/health");

      expect(status).toBe(503);
      expect(data.status).toBe("error");
    });

    it("should handle database check errors gracefully", async () => {
      const { healthCheckService } =
        await import("../../src/services/health-check.service");
      (healthCheckService as any).performHealthCheck.mockRejectedValue(
        new Error("Database connection failed"),
      );

      const { status, data } = await makeRequest(
        app,
        "/api/v1/health/database",
      );

      expect(status).toBe(500);
      expect(data.status).toBe("error");
    });

    it("should handle summary errors gracefully", async () => {
      const { healthCheckService } =
        await import("../../src/services/health-check.service");
      (healthCheckService as any).getSummary.mockImplementation(() => {
        throw new Error("Summary failed");
      });

      const { status, data } = await makeRequest(app, "/api/v1/health/summary");

      expect(status).toBe(500);
      expect(data.status).toBe("error");
    });
  });
});
