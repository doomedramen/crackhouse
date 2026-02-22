import { Page, BrowserContext, APIRequestContext } from "@playwright/test";
import { loginViaUI, TEST_USER } from "./auth";
import { waitForDebounce, TEST_TIMEOUTS } from "./wait-helpers";
import * as fs from "fs";
import * as path from "path";

/**
 * Setup helpers for self-contained E2E tests
 * Each helper creates its own test data to ensure test isolation
 *
 * Uses Playwright's page.request API which automatically handles cookies
 */

// Paths to test fixtures
// When running from apps/web, we need to go up 2 levels to get to the repo root
const getRepoRoot = () => {
  const cwd = process.cwd();
  // If running from apps/web, go up 2 levels
  if (cwd.includes("/apps/web")) {
    return path.resolve(cwd, "..", "..");
  }
  // If running from repo root, use current directory
  return cwd;
};

const ROOT_DIR = getRepoRoot();
const INTEGRATION_FILES_DIR = path.join(ROOT_DIR, "tests", "integration-files");

// Test files with known password "wireshark"
const TEST_PCAP_FILE = path.join(INTEGRATION_FILES_DIR, "wpa2-ikeriri-5g.pcap");
const TEST_DICT_FILE = path.join(INTEGRATION_FILES_DIR, "test-passwords.txt");

// API URL for direct API calls
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

/**
 * Get auth cookie header from browser context
 */
export async function getAuthCookies(context: BrowserContext): Promise<string> {
  const cookies = await context.cookies();
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/**
 * Full login helper - logs in and returns auth cookies
 */
export async function fullLogin(
  page: Page,
  context: BrowserContext,
): Promise<string> {
  await loginViaUI(page, TEST_USER.email, TEST_USER.password);
  return getAuthCookies(context);
}

/**
 * Upload a dictionary file via API using Playwright's request context
 * Returns the dictionary ID
 */
export async function uploadDictionary(
  context: BrowserContext,
  name?: string,
): Promise<{ id: string; name: string }> {
  // Read dictionary file or create one
  let dictContent: Buffer;
  let dictName = name || `test-dict-${Date.now()}.txt`;

  if (fs.existsSync(TEST_DICT_FILE)) {
    dictContent = fs.readFileSync(TEST_DICT_FILE);
  } else {
    // Create dictionary with known password "wireshark"
    dictContent = Buffer.from(
      "password\n123456\nwireshark\nadmin\npassword123\nqwerty\nabc123\nletmein\n",
    );
  }

  // Create a request context that shares cookies with the browser context
  const request = context.request;

  // Get cookies explicitly from the browser context
  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // Create multipart form data manually
  const boundary = "----FormBoundary" + Date.now();
  const parts: Buffer[] = [];

  // Add file part
  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(
    Buffer.from(
      `Content-Disposition: form-data; name="file"; filename="${dictName}"\r\n`,
    ),
  );
  parts.push(Buffer.from(`Content-Type: text/plain\r\n\r\n`));
  parts.push(dictContent);
  parts.push(Buffer.from(`\r\n--${boundary}\r\n`));

  // Add name field
  parts.push(
    Buffer.from(`Content-Disposition: form-data; name="name"\r\n\r\n`),
  );
  parts.push(Buffer.from(`Test Dictionary ${Date.now()}`));
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const response = await request.post(`${API_URL}/api/dictionaries/upload`, {
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Cookie: cookieHeader,
      Origin: "http://localhost:3000",
    },
    data: body,
  });

  if (!response.ok()) {
    const error = await response.text();
    throw new Error(`Failed to upload dictionary: ${error}`);
  }

  const data = await response.json();
  return {
    id: data.data?.id || data.id,
    name: data.data?.name || dictName,
  };
}

/**
 * Upload a PCAP file via API and wait for processing
 * Returns the capture ID and extracted networks
 */
