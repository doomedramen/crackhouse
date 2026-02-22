import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";

// ES module compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load E2E container env FIRST (before any other config)
// This is set by `pnpm test:e2e:start` and contains testcontainer ports
const e2eEnvPath = path.resolve(__dirname, "tests/.env.e2e.local");
if (existsSync(e2eEnvPath)) {
  const e2eEnvContent = readFileSync(e2eEnvPath, "utf-8");
  e2eEnvContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && !key.startsWith("#") && valueParts.length > 0) {
      const value = valueParts.join("=").trim();
      process.env[key] = value;
    }
  });
  console.log("📦 Loaded E2E container environment from .env.e2e.local");
}

// Load .env.test file manually to avoid dotenv dependency
try {
  const envPath = path.resolve(process.cwd(), ".env.test");
  const envContent = readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && !key.startsWith("#") && valueParts.length > 0) {
      const value = valueParts.join("=").trim();
      // Don't override E2E env values
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
} catch {
  // .env.test file not found, use existing env vars
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests/specs",
  /* Run tests in parallel for better performance */
  fullyParallel: false,
  /* Stop on first failure for debugging */
  maxFailures: 1,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Enable retries for flaky tests */
  retries: 0,
  /* Use multiple workers for faster execution */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [
        ["html", { outputFolder: "playwright-report", open: "never" }],
        ["list"],
        //        ["playwright-coverage-reporter", { format: "all" }],
      ]
    : [
        ["html", { outputFolder: "playwright-report", open: "never" }],
        ["list"],
        // ["playwright-coverage-reporter", { format: "all" }],
      ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || "http://localhost:3000",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "retain-on-failure",

    /* Take screenshot on failure */
    screenshot: "only-on-failure",

    /* Enable video recording for debugging failed tests */
    video: "retain-on-failure",

    /* Viewport settings */
    viewport: { width: 1280, height: 720 },

    /* Reasonable timeouts for better reliability */
    actionTimeout: 30000,
    navigationTimeout: 30000,

    /* Context options */
    ignoreHTTPSErrors: true,
  },

  /* Configure projects - test on Chromium only for focused testing */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    // Temporarily disabled other browsers for focused testing
    // {
    //   name: 'firefox',
    //   use: {
    //     ...devices['Desktop Firefox'],
    //     viewport: { width: 1280, height: 720 },
    //     storageState: 'playwright/.auth/user.json'
    //   },
    //   dependencies: ['setup'],
    // },
    // {
    //   name: 'webkit',
    //   use: {
    //     ...devices['Desktop Safari'],
    //     viewport: { width: 1280, height: 720 },
    //     storageState: 'playwright/.auth/user.json'
    //   },
    //   dependencies: ['setup'],
    // }
  ],

  /* Run API + Worker and frontend servers before starting tests */
  webServer: [
    {
      // API Server + Worker (Hono + BullMQ)
      // Containers must be started first: `pnpm test:e2e:start`
      // DATABASE_URL/REDIS_* are loaded from tests/.env.e2e.local
      // Worker runs in background (&), API in foreground so Playwright can check health endpoint.
      command:
        "NODE_ENV=test PORT=3001 pnpm run worker & NODE_ENV=test PORT=3001 pnpm run dev",
      cwd: path.resolve(__dirname, "../../apps/api"),
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // Frontend Server (Next.js)
      command: "NODE_ENV=test PORT=3000 pnpm run dev",
      cwd: __dirname,
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],

  // Global setup for resource management
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
});
