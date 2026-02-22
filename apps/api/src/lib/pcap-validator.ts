import { promises as fs } from "fs";
import { createValidationError } from "./error-handler";
import { logger } from "./logger";

/**
 * PCAP file magic bytes and validation
 */
const PCAP_MAGIC_BYTES = {
  // PCAP global header magic numbers
  BIG_ENDIAN: 0xa1b2c3d4,
  LITTLE_ENDIAN: 0xd4c3b2a1,
  // PCAPNG magic numbers
  PCAPNG: 0x0a0d0d0a,
};

/**
 * PCAP file header structure
 */
interface PCAPHeader {
  magic_number: number;
  version_major: number;
  version_minor: number;
  thiszone: number;
  sigfigs: number;
  snaplen: number;
  network: number;
}

/**
 * Validate if a file is a valid PCAP file
 * @param filePath Path to the file to validate
 * @returns Promise<boolean> true if valid PCAP, false otherwise
 */
export async function validatePCAPFile(filePath: string): Promise<boolean> {
  try {
    // Check file size before reading to prevent memory exhaustion
    const stats = await fs.stat(filePath);
    const maxSize = 1024 * 1024 * 1024; // 1GB
    if (stats.size > maxSize) {
      logger.warn("PCAP validation: File too large", "pcap-validator", {
        filePath,
        size: stats.size,
        maxSize,
        sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
      });
      return false;
    }

    // Read the first 24 bytes (PCAP global header size)
    const fileBuffer = await fs.readFile(filePath);

    if (fileBuffer.length < 24) {
      logger.warn(
        "PCAP validation: File too small to be valid PCAP",
        "pcap-validator",
        {
          filePath,
          fileSize: fileBuffer.length,
        },
      );
      return false;
    }

    // Read magic number (first 4 bytes)
    const magicNumber = fileBuffer.readUInt32LE(0);

    // Check if it matches any known PCAP magic numbers
    const isValidMagic = Object.values(PCAP_MAGIC_BYTES).includes(magicNumber);

    if (!isValidMagic) {
      logger.warn("PCAP validation: Invalid magic number", "pcap-validator", {
        filePath,
        magicNumber: `0x${magicNumber.toString(16)}`,
      });
      return false;
    }

    // Read and validate the rest of the header
    const header = parsePCAPHeader(fileBuffer);
    if (!header) {
      logger.warn("PCAP validation: Failed to parse header", "pcap-validator", {
        filePath,
      });
      return false;
    }

    // Validate PCAP version
    if (header.version_major !== 1 || header.version_minor !== 0) {
      logger.warn(
        "PCAP validation: Unsupported PCAP version",
        "pcap-validator",
        {
          filePath,
          version: `${header.version_major}.${header.version_minor}`,
        },
      );
      return false;
    }

    // Validate network layer (should be reasonable values)
    if (header.network < 0 || header.network > 255) {
      logger.warn("PCAP validation: Invalid network layer", "pcap-validator", {
        filePath,
        network: header.network,
      });
      return false;
    }

    // Validate snaplen (should be reasonable)
    if (header.snaplen <= 0 || header.snaplen > 65535) {
      logger.warn("PCAP validation: Invalid snaplen", "pcap-validator", {
        filePath,
        snaplen: header.snaplen,
      });
      return false;
    }

    logger.info("PCAP validation: File is valid", "pcap-validator", {
      filePath,
      version: `${header.version_major}.${header.version_minor}`,
      network: header.network,
      snaplen: header.snaplen,
    });

    return true;
  } catch (error) {
    logger.error("PCAP validation: Error validating file", "pcap-validator", {
      filePath,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

/**
 * Parse PCAP header from buffer
 */
function parsePCAPHeader(buffer: Buffer): PCAPHeader | null {
  try {
    // Determine byte order from magic number
    const magicNumber = buffer.readUInt32LE(0);
    const isLittleEndian =
      magicNumber === PCAP_MAGIC_BYTES.LITTLE_ENDIAN ||
      magicNumber === PCAP_MAGIC_BYTES.PCAPNG;

    if (isLittleEndian) {
      return {
        magic_number: magicNumber,
        version_major: buffer.readUInt16LE(4),
        version_minor: buffer.readUInt16LE(6),
        thiszone: buffer.readInt32LE(8),
        sigfigs: buffer.readUInt32LE(12),
        snaplen: buffer.readUInt32LE(16),
        network: buffer.readUInt32LE(20),
      };
    } else {
      return {
        magic_number: magicNumber,
        version_major: buffer.readUInt16BE(4),
        version_minor: buffer.readUInt16BE(6),
        thiszone: buffer.readInt32BE(8),
        sigfigs: buffer.readUInt32BE(12),
        snaplen: buffer.readUInt32BE(16),
        network: buffer.readUInt32BE(20),
      };
    }
  } catch (error) {
    return null;
  }
}

/**
 * Validate file content matches PCAP extension
 * @param fileName File name to check
 * @param filePath File path to validate
 * @returns Promise<boolean> true if file is valid PCAP, false otherwise
 */
export async function validatePCAPFileByName(
  fileName: string,
  filePath: string,
): Promise<boolean> {
  // First check file extension
  const validExtensions = [".pcap", ".cap", ".pcapng", ".dmp"];
  const ext = fileName.toLowerCase().substring(fileName.lastIndexOf("."));

  if (!validExtensions.includes(ext)) {
    throw createValidationError(
      `Invalid file extension: ${ext}. Allowed extensions: ${validExtensions.join(", ")}`,
      "INVALID_FILE_EXTENSION",
    );
  }

  // Then validate actual file content
  const isValid = await validatePCAPFile(filePath);

  if (!isValid) {
    throw createValidationError(
      "File content is not a valid PCAP file. The file may be corrupted or not in PCAP format.",
      "INVALID_PCAP_CONTENT",
    );
  }

  return true;
}

/**
 * Get basic PCAP file information
 * @param filePath Path to PCAP file
 * @returns Promise<object> Basic PCAP file information
 */
export async function getPCAPFileInfo(filePath: string): Promise<{
  version: string;
  network: number;
  snaplen: number;
  fileSize: number;
  isBigEndian: boolean;
}> {
  try {
    const stats = await fs.stat(filePath);
    const fileBuffer = await fs.readFile(filePath);

    if (fileBuffer.length < 24) {
      throw new Error("File too small to be valid PCAP");
    }

    const header = parsePCAPHeader(fileBuffer);
    if (!header) {
      throw new Error("Failed to parse PCAP header");
    }

    const isBigEndian = header.magic_number === PCAP_MAGIC_BYTES.BIG_ENDIAN;

    return {
      version: `${header.version_major}.${header.version_minor}`,
      network: header.network,
      snaplen: header.snaplen,
      fileSize: stats.size,
      isBigEndian,
    };
  } catch (error) {
    logger.error("Error getting PCAP file info", "pcap-validator", {
      filePath,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Quick PCAP validation for upload scenarios
 * Validates file extension and basic file structure
 * @param fileName File name
 * @param fileBuffer File content as buffer
 * @returns Promise<boolean> true if appears to be valid PCAP
 */
export async function quickPCAPValidation(
  fileName: string,
  fileBuffer: Buffer,
): Promise<boolean> {
  try {
    // Check file extension first
    const validExtensions = [".pcap", ".cap", ".pcapng", ".dmp"];
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf("."));

    if (!validExtensions.includes(ext)) {
      return false;
    }

    // Quick content validation - check magic bytes
    if (fileBuffer.length < 24) {
      return false;
    }

    const magicNumber = fileBuffer.readUInt32LE(0);
    const isValid = Object.values(PCAP_MAGIC_BYTES).includes(magicNumber);

    return isValid;
  } catch (error) {
    logger.error("Quick PCAP validation failed", "pcap-validator", {
      fileName,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}
