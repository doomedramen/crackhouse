// Load environment variables based on NODE_ENV
import "dotenv-flow/config";

import { Worker } from "bullmq";
import Redis from "ioredis";
import { env } from "../config/env";
import { logger } from "@/lib/logger";
import {
  QUEUE_NAMES,
  PCAPProcessingJob,
  HashcatCrackingJob,
  DictionaryGenerationJob,
  FileCleanupJob,
  StorageCleanupJob,
} from "../lib/queue";
import { processPCAP } from "./pcap-processing";
import { runHashcatAttack } from "./hashcat";
import { generateDictionary } from "./dictionary-generation";
import { cleanupFiles } from "./file-cleanup";
import { processStorageCleanup } from "./storage-cleanup";
import { startEmailWorker } from "./email-worker";

// Create Redis connection for workers
const redisConnection = new Redis({
  host: env.REDIS_HOST,
  port: parseInt(env.REDIS_PORT),
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy: (times) => {
    // Exponential backoff: start with 100ms, double each time, max 30 seconds
    const delay = Math.min(100 * Math.pow(2, times - 1), 30000);
    return delay;
  },
  connectTimeout: 30000, // 30 seconds
  commandTimeout: 10000, // 10 seconds
});

// Email Worker - runs independently for async email sending
export { startEmailWorker } from "./email-worker";

// PCAP Processing Worker
export const pcapProcessingWorker = new Worker<PCAPProcessingJob>(
  QUEUE_NAMES.PCAP_PROCESSING,
  async (job) => {
    const { captureId, filePath, originalFilename, userId } = job.data;

    try {
      const result = await processPCAP({
        captureId,
        filePath,
        originalFilename,
        userId,
      });

      return { success: true, message: "PCAP processed successfully", result };
    } catch (error) {
      logger.error("PCAP processing failed", "worker:pcap", {
        error: error instanceof Error ? error : new Error(String(error)),
        jobId: job.id,
      });
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60000, // 1 minute
    },
  },
);

// Hashcat Cracking Worker
export const hashcatCrackingWorker = new Worker<HashcatCrackingJob>(
  QUEUE_NAMES.HASHCAT_CRACKING,
  async (job) => {
    const {
      jobId,
      networkId,
      dictionaryId,
      handshakePath,
      dictionaryPath,
      attackMode,
      userId,
    } = job.data;

    try {
      const result = await runHashcatAttack({
        jobId,
        networkId,
        dictionaryId,
        handshakePath,
        dictionaryPath,
        attackMode,
        userId,
      });

      return { success: true, result };
    } catch (error) {
      logger.error("Hashcat attack failed", "worker:hashcat", {
        error: error instanceof Error ? error : new Error(String(error)),
        jobId: job.id,
      });
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1, // Limit to one hashcat instance at a time for system stability
  },
);

// Dictionary Generation Worker
export const dictionaryGenerationWorker = new Worker<DictionaryGenerationJob>(
  QUEUE_NAMES.DICTIONARY_GENERATION,
  async (job) => {
    const { name, baseWords, rules, transformations, userId } = job.data;

    try {
      const result = await generateDictionary({
        name,
        baseWords,
        rules,
        transformations,
        userId,
      });

      return {
        success: true,
        dictionaryId: result.id,
        wordCount: result.wordCount,
      };
    } catch (error) {
      logger.error("Dictionary generation failed", "worker:dictionary", {
        error: error instanceof Error ? error : new Error(String(error)),
        jobId: job.id,
      });
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,
  },
);

// File Cleanup Worker
export const fileCleanupWorker = new Worker<FileCleanupJob>(
  QUEUE_NAMES.FILE_CLEANUP,
  async (job) => {
    const { filePaths, olderThan, userId } = job.data;

    try {
      const result = await cleanupFiles({
        filePaths,
        olderThan,
        userId,
      });

      return { success: true, cleanedFiles: (result as any).length || 0 };
    } catch (error) {
      logger.error("File cleanup failed", "worker:file-cleanup", {
        error: error instanceof Error ? error : new Error(String(error)),
        jobId: job.id,
      });
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  },
);

// Storage Cleanup Worker
export const storageCleanupWorker = new Worker<StorageCleanupJob>(
  QUEUE_NAMES.STORAGE_CLEANUP,
  async (job) => {
    const { triggeredBy, retentionDays, dryRun } = job.data;

    try {
      const result = await processStorageCleanup({
        triggeredBy: triggeredBy || "system",
        retentionDays,
        dryRun: dryRun || false,
      });

      return { success: true, ...result };
    } catch (error) {
      logger.error("Storage cleanup failed", "worker:storage-cleanup", {
        error: error instanceof Error ? error : new Error(String(error)),
        jobId: job.id,
      });
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  },
);

// Error handlers for workers
pcapProcessingWorker.on("error", (error) => {
  logger.error("PCAP Processing Worker Error", "worker:pcap", {
    error: error instanceof Error ? error : new Error(String(error)),
  });
});

hashcatCrackingWorker.on("error", (error) => {
  logger.error("Hashcat Cracking Worker Error", "worker:hashcat", {
    error: error instanceof Error ? error : new Error(String(error)),
  });
});

dictionaryGenerationWorker.on("error", (error) => {
  logger.error("Dictionary Generation Worker Error", "worker:dictionary", {
    error: error instanceof Error ? error : new Error(String(error)),
  });
});

fileCleanupWorker.on("error", (error) => {
  logger.error("File Cleanup Worker Error", "worker:file-cleanup", {
    error: error instanceof Error ? error : new Error(String(error)),
  });
});

// Logging for debugging
pcapProcessingWorker.on("completed", (job) => {
  logger.info("PCAP Processing job completed", "worker:pcap", {
    jobId: job.id,
  });
});

hashcatCrackingWorker.on("completed", (job) => {
  logger.info("Hashcat Cracking job completed", "worker:hashcat", {
    jobId: job.id,
  });
});

dictionaryGenerationWorker.on("completed", (job) => {
  logger.info("Dictionary Generation job completed", "worker:dictionary", {
    jobId: job.id,
  });
});

fileCleanupWorker.on("completed", (job) => {
  logger.info("File Cleanup job completed", "worker:file-cleanup", {
    jobId: job.id,
  });
});

// Graceful shutdown for workers
export const closeWorkers = async () => {
  await Promise.all([
    pcapProcessingWorker.close(),
    hashcatCrackingWorker.close(),
    dictionaryGenerationWorker.close(),
    fileCleanupWorker.close(),
    storageCleanupWorker.close(),
  ]);
};

// Health check for workers
export const checkWorkerHealth = () => {
  return {
    pcapProcessing: pcapProcessingWorker.isRunning(),
    hashcatCracking: hashcatCrackingWorker.isRunning(),
    dictionaryGeneration: dictionaryGenerationWorker.isRunning(),
    fileCleanup: fileCleanupWorker.isRunning(),
    storageCleanup: storageCleanupWorker.isRunning(),
  };
};
