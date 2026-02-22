import { Worker } from "bullmq";
import Redis from "ioredis";
import { env } from "../config/env";
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
      console.error("PCAP processing failed:", error);
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
      additionalNetworks,
    } = job.data;

    // Log if additional networks are provided (for future multi-network support)
    if (additionalNetworks && additionalNetworks.length > 0) {
      console.log(`Job ${jobId} has ${additionalNetworks.length} additional networks to process`);
    }

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
      console.error("Hashcat attack failed:", error);
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
      console.error("Dictionary generation failed:", error);
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
      console.error("File cleanup failed:", error);
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
      console.error("Storage cleanup failed:", error);
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
  console.error("PCAP Processing Worker Error:", error);
});

hashcatCrackingWorker.on("error", (error) => {
  console.error("Hashcat Cracking Worker Error:", error);
});

dictionaryGenerationWorker.on("error", (error) => {
  console.error("Dictionary Generation Worker Error:", error);
});

fileCleanupWorker.on("error", (error) => {
  console.error("File Cleanup Worker Error:", error);
});

// Logging for debugging
pcapProcessingWorker.on("completed", (job) => {
  console.log(`PCAP Processing job ${job.id} completed`);
});

hashcatCrackingWorker.on("completed", (job) => {
  console.log(`Hashcat Cracking job ${job.id} completed`);
});

dictionaryGenerationWorker.on("completed", (job) => {
  console.log(`Dictionary Generation job ${job.id} completed`);
});

fileCleanupWorker.on("completed", (job) => {
  console.log(`File Cleanup job ${job.id} completed`);
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
