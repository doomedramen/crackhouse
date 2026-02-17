/**
 * Standalone script to seed config values before API starts
 * This runs before the API server starts to ensure required config exists
 */

import postgres from 'postgres';

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Testcontainers global setup should set it automatically.',
    );
  }
  return url;
}

async function seedConfig() {
  console.log('⚙️ Seeding config values (pre-server)...');

  const sql = postgres(getDatabaseUrl(), {
    max: 1,
  });

  // Valid categories: 'general', 'security', 'performance'
  const configValues = [
    { id: 'email-enabled', value: false, category: 'general', type: 'boolean', defaultValue: false, description: 'Enable email notifications' },
    { id: 'email-host', value: 'smtp.example.com', category: 'general', type: 'string', defaultValue: 'smtp.example.com', description: 'SMTP host' },
    { id: 'email-port', value: 587, category: 'general', type: 'number', defaultValue: 587, description: 'SMTP port' },
    { id: 'email-secure', value: true, category: 'general', type: 'boolean', defaultValue: true, description: 'Use TLS' },
    { id: 'email-user', value: 'test@example.com', category: 'general', type: 'string', defaultValue: 'test@example.com', description: 'SMTP user' },
    { id: 'email-password', value: 'test-password', category: 'security', type: 'string', defaultValue: 'test-password', description: 'SMTP password' },
    { id: 'email-from', value: 'noreply@example.com', category: 'general', type: 'string', defaultValue: 'noreply@example.com', description: 'From address' },
    { id: 'registration-enabled', value: true, category: 'general', type: 'boolean', defaultValue: true, description: 'Allow new registrations' },
    { id: 'max-file-size', value: 104857600, category: 'general', type: 'number', defaultValue: 104857600, description: 'Max file size in bytes' },
    { id: 'max-storage-per-user', value: 1073741824, category: 'general', type: 'number', defaultValue: 1073741824, description: 'Max storage per user' },
    { id: 'default-runtime', value: 3600, category: 'performance', type: 'number', defaultValue: 3600, description: 'Default job runtime' },
    { id: 'max-concurrent-jobs', value: 5, category: 'performance', type: 'number', defaultValue: 5, description: 'Max concurrent jobs' },
    { id: 'auto-cleanup-enabled', value: false, category: 'general', type: 'boolean', defaultValue: false, description: 'Enable auto cleanup' },
  ];

  try {
    for (const config of configValues) {
      await sql`
        INSERT INTO config (id, value, category, type, default_value, description)
        VALUES (${config.id}, ${JSON.stringify(config.value)}, ${config.category}, ${config.type}, ${JSON.stringify(config.defaultValue)}, ${config.description})
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log('✅ Config values seeded');
  } catch (error) {
    console.error('Failed to seed config:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

seedConfig()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
