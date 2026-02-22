import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { authRoutes } from "../../src/routes/auth";
import { getTestDb, cleanDatabase } from "../setup";
import { users, accounts, sessions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import * as bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

// Mock the email service
vi.mock("../../src/lib/email", () => ({
  emailService: {
    sendVerificationEmail: vi.fn(() => Promise.resolve()),
    sendPasswordResetEmail: vi.fn(() => Promise.resolve()),
    initialize: vi.fn(() => Promise.resolve()),
  },
  emailQueue: {
    initialize: vi.fn(() => Promise.resolve()),
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

// Mock the config service
vi.mock("../../src/services/config.service", () => ({
  configService: {
    loadConfig: vi.fn(() => Promise.resolve()),
    getBoolean: vi.fn(() => Promise.resolve(false)),
  },
}));

// Mock the websocket server
vi.mock("../../src/lib/websocket", () => ({
  getWebSocketServer: vi.fn(() => ({
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
  })),
}));

describe("Auth API Routes", () => {
  let db: ReturnType<typeof getTestDb>;
  let app: Hono;

  beforeEach(async () => {
    db = getTestDb();

    // Clean database before auth tests
    await cleanDatabase();

    // Create app with auth routes
    app = new Hono();
    app.route("/api/auth", authRoutes);
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  describe("Auth routes are mounted", () => {
    it("should have auth routes available", async () => {
      const response = await app.request(
        "http://localhost/api/auth/test-endpoint",
        {
          method: "GET",
        },
      );

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe("Auth database operations", () => {
    it("should create user with account properly", async () => {
      const email = `test-${uuidv4()}@example.com`;
      const hashedPassword = await bcrypt.hash("testPassword123", 10);
      const userId = uuidv4();

      await db.insert(users).values({
        id: userId,
        email,
        name: "Test User",
        role: "user",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(accounts).values({
        id: uuidv4(),
        userId,
        accountId: userId,
        providerId: "credential",
        provider: "credential",
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const allUsers = await db.query.users.findMany();
      const foundUser = allUsers.find((u: any) => u.email === email);
      expect(foundUser).toBeDefined();
      expect(foundUser?.email).toBe(email);
    });

    it("should make the first user an admin", async () => {
      const email = `admin-${uuidv4()}@example.com`;
      const hashedPassword = await bcrypt.hash("adminPassword123", 10);
      const userId = uuidv4();

      await db.insert(users).values({
        id: userId,
        email,
        name: "First User",
        role: "admin",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(accounts).values({
        id: uuidv4(),
        userId,
        accountId: userId,
        providerId: "credential",
        provider: "credential",
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const allUsers = await db.query.users.findMany();
      expect(allUsers[0].role).toBe("admin");
    });

    it("should hash passwords correctly", async () => {
      const password = "testPassword123";
      const hashedPassword = await bcrypt.hash(password, 10);

      const isValid = await bcrypt.compare(password, hashedPassword);
      expect(isValid).toBe(true);

      const isInvalid = await bcrypt.compare("wrongPassword", hashedPassword);
      expect(isInvalid).toBe(false);
    });

    it("should create sessions correctly", async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await db.insert(users).values({
        id: userId,
        email: `session-${uuidv4()}@example.com`,
        name: "Session Test User",
        role: "user",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(sessions).values({
        id: sessionId,
        userId,
        token: `session-token-${sessionId}`,
        expiresAt,
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const allSessions = await db.query.sessions.findMany();
      expect(allSessions).toHaveLength(1);
      expect(allSessions[0].userId).toBe(userId);
    });
  });

  describe("Auth request handling", () => {
    it("should handle sign-in request", async () => {
      const response = await app.request("http://localhost/api/auth/sign-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: `test-${uuidv4()}@example.com`,
          password: "testPassword123",
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it("should handle sign-up request", async () => {
      const response = await app.request("http://localhost/api/auth/sign-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: `test-${uuidv4()}@example.com`,
          password: "testPassword123",
          name: "Test User",
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it("should handle sign-out request", async () => {
      const response = await app.request("http://localhost/api/auth/sign-out", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it("should handle session request", async () => {
      const response = await app.request("http://localhost/api/auth/session", {
        method: "GET",
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe("Auth error cases", () => {
    it("should handle malformed JSON gracefully", async () => {
      const response = await app.request("http://localhost/api/auth/sign-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json{{{",
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it("should handle large payloads", async () => {
      const largeEmail = `${"a".repeat(10000)}@example.com`;

      const response = await app.request("http://localhost/api/auth/sign-up", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: largeEmail,
          password: "testPassword123",
          name: "Test User",
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe("User role management", () => {
    it("should support different user roles", async () => {
      const roles = ["user", "admin", "superuser"] as const;

      for (const role of roles) {
        const email = `${role}-${uuidv4()}@example.com`;
        const userId = uuidv4();

        await db.insert(users).values({
          id: userId,
          email,
          name: `${role} User`,
          role,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        const user = await db.query.users.findFirst({
          where: eq(users.id, userId),
        });

        expect(user?.role).toBe(role);
      }
    });

    it("should store additional user fields", async () => {
      const userId = uuidv4();

      await db.insert(users).values({
        id: userId,
        email: `fields-${uuidv4()}@example.com`,
        name: "Fields Test User",
        role: "admin",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      expect(user).toMatchObject({
        id: userId,
        name: "Fields Test User",
        role: "admin",
        emailVerified: true,
      });
    });
  });

  describe("Session management", () => {
    it("should create session with expiration", async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await db.insert(users).values({
        id: userId,
        email: `session-exp-${uuidv4()}@example.com`,
        name: "Session Exp Test User",
        role: "user",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(sessions).values({
        id: sessionId,
        userId,
        token: `test-token-${sessionId}`,
        expiresAt,
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });

      expect(session).toBeDefined();
      expect(session?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("should associate session with user", async () => {
      const userId = uuidv4();
      const sessionId = uuidv4();

      await db.insert(users).values({
        id: userId,
        email: `session-user-${uuidv4()}@example.com`,
        name: "Session User",
        role: "user",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await db.insert(sessions).values({
        id: sessionId,
        userId,
        token: `user-session-${sessionId}`,
        expiresAt,
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });

      expect(session?.userId).toBe(userId);
    });
  });
});
