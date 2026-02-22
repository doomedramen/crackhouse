import { promises as fs } from "fs";
import { logger } from "./logger";

/**
 * Basic PCAP packet record structure
 */
interface PCAPPacketRecord {
  timestamp_seconds: number;
  timestamp_microseconds: number;
  captured_length: number;
  original_length: number;
  packet_data: Buffer;
}

/**
 * Analyze PCAP file for basic network information
 */
export class PCAPAnalyzer {
  private buffer: Buffer;
  private isLittleEndian: boolean;
  private header: any;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.parseHeader();
  }

  /**
   * Parse PCAP global header
   */
  private parseHeader(): void {
    if (this.buffer.length < 24) {
      throw new Error("File too small for PCAP header");
    }

    const magicNumber = this.buffer.readUInt32LE(0);

    // Determine byte order and validate magic number
    if (magicNumber === 0xa1b2c3d4) {
      this.isLittleEndian = false;
    } else if (magicNumber === 0xd4c3b2a1) {
      this.isLittleEndian = true;
    } else if (magicNumber === 0x0a0d0d0a) {
      throw new Error("PCAP-NG format not yet supported");
    } else {
      throw new Error(
        `Invalid PCAP magic number: 0x${magicNumber.toString(16)}`,
      );
    }

    // Parse the rest of the header
    if (this.isLittleEndian) {
      this.header = {
        magic_number: magicNumber,
        version_major: this.buffer.readUInt16LE(4),
        version_minor: this.buffer.readUInt16LE(6),
        thiszone: this.buffer.readInt32LE(8),
        sigfigs: this.buffer.readUInt32LE(12),
        snaplen: this.buffer.readUInt32LE(16),
        network: this.buffer.readUInt32LE(20),
      };
    } else {
      this.header = {
        magic_number: magicNumber,
        version_major: this.buffer.readUInt16BE(4),
        version_minor: this.buffer.readUInt16BE(6),
        thiszone: this.buffer.readInt32BE(8),
        sigfigs: this.buffer.readUInt32BE(12),
        snaplen: this.buffer.readUInt32BE(16),
        network: this.buffer.readUInt32BE(20),
      };
    }
  }

  /**
   * Get PCAP header information
   */
  getHeader(): any {
    return this.header;
  }

  /**
   * Read packet records from PCAP file
   * @param maxPackets Maximum number of packets to analyze
   * @returns Array of packet records
   */
  readPackets(maxPackets: number = 100): PCAPPacketRecord[] {
    const packets: PCAPPacketRecord[] = [];
    let offset = 24; // PCAP header size

    while (offset < this.buffer.length && packets.length < maxPackets) {
      // Check if we have enough bytes for a packet record header (16 bytes)
      if (offset + 16 > this.buffer.length) {
        break;
      }

      // Read packet record header
      let timestamp_seconds: number;
      let timestamp_microseconds: number;
      let captured_length: number;
      let original_length: number;

      if (this.isLittleEndian) {
        timestamp_seconds = this.buffer.readUInt32LE(offset);
        timestamp_microseconds = this.buffer.readUInt32LE(offset + 4);
        captured_length = this.buffer.readUInt32LE(offset + 8);
        original_length = this.buffer.readUInt32LE(offset + 12);
      } else {
        timestamp_seconds = this.buffer.readUInt32BE(offset);
        timestamp_microseconds = this.buffer.readUInt32BE(offset + 4);
        captured_length = this.buffer.readUInt32BE(offset + 8);
        original_length = this.buffer.readUInt32BE(offset + 12);
      }

      // Validate packet lengths
      if (captured_length > this.header.snaplen) {
        logger.warn("Packet captured length exceeds snaplen", "pcap-analyzer", {
          captured_length,
          snaplen: this.header.snaplen,
        });
        captured_length = Math.min(captured_length, this.header.snaplen);
      }

      // Check if we have enough bytes for packet data
      if (offset + 16 + captured_length > this.buffer.length) {
        break;
      }

      // Read packet data
      const packet_data = this.buffer.slice(
        offset + 16,
        offset + 16 + captured_length,
      );

      packets.push({
        timestamp_seconds,
        timestamp_microseconds,
        captured_length,
        original_length,
        packet_data,
      });

      offset += 16 + captured_length;
    }

    return packets;
  }

  /**
   * Analyze packets for basic network information
   */
  analyzePackets(maxPackets: number = 100): {
    totalPackets: number;
    duration: number;
    bytesTotal: number;
    bytesPerSecond: number;
    packetsPerSecond: number;
    hasWiFi: boolean;
    hasIPv4: boolean;
    hasIPv6: boolean;
    hasTCP: boolean;
    hasUDP: boolean;
    estimatedNetworkTypes: string[];
  } {
    const packets = this.readPackets(maxPackets);

    if (packets.length === 0) {
      return {
        totalPackets: 0,
        duration: 0,
        bytesTotal: 0,
        bytesPerSecond: 0,
        packetsPerSecond: 0,
        hasWiFi: false,
        hasIPv4: false,
        hasIPv6: false,
        hasTCP: false,
        hasUDP: false,
        estimatedNetworkTypes: [],
      };
    }

    const firstTimestamp =
      packets[0].timestamp_seconds +
      packets[0].timestamp_microseconds / 1000000;
    const lastTimestamp =
      packets[packets.length - 1].timestamp_seconds +
      packets[packets.length - 1].timestamp_microseconds / 1000000;
    const duration = lastTimestamp - firstTimestamp;

    const bytesTotal = packets.reduce(
      (sum, packet) => sum + packet.captured_length,
      0,
    );

    const analysis = {
      totalPackets: packets.length,
      duration,
      bytesTotal,
      bytesPerSecond: duration > 0 ? bytesTotal / duration : 0,
      packetsPerSecond: duration > 0 ? packets.length / duration : 0,
      hasWiFi: false,
      hasIPv4: false,
      hasIPv6: false,
      hasTCP: false,
      hasUDP: false,
      estimatedNetworkTypes: [] as string[],
    };

    // Analyze packet headers for network information
    for (const packet of packets) {
      this.analyzePacketHeader(packet.packet_data, analysis);
    }

    // Estimate network types based on findings
    if (analysis.hasWiFi) {
      analysis.estimatedNetworkTypes.push("WiFi");
    }
    if (analysis.hasIPv4 || analysis.hasIPv6) {
      analysis.estimatedNetworkTypes.push("IP");
    }
    if (analysis.hasTCP) {
      analysis.estimatedNetworkTypes.push("TCP");
    }
    if (analysis.hasUDP) {
      analysis.estimatedNetworkTypes.push("UDP");
    }

    return analysis;
  }

  /**
   * Analyze individual packet header
   */
  private analyzePacketHeader(packetData: Buffer, analysis: any): void {
    if (packetData.length < 14) return; // Minimum Ethernet frame size

    // Check for WiFi (radiotap header or 802.11)
    if (this.isWiFiPacket(packetData)) {
      analysis.hasWiFi = true;
    }

    // Check Ethernet type
    const etherType = packetData.readUInt16BE(12);

    switch (etherType) {
      case 0x0800: // IPv4
        analysis.hasIPv4 = true;
        this.analyzeIPv4Packet(packetData.slice(14), analysis);
        break;
      case 0x86dd: // IPv6
        analysis.hasIPv6 = true;
        this.analyzeIPv6Packet(packetData.slice(14), analysis);
        break;
      case 0x0806: // ARP
        analysis.estimatedNetworkTypes.push("ARP");
        break;
    }
  }

  /**
   * Check if packet is a WiFi packet
   */
  private isWiFiPacket(packetData: Buffer): boolean {
    // Look for radiotap header (common in WiFi captures)
    if (packetData.length >= 4 && packetData[0] === 0x00) {
      // Radiotap header length is in bytes 2-3
      const radiotapLength = packetData.readUInt16LE(2);
      if (radiotapLength > 0 && radiotapLength < packetData.length) {
        return true;
      }
    }

    // Look for 802.11 frame structure
    if (packetData.length >= 24) {
      const frameControl = packetData.readUInt16BE(0);
      const frameType = (frameControl & 0x0c) >> 2;
      const _frameSubtype = (frameControl & 0xf0) >> 4;

      // 802.11 frame types: Management (0), Control (1), Data (2)
      if (frameType <= 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Analyze IPv4 packet for transport layer info
   */
  private analyzeIPv4Packet(ipData: Buffer, analysis: any): void {
    if (ipData.length < 20) return;

    const version = (ipData[0] & 0xf0) >> 4;
    if (version !== 4) return;

    const headerLength = (ipData[0] & 0x0f) * 4;
    if (ipData.length < headerLength) return;

    const protocol = ipData[9];

    switch (protocol) {
      case 6: // TCP
        analysis.hasTCP = true;
        break;
      case 17: // UDP
        analysis.hasUDP = true;
        break;
    }
  }

  /**
   * Analyze IPv6 packet for transport layer info
   */
  private analyzeIPv6Packet(ipData: Buffer, analysis: any): void {
    if (ipData.length < 40) return;

    const nextHeader = ipData[6];

    switch (nextHeader) {
      case 6: // TCP
        analysis.hasTCP = true;
        break;
      case 17: // UDP
        analysis.hasUDP = true;
        break;
    }
  }
}

/**
 * Analyze PCAP file and return summary information with performance optimizations
 */
export async function analyzePCAPFile(
  filePath: string,
  maxPackets: number = 100,
): Promise<{
  header: any;
  analysis: any;
  estimatedNetworkCount: number;
}> {
  const startTime = Date.now();

  try {
    logger.debug("Starting PCAP file analysis", "pcap-analyzer", {
      filePath,
      maxPackets,
    });

    // Performance optimization: Use file stats to pre-validate
    const fileStats = await fs.stat(filePath);
    if (fileStats.size > 100 * 1024 * 1024) {
      // 100MB limit
      logger.warn(
        "Large PCAP file detected, adjusting analysis parameters",
        "pcap-analyzer",
        {
          filePath,
          fileSize: fileStats.size,
        },
      );
      // Reduce packet count for large files
      maxPackets = Math.min(maxPackets, 50);
    }

    // Performance optimization: Read file in chunks if very large
    let buffer: Buffer;
    if (fileStats.size > 50 * 1024 * 1024) {
      // 50MB threshold
      // For very large files, only read the beginning for header and initial packets
      const readSize = Math.min(fileStats.size, 10 * 1024 * 1024); // Max 10MB read
      const fileHandle = await fs.open(filePath, "r");
      try {
        buffer = Buffer.allocUnsafe(readSize);
        await fileHandle.read(buffer, 0, readSize, 0);
      } finally {
        await fileHandle.close();
      }
      logger.debug(
        "Read PCAP file in chunks for performance",
        "pcap-analyzer",
        {
          filePath,
          readSize,
          originalSize: fileStats.size,
        },
      );
    } else {
      buffer = await fs.readFile(filePath);
    }

    const analyzer = new PCAPAnalyzer(buffer);

    const header = analyzer.getHeader();
    const analysis = analyzer.analyzePackets(maxPackets);

    // Performance optimization: Smarter network count estimation
    const estimatedNetworkCount = estimateNetworkCountOptimized(
      analysis,
      fileStats.size,
    );

    const processingTime = Date.now() - startTime;

    logger.debug("PCAP analysis completed", "pcap-analyzer", {
      filePath,
      processingTime,
      packetsAnalyzed: analysis.totalPackets,
      fileSize: fileStats.size,
      estimatedNetworks: estimatedNetworkCount,
    });

    return {
      header,
      analysis,
      estimatedNetworkCount,
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error("PCAP analysis failed", "pcap-analyzer", {
      filePath,
      processingTime,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

/**
 * Optimized network count estimation based on multiple factors
 */
function estimateNetworkCountOptimized(
  analysis: any,
  fileSize: number,
): number {
  const { totalPackets, hasWiFi, hasIPv4, hasIPv6, bytesTotal } = analysis;

  // Base estimation on packet density and file size
  let networkCount = 1;

  // Factor in file size (larger files likely contain more networks)
  if (fileSize > 10 * 1024 * 1024) {
    // > 10MB
    networkCount = Math.min(8, Math.ceil(fileSize / (5 * 1024 * 1024))); // 1 network per 5MB
  } else if (fileSize > 1024 * 1024) {
    // > 1MB
    networkCount = Math.min(4, Math.ceil(fileSize / (2 * 1024 * 1024))); // 1 network per 2MB
  }

  // Adjust based on packet analysis
  if (totalPackets > 1000) {
    networkCount = Math.min(networkCount + 2, 10);
  } else if (totalPackets > 500) {
    networkCount = Math.min(networkCount + 1, 6);
  }

  // Adjust based on protocol diversity
  const protocolCount = [hasWiFi, hasIPv4, hasIPv6].filter(Boolean).length;
  networkCount = Math.max(networkCount, Math.ceil(protocolCount / 2));

  // Factor in data density
  const avgPacketSize = totalPackets > 0 ? bytesTotal / totalPackets : 0;
  if (avgPacketSize > 1000) {
    // Large packets suggest more data
    networkCount = Math.min(networkCount + 1, 12);
  }

  return Math.max(1, networkCount);
}
