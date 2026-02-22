/**
 * Zod schemas for JSONB field validation
 *
 * This file contains Zod schemas for validating JSONB data stored in the database.
 * These schemas ensure type safety and data integrity for complex JSON structures.
 */

import { z } from "zod";

// ============================================================================
// Dictionary Processing Config Schema
// ============================================================================

/**
 * Schema for dictionary processing configuration
 * Used in: dictionaries.processingConfig
 */
export const dictionaryProcessingConfigSchema = z
  .object({
    // Generation options
    baseWords: z
      .array(z.string())
      .optional()
      .describe("Base words for dictionary generation"),
    rules: z.array(z.string()).optional().describe("Hashcat rules to apply"),
    transformations: z
      .array(
        z.enum([
          "lowercase",
          "uppercase",
          "capitalize",
          "leet",
          "reverse",
          "append_numbers",
          "append_special",
          "prepend_numbers",
          "prepend_special",
        ]),
      )
      .optional()
      .describe("Text transformations to apply"),

    // Upload processing options
    encoding: z.string().optional().default("utf-8").describe("File encoding"),
    deduplication: z
      .boolean()
      .optional()
      .default(true)
      .describe("Remove duplicate entries"),
    minWordLength: z
      .number()
      .int()
      .min(1)
      .optional()
      .default(1)
      .describe("Minimum word length"),
    maxWordLength: z
      .number()
      .int()
      .max(256)
      .optional()
      .default(256)
      .describe("Maximum word length"),

    // Advanced options
    customRules: z
      .record(z.string())
      .optional()
      .describe("Custom transformation rules"),
    metadata: z.record(z.unknown()).optional().describe("Additional metadata"),
  })
  .strict()
  .describe("Dictionary processing configuration");

export type DictionaryProcessingConfig = z.infer<
  typeof dictionaryProcessingConfigSchema
>;

// ============================================================================
// Job Config Schema
// ============================================================================

/**
 * Schema for job configuration
 * Used in: jobs.config (notNull)
 */