export async function uploadPcap(
  context: BrowserContext,
  page: Page,
  waitForProcessing: boolean = true,
): Promise<{
  captureId: string;
  networks: Array<{ id: string; ssid: string; hasHandshake: boolean }>;
}> {
  // Read PCAP file
  if (!fs.existsSync(TEST_PCAP_FILE)) {
    throw new Error(`Test PCAP file not found: ${TEST_PCAP_FILE}`);
  }

  const pcapBuffer = fs.readFileSync(TEST_PCAP_FILE);

  // Create a request context that shares cookies with the browser context
  const request = context.request;

  // Get cookies explicitly from the browser context
  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // Create multipart form data manually
  const boundary = "----FormBoundary" + Date.now();
  const parts: Buffer[] = [];

  parts.push(Buffer.from(`--${boundary}\r\n`));
  parts.push(
    Buffer.from(
      `Content-Disposition: form-data; name="file"; filename="wpa2-ikeriri-5g.pcap"\r\n`,
    ),
  );
  parts.push(Buffer.from(`Content-Type: application/vnd.tcpdump.pcap\r\n\r\n`));
  parts.push(pcapBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  const response = await request.post(`${API_URL}/api/upload`, {
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      Cookie: cookieHeader,
      Origin: "http://localhost:3000",
    },
    data: body,
  });

  if (!response.ok() && response.status() !== 202) {
    const error = await response.text();
    throw new Error(`Failed to upload PCAP: ${error}`);
  }

  const data = await response.json();
  const captureId = data.data?.captureId || data.captureId;

  if (waitForProcessing && captureId) {
    // Wait for PCAP processing to complete
    let attempts = 0;
    const maxAttempts = 30;
    let status = "pending";

    while (
      (status === "pending" || status === "processing") &&
      attempts < maxAttempts
    ) {
      await waitForDebounce(page, TEST_TIMEOUTS.default);

      const statusResponse = await request.get(
        `${API_URL}/api/captures/${captureId}`,
        {
          headers: {
            Cookie: cookieHeader,
          },
        },
      );

      if (statusResponse.ok()) {
        const statusData = await statusResponse.json();
        status = statusData.data?.status || "unknown";
      }

      attempts++;
    }
  }

  // Get networks extracted from the PCAP
  const networksResponse = await request.get(`${API_URL}/api/networks`, {
    headers: {
      Cookie: cookieHeader,
    },
  });

  let networks: Array<{ id: string; ssid: string; hasHandshake: boolean }> = [];
  if (networksResponse.ok()) {
    const networksData = await networksResponse.json();
    networks = (networksData.data || []).map((n: any) => ({
      id: n.id,
      ssid: n.ssid || n.bssid,
      hasHandshake: !!(n.handshakePath || n.pmkidPath || n.hasHandshake),
    }));
  }

  return { captureId, networks };
}

/**
 * Create a cracking job via API
 * Returns the job ID
 */
export async function createJob(
  context: BrowserContext,
  networkId: string,
  dictionaryIds: string[],
  attackMode: "handshake" | "pmkid" = "handshake",
): Promise<string> {
  const request = context.request;

  // Get cookies explicitly from the browser context
  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  const response = await request.post(`${API_URL}/api/queue/crack`, {
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
      Origin: "http://localhost:3000",
    },
    data: JSON.stringify({
      networkId,
      dictionaryIds,
      attackMode,
    }),
  });

  if (!response.ok()) {
    const error = await response.text();
    throw new Error(`Failed to create job: ${error}`);
  }

  const data = await response.json();
  // Handle various response formats
  return (
    data.job?.id || data.data?.jobId || data.data?.id || data.jobId || data.id
  );
}

/**
 * Complete setup for jobs tests
 * Logs in, uploads dictionary, uploads PCAP, and creates a job
 */
export async function setupForJobsTest(
  page: Page,
  context: BrowserContext,
): Promise<{
  dictionaryId: string;
  networkId: string;
  jobId: string;
}> {
  // Step 1: Login
  await fullLogin(page, context);

  // Step 2: Upload dictionary
  const dictionary = await uploadDictionary(context);

  // Step 3: Upload PCAP and get networks
  const { networks } = await uploadPcap(context, page);

  if (networks.length === 0) {
    throw new Error("No networks extracted from PCAP - cannot create job");
  }

  // Find a network with handshake
  const networkWithHandshake =
    networks.find((n) => n.hasHandshake) ?? networks[0]!;

  // Step 4: Create a job (single network against multiple dictionaries)
  const jobId = await createJob(context, networkWithHandshake.id, [
    dictionary.id,
  ]);

  return {
    dictionaryId: dictionary.id,
    networkId: networkWithHandshake.id,
    jobId,
  };
}

/**
 * Wait for a job to reach a terminal state
 */
export async function waitForJobCompletion(
  context: BrowserContext,
  jobId: string,
  page: Page,
  timeoutMs: number = 60000,
): Promise<{ status: string; progress: number }> {
  const request = context.request;
  const startTime = Date.now();
  let lastStatus = "pending";
  let lastProgress = 0;

  while (Date.now() - startTime < timeoutMs) {
    const response = await request.get(`${API_URL}/api/jobs/${jobId}`);

    if (response.ok()) {
      const data = await response.json();
      lastStatus = data.data?.status || "unknown";
      lastProgress = data.data?.progress || 0;

      if (["completed", "failed", "cancelled"].includes(lastStatus)) {
        break;
      }
    }

    await waitForDebounce(page, TEST_TIMEOUTS.default);
  }

  return { status: lastStatus, progress: lastProgress };
}

/**
 * Block WebSocket connections for tests that don't need real-time updates
 */
export async function blockWebSockets(page: Page) {
  await page.route(/^(ws|wss):/, (route) => route.abort());
}
