# Testing

This directory contains testing documentation for CrackHouse.

## Test Infrastructure

Tests use [Testcontainers](https://node.testcontainers.org/) to automatically manage Postgres and Redis containers. No manual Docker commands are needed — containers start and stop automatically with dynamic ports.

## Unit Tests (API)

```bash
cd apps/api
pnpm test:run
```

Vitest `globalSetup` starts Postgres + Redis via Testcontainers, runs migrations, executes tests, then stops containers.

## E2E Tests (Playwright)

```bash
# From root
pnpm test:e2e

# Or from apps/web
cd apps/web
pnpm test:e2e
```

Playwright `globalSetup` starts Testcontainers, seeds the database, then Playwright's `webServer` config starts the API and web servers. Environment variables (DATABASE_URL, REDIS_URL, etc.) are set dynamically and inherited by child processes.

### What the Tests Cover

- User registration and authentication
- PCAP file upload and network extraction
- Dictionary upload
- Job creation and execution
- Password cracking verification

### Test Files

Tests are located in `apps/web/tests/specs/`.

## Shared Package

The `@workspace/testcontainers` package (`packages/testcontainers/`) provides:

- `startTestContainers()` — starts Postgres 16 + Redis 7 in parallel
- `stopTestContainers()` — stops both containers
- `setTestEnvVars()` — sets DATABASE_URL, REDIS_URL, REDIS_HOST, REDIS_PORT on process.env
