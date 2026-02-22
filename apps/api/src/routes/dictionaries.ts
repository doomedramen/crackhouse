import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/db";
import {
  dictionaries as dictionariesSchema,
  selectDictionarySchema,
} from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { authMiddleware as authenticate, getUserId } from "@/middleware/auth";
// import { uploadRateLimit } from '@/middleware/rateLimit' // Temporarily disabled for testing
import { fileSecurityMiddleware } from "@/middleware/fileSecurity";
import { logger } from "@/lib/logger";
import * as fs from "fs/promises";
import { createReadStream } from "fs";
import * as readline from "readline";
import * as path from "path";
import * as crypto from "crypto";
import { env } from "@/config/env";

const dictionariesRouter = new Hono();

dictionariesRouter.use("*", authenticate);

export { dictionariesRouter as dictionariesRoutes };

// GET all dictionaries - user's own dictionaries
dictionariesRouter.get("/", async (c) => {
  const userId = getUserId(c);
  try {
    const allDictionaries = await db.query.dictionaries.findMany({
      where: eq(dictionariesSchema.userId, userId),
      orderBy: [desc(dictionariesSchema.createdAt)],
    });
    return c.json({
      success: true,
      data: allDictionaries,
      count: allDictionaries.length,
    });
  } catch (error) {
    logger.error(
      "Get dictionaries error",
      "dictionaries",
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch dictionaries",
      },
      500,
    );
  }
});

// GET single dictionary by ID - user must own it
dictionariesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = getUserId(c);
  try {
    const dictionary = await db.query.dictionaries.findFirst({
      where: eq(dictionariesSchema.id, id),
    });
    if (!dictionary) {
      return c.json(
        {
          success: false,
          error: "Dictionary not found",
        },
        404,
      );
    }
    if (dictionary.userId !== userId) {
      return c.json(
        {
          success: false,
          error: "Access denied",
        },
        403,
      );
    }
    return c.json({
      success: true,
      data: dictionary,
    });
  } catch (error) {
    logger.error(
      "Get dictionary error",
      "dictionaries",
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json(
      {
        success: false,
        error: "Failed to fetch dictionary",
      },
      500,
    );
  }
});

// Helper function to parse size strings like "10GB" to bytes
function parseSizeToBytes(sizeStr: string): number {
  const units: { [key: string]: number } = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
  };
  const match = sizeStr.match(/^(\d+(\.\d+)?)\s*(B|KB|MB|GB)$/i);
  if (!match) {
    return 10 * 1024 * 1024 * 1024;
  }
  const value = parseFloat(match[1]);
  const unit = match[3].toUpperCase();
  return value * (units[unit] || 1);
}

// Upload dictionary file validation schema
const uploadDictionarySchema = z.object({
  file: z.instanceof(File).refine(
    (file) => {
      const maxSize = parseSizeToBytes(env.MAX_DICTIONARY_SIZE);
      return file.size <= maxSize;
    },
    {
      message:
        "File size must be less than " + (env.MAX_DICTIONARY_SIZE || "10GB"),
    },
  ),
  name: z.string().min(1).max(255).optional(),
  metadata: z.record(z.string()).optional(),
});

