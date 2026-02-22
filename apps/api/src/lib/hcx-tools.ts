import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export interface ConversionResult {
  success: boolean;
  outputFile?: string;
  networksFound?: number;
  pmkidsFound?: number;
  hashesConverted?: number;
  processingTime?: number;
  error?: string;
  metrics?: {
    packetsAnalyzed?: number;
    beaconFramesFound?: number;
    dataRate?: number;
  };
}

export interface PMKIDResult {
  success: boolean;
  outputFile?: string;
  pmkidsFound?: number;
  processingTime?: number;
  error?: string;
}

export interface HashcatConversionResult {
  success: boolean;
  outputFile?: string;
  hashesConverted?: number;
  processingTime?: number;
  error?: string;
}

export interface Validation {
  isValid: boolean;
  format?: string;
  networks?: number;
  errors: string[];
}

export interface ExtractedNetwork {
  ssid: string;
  bssid: string;
  encryption: string;
  hasHandshake: boolean;
  hasPMKID: boolean;
  hashLine: string;
  channel?: number;
  frequency?: number;
  signalStrength?: number;
}

export interface NetworkExtractionResult {
  success: boolean;
  networks: ExtractedNetwork[];
  hc22000File?: string;
  error?: string;
  processingTime?: number;
}

/**
 * Convert PCAP file to HC22000 format using hcxpcapngtool
 */
