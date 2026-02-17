import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../src/db/schema'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { eq, sql } from 'drizzle-orm'
import * as bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

// Test database configuration — set dynamically by testcontainers globalSetup
const TEST_DATABASE_URL = process.env.DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Testcontainers global setup should set it automatically. ' +
    'Make sure vitest.config.ts has globalSetup pointing to __tests__/global-setup.ts.',
  );
}

// Track if migrations have been run
let migrationsRun = false

// Global test client (non-pooled for cleanup)
let testClient: postgres.Sql<{}> | null = null
let testDb: ReturnType<typeof drizzle> | null = null

// Migration client (separate for migrations)
let migrationClient: postgres.Sql<{}> | null = null

/**
 * Get the test database client
 */
export function getTestDb() {
  if (!testDb) {
    throw new Error('Test database not initialized. Call setupTestDatabase first.')
  }
  return testDb
}

/**
 * Get the SQL client for raw queries
 */
export function getTestClient() {
  if (!testClient) {
    throw new Error('Test client not initialized. Call setupTestDatabase first.')
  }
  return testClient
}

/**
 * Set up the test database
 */
export async function setupTestDatabase() {
  try {
    // Create migration client
    migrationClient = postgres(TEST_DATABASE_URL, {
      max: 1,
      connect_timeout: 5, // 5 second timeout
    })

    // Create test client
    testClient = postgres(TEST_DATABASE_URL, {
      max: 1,
      connect_timeout: 5, // 5 second timeout
    })

    testDb = drizzle(testClient, { schema })

    // Run migrations - skip if already applied
    try {
      await migrate(drizzle(migrationClient, { schema }), {
        migrationsFolder: './src/db/migrations',
      })
      console.log('✅ Test database migrations completed')
    } catch (error: any) {
      // Check if it's just because migrations already exist
      const isAlreadyExistsError =
        error.message?.includes('already exists') ||
        error.code === '23505' ||
        error.code === '42710' ||
        error.cause?.code === '23505' ||
        error.cause?.code === '42710' ||
        error.cause?.message?.includes('already exists')

      if (isAlreadyExistsError) {
        console.log('✅ Test database migrations already applied')
      } else {
        console.error('Migration error:', error.message)
        // Don't throw - let tests try to run anyway
      }
    }
  } catch (error: any) {
    // Database connection failed - skip database setup and continue with tests
    console.warn('⚠️  Test database not available, skipping database setup:', error.message)
    console.warn('Tests will run without database connection (unit tests only)')
    testDb = null
    migrationClient = null
    testClient = null
  }
}

/**
 * Clean all tables in the database
 */
export async function cleanDatabase() {
  if (!testDb) return

  const client = getTestClient()

  // Delete all data in reverse order of dependencies
  const tables = [
    'audit_logs',
    'job_results',
    'jobs',
    'captures',
    'dictionaries',
    'networks',
    'verifications',
    'sessions',
    'accounts',
    'users',
    'config',
  ]

  for (const table of tables) {
    try {
      await client.unsafe(`DELETE FROM ${table} CASCADE`)
    } catch (error) {
      // Table might not exist or have no data
    }
  }
}

/**
 * Clean a specific table
 */
export async function cleanTable(tableName: string) {
  const client = getTestClient()
  try {
    await client.unsafe(`DELETE FROM ${tableName} CASCADE`)
  } catch (error) {
    // Table might not exist
  }
}

/**
 * Seed test data helpers
 */
