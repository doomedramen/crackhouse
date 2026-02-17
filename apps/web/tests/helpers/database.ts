import postgres from 'postgres';

/**
 * Database helper for E2E tests
 * Connects directly to the test database to clean up and seed data
 */

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Testcontainers global setup should set it automatically.',
    );
  }
  return url;
}

/**
 * Create a database connection for E2E tests
 */
export function getTestDb() {
  return postgres(getDatabaseUrl(), { max: 1 });
}

/**
 * Clean all data from the test database
 * Run this before the test suite to ensure a clean state
 * Note: Does NOT clear config table - that should be seeded separately
 */
export async function cleanDatabase() {
  const sql = getTestDb();

  console.log('🧹 Cleaning test database...');

  // Delete all data in reverse order of dependencies
  // Note: config is NOT deleted - it's seeded once and persisted
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
  ];

  for (const table of tables) {
    try {
      await sql.unsafe(`DELETE FROM ${table} CASCADE`);
    } catch (error) {
      // Table might not exist
    }
  }

  await sql.end();
  console.log('✅ Test database cleaned');
}

/**
 * Seed config values required for the API to run
 */
export async function seedConfig() {
  const sql = getTestDb();

  console.log('⚙️ Seeding config values...');

  const configValues = [
    { id: 'maxConcurrentJobs', value: 2, category: 'performance', type: 'number', defaultValue: 2 },
    { id: 'maxPcapSize', value: 524288000, category: 'general', type: 'number', defaultValue: 524288000 },
    { id: 'maxDictionarySize', value: 10737418240, category: 'general', type: 'number', defaultValue: 10737418240 },
    { id: 'maxGeneratedDictSize', value: 21474836480, category: 'general', type: 'number', defaultValue: 21474836480 },
    { id: 'hashcatDefaultWorkload', value: 3, category: 'performance', type: 'number', defaultValue: 3 },
    { id: 'hashcatJobTimeout', value: 86400, category: 'performance', type: 'number', defaultValue: 86400 },
    { id: 'allowUserRegistration', value: false, category: 'security', type: 'boolean', defaultValue: false },
    { id: 'sessionExpiry', value: 604800, category: 'security', type: 'number', defaultValue: 604800 },
    { id: 'cache-dictionaries', value: true, category: 'performance', type: 'boolean', defaultValue: true },
    { id: 'cache-ttl-seconds', value: 300, category: 'performance', type: 'number', defaultValue: 300 },
    { id: 'rateLimitUpload', value: 5, category: 'security', type: 'number', defaultValue: 5 },
    { id: 'rateLimitAuth', value: 10, category: 'security', type: 'number', defaultValue: 10 },
    { id: 'email-enabled', value: false, category: 'general', type: 'boolean', defaultValue: false },
  ];

  for (const cfg of configValues) {
    try {
      await sql`
        INSERT INTO config (id, value, category, type, default_value, is_read_only, requires_restart, updated_at)
        VALUES (${cfg.id}, ${JSON.stringify(cfg.value)}, ${cfg.category}, ${cfg.type}, ${JSON.stringify(cfg.defaultValue)}, false, false, NOW())
        ON CONFLICT (id) DO NOTHING
      `;
    } catch (error) {
      // Config might already exist
    }
  }

  await sql.end();
  console.log('✅ Config values seeded');
}

/**
 * Create a test user via the API sign-up endpoint
 * This ensures the password is hashed correctly by Better Auth
 */
export async function createTestUser(options: {
  email: string;
  password: string;
  name: string;
  role?: string;
}): Promise<{ id: string; email: string; name: string; role: string }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Use Better Auth's sign-up endpoint to create user with properly hashed password
  const response = await fetch(`${apiUrl}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: options.email,
      password: options.password,
      name: options.name,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create test user ${options.email}: ${error}`);
  }

  const data = await response.json();
  const userId = data.user?.id;

  if (!userId) {
    throw new Error(`Failed to get user ID for ${options.email}`);
  }

  // If a specific role is needed, update it in the database
  if (options.role && options.role !== 'user') {
    const sql = getTestDb();
    await sql`
      UPDATE users SET role = ${options.role} WHERE email = ${options.email}
    `;
    await sql.end();
  }

  return {
    id: userId,
    email: options.email,
    name: options.name,
    role: options.role || 'user',
  };
}

/**
 * Create a test user directly in the database (legacy method - may have hash issues)
 * Use createTestUser instead for proper password hashing
 */
export async function createTestUserDirect(options: {
  email: string;
  password: string;
  name: string;
  role?: string;
}) {
  const sql = getTestDb();
  const bcrypt = await import('bcryptjs');
  const { v4: uuidv4 } = await import('uuid');

  const userId = uuidv4();
  const hashedPassword = await bcrypt.hash(options.password, 10);

  // Create user
  await sql`
    INSERT INTO users (id, email, name, role, email_verified, created_at, updated_at)
    VALUES (${userId}, ${options.email}, ${options.name}, ${options.role || 'user'}, true, NOW(), NOW())
  `;

  // Create account for credential auth
  const accountId = uuidv4();
  await sql`
    INSERT INTO accounts (id, user_id, account_id, provider_id, provider, password, created_at, updated_at)
    VALUES (${accountId}, ${userId}, ${userId}, 'credential', 'credential', ${hashedPassword}, NOW(), NOW())
  `;

  await sql.end();

  return { id: userId, email: options.email, name: options.name, role: options.role || 'user' };
}

/**
 * Delete a test user from the database
 */
export async function deleteTestUser(email: string) {
  const sql = getTestDb();

  try {
    await sql`DELETE FROM users WHERE email = ${email}`;
  } catch (error) {
    // User might not exist
  }

  await sql.end();
}
