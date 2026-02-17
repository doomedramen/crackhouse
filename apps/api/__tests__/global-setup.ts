import { startTestContainers, stopTestContainers, setTestEnvVars } from '@workspace/testcontainers';

/**
 * Vitest global setup — starts Postgres + Redis via Testcontainers,
 * sets DATABASE_URL / REDIS_* env vars, and returns a teardown function.
 */
export default async function globalSetup() {
  const { containers, ports } = await startTestContainers();
  setTestEnvVars(ports);

  // Return teardown function — Vitest calls this after all tests finish
  return async () => {
    await stopTestContainers(containers);
  };
}