// Helper function to count lines in a file using streaming (memory-efficient)
async function countLines(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      let lineCount = 0;
      const stream = createReadStream(filePath, { encoding: "utf-8" });
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      rl.on("line", (line) => {
        // Only count non-empty lines
        if (line.trim().length > 0) {
          lineCount++;
        }
      });

      rl.on("close", () => {
        resolve(lineCount);
      });

      rl.on("error", (error) => {
        logger.warn("Failed to count lines in dictionary", "dictionaries", {
          filePath,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        resolve(0); // Return 0 on error instead of rejecting
      });

      stream.on("error", (error) => {
        logger.warn("Failed to read dictionary file", "dictionaries", {
          filePath,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        resolve(0); // Return 0 on error instead of rejecting
      });
    } catch (error) {
      logger.warn("Failed to count lines in dictionary", "dictionaries", {
        filePath,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      resolve(0);
    }
  });
}

// Helper function to calculate file checksum
async function calculateChecksum(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  } catch (error) {
    logger.warn("Failed to calculate checksum", "dictionaries", {
      filePath,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return "";
  }
}

// POST upload a dictionary file
dictionariesRouter.post(
  "/upload",
  fileSecurityMiddleware({
    maxFileSize: 10 * 1024 * 1024 * 1024,
    allowedExtensions: [".txt", ".lst", ".dict", ".wordlist"],
    allowedMimeTypes: ["text/plain", "application/octet-stream"],
    scanFiles: true,
    virusScanning: false,
    enableDeepScanning: true,
  }),
  zValidator("form", uploadDictionarySchema),
  async (c) => {
    const userId = getUserId(c);
    try {
      const { file, name, metadata } = c.req.valid("form");
      const dictionaryName = name || file.name.replace(/\.[^/.]+$/, "");
      const uploadDir = path.join(env.UPLOAD_DIR, "dictionaries", userId);
      await fs.mkdir(uploadDir, { recursive: true });
      const fileBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(fileBuffer);
      const fileName = Date.now() + "-" + file.name;
      const filePath = path.join(uploadDir, fileName);
      await fs.writeFile(filePath, buffer);
      await fs.chmod(filePath, 0o600);
      logger.info("Dictionary file uploaded", "dictionaries", {
        userId,
        fileName,
        originalName: file.name,
        fileSize: file.size,
      });
      const [wordCount, checksum] = await Promise.all([
        countLines(filePath),
        calculateChecksum(filePath),
      ]);
      const [dictionaryRecord] = await db
        .insert(dictionariesSchema)
        .values({
          name: dictionaryName,
          filename: fileName,
          type: "uploaded",
          status: "ready",
          size: file.size,
          wordCount,
          encoding: "utf-8",
          checksum,
          filePath,
          userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      logger.info("Dictionary created", "dictionaries", {
        dictionaryId: dictionaryRecord.id,
        userId,
        name: dictionaryName,
        wordCount,
        size: file.size,
      });
      return c.json({
        success: true,
        message: "Dictionary uploaded successfully",
        data: dictionaryRecord,
      });
    } catch (error) {
      logger.error(
        "Dictionary upload error",
        "dictionaries",
        error instanceof Error ? error : new Error(String(error)),
        {
          userId,
          fileName: c.req.valid("form")?.file?.name,
        },
      );
      if (
        error instanceof Error &&
        error.message.includes("INVALID_FILE_TYPE")
      ) {
        return c.json(
          {
            success: false,
            error: "Invalid file type",
            message: error.message,
            code: "INVALID_FILE_TYPE",
          },
          400,
        );
      }
      return c.json(
        {
          success: false,
          error: "Dictionary upload failed",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  },
);

// DELETE /api/dictionaries/:id - Delete a dictionary
dictionariesRouter.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  try {
    const [dictionary] = await db
      .select()
      .from(dictionariesSchema)
      .where(eq(dictionariesSchema.id, id))
      .limit(1);

    if (!dictionary) {
      return c.json(
        {
          success: false,
          error: "Dictionary not found",
        },
        404,
      );
    }

    if (dictionary.userId !== userId) {
      return c.json(
        {
          success: false,
          error: "Access denied",
        },
        403,
      );
    }

    if (dictionary.filePath) {
      try {
        await fs.unlink(dictionary.filePath);
        logger.info("Dictionary file deleted", "dictionaries", {
          dictionaryId: id,
          filePath: dictionary.filePath,
        });
      } catch (fileError) {
        logger.warn("Failed to delete dictionary file", "dictionaries", {
          dictionaryId: id,
          filePath: dictionary.filePath,
          error:
            fileError instanceof Error ? fileError.message : "Unknown error",
        });
      }
    }

    await db.delete(dictionariesSchema).where(eq(dictionariesSchema.id, id));
    logger.info("Dictionary deleted", "dictionaries", {
      dictionaryId: id,
      userId,
      name: dictionary.name,
    });

    return c.json({
      success: true,
      message: "Dictionary deleted successfully",
    });
  } catch (error) {
    logger.error(
      "Delete dictionary error",
      "dictionaries",
      error instanceof Error ? error : new Error(String(error)),
      {
        dictionaryId: id,
        userId,
      },
    );
    return c.json(
      {
        success: false,
        error: "Failed to delete dictionary",
      },
      500,
    );
  }
});

// POST /api/dictionaries/merge - Combine multiple dictionaries
dictionariesRouter.post(
  "/merge",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(255),
      dictionaryIds: z.array(z.string()).min(2).max(10),
      removeDuplicates: z.boolean().optional().default(true),
      validationRules: z
        .object({
          minLength: z.number().min(1).optional(),
          maxLength: z.number().min(1).optional(),
          excludePatterns: z.array(z.string()).optional(),
        })
        .optional(),
    }),
  ),
  async (c) => {
    const userId = getUserId(c);
    const { name, dictionaryIds, removeDuplicates, validationRules } =
      c.req.valid("json");
    try {
      const dictionariesToMerge = await db.query.dictionaries.findMany({
        where: and(
          eq(dictionariesSchema.userId, userId),
          eq(dictionariesSchema.status, "ready"),
        ),
      });
      const foundIds = new Set(dictionariesToMerge.map((d) => d.id));
      const missingIds = dictionaryIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        return c.json(
          {
            success: false,
            error: "Some dictionaries not found or inaccessible",
            message:
              "The following dictionaries could not be found: " +
              missingIds.join(", "),
          },
          404,
        );
      }
      if (dictionariesToMerge.length < 2) {
        return c.json(
          {
            success: false,
            error: "Insufficient dictionaries",
            message: "At least 2 dictionaries are required for merging",
          },
          400,
        );
      }
      logger.info("Starting dictionary merge", "dictionaries", {
        userId,
        dictionaryName: name,
        dictionaryCount: dictionaryIds.length,
      });
      const allWords: string[] = [];
      let totalSize = 0;
      for (const dictionary of dictionariesToMerge) {
        if (!dictionary.filePath) continue;
        try {
          const content = await fs.readFile(dictionary.filePath, "utf-8");
          const lines = content
            .split("\n")
            .filter((line) => line.trim().length > 0);
          allWords.push(...lines);
          totalSize += content.length;
        } catch (error) {
          logger.warn(
            "Failed to read dictionary " + dictionary.id,
            "dictionaries",
            {
              error: error instanceof Error ? error.message : "Unknown error",
            },
          );
        }
      }
      let mergedWords = allWords;
      if (validationRules) {
        if (validationRules.minLength) {
          mergedWords = mergedWords.filter(
            (w) => w.length >= validationRules.minLength!,
          );
        }
        if (validationRules.maxLength) {
          mergedWords = mergedWords.filter(
            (w) => w.length <= validationRules.maxLength!,
          );
        }
        if (validationRules.excludePatterns) {
          const regexPatterns = validationRules.excludePatterns.map(
            (pattern) => new RegExp(pattern, "i"),
          );
          mergedWords = mergedWords.filter(
            (word) => !regexPatterns.some((regex) => regex.test(word)),
          );
        }
      }
      if (removeDuplicates) {
        const uniqueWords = new Set(mergedWords);
        mergedWords = Array.from(uniqueWords);
      }
      if (mergedWords.length === 0) {
        return c.json(
          {
            success: false,
            error: "Merge resulted in empty dictionary",
            message: "No words remain after applying filters and deduplication",
          },
          400,
        );
      }
      const mergedContent = mergedWords.join("\n");
      const checksum = crypto
        .createHash("sha256")
        .update(mergedContent)
        .digest("hex");
      const uploadDir = path.join(env.UPLOAD_DIR, "dictionaries", userId);
      await fs.mkdir(uploadDir, { recursive: true });
      const fileName =
        Date.now() + "-" + name.replace(/[^a-zA-Z0-9]/g, "_") + ".txt";
      const filePath = path.join(uploadDir, fileName);
      await fs.writeFile(filePath, mergedContent, "utf-8");
      await fs.chmod(filePath, 0o600);
      const [newDictionary] = await db
        .insert(dictionariesSchema)
        .values({
          name,
          filename: fileName,
          type: "generated",
          status: "ready",
          size: mergedContent.length,
          wordCount: mergedWords.length,
          encoding: "utf-8",
          checksum,
          filePath,
          userId,
          processingConfig: {
            merge: {
              sourceDictionaries: dictionaryIds,
              originalWordCount: allWords.length,
              finalWordCount: mergedWords.length,
              removedDuplicates: removeDuplicates
                ? allWords.length - mergedWords.length
                : 0,
              validationRules,
              mergedAt: new Date().toISOString(),
            },
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      logger.info("Dictionary merged successfully", "dictionaries", {
        dictionaryId: newDictionary.id,
        userId,
        name,
        sourceDictionaries: dictionaryIds.length,
        totalWords: mergedWords.length,
      });
      return c.json({
        success: true,
        message: "Dictionary merged successfully",
        data: newDictionary,
      });
    } catch (error) {
      logger.error(
        "Dictionary merge error",
        "dictionaries",
        error instanceof Error ? error : new Error(String(error)),
        {
          userId,
          dictionaryName: c.req.valid("json")?.name,
        },
      );
      return c.json(
        {
          success: false,
          error: "Failed to merge dictionaries",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500,
      );
    }
  },
);

// POST /api/dictionaries/:id/validate - Validate and clean a dictionary
dictionariesRouter.post("/:id/validate", async (c) => {
  const id = c.req.param("id");
  const userId = getUserId(c);
  try {
    const dictionary = await db.query.dictionaries.findFirst({
      where: eq(dictionariesSchema.id, id),
    });
    if (!dictionary) {
      return c.json(
        {
          success: false,
          error: "Dictionary not found",
        },
        404,
      );
    }
    if (dictionary.userId !== userId) {
      return c.json(
        {
          success: false,
          error: "Access denied",
        },
        403,
      );
    }
    if (!dictionary.filePath) {
      return c.json(
        {
          success: false,
          error: "Dictionary file not available",
          message:
            "This dictionary was generated or processed and does not have a source file to validate",
        },
        400,
      );
    }
    logger.info("Validating dictionary", "dictionaries", {
      dictionaryId: id,
      userId,
    });
    const content = await fs.readFile(dictionary.filePath, "utf-8");
    const lines = content.split("\n");
    const originalWordCount = lines.length;
    let validWords: string[] = [];
    let invalidWords: string[] = [];
    let duplicateWords: string[] = [];
    const seenWords = new Set<string>();
    const validPatterns = [
      /^[a-zA-Z0-9]+$/,
      /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{}|;:\'",.<>\/?]+$/,
    ];
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0) continue;
      const isValid = validPatterns.some((pattern) =>
        pattern.test(trimmedLine),
      );
      if (!isValid) {
        invalidWords.push(trimmedLine);
        continue;
      }
      if (seenWords.has(trimmedLine.toLowerCase())) {
        duplicateWords.push(trimmedLine);
        continue;
      }
      seenWords.add(trimmedLine.toLowerCase());
      validWords.push(trimmedLine);
    }
    const validatedContent = validWords.join("\n");
    const checksum = crypto
      .createHash("sha256")
      .update(validatedContent)
      .digest("hex");
    const uploadDir = path.join(env.UPLOAD_DIR, "dictionaries", userId);
    await fs.mkdir(uploadDir, { recursive: true });
    const fileName =
      Date.now() +
      "-" +
      dictionary.name.replace(/[^a-zA-Z0-9]/g, "_") +
      "-validated.txt";
    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, validatedContent, "utf-8");
    await fs.chmod(filePath, 0o600);
    const [validatedDictionary] = await db
      .insert(dictionariesSchema)
      .values({
        name: dictionary.name + " (validated)",
        filename: fileName,
        type: "generated",
        status: "ready",
        size: validatedContent.length,
        wordCount: validWords.length,
        encoding: "utf-8",
        checksum,
        filePath,
        userId,
        processingConfig: {
          validation: {
            sourceDictionaryId: id,
            originalWordCount,
            validWordCount: validWords.length,
            invalidWordCount: invalidWords.length,
            duplicateWordCount: duplicateWords.length,
            invalidWords: invalidWords.slice(0, 100),
            duplicateWords: duplicateWords.slice(0, 100),
            validatedAt: new Date().toISOString(),
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    logger.info("Dictionary validated successfully", "dictionaries", {
      dictionaryId: validatedDictionary.id,
      userId,
      originalDictionaryId: id,
      validWords: validWords.length,
      invalidWords: invalidWords.length,
      duplicateWords: duplicateWords.length,
    });
    return c.json({
      success: true,
      message: "Dictionary validated and cleaned successfully",
      data: validatedDictionary,
      stats: {
        originalWords: originalWordCount,
        validWords: validWords.length,
        invalidWords: invalidWords.length,
        duplicateWords: duplicateWords.length,
        removedWords: originalWordCount - validWords.length,
      },
    });
  } catch (error) {
    logger.error(
      "Dictionary validation error",
      "dictionaries",
      error instanceof Error ? error : new Error(String(error)),
      {
        dictionaryId: id,
        userId,
      },
    );
    return c.json(
      {
        success: false,
        error: "Failed to validate dictionary",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// GET /api/dictionaries/:id/statistics - Get detailed statistics for a dictionary
dictionariesRouter.get("/:id/statistics", async (c) => {
  try {
    const dictionaryId = c.req.param("id");
    const dictionary = await db.query.dictionaries.findFirst({
      where: eq(dictionariesSchema.id, dictionaryId),
    });

    if (!dictionary) {
      return c.json(
        {
          success: false,
          error: "Dictionary not found",
        },
        404,
      );
    }

    if (dictionary.userId !== getUserId(c)) {
      return c.json(
        {
          success: false,
          error: "Access denied",
        },
        403,
      );
    }

    return c.json({
      success: true,
      data: {
        basic: {
          wordCount: dictionary.wordCount,
          size: dictionary.size,
          encoding: dictionary.encoding,
        },
        frequency: [],
        size: dictionary.size,
        timestamp: dictionary.createdAt.getTime(),
      },
    });
  } catch (error) {
    logger.error(
      "Failed to get dictionary statistics",
      "dictionaries",
      error instanceof Error ? error : new Error(String(error)),
    );
    return c.json(
      {
        success: false,
        error: "Failed to get dictionary statistics",
      },
      500,
    );
  }
});
