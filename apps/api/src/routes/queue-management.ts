import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/db";
import { jobs, networks, dictionaries } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  addPCAPProcessingJob,
  addHashcatCrackingJob,
  addDictionaryGenerationJob,
  addFileCleanupJob,
  QUEUE_NAMES,
} from "@/lib/queue";
import { authenticate, getUserId } from "@/middleware/auth";
import { logger } from "@/lib/logger";

const queueManagement = new Hono();

// Apply authentication middleware to all routes
queueManagement.use("*", authenticate);

// Create cracking job (consolidated - accepts multiple networks and dictionaries)
queueManagement.post(
  "/crack",
  zValidator(
    "json",
    z.object({
      networkIds: z.array(z.string().min(1)).min(1),
      dictionaryIds: z.array(z.string().min(1)).min(1),
      attackMode: z.enum(["pmkid", "handshake"]).default("handshake"),
    }),
  ),
  async (c) => {
    const data = c.req.valid("json");
    const userId = getUserId(c);

    try {
      const { networkIds, dictionaryIds, attackMode } = data;

      // Import inArray for querying multiple records
      const { inArray } = await import("drizzle-orm");

      // Fetch all networks
      const fetchedNetworks = await db.query.networks.findMany({
        where: inArray(networks.id, networkIds),
      });

      if (fetchedNetworks.length !== networkIds.length) {
        return c.json(
          {
            success: false,
            error: "One or more networks not found",
          },
          404,
        );
      }

      // Fetch all dictionaries
      const fetchedDictionaries = await db.query.dictionaries.findMany({
        where: inArray(dictionaries.id, dictionaryIds),
      });

      if (fetchedDictionaries.length !== dictionaryIds.length) {
        return c.json(
          {
            success: false,
            error: "One or more dictionaries not found",
          },
          404,
        );
      }

      // Import file system utilities for consolidation
      const fs = await import("fs/promises");
      const path = await import("path");

      // Create temporary directory for consolidated files
      const tmpDir = path.join(process.env.TEMP_DIR || "/tmp", `consolidated-${Date.now()}`);
      await fs.mkdir(tmpDir, { recursive: true });

      // Consolidate dictionaries: concatenate all dictionary files
      const consolidatedDictionaryPath = path.join(tmpDir, "consolidated.txt");
      const dictionaryWriteStream = (await import("fs")).createWriteStream(consolidatedDictionaryPath);

      for (const dict of fetchedDictionaries) {
        if (dict.filePath) {
          const dictContent = await fs.readFile(dict.filePath, "utf-8");
          dictionaryWriteStream.write(dictContent);
          // Add newline between dictionaries if not already present
          if (!dictContent.endsWith("\n")) {
            dictionaryWriteStream.write("\n");
          }
        }
      }
      dictionaryWriteStream.end();

      // Wait for stream to finish
      await new Promise<void>((resolve, reject) => {
        dictionaryWriteStream.on("finish", resolve);
        dictionaryWriteStream.on("error", reject);
      });

      // Count total words in consolidated dictionary
      const consolidatedContent = await fs.readFile(consolidatedDictionaryPath, "utf-8");
      const totalWords = consolidatedContent.split("\n").filter((line: string) => line.trim()).length;

      // Get the file size of the consolidated dictionary
      const dictionaryStats = await fs.stat(consolidatedDictionaryPath);

      // Create a consolidated dictionary record
      const [consolidatedDictionary] = await db
        .insert(dictionaries)
        .values({
          name: `Consolidated (${fetchedDictionaries.length} dicts, ${totalWords.toLocaleString()} words)`,
          filename: `consolidated-${Date.now()}.txt`,
          filePath: consolidatedDictionaryPath,
          wordCount: totalWords,
          size: dictionaryStats.size,
          type: "generated",
          status: "ready",
          encoding: "utf-8",
          userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Consolidate PCAPs/handshakes: combine all network capture files
      // For handshake/PMKID attacks, we need to combine the handshake files
      const consolidatedHandshakePath = path.join(tmpDir, "consolidated.hccapx");

      // If we have multiple networks, we'll use hashcat's ability to handle multiple hashes
      // by combining them into a single file or using the first network's file
      // For now, we'll create a job that references all networks

      // Create job name based on networks
      const networkNames = fetchedNetworks.map((n) => n.ssid || n.bssid).join(", ");
      const jobName = `Consolidated Job: ${fetchedNetworks.length} networks, ${fetchedDictionaries.length} dicts`;

      // Create a single consolidated job record
      // Use the first network as primary reference, but store all network IDs
      const [newJob] = await db
        .insert(jobs)
        .values({
          name: jobName,
          networkId: fetchedNetworks[0].id, // Primary network
          dictionaryId: consolidatedDictionary.id,
          status: "pending",
          config: {
            attackMode: data.attackMode,
            queued: true,
            type: "cracking",
            consolidated: true,
            networkIds, // Store all network IDs
            dictionaryIds, // Store original dictionary IDs
            networkCount: fetchedNetworks.length,
            dictionaryCount: fetchedDictionaries.length,
            totalWords,
            networks: fetchedNetworks.map((n) => ({ id: n.id, ssid: n.ssid, bssid: n.bssid })),
          },
          userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Add to queue with consolidated dictionary
      // For multiple networks, hashcat can process multiple hashes if we provide them
      await addHashcatCrackingJob({
        jobId: newJob.id,
        networkId: fetchedNetworks[0].id,
        dictionaryId: consolidatedDictionary.id,
        handshakePath: fetchedNetworks[0].filePath || "",
        dictionaryPath: consolidatedDictionaryPath,
        attackMode: data.attackMode,
        userId,
        additionalNetworks: fetchedNetworks.slice(1).map((n) => ({
          id: n.id,
          filePath: n.filePath || "",
        })),
      });

      return c.json({
        success: true,
        message: `Consolidated cracking job created with ${fetchedNetworks.length} networks and ${fetchedDictionaries.length} dictionaries (${totalWords.toLocaleString()} total words)`,
        job: {
          id: newJob.id,
          name: jobName,
          networkIds,
          dictionaryIds,
          consolidatedDictionaryId: consolidatedDictionary.id,
          totalWords,
          networkCount: fetchedNetworks.length,
          dictionaryCount: fetchedDictionaries.length,
          attackMode: data.attackMode,
          status: "pending",
          createdAt: newJob.createdAt,
        },
      });
    } catch (error) {
      logger.error("Create consolidated cracking job error", "queue-management", error instanceof Error ? error : new Error(String(error)));
      return c.json(
        {
          success: false,
          error: "Failed to create consolidated cracking job",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  },
);

// Generate dictionary job
queueManagement.post(
  "/dictionary/generate",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(255),
      baseWords: z.array(z.string()).optional(),
      rules: z.array(z.string()).optional(),
      transformations: z.array(z.string()).optional(),
      async: z.boolean().optional().default(true),
    }),
  ),
  async (c) => {
    const data = c.req.valid("json");
    const userId = getUserId(c);

    try {
      // Validate dictionary name uniqueness for user
      const existingDictionary = await db.query.dictionaries.findFirst({
        where: and(
          eq(dictionaries.name, data.name),
          eq(dictionaries.userId, userId),
        ),
      });

      if (existingDictionary) {
        return c.json(
          {
            success: false,
            error: "Dictionary name already exists",
            message:
              "You already have a dictionary with this name. Please choose a different name.",
          },
          400,
        );
      }

      // Validate input size to prevent resource exhaustion
      if (data.baseWords && data.baseWords.length > 10000) {
        return c.json(
          {
            success: false,
            error: "Too many base words",
            message:
              "Maximum 10,000 base words allowed per dictionary generation request.",
          },
          400,
        );
      }

      if (data.rules && data.rules.length > 100) {
        return c.json(
          {
            success: false,
            error: "Too many rules",
            message:
              "Maximum 100 rules allowed per dictionary generation request.",
          },
          400,
        );
      }

      if (data.transformations && data.transformations.length > 50) {
        return c.json(
          {
            success: false,
            error: "Too many transformations",
            message:
              "Maximum 50 transformations allowed per dictionary generation request.",
          },
          400,
        );
      }

      if (data.async) {
        // Add to queue for asynchronous processing
        const job = await addDictionaryGenerationJob({
          name: data.name,
          baseWords: data.baseWords || [],
          rules: data.rules || [],
          transformations: data.transformations || [],
          userId,
        });

        return c.json({
          success: true,
          message: "Dictionary generation job queued successfully",
          job: {
            id: job.id,
            name: data.name,
            baseWords: data.baseWords?.length || 0,
            rules: data.rules?.length || 0,
            transformations: data.transformations?.length || 0,
            status: "queued",
          },
          estimatedTime:
            "Dictionary generation will begin shortly and may take several minutes depending on complexity.",
        });
      } else {
        // Synchronous generation for smaller requests
        if (data.baseWords && data.baseWords.length > 1000) {
          return c.json(
            {
              success: false,
              error: "Request too large for synchronous generation",
              message:
                "Requests with more than 1,000 base words must be processed asynchronously. Please set async=true.",
            },
            400,
          );
        }

        // Import generateDictionary function for synchronous processing
        const { generateDictionary } = await import(
          "@/workers/dictionary-generation"
        );

        const newDictionary = await generateDictionary({
          name: data.name,
          baseWords: data.baseWords || [],
          rules: data.rules || [],
          transformations: data.transformations || [],
          userId,
        });

        return c.json({
          success: true,
          message: "Dictionary generated successfully",
          dictionary: newDictionary,
        });
      }
    } catch (error) {
      logger.error("Generate dictionary job error", "queue-management", error instanceof Error ? error : new Error(String(error)));
      return c.json(
        {
          success: false,
          error: "Failed to generate dictionary",
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
        },
        500,
      );
    }
  },
);

// Get queue statistics
queueManagement.get("/stats", async (c) => {
  try {
    // Get job counts by status
    const [pendingJobs, runningJobs, completedJobs, failedJobs] =
      await Promise.all([
        db.select().from(jobs).where(eq(jobs.status, "pending")),
        db.select().from(jobs).where(eq(jobs.status, "running")),
        db.select().from(jobs).where(eq(jobs.status, "completed")),
        db.select().from(jobs).where(eq(jobs.status, "failed")),
      ]);

    // Get recent jobs
    const recentJobs = await db.query.jobs.findMany({
      where: eq(jobs.userId, getUserId(c)),
      with: {
        network: true,
        dictionary: true,
      },
      orderBy: [(jobs, { desc }) => [desc(jobs.createdAt)]],
      limit: 10,
    });

    return c.json({
      success: true,
      stats: {
        pending: pendingJobs.length,
        running: runningJobs.length,
        completed: completedJobs.length,
        failed: failedJobs.length,
        total:
          pendingJobs.length +
          runningJobs.length +
          completedJobs.length +
          failedJobs.length,
      },
      recentJobs,
      queues: {
        [QUEUE_NAMES.PCAP_PROCESSING]: "PCAP Processing",
        [QUEUE_NAMES.HASHCAT_CRACKING]: "Hashcat Cracking",
        [QUEUE_NAMES.DICTIONARY_GENERATION]: "Dictionary Generation",
        [QUEUE_NAMES.FILE_CLEANUP]: "File Cleanup",
      },
    });
  } catch (error) {
    logger.error("Get queue stats error", "queue-management", error instanceof Error ? error : new Error(String(error)));
    return c.json(
      {
        success: false,
        error: "Failed to get queue statistics",
      },
      500,
    );
  }
});

// Get predefined word lists and transformation options
queueManagement.get("/dictionary/templates", async (c) => {
  try {
    const { defaultWordLists } = await import(
      "@/workers/dictionary-generation"
    );

    const templates = {
      wordLists: {
        commonPasswords: {
          name: "Common Passwords",
          description: "Most frequently used passwords",
          words: defaultWordLists.commonPasswords,
        },
        commonWords: {
          name: "Common Words",
          description: "Frequently used English words",
          words: defaultWordLists.commonWords,
        },
        numbers: {
          name: "Numbers",
          description: "Single digits",
          words: defaultWordLists.numbers,
        },
        months: {
          name: "Months",
          description: "Month names",
          words: defaultWordLists.months,
        },
      },
      transformations: [
        {
          id: "upper",
          name: "Uppercase",
          description: "Convert all letters to uppercase",
        },
        {
          id: "lower",
          name: "Lowercase",
          description: "Convert all letters to lowercase",
        },
        {
          id: "capitalize",
          name: "Capitalize",
          description: "Capitalize first letter only",
        },
        { id: "reverse", name: "Reverse", description: "Reverse the word" },
        {
          id: "leet",
          name: "Leet Speak",
          description: "Replace letters with numbers (e=3, a=4, o=0, s=5)",
        },
        {
          id: "duplicate",
          name: "Duplicate",
          description: "Duplicate the word (password -> passwordpassword)",
        },
        {
          id: "append_year",
          name: "Append Year",
          description: "Append current year (2024)",
        },
        { id: "append_1", name: "Append 1", description: "Append number 1" },
        { id: "prepend_1", name: "Prepend 1", description: "Prepend number 1" },
      ],
      commonRules: [
        { rule: ":", name: "No Change", description: "Keep word as is" },
        { rule: "u", name: "Uppercase", description: "Convert to uppercase" },
        { rule: "l", name: "Lowercase", description: "Convert to lowercase" },
        {
          rule: "c",
          name: "Capitalize",
          description: "Capitalize first letter",
        },
        { rule: "r", name: "Reverse", description: "Reverse the word" },
        { rule: "d", name: "Duplicate", description: "Duplicate the word" },
        { rule: "$1", name: "Append 1", description: "Append number 1" },
        {
          rule: "$!",
          name: "Append !",
          description: "Append exclamation mark",
        },
        { rule: "^1", name: "Prepend 1", description: "Prepend number 1" },
        {
          rule: "^!",
          name: "Prepend !",
          description: "Prepend exclamation mark",
        },
      ],
    };

    return c.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    logger.error("Get dictionary templates error", "queue-management", error instanceof Error ? error : new Error(String(error)));
    return c.json(
      {
        success: false,
        error: "Failed to get dictionary templates",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      500,
    );
  }
});

// Cancel job
queueManagement.delete("/jobs/:id", async (c) => {
  const jobId = c.req.param("id");
  const userId = getUserId(c);

  try {
    // Update job status to cancelled
    const [cancelledJob] = await db
      .update(jobs)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
      .returning();

    if (!cancelledJob) {
      return c.json(
        {
          success: false,
          error: "Job not found or you do not have permission to cancel it",
        },
        404,
      );
    }

    // Note: In BullMQ, you would also want to cancel the job in the queue
    // This would require access to the queue instance and job ID from BullMQ

    return c.json({
      success: true,
      message: "Job cancelled successfully",
      job: cancelledJob,
    });
  } catch (error) {
    logger.error("Cancel job error", "queue-management", error instanceof Error ? error : new Error(String(error)));
    return c.json(
      {
        success: false,
        error: "Failed to cancel job",
      },
      500,
    );
  }
});

// Retry failed job
queueManagement.post("/jobs/:id/retry", async (c) => {
  const jobId = c.req.param("id");
  const userId = getUserId(c);

  try {
    // Get the failed job
    const failedJob = await db.query.jobs.findFirst({
      where: and(
        eq(jobs.id, jobId),
        eq(jobs.userId, userId),
        eq(jobs.status, "failed"),
      ),
      with: {
        network: true,
        dictionary: true,
      },
    });

    if (!failedJob) {
      return c.json(
        {
          success: false,
          error:
            "Failed job not found or you do not have permission to retry it",
        },
        404,
      );
    }

    // Reset job status
    const [retriedJob] = await db
      .update(jobs)
      .set({
        status: "pending",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId))
      .returning();

    // Re-add to queue based on job type
    if (failedJob.networkId && failedJob.dictionaryId) {
      await addHashcatCrackingJob({
        jobId: failedJob.id,
        networkId: failedJob.networkId,
        dictionaryId: failedJob.dictionaryId,
        handshakePath: failedJob.network?.filePath || "",
        dictionaryPath: failedJob.dictionary?.filePath || "",
        attackMode:
          (failedJob.attackMode as "pmkid" | "handshake") || "handshake",
        userId,
      });
    }

    return c.json({
      success: true,
      message: "Job queued for retry",
      job: retriedJob,
    });
  } catch (error) {
    logger.error("Retry job error", "queue-management", error instanceof Error ? error : new Error(String(error)));
    return c.json(
      {
        success: false,
        error: "Failed to retry job",
      },
      500,
    );
  }
});

// Cleanup job
queueManagement.post(
  "/cleanup",
  zValidator(
    "json",
    z.object({
      strategy: z.enum([
        "old_files",
        "failed_jobs",
        "completed_jobs",
        "temp_files",
      ]),
      userId: z.string().optional(),
    }),
  ),
  async (c) => {
    const data = c.req.valid("json");
    const userId = data.userId || getUserId(c);

    try {
      // Add cleanup job to queue
      await addFileCleanupJob({
        filePaths: [],
        userId,
      });

      return c.json({
        success: true,
        message: "Cleanup job queued successfully",
        strategy: data.strategy,
      });
    } catch (error) {
      logger.error("Cleanup job error", "queue-management", error instanceof Error ? error : new Error(String(error)));
      return c.json(
        {
          success: false,
          error: "Failed to queue cleanup job",
        },
        500,
      );
    }
  },
);

export {
  queueManagement as queueManagementRoutes,
  queueManagement as queueRoutes,
};
