import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

export interface TestContainers {
  postgres: StartedTestContainer;
  redis: StartedTestContainer;
}

export interface TestPorts {
  postgresPort: number;
  redisPort: number;
}

/**
 * Start Postgres 16 and Redis 7 containers in parallel.
 * Returns container handles and dynamic port mappings.
 */
export async function startTestContainers(): Promise<{
  containers: TestContainers;
  ports: TestPorts;
}> {
  console.log('Starting test containers (Postgres + Redis)...');

  const [postgres, redis] = await Promise.all([
    new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_USER: 'postgres',
        POSTGRES_PASSWORD: 'password',
        POSTGRES_DB: 'crackhouse_test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .withStartupTimeout(60_000)
      .start(),

    new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .withStartupTimeout(30_000)
      .start(),
  ]);

  const ports: TestPorts = {
    postgresPort: postgres.getMappedPort(5432),
    redisPort: redis.getMappedPort(6379),
  };

  console.log(`Postgres ready on port ${ports.postgresPort}`);
  console.log(`Redis ready on port ${ports.redisPort}`);

  return { containers: { postgres, redis }, ports };
}

/**
 * Stop both test containers.
 */
export async function stopTestContainers(containers: TestContainers): Promise<void> {
  console.log('Stopping test containers...');
  await Promise.all([
    containers.postgres.stop(),
    containers.redis.stop(),
  ]);
  console.log('Test containers stopped.');
}

/**
 * Set environment variables for the test database and Redis
 * using the dynamic ports from testcontainers.
 */
export function setTestEnvVars(ports: TestPorts): void {
  const dbUrl = `postgresql://postgres:password@localhost:${ports.postgresPort}/crackhouse_test`;
  const redisUrl = `redis://localhost:${ports.redisPort}`;

  process.env.DATABASE_URL = dbUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = String(ports.redisPort);
}