export async function convertToHC22000(
  inputPcap: string,
  outputHc22000: string,
): Promise<ConversionResult> {
  const startTime = Date.now();

  try {
    // Check if hcxpcapngtool is available
    const versionCheck = await execAsync("hcxpcapngtool --version");
    if (versionCheck.stderr) {
      throw new Error("HCX PCAPNGTOOL not found");
    }

    // Run hcxpcapngtool conversion
    // Fixed: hcxpcapngtool 7.0+ uses positional input, no -i or -O flags
    const command = `hcxpcapngtool -o "${outputHc22000}" "${inputPcap}"`;
    const result = await execAsync(command);

    if (result.stderr) {
      throw new Error(`HCX conversion failed: ${result.stderr}`);
    }

    const processingTime = Date.now() - startTime;
    const networksFound = extractNetworkCountFromOutput(result.stdout);

    return {
      success: true,
      outputFile: outputHc22000,
      networksFound,
      processingTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Extract networks from PCAP file using hcxpcapngtool
 * Parses the hc22000 output to get SSID, BSSID, and handshake information
 */
export async function extractNetworksFromPCAP(
  inputPcap: string,
  outputDir?: string,
): Promise<NetworkExtractionResult> {
  const startTime = Date.now();

  try {
    // Determine output file path
    const baseDir = outputDir || path.dirname(inputPcap);
    const baseName = path.basename(inputPcap, path.extname(inputPcap));
    const hc22000File = path.join(baseDir, `${baseName}.hc22000`);

    // Run hcxpcapngtool to convert PCAP to hc22000
    const command = `hcxpcapngtool -o "${hc22000File}" "${inputPcap}" 2>&1`;
    const result = await execAsync(command);

    // Check if output file was created
    let fileExists = false;
    try {
      await fs.access(hc22000File);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    if (!fileExists) {
      // No handshakes or PMKIDs found in PCAP
      return {
        success: true,
        networks: [],
        processingTime: Date.now() - startTime,
      };
    }

    // Read and parse the hc22000 file
    const hc22000Content = await fs.readFile(hc22000File, "utf-8");
    const networks = parseHC22000(hc22000Content);

    return {
      success: true,
      networks,
      hc22000File,
      processingTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      networks: [],
      error: error instanceof Error ? error.message : "Unknown error",
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Parse hc22000 file content and extract network information
 *
 * HC22000 format: WPA*TYPE*HASH*BSSID*CLIENTMAC*ESSID*...*
 * TYPE: 01 = PMKID, 02 = EAPOL (handshake)
 * BSSID: AP MAC address (hex, no colons)
 * ESSID: Network name (hex encoded ASCII)
 */
function parseHC22000(content: string): ExtractedNetwork[] {
  const lines = content
    .split("\n")
    .filter((line) => line.trim().startsWith("WPA*"));
  const networkMap = new Map<string, ExtractedNetwork>();

  for (const line of lines) {
    const parts = line.split("*");
    if (parts.length < 6) continue;

    const type = parts[1];
    const bssidHex = parts[3];
    const essidHex = parts[5];

    if (!bssidHex || bssidHex.length !== 12) continue;

    // Convert BSSID from hex to colon-separated format
    const bssid = formatBSSID(bssidHex);

    // Convert ESSID from hex to ASCII
    const ssid = hexToAscii(essidHex) || bssid;

    // Use BSSID as key to deduplicate networks
    const existing = networkMap.get(bssid);

    if (existing) {
      // Update existing network with new handshake/PMKID info
      if (type === "01") {
        existing.hasPMKID = true;
      } else if (type === "02") {
        existing.hasHandshake = true;
      }
      // Keep the hash line with handshake (more complete)
      if (type === "02") {
        existing.hashLine = line;
      }
    } else {
      // Create new network entry
      networkMap.set(bssid, {
        ssid,
        bssid,
        encryption: "WPA2", // hcxpcapngtool only outputs WPA2/WPA3 networks
        hasHandshake: type === "02",
        hasPMKID: type === "01",
        hashLine: line,
      });
    }
  }

  return Array.from(networkMap.values());
}

/**
 * Convert hex string to colon-separated BSSID format
 * e.g., "500f807018d0" -> "50:0f:80:70:18:d0"
 */
function formatBSSID(hex: string): string {
  if (hex.length !== 12) return hex;
  return hex.match(/.{2}/g)?.join(":").toLowerCase() || hex;
}

/**
 * Convert hex-encoded string to ASCII
 * e.g., "696b65726972692d3567" -> "ikeriri-5g"
 */
function hexToAscii(hex: string): string {
  if (!hex || hex.length === 0 || hex.length % 2 !== 0) return "";

  try {
    let result = "";
    for (let i = 0; i < hex.length; i += 2) {
      const charCode = parseInt(hex.substr(i, 2), 16);
      // Only include printable ASCII characters
      if (charCode >= 32 && charCode < 127) {
        result += String.fromCharCode(charCode);
      }
    }
    return result;
  } catch {
    return "";
  }
}

/**
 * Extract PMKID from PCAP using hcxpcapngtool
 */
export async function extractPMKID(
  inputPcap: string,
  outputPmkid: string,
): Promise<PMKIDResult> {
  const startTime = Date.now();

  try {
    // Run hcxpcapngtool PMKID extraction
    // Fixed: hcxpcapngtool 7.0+ uses positional input, no -i or -O flags
    const command = `hcxpcapngtool -o "${outputPmkid}" "${inputPcap}"`;
    const result = await execAsync(command);

    if (result.stderr) {
      throw new Error(`PMKID extraction failed: ${result.stderr}`);
    }

    const processingTime = Date.now() - startTime;
    const pmkidsFound = extractPMKIDCountFromOutput(result.stdout);

    return {
      success: true,
      outputFile: outputPmkid,
      pmkidsFound,
      processingTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Convert HC22000 to hashcat-compatible format
 */
export async function convertToHashcat(
  inputHc22000: string,
  outputHashcat: string,
): Promise<HashcatConversionResult> {
  const startTime = Date.now();

  try {
    // Read HC22000 file and format for hashcat
    const hc22000Content = await fs.readFile(inputHc22000, "utf-8");
    const hashcatFormat = hc22000Content
      .split("\n")
      .map((line) => line.replace(/^WPA\*01\*/, "$")) // Remove WPA*01 prefix, keep hash
      .filter((line) => line.includes(":")) // Keep lines with passwords
      .join("\n");

    await fs.writeFile(outputHashcat, hashcatFormat);

    const processingTime = Date.now() - startTime;
    const hashesConverted = hashcatFormat.split("\n").length;

    return {
      success: true,
      outputFile: outputHashcat,
      hashesConverted,
      processingTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Validate converted file format (HC22000 format)
 * HC22000 format: WPA*TYPE*HASH*BSSID*CLIENTMAC*ESSID*...*
 */
export async function validateConversion(
  convertedFile: string,
): Promise<Validation> {
  try {
    const content = await fs.readFile(convertedFile, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    let isValid = true;
    const errors: string[] = [];
    let networks = 0;

    // Check each line
    for (const line of lines) {
      // HC22000 lines must start with 'WPA*'
      if (!line.startsWith("WPA*")) {
        errors.push(`Invalid format: line must start with 'WPA*'`);
        isValid = false;
        continue;
      }

      // Split by '*' delimiter
      const parts = line.split("*");

      // HC22000 format requires at least 6 fields:
      // WPA*TYPE*HASH*BSSID*CLIENTMAC*ESSID
      if (parts.length < 6) {
        errors.push(
          `Invalid format: expected at least 6 fields, got ${parts.length}`,
        );
        isValid = false;
        continue;
      }

      // TYPE should be 01 (PMKID) or 02 (EAPOL/handshake)
      const type = parts[1];
      if (type !== "01" && type !== "02") {
        errors.push(`Invalid format: TYPE must be '01' or '02', got '${type}'`);
        isValid = false;
      }

      // BSSID should be 12 hex characters
      const bssid = parts[3];
      if (!/^[a-fA-F0-9]{12}$/.test(bssid)) {
        errors.push(
          `Invalid format: BSSID must be 12 hex characters, got '${bssid}'`,
        );
        isValid = false;
      }

      // HASH should be hex characters (32 or 64 chars typically)
      const hash = parts[2];
      if (!/^[a-fA-F0-9]{32,64}$/.test(hash)) {
        errors.push(`Invalid format: HASH must be 32-64 hex characters`);
        isValid = false;
      }

      networks++;
    }

    // If no valid networks found, mark as invalid
    if (networks === 0 && lines.length > 0) {
      isValid = false;
      errors.push("No valid HC22000 entries found");
    }

    return {
      isValid,
      format: "HC22000",
      networks,
      errors,
    };
  } catch (error) {
    return {
      isValid: false,
      format: "unknown",
      networks: 0,
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

/**
 * Extract network count from hcxpcapngtool output
 */
function extractNetworkCountFromOutput(output: string): number {
  // Try to find ESSID count first: "ESSID (total unique).................: 1"
  const essidMatch = output.match(/ESSID \(total unique\).+?: (\d+)/i);
  if (essidMatch) return parseInt(essidMatch[1]);

  // Fallback to "networks found" pattern
  const match = output.match(/(\d+)\s+networks?\s+found/i);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Extract PMKID count from hcxpcapngtool output
 */
function extractPMKIDCountFromOutput(output: string): number {
  const match = output.match(/(\d+)\s+PMKIDs?\s+found/i);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Check if hcxpcapngtool is available
 */
export async function checkHCXToolsAvailability(): Promise<{
  available: boolean;
  version?: string;
  error?: string;
}> {
  try {
    const result = await execAsync("hcxpcapngtool --version");

    if (result.stderr) {
      return {
        available: false,
        error: result.stderr.trim(),
      };
    }

    return {
      available: true,
      version: result.stdout.trim(),
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Analyze PCAP file metadata
 */
export async function analyzePCAPOptions(inputPcap: string): Promise<{
  fileSize: number;
  packetCount?: number;
  duration?: number;
  hasBeaconFrames?: boolean;
  hasDataFrames?: boolean;
  encryptionTypes?: string[];
}> {
  try {
    // Use hcxpcapngtool for analysis
    const command = `hcxpcapngtool -i "${inputPcap}" -E`;
    const result = await execAsync(command);

    if (result.stderr) {
      throw new Error(`PCAP analysis failed: ${result.stderr}`);
    }

    // Parse output for metadata
    const output = result.stdout;
    const encryptionTypes = new Set<string>();

    // Look for encryption type indicators
    if (output.includes("WPA2")) encryptionTypes.add("WPA2");
    if (output.includes("WPA3")) encryptionTypes.add("WPA3");
    if (output.includes("WEP")) encryptionTypes.add("WEP");

    return {
      fileSize: (await fs.stat(inputPcap)).size,
      packetCount: extractPacketCount(output),
      duration: extractDuration(output),
      hasBeaconFrames: output.includes("Beacon frames"),
      hasDataFrames: output.includes("Data frames"),
      encryptionTypes: Array.from(encryptionTypes),
    };
  } catch (error) {
    throw new Error(`PCAP analysis error: ${error.message}`);
  }
}

function extractPacketCount(output: string): number {
  const match = output.match(/(\d+)\s+packets?\s+captured/i);
  return match ? parseInt(match[1]) : 0;
}

function extractDuration(output: string): number {
  const match = output.match(/Duration:\s+(\d+)\s+seconds/);
  return match ? parseInt(match[1]) : 0;
}
