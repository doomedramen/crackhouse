import { exec } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { logger } from "./logger";
import { logSecurityEvent, SecurityEventType } from "./monitoring";

const execAsync = promisify(exec);

export interface VirusScanResult {
  safe: boolean;
  infected: boolean;
  threats: string[];
  signatures: string[];
  scanTime: number;
  engine: string;
  definitions: string;
  quarantined: boolean;
  quarantinePath?: string;
  fileHash: string;
}

export interface VirusScannerConfig {
  enabled: boolean;
  engine: "clamav" | "yara" | "custom";
  quarantineDirectory: string;
  maxScanSize: number;
  timeout: number;
  scanEncrypted: boolean;
  heuristicAnalysis: boolean;
}

const defaultConfig: VirusScannerConfig = {
  enabled: true,
  engine: "clamav",
  quarantineDirectory: "./quarantine",
  maxScanSize: 100 * 1024 * 1024, // 100MB
  timeout: 30000, // 30 seconds
  scanEncrypted: true,
  heuristicAnalysis: true,
};

/**
 * ClamAV virus scanner implementation
 */
class ClamAVScanner {
  private config: VirusScannerConfig;

  constructor(config: VirusScannerConfig) {
    this.config = config;
  }

  /**
   * Scan file using ClamAV
   */
  async scanFile(
    filePath: string,
    originalName: string,
  ): Promise<VirusScanResult> {
    const startTime = Date.now();
    const fileHash = await this.generateFileHash(filePath);

    try {
      // Check if ClamAV is available
      await this.checkClamAVAvailability();

      // Perform the scan
      const scanResult = await this.performClamAVScan(filePath);

      const scanTime = Date.now() - startTime;

      const result: VirusScanResult = {
        safe: !scanResult.infected,
        infected: scanResult.infected,
        threats: scanResult.threats,
        signatures: scanResult.signatures,
        scanTime,
        engine: "ClamAV",
        definitions: scanResult.definitions,
        quarantined: false,
        fileHash,
      };

      // Log security event if infected
      if (result.infected) {
        await this.logInfection(result, originalName, filePath);
        await this.quarantineFile(filePath, originalName, result);
      }

      return result;
    } catch (error) {
      logger.error(
        "Virus scan failed",
        "virus_scanner",
        error instanceof Error ? error : new Error(String(error)),
        {
          filePath,
          originalName,
          engine: "ClamAV",
          scanTime: Date.now() - startTime,
        },
      );

      // On scan failure, treat as suspicious
      return {
        safe: false,
        infected: false,
        threats: [
          "Scan failed: " +
            (error instanceof Error ? error.message : "Unknown error"),
        ],
        signatures: [],
        scanTime: Date.now() - startTime,
        engine: "ClamAV",
        definitions: "Unknown",
        quarantined: false,
        fileHash,
      };
    }
  }

  /**
   * Check if ClamAV is available and working
   */
  private async checkClamAVAvailability(): Promise<void> {
    try {
      // Check if clamscan is available
      await execAsync("which clamscan");

      // Check if freshclam is available for definitions
      try {
        await execAsync("which freshclam");
      } catch {
        logger.warn(
          "freshclam not found - virus definitions may be outdated",
          "virus_scanner",
        );
      }
    } catch (_error) {
      throw new Error("ClamAV not found. Please install clamav package.");
    }
  }

  /**
   * Perform actual ClamAV scan
   */
  private async performClamAVScan(filePath: string): Promise<{
    infected: boolean;
    threats: string[];
    signatures: string[];
    definitions: string;
  }> {
    const scanCommand = `clamscan --no-summary --detect-pua=yes ${this.config.heuristicAnalysis ? "--detect-broken=yes" : ""} "${filePath}"`;

    const { stdout, stderr } = await execAsync(scanCommand, {
      timeout: this.config.timeout,
    });

    const output = stdout + stderr;

    // Get virus definitions version
    let definitions = "Unknown";
    try {
      const versionResult = await execAsync("clamscan --version");
      const versionMatch = versionResult.stdout.match(/ClamAV (\d+\.\d+\.\d+)/);
      if (versionMatch && versionMatch[1]) {
        definitions = versionMatch[1];
      }
    } catch {
      // Ignore version check errors
    }

    // Parse scan results
    const lines = output.split("\n").filter((line) => line.trim());
    const threats: string[] = [];
    const signatures: string[] = [];
    let infected = false;

    for (const line of lines) {
      if (line.includes("FOUND")) {
        infected = true;

        // Extract threat name and signature
        const match = line.match(/^(.+):\s+(.+)\s+FOUND$/);
        if (match) {
          const [, filePath, signature] = match;
          if (filePath && signature) {
            threats.push(`Threat detected in ${path.basename(filePath)}`);
            signatures.push(signature);
          }
        } else {
          // Fallback parsing
          const parts = line.split(":");
          if (parts.length >= 2) {
            const signature = parts[parts.length - 1]
              ?.replace("FOUND", "")
              .trim();
            threats.push("Threat detected");
            signatures.push(signature);
          }
        }
      }
    }

    return {
      infected,
      threats,
      signatures,
      definitions,
    };
  }