export const testHelpers = {
  /**
   * Create a test user
   */
  async createUser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
    const db = getTestDb()
    const userId = overrides.id || uuidv4()
    const hashedPassword = await bcrypt.hash('testPassword123', 10)

    // Generate unique email - either use provided email with suffix, or generate one
    const baseEmail = overrides.email || 'test'
    const uniqueEmail = overrides.email
      ? `${baseEmail.replace('@', '-')}-${userId}@example.com`
      : `test-${userId}@example.com`

    const [user] = await db
      .insert(schema.users)
      .values({
        id: userId,
        email: uniqueEmail,
        name: overrides.name || 'Test User',
        role: overrides.role || 'user',
        emailVerified: overrides.emailVerified ?? true,
        createdAt: overrides.createdAt || new Date(),
        updatedAt: overrides.updatedAt || new Date(),
      })
      .returning()

    // Create account record for password auth
    await db.insert(schema.accounts).values({
      id: uuidv4(),
      userId: user.id,
      accountId: user.id,
      providerId: 'credential',
      provider: 'credential',
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return user
  },

  /**
   * Create an admin user
   */
  async createAdmin(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
    return this.createUser({ ...overrides, role: 'admin' })
  },

  /**
   * Create a superuser
   */
  async createSuperuser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
    return this.createUser({ ...overrides, role: 'superuser' })
  },

  /**
   * Create a test network
   */
  async createNetwork(userId: string, overrides: Partial<typeof schema.networks.$inferInsert> = {}) {
    const db = getTestDb()
    const [network] = await db
      .insert(schema.networks)
      .values({
        bssid: overrides.bssid || `AA:BB:CC:DD:EE:${Math.floor(Math.random() * 99).toString().padStart(2, '0')}`,
        ssid: overrides.ssid || 'TestNetwork',
        encryption: overrides.encryption || 'WPA2',
        channel: overrides.channel || 6,
        frequency: overrides.frequency || 2412,
        signalStrength: overrides.signalStrength || -50,
        status: overrides.status || 'ready',
        location: overrides.location || null,
        notes: overrides.notes || null,
        userId,
        captureDate: overrides.captureDate || new Date(),
        createdAt: overrides.createdAt || new Date(),
        updatedAt: overrides.updatedAt || new Date(),
      })
      .returning()

    return network
  },

  /**
   * Create a test dictionary
   */
  async createDictionary(userId: string, overrides: Partial<typeof schema.dictionaries.$inferInsert> = {}) {
    const db = getTestDb()
    const [dictionary] = await db
      .insert(schema.dictionaries)
      .values({
        name: overrides.name || 'Test Dictionary',
        filename: overrides.filename || 'test-dict.txt',
        type: overrides.type || 'uploaded',
        status: overrides.status || 'ready',
        size: overrides.size || 1024,
        wordCount: overrides.wordCount || 100,
        encoding: overrides.encoding || 'utf-8',
        checksum: overrides.checksum || 'abc123',
        filePath: overrides.filePath || '/tmp/test-dict.txt',
        userId,
        processingConfig: overrides.processingConfig || null,
        createdAt: overrides.createdAt || new Date(),
        updatedAt: overrides.updatedAt || new Date(),
      })
      .returning()

    return dictionary
  },

  /**
   * Create a test job
   */
  async createJob(
    userId: string,
    networkIdOrOverrides?: string | Partial<typeof schema.jobs.$inferInsert>,
    dictionaryId?: string,
    overrides: Partial<typeof schema.jobs.$inferInsert> = {},
  ) {
    const db = getTestDb()

    // Handle overloaded parameters
    let finalNetworkId: string | null = null
    let finalDictionaryId: string | null = null
    let finalOverrides: Partial<typeof schema.jobs.$inferInsert> = {}

    if (typeof networkIdOrOverrides === 'string') {
      finalNetworkId = networkIdOrOverrides
      finalDictionaryId = dictionaryId || null
      finalOverrides = overrides
    } else if (networkIdOrOverrides && typeof networkIdOrOverrides === 'object') {
      finalOverrides = networkIdOrOverrides
      finalNetworkId = networkIdOrOverrides.networkId || null
      finalDictionaryId = networkIdOrOverrides.dictionaryId || null
    }

    const [job] = await db
      .insert(schema.jobs)
      .values({
        name: finalOverrides.name || 'Test Job',
        description: finalOverrides.description || 'Test job description',
        status: finalOverrides.status || 'pending',
        priority: finalOverrides.priority || 'normal',
        networkId: finalNetworkId,
        dictionaryId: finalDictionaryId,
        config: finalOverrides.config || { hashcatMode: 22000 },
        progress: finalOverrides.progress || 0,
        startTime: finalOverrides.startTime || null,
        endTime: finalOverrides.endTime || null,
        result: finalOverrides.result || null,
        errorMessage: finalOverrides.errorMessage || null,
        userId,
        createdAt: finalOverrides.createdAt || new Date(),
        updatedAt: finalOverrides.updatedAt || new Date(),
        scheduledAt: finalOverrides.scheduledAt || null,
        cancelledAt: finalOverrides.cancelledAt || null,
        dependsOn: finalOverrides.dependsOn || null,
        tags: finalOverrides.tags || [],
      })
      .returning()

    return job
  },

  /**
   * Create a test capture
   */
  async createCapture(userId: string, overrides: Partial<typeof schema.captures.$inferInsert> = {}) {
    const db = getTestDb()
    const [capture] = await db
      .insert(schema.captures)
      .values({
        filename: overrides.filename || 'test-capture.pcap',
        status: overrides.status || 'completed',
        fileSize: overrides.fileSize || 1024,
        filePath: overrides.filePath || '/tmp/test-capture.pcap',
        networkCount: overrides.networkCount || 1,
        uploadedAt: overrides.uploadedAt || new Date(),
        processedAt: overrides.processedAt || new Date(),
        errorMessage: overrides.errorMessage || null,
        metadata: overrides.metadata || null,
        userId,
        createdAt: overrides.createdAt || new Date(),
        updatedAt: overrides.updatedAt || new Date(),
      })
      .returning()

    return capture
  },

  /**
   * Create a test session
   */
  async createSession(userId: string, overrides: Partial<typeof schema.sessions.$inferInsert> = {}) {
    const db = getTestDb()
    const sessionId = overrides.id || uuidv4()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const [session] = await db
      .insert(schema.sessions)
      .values({
        id: sessionId,
        userId,
        token: overrides.token || `test-token-${sessionId}`,
        expiresAt: overrides.expiresAt || expiresAt,
        ipAddress: overrides.ipAddress || '127.0.0.1',
        userAgent: overrides.userAgent || 'test-agent',
        createdAt: overrides.createdAt || new Date(),
        updatedAt: overrides.updatedAt || new Date(),
      })
      .returning()

    return session
  },
}

/**
 * Close database connections
 */
export async function closeTestDatabase() {
  if (testClient) {
    await testClient.end()
    testClient = null
  }
  if (migrationClient) {
    await migrationClient.end()
    migrationClient = null
  }
  testDb = null
}

// Global setup - runs once before all tests
beforeAll(async () => {
  // NODE_ENV is now set by vitest.config.ts before any imports
  // This ensures dotenv-flow loads .env.test correctly

  // Set up database for all tests
  await setupTestDatabase()
  await cleanDatabase()
})

// Global teardown - runs once after all tests
afterAll(async () => {
  await cleanDatabase()
  await closeTestDatabase()
})

// Clean database before each test file runs - REMOVED
// Tests should use unique data to avoid conflicts
// beforeEach(async () => {
//   await cleanDatabase()
// })