export const jobConfigSchema = z
  .object({
    // Attack configuration
    attackMode: z
      .enum([
        "pmkid",
        "handshake",
        "dictionary",
        "mask",
        "hybrid",
        "combinator",
      ])
      .describe("Hashcat attack mode"),
    hashcatMode: z
      .number()
      .int()
      .min(0)
      .max(99999)
      .describe("Hashcat hash mode (e.g., 22000 for WPA)"),

    // Target information
    targetFile: z
      .string()
      .optional()
      .describe("Path to target file (handshake/hash)"),
    networkId: z.string().uuid().optional().describe("Target network UUID"),
    dictionaryId: z.string().uuid().optional().describe("Dictionary UUID"),

    // Hashcat options
    workloadProfile: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .default(3)
      .describe("Hashcat workload profile (1=low, 4=nightmare)"),
    optimizedKernel: z
      .boolean()
      .optional()
      .default(true)
      .describe("Use optimized kernel (-O)"),
    rulesFile: z.string().optional().describe("Path to rules file"),
    mask: z
      .string()
      .optional()
      .describe("Mask for mask attack (e.g., ?a?a?a?a?a?a)"),

    // Resource limits
    runtime: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(3600)
      .describe("Maximum runtime in seconds"),
    sessionTimeout: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Session timeout in seconds"),

    // Advanced options
    customArgs: z
      .array(z.string())
      .optional()
      .describe("Additional hashcat arguments"),
    gpuDevices: z
      .array(z.number().int())
      .optional()
      .describe("GPU device IDs to use"),
    cpuAffinity: z
      .array(z.number().int())
      .optional()
      .describe("CPU cores to use"),

    // Job priority and organization
    priority: z
      .enum(["low", "normal", "high", "critical"])
      .optional()
      .default("normal")
      .describe("Job priority in queue"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Job tags for organization and filtering"),
    metadata: z.record(z.unknown()).optional().describe("Additional metadata"),
  })
  .strict()
  .describe("Job configuration");

export type JobConfig = z.infer<typeof jobConfigSchema>;

// ============================================================================
// Job Result Schema
// ============================================================================

/**
 * Schema for job results
 * Used in: jobs.result (nullable)
 */
export const jobResultSchema = z
  .object({
    // Success information
    success: z.boolean().describe("Whether the job completed successfully"),
    crackedPassword: z
      .string()
      .optional()
      .describe("The cracked password (if found)"),
    passwordsFound: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe("Number of passwords found"),

    // Performance metrics
    processingTime: z
      .number()
      .int()
      .min(0)
      .describe("Total processing time in milliseconds"),
    hashesTotal: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Total number of hashes processed"),
    hashesCracked: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Number of hashes cracked"),
    recoveredPercentage: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Percentage of hashes recovered"),

    // Hashcat statistics
    speed: z
      .object({
        value: z.number().min(0).describe("Hashes per second"),
        unit: z.enum(["H/s", "kH/s", "MH/s", "GH/s"]).describe("Speed unit"),
      })
      .optional()
      .describe("Cracking speed"),

    devices: z
      .array(
        z.object({
          id: z.number().int().describe("Device ID"),
          name: z.string().describe("Device name"),
          type: z.enum(["CPU", "GPU"]).describe("Device type"),
          temperature: z
            .number()
            .int()
            .optional()
            .describe("Temperature in Celsius"),
          utilization: z
            .number()
            .min(0)
            .max(100)
            .optional()
            .describe("Utilization percentage"),
        }),
      )
      .optional()
      .describe("Device information"),

    // Error information (if failed)
    error: z.string().optional().describe("Error message if job failed"),
    errorCode: z.string().optional().describe("Error code for categorization"),
    errorDetails: z
      .record(z.unknown())
      .optional()
      .describe("Additional error details"),

    // Output files
    outputFiles: z
      .array(
        z.object({
          type: z
            .enum(["potfile", "output", "log", "restore"])
            .describe("File type"),
          path: z.string().describe("File path"),
          size: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("File size in bytes"),
        }),
      )
      .optional()
      .describe("Generated output files"),

    // Additional metadata
    exitCode: z.number().int().optional().describe("Hashcat exit code"),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Additional result metadata"),
  })
  .strict()
  .describe("Job result data");

export type JobResult = z.infer<typeof jobResultSchema>;

// ============================================================================
// Job Result Data Schema (for jobResults table)
// ============================================================================

/**
 * Schema for individual job result entries
 * Used in: jobResults.data (notNull)
 */
export const jobResultDataSchema = z
  .object({
    // Result type and identification
    type: z
      .enum(["password", "hash", "handshake", "error", "progress"])
      .describe("Type of result entry"),

    // Password cracking result
    hash: z.string().optional().describe("The original hash value"),
    password: z.string().optional().describe("The cracked password"),
    plaintext: z.string().optional().describe("The plaintext value"),

    // Handshake information
    ssid: z.string().optional().describe("Network SSID"),
    bssid: z.string().optional().describe("Network BSSID (MAC address)"),
    clientMac: z.string().optional().describe("Client MAC address"),

    // Timing and performance
    timestamp: z
      .string()
      .datetime()
      .optional()
      .describe("When this result was generated"),
    processingTime: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Time to crack in milliseconds"),
    keyspace: z
      .object({
        position: z.number().int().min(0).describe("Current keyspace position"),
        total: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Total keyspace size"),
      })
      .optional()
      .describe("Keyspace progress information"),

    // Progress updates (for type='progress')
    progress: z
      .object({
        percentage: z.number().min(0).max(100).describe("Progress percentage"),
        currentSpeed: z
          .number()
          .min(0)
          .optional()
          .describe("Current cracking speed"),
        timeRemaining: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Estimated time remaining in seconds"),
        status: z.string().optional().describe("Current status message"),
      })
      .optional()
      .describe("Progress information"),

    // Error information (for type='error')
    error: z.string().optional().describe("Error message"),
    errorCode: z.string().optional().describe("Error code"),

    // Method and context
    attackMode: z.string().optional().describe("Attack mode used"),
    hashMode: z.number().int().optional().describe("Hash mode used"),
    dictionaryName: z.string().optional().describe("Dictionary name used"),

    // Additional metadata
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Additional result metadata"),
  })
  .strict()
  .describe("Job result entry data");

export type JobResultData = z.infer<typeof jobResultDataSchema>;

// ============================================================================
// Job Progress Metadata Schema
// ============================================================================

/**
 * Schema for job progress metadata
 * Used in: jobs.progressMetadata (nullable)
 */
export const jobProgressMetadataSchema = z
  .object({
    stage: z
      .enum([
        "validation",
        "extraction",
        "preparation",
        "cracking",
        "parsing",
        "completed",
      ])
      .optional()
      .describe("Current stage of job execution"),
    stageProgress: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Progress percentage within current stage"),
    currentAction: z
      .string()
      .optional()
      .describe("Human-readable description of current action"),
    eta: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Estimated time remaining in seconds"),
    passwordsTested: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Number of passwords tested so far"),
    passwordsPerSecond: z
      .number()
      .min(0)
      .optional()
      .describe("Current cracking speed in passwords per second"),
    dictionaryProgress: z
      .object({
        current: z
          .number()
          .int()
          .min(0)
          .describe("Current position in dictionary"),
        total: z.number().int().min(0).describe("Total dictionary size"),
      })
      .optional()
      .describe("Progress through dictionary"),
    hashcatStatus: z
      .object({
        recovered: z
          .string()
          .optional()
          .describe("Recovered hashes (e.g., '0/1')"),
        speed: z.string().optional().describe("Speed unit (e.g., 'MH/s')"),
        progress: z
          .string()
          .optional()
          .describe("Progress string from hashcat"),
      })
      .optional()
      .describe("Raw hashcat status information"),
  })
  .strict()
  .describe("Job progress metadata for real-time tracking");

export type JobProgressMetadata = z.infer<typeof jobProgressMetadataSchema>;

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Validates dictionary processing config and returns typed result
 */
export function validateDictionaryProcessingConfig(
  data: unknown,
): DictionaryProcessingConfig | null {
  if (!data) return null;

  const result = dictionaryProcessingConfigSchema.safeParse(data);
  if (!result.success) {
    console.error(
      "Dictionary processing config validation failed:",
      result.error.format(),
    );
    return null;
  }

  return result.data;
}

/**
 * Validates job config and returns typed result
 * @throws Error if validation fails (config is required)
 */
export function validateJobConfig(data: unknown): JobConfig {
  const result = jobConfigSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Job config validation failed: ${JSON.stringify(result.error.format())}`,
    );
  }

  return result.data;
}

/**
 * Validates job result and returns typed result
 */
export function validateJobResult(data: unknown): JobResult | null {
  if (!data) return null;

  const result = jobResultSchema.safeParse(data);
  if (!result.success) {
    console.error("Job result validation failed:", result.error.format());
    return null;
  }

  return result.data;
}

/**
 * Validates job result data and returns typed result
 * @throws Error if validation fails (data is required)
 */
export function validateJobResultData(data: unknown): JobResultData {
  const result = jobResultDataSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Job result data validation failed: ${JSON.stringify(result.error.format())}`,
    );
  }

  return result.data;
}

/**
 * Validates job progress metadata and returns typed result
 */
export function validateJobProgressMetadata(
  data: unknown,
): JobProgressMetadata | null {
  if (!data) return null;

  const result = jobProgressMetadataSchema.safeParse(data);
  if (!result.success) {
    console.error(
      "Job progress metadata validation failed:",
      result.error.format(),
    );
    return null;
  }

  return result.data;
}

// ============================================================================
// Schema Exports for Direct Use
// ============================================================================

export const JSONB_SCHEMAS = {
  dictionaryProcessingConfig: dictionaryProcessingConfigSchema,
  jobConfig: jobConfigSchema,
  jobResult: jobResultSchema,
  jobResultData: jobResultDataSchema,
  jobProgressMetadata: jobProgressMetadataSchema,
} as const;