  /**
   * Generate SHA-256 hash of file
   */
  private async generateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return createHash("sha256").update(fileBuffer).digest("hex");
  }

  /**
   * Log infection event to security monitoring
   */
  private async logInfection(
    result: VirusScanResult,
    originalName: string,
    filePath: string,
  ): Promise<void> {
    logSecurityEvent({
      type: SecurityEventType.MALICIOUS_FILE_DETECTED,
      severity: "critical",
      ip: "unknown", // Will be set by calling middleware
      path: "/api/upload",
      method: "POST",
      details: {
        originalName,
        threats: result.threats,
        signatures: result.signatures,
        fileHash: result.fileHash,
        engine: result.engine,
        scanTime: result.scanTime,
      },
      metadata: {
        filePath,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Move infected file to quarantine
   */
  private async quarantineFile(
    filePath: string,
    originalName: string,
    scanResult: VirusScanResult,
  ): Promise<void> {
    try {
      await fs.mkdir(this.config.quarantineDirectory, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const quarantineFileName = `${timestamp}_${originalName}`;
      const quarantinePath = path.join(
        this.config.quarantineDirectory,
        quarantineFileName,
      );

      // Move file to quarantine
      await fs.rename(filePath, quarantinePath);

      // Create quarantine metadata file
      const metadata = {
        originalName,
        originalPath: filePath,
        quarantinePath,
        quarantineDate: new Date().toISOString(),
        scanResult,
        quarantinedBy: "ClamAV",
      };

      const metadataPath = path.join(
        this.config.quarantineDirectory,
        `${quarantineFileName}.meta.json`,
      );
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      logger.warn(
        "File quarantined due to malware detection",
        "virus_scanner",
        {
          originalName,
          quarantinePath,
          threats: scanResult.threats,
          signatures: scanResult.signatures,
        },
      );

      scanResult.quarantined = true;
      scanResult.quarantinePath = quarantinePath;
    } catch (error) {
      logger.error(
        "Failed to quarantine infected file",
        "virus_scanner",
        error instanceof Error ? error : new Error(String(error)),
        {
          filePath,
          originalName,
        },
      );
    }
  }
}

/**
 * YARA rules scanner implementation
 */
class YARAScanner {
  private config: VirusScannerConfig;

  constructor(config: VirusScannerConfig) {
    this.config = config;
  }

  async scanFile(
    filePath: string,
    originalName: string,
  ): Promise<VirusScanResult> {
    const startTime = Date.now();
    const fileHash = await this.generateFileHash(filePath);

    try {
      // Check if YARA is available
      await this.checkYARAAvailability();

      // Perform YARA scan
      const scanResult = await this.performYARAScan(filePath);

      const scanTime = Date.now() - startTime;

      const result: VirusScanResult = {
        safe: scanResult.matches.length === 0,
        infected: scanResult.matches.length > 0,
        threats: scanResult.matches.map((match) => match.rule),
        signatures: scanResult.matches.map((match) => match.rule),
        scanTime,
        engine: "YARA",
        definitions: scanResult.rulesVersion,
        quarantined: false,
        fileHash,
      };

      // Log security event if infected
      if (result.infected) {
        await this.logInfection(result, originalName, filePath);
        await this.quarantineFile(filePath, originalName, result);
      }

      return result;
    } catch (error) {
      logger.error(
        "YARA scan failed",
        "virus_scanner",
        error instanceof Error ? error : new Error(String(error)),
        {
          filePath,
          originalName,
          engine: "YARA",
          scanTime: Date.now() - startTime,
        },
      );

      return {
        safe: false,
        infected: false,
        threats: [
          "YARA scan failed: " +
            (error instanceof Error ? error.message : "Unknown error"),
        ],
        signatures: [],
        scanTime: Date.now() - startTime,
        engine: "YARA",
        definitions: "Unknown",
        quarantined: false,
        fileHash,
      };
    }
  }

  private async checkYARAAvailability(): Promise<void> {
    try {
      await execAsync("which yara");
    } catch (error) {
      throw new Error("YARA not found. Please install YARA.");
    }
  }

  private async performYARAScan(filePath: string): Promise<{
    matches: Array<{ rule: string; tags: string[]; meta: any }>;
    rulesVersion: string;
  }> {
    // This is a simplified implementation
    // In production, you would have a comprehensive set of YARA rules
    const rulesPath = path.join(process.cwd(), "security-rules");

    try {
      const { stdout } = await execAsync(
        `yara -r "${rulesPath}" "${filePath}"`,
        {
          timeout: this.config.timeout,
        },
      );

      const matches = stdout
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const parts = line.split(" ");
          return {
            rule: parts[0] || "unknown",
            tags: [],
            meta: {},
          };
        });

      return {
        matches,
        rulesVersion: "custom",
      };
    } catch (error) {
      // YARA returns non-zero exit code when matches are found
      const errorAny = error as any;
      const stdout = errorAny.stdout || "";

      if (stdout) {
        const matches = stdout
          .split("\n")
          .filter((line: string) => line.trim())
          .map((line: string) => {
            const parts = line.split(" ");
            return {
              rule: parts[0] || "unknown",
              tags: [],
              meta: {},
            };
          });

        return {
          matches,
          rulesVersion: "custom",
        };
      }

      throw error;
    }
  }

  private async generateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return createHash("sha256").update(fileBuffer).digest("hex");
  }

  private async logInfection(
    result: VirusScanResult,
    originalName: string,
    filePath: string,
  ): Promise<void> {
    logSecurityEvent({
      type: SecurityEventType.MALICIOUS_FILE_DETECTED,
      severity: "critical",
      ip: "unknown",
      path: "/api/upload",
      method: "POST",
      details: {
        originalName,
        threats: result.threats,
        signatures: result.signatures,
        fileHash: result.fileHash,
        engine: result.engine,
        scanTime: result.scanTime,
      },
    });
  }

  private async quarantineFile(
    filePath: string,
    originalName: string,
    scanResult: VirusScanResult,
  ): Promise<void> {
    try {
      await fs.mkdir(this.config.quarantineDirectory, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const quarantineFileName = `${timestamp}_${originalName}`;
      const quarantinePath = path.join(
        this.config.quarantineDirectory,
        quarantineFileName,
      );

      await fs.rename(filePath, quarantinePath);

      const metadata = {
        originalName,
        originalPath: filePath,
        quarantinePath,
        quarantineDate: new Date().toISOString(),
        scanResult,
        quarantinedBy: "YARA",
      };

      const metadataPath = path.join(
        this.config.quarantineDirectory,
        `${quarantineFileName}.meta.json`,
      );
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      scanResult.quarantined = true;
      scanResult.quarantinePath = quarantinePath;
    } catch (error) {
      logger.error(
        "Failed to quarantine infected file",
        "virus_scanner",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

/**
 * Main virus scanner factory
 */
export class VirusScanner {
  private config: VirusScannerConfig;
  private scanner: ClamAVScanner | YARAScanner;

  constructor(config: Partial<VirusScannerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };

    switch (this.config.engine) {
      case "clamav":
        this.scanner = new ClamAVScanner(this.config);
        break;
      case "yara":
        this.scanner = new YARAScanner(this.config);
        break;
      default:
        throw new Error(
          `Unsupported virus scanner engine: ${this.config.engine}`,
        );
    }
  }

  /**
   * Scan file for viruses
   */
  async scanFile(
    filePath: string,
    originalName: string,
  ): Promise<VirusScanResult> {
    if (!this.config.enabled) {
      return {
        safe: true,
        infected: false,
        threats: [],
        signatures: [],
        scanTime: 0,
        engine: this.config.engine,
        definitions: "disabled",
        quarantined: false,
        fileHash: await this.generateFileHash(filePath),
      };
    }

    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size > this.config.maxScanSize) {
      return {
        safe: false,
        infected: false,
        threats: [
          `File too large for virus scanning (${stats.size} > ${this.config.maxScanSize})`,
        ],
        signatures: [],
        scanTime: 0,
        engine: this.config.engine,
        definitions: "skipped",
        quarantined: false,
        fileHash: await this.generateFileHash(filePath),
      };
    }

    return this.scanner.scanFile(filePath, originalName);
  }

  /**
   * Get scanner status and configuration
   */
  async getStatus(): Promise<{
    enabled: boolean;
    engine: string;
    available: boolean;
    definitions?: string;
    lastUpdate?: Date;
  }> {
    if (!this.config.enabled) {
      return {
        enabled: false,
        engine: this.config.engine,
        available: false,
      };
    }

    try {
      switch (this.config.engine) {
        case "clamav":
          await execAsync("which clamscan");
          const versionResult = await execAsync("clamscan --version");
          const versionMatch = versionResult.stdout.match(
            /ClamAV (\d+\.\d+\.\d+)/,
          );

          const result: {
            enabled: boolean;
            engine: string;
            available: boolean;
            definitions?: string;
            lastUpdate?: Date;
          } = {
            enabled: true,
            engine: "ClamAV",
            available: true,
          };

          if (versionMatch && versionMatch[1]) {
            result.definitions = versionMatch[1];
          }

          return result;

        case "yara":
          await execAsync("which yara");
          return {
            enabled: true,
            engine: "YARA",
            available: true,
          };

        default:
          return {
            enabled: true,
            engine: this.config.engine,
            available: false,
          };
      }
    } catch {
      return {
        enabled: this.config.enabled,
        engine: this.config.engine,
        available: false,
      };
    }
  }

  private async generateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return createHash("sha256").update(fileBuffer).digest("hex");
  }
}

// Export singleton instance
export const virusScanner = new VirusScanner();
