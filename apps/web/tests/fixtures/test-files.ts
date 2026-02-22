import * as fs from "fs";
import * as path from "path";

/**
 * Test file fixtures for E2E tests
 * Creates temporary test files for upload testing
 */

const FIXTURES_DIR = path.join(process.cwd(), "tests", "fixtures", "files");

/**
 * Ensure fixtures directory exists
 */
export function ensureFixturesDir() {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }
}

/**
 * Create a sample dictionary file for testing
 */
export function createTestDictionary(
  name: string = "test-dictionary.txt",
): string {
  ensureFixturesDir();
  const filePath = path.join(FIXTURES_DIR, name);

  // Create a simple dictionary with common passwords
  const words = [
    "password123",
    "admin",
    "letmein",
    "12345678",
    "qwerty123",
    "welcome1",
    "password1",
    "abc123",
    "monkey",
    "dragon",
    "master",
    "login",
    "princess",
    "sunshine",
    "iloveyou",
  ];

  fs.writeFileSync(filePath, words.join("\n"));
  return filePath;
}

/**
 * Create a minimal PCAP file for testing
 * Note: This creates a minimal valid PCAP header but won't contain actual network data
 * For real testing, use actual PCAP files with handshakes
 */
export function createTestPcap(name: string = "test-capture.pcap"): string {
  ensureFixturesDir();
  const filePath = path.join(FIXTURES_DIR, name);

  // PCAP global header (24 bytes)
  // Magic number (0xa1b2c3d4) + version + snaplen + network type
  const pcapHeader = Buffer.from([
    0xd4,
    0xc3,
    0xb2,
    0xa1, // Magic number (little endian)
    0x02,
    0x00, // Major version (2)
    0x04,
    0x00, // Minor version (4)
    0x00,
    0x00,
    0x00,
    0x00, // GMT offset
    0x00,
    0x00,
    0x00,
    0x00, // Timestamp accuracy
    0xff,
    0xff,
    0x00,
    0x00, // Snapshot length (65535)
    0x69,
    0x00,
    0x00,
    0x00, // Link-layer type (105 = IEEE 802.11)
  ]);

  fs.writeFileSync(filePath, pcapHeader);
  return filePath;
}

/**
 * Get path to a test file
 */
export function getTestFilePath(name: string): string {
  return path.join(FIXTURES_DIR, name);
}

/**
 * Clean up test files
 */
export function cleanupTestFiles() {
  if (fs.existsSync(FIXTURES_DIR)) {
    const files = fs.readdirSync(FIXTURES_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(FIXTURES_DIR, file));
    }
  }
}

/**
 * Create all test fixtures needed for E2E tests
 */
export function createAllTestFixtures() {
  ensureFixturesDir();
  createTestDictionary("small-wordlist.txt");
  createTestPcap("sample-capture.pcap");
}
