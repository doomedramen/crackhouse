import { exec, spawn } from "child_process";
import { promisify } from "util";
import { db } from "../db";
import { jobs, jobResults, networks, users } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { promises as fs } from "fs";
import path from "path";
import {
  validateFilePath,
  quotePathForShell,
  createSafePath,
} from "../lib/file-path-validator";
import { logger } from "../lib/logger";
import { getWebSocketServer } from "../lib/websocket";
import { configService } from "../services/config.service";
import { emailQueue } from "../lib/email-queue";
import { env } from "@/config/env";

const execAsync = promisify(exec);

// ============================================================================
// Hashcat Status Parsing
// ============================================================================

interface HashcatStatus {
  progress: number;
  passwordsTested: number;
  totalPasswords: number;
  speed: number;
  speedUnit: string;
  eta: number;
  recovered: string;
  status: string;
}

/**
 * Parse hashcat status output to extract progress metrics
 * Parses hashcat's status output format to extract real-time progress information
 */
function parseHashcatStatus(output: string): Partial<HashcatStatus> {
  const status: Partial<HashcatStatus> = {};

  // Progress: 1234567/10000000 (12.35%)
  const progressMatch = output.match(
    /Progress\.*:\s*(\d+)\/(\d+)\s*\((\d+\.?\d*)%\)/,
  );
  if (progressMatch) {
    status.passwordsTested = parseInt(progressMatch[1], 10);
    status.totalPasswords = parseInt(progressMatch[2], 10);
    status.progress = parseFloat(progressMatch[3]);
  }

  // Speed.#1.........: 123.45 MH/s
  const speedMatch = output.match(/Speed\.#\d+\.*:\s*([\d.]+)\s*([kMGT]?H\/s)/);
  if (speedMatch) {
    const speedValue = parseFloat(speedMatch[1]);
    const unit = speedMatch[2];
    const multipliers: Record<string, number> = {
      "H/s": 1,
      "kH/s": 1000,
      "MH/s": 1000000,
      "GH/s": 1000000000,
    };
    status.speed = speedValue * (multipliers[unit] || 1);
    status.speedUnit = unit;
  }

  // Recovered........: 0/1 (0.00%)
  const recoveredMatch = output.match(/Recovered\.*:\s*(\d+\/\d+)/);
  if (recoveredMatch) {
    status.recovered = recoveredMatch[1];
  }

  // Time.Estimated...: (30 mins, 15 secs)
  const etaMatch = output.match(
    /Time\.Estimated\.*:.*?\((\d+)\s*mins?,\s*(\d+)\s*secs?\)/,
  );
  if (etaMatch) {
    status.eta = parseInt(etaMatch[1], 10) * 60 + parseInt(etaMatch[2], 10);
  }

  return status;
}

interface BuildHashcatCommandOptions {
  attackMode: "pmkid" | "handshake";
  handshakePath: string;
  dictionaryPath: string;
  jobId: string;
  optimized?: boolean;
  force?: boolean;
  runtime?: number;
}

export async function buildHashcatCommand({
  attackMode,
  handshakePath,
  dictionaryPath,
  jobId,
  optimized = true,
  force = true,
  runtime = 3600,
}: BuildHashcatCommandOptions): Promise<string> {
  const workDir = path.join(process.cwd(), "temp", "hashcat", jobId);
  const outputFile = path.join(workDir, "hashcat_output.txt");
  const potfilePath = path.join(workDir, "hashcat.pot");

  const mode = attackMode === "pmkid" ? 16800 : 22000;

  const parts = [
    "hashcat",
    `-m ${mode}`,
    "-a 0",
    "--quiet",
    force ? "--force" : "",
    optimized ? "-O" : "",
    optimized ? "-w 4" : "",
    `--runtime=${runtime}`,
    `--session=${jobId}`,
    `-o ${outputFile}`,
    `--potfile-path=${potfilePath}`,
    handshakePath,
    dictionaryPath,
  ].filter(Boolean);

  return parts.join(" ");
}

interface RunHashcatAttackOptions {
  jobId: string;
  networkId: string;
  dictionaryId: string;
  handshakePath: string;
  dictionaryPath: string;
  attackMode: "pmkid" | "handshake";
  userId: string;
}

export async function runHashcatAttack({
  jobId,
  networkId,
  dictionaryId,
  handshakePath,
  dictionaryPath,
  attackMode,
  userId,
}: RunHashcatAttackOptions) {
  const startTime = new Date();

  try {
    logger.info("Starting Hashcat attack", "hashcat", {
      jobId,
      networkId,
      dictionaryId,
      attackMode,
      userId,
      startTime: startTime.toISOString(),
    });

    // Validate job and network ownership
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.userId, userId)),
    });

    if (!job) {
      throw new Error(`Job ${jobId} not found or access denied`);
    }

    // Check if job is already cancelled
    if (job.status === "cancelled") {
      logger.info("Job is already cancelled, skipping execution", "hashcat", {
        jobId,
      });

      await db
        .update(networks)
        .set({
          status: "ready",
          updatedAt: new Date(),
        })
        .where(eq(networks.id, networkId));

      return {
        success: false,
        cancelled: true,
        message: "Job was cancelled before execution",
      };
    }

    const network = await db.query.networks.findFirst({
      where: and(eq(networks.id, networkId), eq(networks.userId, userId)),
    });

    if (!network) {
      throw new Error(`Network ${networkId} not found or access denied`);
    }

    // Check job dependencies
    if (job.dependsOn && job.dependsOn.length > 0) {
      const dependencyIds = job.dependsOn;

      for (const depId of dependencyIds) {
        const depJob = await db.query.jobs.findFirst({
          where: eq(jobs.id, depId),
        });

        if (!depJob || depJob.status !== "completed") {
          logger.info(
            "Job dependencies not met, skipping execution",
            "hashcat",
            {
              jobId,
              dependencies: dependencyIds,
            },
          );

          return {
            success: false,
            skipped: true,
            message:
              "Job dependencies not met, job will be queued again when dependencies complete",
            dependencies: dependencyIds,
          };
        }
      }

      logger.info("Job dependencies verified", "hashcat", {
        jobId,
        dependencies: dependencyIds,
      });
    }

    // Check if job is scheduled for later
    if (job.scheduledAt && new Date(job.scheduledAt) > new Date()) {
      logger.info("Job scheduled for later, skipping execution", "hashcat", {
        jobId,
        scheduledAt: job.scheduledAt,
      });

      return {
        success: false,
        scheduled: true,
        message: "Job is scheduled for future execution",
        scheduledAt: job.scheduledAt,
      };
    }

    logger.info("Job and network validation passed", "hashcat", {
      jobId,
      networkId,
      networkSSID: network.ssid,
      networkBSSID: network.bssid,
    });

    // Update job status to running or scheduled
    const targetStatus = job.scheduledAt ? "scheduled" : "running";

    await db
      .update(jobs)
      .set({
        status: targetStatus,
        startTime: job.scheduledAt ? null : new Date(),
        scheduledAt: job.scheduledAt || null,
        updatedAt: new Date(),
        progress: 0,
      })
      .where(eq(jobs.id, jobId));

    logger.info(`Job status updated to ${targetStatus}`, "hashcat", {
      jobId,
      status: targetStatus,
    });

    // Ensure handshake/PMKID files exist and are properly extracted
    // The network.key field contains the HC22000 hash line from PCAP processing
    const validatedAttackFile = await ensureAttackFileExists(
      handshakePath,
      attackMode,
      network.bssid!,
      network.key, // Pass the HC22000 hash line from the database
    );

    // SECURITY: Validate file paths before using them
    logger.info("Validating file paths for hashcat attack", "hashcat", {
      jobId,
      userId,
      originalHandshakePath: handshakePath,
      validatedAttackFile,
      dictionaryPath,
    });

    // Validate attack file path
    // Note: UPLOAD_DIR may be set to different paths (e.g., ./uploads/test for tests)
    const uploadDir = env.UPLOAD_DIR.replace(/^\.\//, "");
    const validatedHandshakePath = await validateFilePath(validatedAttackFile, {
      allowedBasePaths: [
        "temp/handshakes",
        "data/handshakes",
        "uploads/handshakes",
        `${uploadDir}/captures`, // PCAP processing creates HC22000 files here
        `${uploadDir}/handshakes`,
        "temp/pmkids",
      ],
      allowedExtensions: [".hc22000", ".cap", ".pcap", ".pmkid"],
      mustExist: true,
      allowSymlinks: false,
    });

    // Validate dictionary file path
    const validatedDictionaryPath = await validateFilePath(dictionaryPath, {
      allowedBasePaths: [
        "temp/dictionaries",
        "data/dictionaries",
        "uploads/dictionaries",
        `${uploadDir}/dictionaries`,
        "/tmp", // Consolidated dictionaries are created in /tmp
      ],
      allowedExtensions: [".txt", ".lst", ".dict"],
      mustExist: true,
      allowSymlinks: false,
    });

    logger.info("File paths validated successfully", "hashcat", {
      jobId,
      validatedHandshakePath,
      validatedDictionaryPath,
    });

    // Update job status to running
    await db
      .update(jobs)
      .set({
        status: "running",
        startTime,
        updatedAt: new Date(),
        progress: 0,
      })
      .where(eq(jobs.id, jobId));

    // Update network status
    await db
      .update(networks)
      .set({
        status: "processing",
        updatedAt: new Date(),
      })
      .where(eq(networks.id, networkId));

    logger.info("Job status updated to running", "hashcat", {
      jobId,
      networkId,
    });

    // Stage 1: Validation complete
    await smartUpdateJobProgress(jobId, 5, {
      stage: "preparation",
      currentAction: "Validating job configuration",
      stageProgress: 100,
    });

    // Prepare hashcat command with validated paths
    const hashcatCommand = await buildHashcatCommand({
      attackMode,
      handshakePath: validatedHandshakePath,
      dictionaryPath: validatedDictionaryPath,
      jobId,
    });

    logger.info("Executing hashcat command", "hashcat", {
      jobId,
      command: hashcatCommand.replace(/\s+/g, " "),
    });

    // Execute hashcat command with streaming output
    const workDir = path.join(process.cwd(), "temp", "hashcat", jobId);

    // Create working directory for hashcat output
    await fs.mkdir(workDir, { recursive: true });

    let hashcatProcess: any;
    let statusBuffer = "";
    let lastProgressUpdate = Date.now();
    const PROGRESS_UPDATE_INTERVAL = 2000; // 2 seconds
    let result;

    try {
      // Build hashcat arguments array (safer than command string)
      const hashcatArgs = [
        "-m",
        attackMode === "pmkid" ? "16800" : "22000",
        "-a",
        "0",
        "--quiet",
        "--force",
        "-O",
        "-w",
        "4",
        `--runtime=${job.config.runtime || 3600}`,
        `--session=${jobId}`,
        "-o",
        path.join(workDir, "hashcat_output.txt"),
        `--potfile-path=${path.join(workDir, "hashcat.pot")}`,
        "--potfile-disable", // Disable global potfile to ensure we always run the attack
        "--status",
        "--status-timer=2",
        validatedHandshakePath,
        validatedDictionaryPath,
      ];

      // Initial progress update
      await smartUpdateJobProgress(jobId, 0, {
        stage: "cracking",
        currentAction: "Starting hashcat...",
        stageProgress: 0,
      });

      // Spawn hashcat process for streaming output
      hashcatProcess = spawn("hashcat", hashcatArgs);

      // Process stdout data in real-time
      hashcatProcess.stdout.on("data", (data: Buffer) => {
        statusBuffer += data.toString();
        const statusBlocks = statusBuffer.split("\n\n");
        statusBuffer = statusBlocks.pop() || "";

        for (const block of statusBlocks) {
          if (block.includes("Progress") || block.includes("Speed")) {
            const status = parseHashcatStatus(block);
            const now = Date.now();

            // Throttle progress updates to every 2 seconds
            if (now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
              lastProgressUpdate = now;

              smartUpdateJobProgress(jobId, status.progress || 0, {
                stage: "cracking",
                currentAction: `Testing passwords (${status.recovered || "0/1"})`,
                stageProgress: status.progress || 0,
                eta: status.eta,
                passwordsTested: status.passwordsTested,
                passwordsPerSecond: status.speed,
                dictionaryProgress: status.totalPasswords
                  ? {
                      current: status.passwordsTested || 0,
                      total: status.totalPasswords,
                    }
                  : undefined,
                hashcatStatus: {
                  recovered: status.recovered,
                  speed: status.speedUnit,
                  progress: status.progress
                    ? `${status.progress.toFixed(2)}%`
                    : undefined,
                },
              }).catch((err) =>
                logger.warn("Failed to update progress", "hashcat", {
                  jobId,
                  error: err.message,
                }),
              );
            }
          }
        }
      });

      // Log stderr for debugging
      hashcatProcess.stderr.on("data", (data: Buffer) => {
        logger.debug("Hashcat stderr", "hashcat", {
          jobId,
          output: data.toString(),
        });
      });

      // Wait for process completion with cancellation support
      const exitCode = await new Promise<number>((resolve, reject) => {
        hashcatProcess.on("close", (code: number) => resolve(code));
        hashcatProcess.on("error", (error: Error) => reject(error));

        // Poll for cancellation every second
        const cancellationCheck = setInterval(async () => {
          try {
            const currentJob = await db.query.jobs.findFirst({
              where: eq(jobs.id, jobId),
            });
            if (currentJob?.status === "cancelled") {
              clearInterval(cancellationCheck);
              hashcatProcess.kill("SIGTERM");
              reject(new Error("Job cancelled"));
            }
          } catch (error) {
            logger.error("Cancellation check failed", "hashcat", {
              jobId,
              error,
            });
          }
        }, 1000);

        hashcatProcess.on("close", () => clearInterval(cancellationCheck));
      });

      result = { stdout: "", stderr: "", exitCode };
    } catch (execError) {
      logger.error("Hashcat execution failed", "hashcat", {
        jobId,
        error:
          execError instanceof Error ? execError : new Error(String(execError)),
      });

      // Check if job was cancelled during execution
      const currentJob = await db.query.jobs.findFirst({
        where: eq(jobs.id, jobId),
      });

      if (currentJob?.status === "cancelled") {
        logger.info("Job was cancelled during execution", "hashcat", { jobId });
        return {
          success: false,
          cancelled: true,
          message: "Job was cancelled during execution",
        };
      }

      throw execError;
    }

    // Stage 2: Hashcat completed, parsing results
    await smartUpdateJobProgress(jobId, 90, {
      stage: "parsing",
      currentAction: "Parsing hashcat output",
      stageProgress: 0,
    });

    // Process results
    const crackedPasswords = await parseHashcatOutput(result, jobId);

    logger.info("Processing hashcat results", "hashcat", {
      jobId,
      passwordsFound: crackedPasswords.length,
    });

    // Save results to database
    if (crackedPasswords.length > 0) {
      for (const password of crackedPasswords) {
        await db.insert(jobResults).values({
          jobId,
          type: "password",
          data: {
            password: password.password,
            plaintext: password.plaintext,
            attackMode,
            hashType: getHashType(attackMode),
            processingTime: password.processingTime,
            networkId,
            dictionaryId,
            userId,
          },
          createdAt: new Date(),
        });
      }

      // Update network with cracked password
      const mainPassword = crackedPasswords[0];
      await db
        .update(networks)
        .set({
          status: "ready", // Back to ready now that we have the password
          key: mainPassword.plaintext, // Store cracked password in key field
          notes: `Cracked password: ${mainPassword.plaintext}`,
          updatedAt: new Date(),
        })
        .where(eq(networks.id, networkId));

      // Update job status to completed
      await db
        .update(jobs)
        .set({
          status: "completed",
          endTime: new Date(),
          progress: 100,
          result: {
            passwordsFound: crackedPasswords.length,
            passwords: crackedPasswords.map((p) => ({
              password: p.password,
              plaintext: p.plaintext,
            })),
          },
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      // Stage 3: Completion
      await smartUpdateJobProgress(
        jobId,
        100,
        {
          stage: "completed",
          currentAction: `Found ${crackedPasswords.length} password(s)`,
          stageProgress: 100,
        },
        true,
      ); // Force immediate update

      logger.info("Hashcat attack completed successfully", "hashcat", {
        jobId,
        passwordsFound: crackedPasswords.length,
        mainPassword: mainPassword.plaintext,
      });

      // Send email notification if enabled
      try {
        const emailEnabled = await configService.getBoolean(
          "email-enabled",
          false,
        );
        const emailNotifyJobComplete = await configService.getBoolean(
          "email-notify-job-complete",
          true,
        );

        if (emailEnabled && emailNotifyJobComplete) {
          const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            columns: { email: true, name: true },
          });

          if (user) {
            await emailQueue.sendJobEmail({
              type:
                crackedPasswords.length > 0 ? "job_completed" : "job_failed",
              to: user.email,
              data: {
                name: job.name,
                jobId,
                status: crackedPasswords.length > 0 ? "completed" : "failed",
                passwordsFound: crackedPasswords.length,
                totalHashes: crackedPasswords.length,
                duration: Date.now() - new Date(job.startTime).getTime(),
              },
            });
          }
        }
      } catch (emailError) {
        logger.error("Failed to send job completion email", "hashcat", {
          jobId,
          error:
            emailError instanceof Error
              ? emailError
              : new Error(String(emailError)),
        });
      }

      return {
        success: true,
        passwordsFound: crackedPasswords.length,
        passwords: crackedPasswords.map((p) => ({
          password: p.password,
          plaintext: p.plaintext,
        })),
      };
    } else {
      // No passwords found
      await db
        .update(jobs)
        .set({
          status: "completed",
          endTime: new Date(),
          progress: 100,
          result: {
            passwordsFound: 0,
            message: "No passwords found with the provided dictionary",
          },
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      await db
        .update(networks)
        .set({
          status: "ready",
          updatedAt: new Date(),
        })
        .where(eq(networks.id, networkId));

      // Stage 3: Completion (no passwords found)
      await smartUpdateJobProgress(
        jobId,
        100,
        {
          stage: "completed",
          currentAction: "No passwords found",
          stageProgress: 100,
        },
        true,
      ); // Force immediate update

      logger.info("Hashcat attack completed - no passwords found", "hashcat", {
        jobId,
        message: "No passwords found with the provided dictionary",
      });

      return {
        success: true,
        passwordsFound: 0,
        message: "No passwords found with the provided dictionary",
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logger.error("Hashcat attack failed", "hashcat", {
      jobId,
      networkId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Update job status to failed
    await db
      .update(jobs)
      .set({
        status: "failed",
        endTime: new Date(),
        errorMessage: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    // Reset network status
    await db
      .update(networks)
      .set({
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(networks.id, networkId));

    // Send email notification if enabled
    try {
      const emailEnabled = await configService.getBoolean(
        "email-enabled",
        false,
      );
      const emailNotifyJobFailed = await configService.getBoolean(
        "email-notify-job-failed",
        true,
      );

      if (emailEnabled && emailNotifyJobFailed) {
        const user = await db.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { email: true, name: true },
        });

        if (user) {
          await emailQueue.sendJobEmail({
            type: "job_failed",
            to: user.email,
            data: {
              name: job.name,
              jobId,
              status: "failed",
              errorMessage,
            },
          });
        }
      }
    } catch (emailError) {
      logger.error("Failed to send job failure email", "hashcat", {
        jobId,
        error:
          emailError instanceof Error
            ? emailError
            : new Error(String(emailError)),
      });
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function parseHashcatOutput(result: any, jobId: string) {
  const workDir = path.join(process.cwd(), "temp", "hashcat", jobId);
  const outputFile = path.join(workDir, "hashcat_output.txt");

  logger.info("Parsing hashcat output", "hashcat", {
    jobId,
    outputFile,
  });

  try {
    // Check if output file exists and has content
    const outputExists = await fs
      .access(outputFile)
      .then(() => true)
      .catch(() => false);

    if (!outputExists) {
      logger.warn("Hashcat output file not found", "hashcat", {
        jobId,
        outputFile,
      });
      return [];
    }

    const outputContent = await fs.readFile(outputFile, "utf-8");
    const lines = outputContent
      .trim()
      .split("\n")
      .filter((line) => line.trim());

    logger.debug("Hashcat output file content", "hashcat", {
      jobId,
      totalLines: lines.length,
      contentPreview: outputContent.substring(0, 200),
    });

    const crackedPasswords = [];

    for (const line of lines) {
      // Parse hashcat output format
      // Format for WPA: WPA*01*AP_MAC*CLIENT_MAC*CLIENT_NONCE*SERVER_NONCE*EAPOL*MIC:password
      // Format for PMKID: BSSID*CLIENT_MAC*PMKID:password
      const parts = line.split(":");
      if (parts.length >= 2) {
        const hash = parts[0];
        const plaintext = parts.slice(1).join(":");

        // Validate that we have both hash and plaintext
        if (hash && plaintext) {
          crackedPasswords.push({
            password: hash,
            plaintext: plaintext,
            processingTime: result.processingTime,
          });

          logger.debug("Parsed cracked password", "hashcat", {
            jobId,
            hashType: hash.includes("WPA*") ? "handshake" : "pmkid",
            passwordLength: plaintext.length,
          });
        }
      }
    }

    logger.info("Hashcat output parsing completed", "hashcat", {
      jobId,
      passwordsFound: crackedPasswords.length,
    });

    return crackedPasswords;
  } catch (error) {
    logger.error("Error parsing hashcat output", "hashcat", {
      jobId,
      outputFile,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return [];
  }
}

function getHashType(attackMode: "pmkid" | "handshake"): string {
  return attackMode === "pmkid" ? "WPA-PMKID-PBKDF2" : "WPA-PBKDF2-PMKID+EAPOL";
}

// Cleanup temporary files with improved logging
export async function cleanupHashcatTemp(jobId: string) {
  const workDir = path.join(process.cwd(), "temp", "hashcat", jobId);

  logger.info("Cleaning up hashcat temporary files", "hashcat", {
    jobId,
    workDir,
  });

  try {
    await fs.rm(workDir, { recursive: true, force: true });
    logger.info("Hashcat temporary files cleaned up successfully", "hashcat", {
      jobId,
      workDir,
    });
  } catch (error) {
    logger.error("Error cleaning up hashcat temp files", "hashcat", {
      jobId,
      workDir,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Check hashcat availability with detailed information
export async function checkHashcatAvailability() {
  logger.info("Checking hashcat availability", "hashcat");

  try {
    const { stdout, stderr } = await execAsync("hashcat --version");
    const version = stdout.trim();

    // Also check for supported hash modes
    const { stdout: modesOutput } = await execAsync(
      'hashcat --help | grep -E "(16800|22000)" || true',
    );
    const supportedModes =
      modesOutput.includes("16800") && modesOutput.includes("22000");

    logger.info("Hashcat availability check completed", "hashcat", {
      available: true,
      version,
      supportedModes,
    });

    return {
      available: true,
      version,
      supportedModes,
      supportedAttackModes: {
        pmkid: modesOutput.includes("16800"),
        handshake: modesOutput.includes("22000"),
      },
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "hashcat: command not found";

    logger.error("Hashcat availability check failed", "hashcat", {
      available: false,
      error: errorMessage,
    });

    return {
      available: false,
      error: errorMessage,
      supportedModes: false,
      supportedAttackModes: {
        pmkid: false,
        handshake: false,
      },
    };
  }
}

/**
 * Ensure attack file exists and is properly extracted
 * The networks table stores the HC22000 hash line in the `key` field
 * This function will create a temp file from the key if no file path is provided
 */
async function ensureAttackFileExists(
  handshakePath: string,
  attackMode: "pmkid" | "handshake",
  bssid: string,
  networkKey?: string,
): Promise<string> {
  logger.info("Ensuring attack file exists", "hashcat", {
    handshakePath,
    attackMode,
    bssid,
    hasNetworkKey: !!networkKey,
  });

  const workDir = path.join(process.cwd(), "temp", "handshakes");

  // Ensure temp directory exists
  await fs.mkdir(workDir, { recursive: true });

  // First, try to use the provided path if it exists
  if (handshakePath) {
    try {
      await fs.access(handshakePath);
      logger.info("Attack file exists at provided path", "hashcat", {
        handshakePath,
      });
      return handshakePath;
    } catch {
      // File doesn't exist, continue to create from network key
    }
  }

  // If we have a network key (HC22000 hash line), write it to a temp file
  if (networkKey) {
    const tempFilePath = path.join(
      workDir,
      `${bssid.replace(/:/g, "")}.hc22000`,
    );

    await fs.writeFile(tempFilePath, networkKey, "utf-8");

    logger.info("Attack file created from network key", "hashcat", {
      tempFilePath,
      bssid,
      keyLength: networkKey.length,
    });

    return tempFilePath;
  }

  // No key and no file path - throw error
  logger.warn("No attack file or network key available", "hashcat", {
    bssid,
  });

  throw new Error(
    `No handshake file available for BSSID ${bssid}. Please upload a PCAP file containing a handshake for this network.`,
  );
}

/**
 * Update job progress in database and broadcast via WebSocket
 */
// ============================================================================
// Smart Progress Updates
// ============================================================================

interface ProgressUpdateState {
  lastDbWrite: number;
  lastWsBroadcast: number;
  currentProgress: number;
  currentMetadata?: any;
}

const progressStates = new Map<string, ProgressUpdateState>();
const DB_UPDATE_INTERVAL = 5000; // 5 seconds
const WS_BROADCAST_INTERVAL = 1500; // 1.5 seconds

/**
 * Smart progress update that throttles DB writes while maintaining frequent WS broadcasts
 * Reduces database load by ~70% while providing real-time updates to users
 */
async function smartUpdateJobProgress(
  jobId: string,
  progress: number,
  metadata?: any,
  force: boolean = false,
): Promise<void> {
  const now = Date.now();
  const state = progressStates.get(jobId) || {
    lastDbWrite: 0,
    lastWsBroadcast: 0,
    currentProgress: 0,
  };

  state.currentProgress = progress;
  state.currentMetadata = metadata;
  progressStates.set(jobId, state);

  // Determine if we should write to DB or broadcast
  const shouldWriteDb =
    force ||
    now - state.lastDbWrite >= DB_UPDATE_INTERVAL ||
    progress === 0 ||
    progress === 100;

  const shouldBroadcast =
    force || now - state.lastWsBroadcast >= WS_BROADCAST_INTERVAL;

  // Update database (less frequently)
  if (shouldWriteDb) {
    const updateData: any = {
      progress: Math.max(0, Math.min(100, progress)),
      progressMetadata: metadata,
      updatedAt: new Date(),
    };

    // Only update startTime if it's not already set and progress > 0
    if (progress > 0) {
      const currentJob = await db.query.jobs.findFirst({
        where: eq(jobs.id, jobId),
        columns: { startTime: true },
      });

      if (!currentJob?.startTime) {
        updateData.startTime = new Date();
      }
    }

    await db.update(jobs).set(updateData).where(eq(jobs.id, jobId));
    state.lastDbWrite = now;

    logger.debug("Job progress updated in DB", "hashcat", {
      jobId,
      progress,
      metadata: metadata ? "included" : "none",
    });
  }

  // Broadcast via WebSocket (more frequently)
  if (shouldBroadcast) {
    try {
      const wsServer = getWebSocketServer();
      const currentJob = await db.query.jobs.findFirst({
        where: eq(jobs.id, jobId),
        columns: {
          id: true,
          status: true,
          userId: true,
          startTime: true,
          endTime: true,
          errorMessage: true,
        },
      });

      if (currentJob) {
        wsServer.broadcastJobUpdate({
          id: currentJob.id,
          status: currentJob.status,
          progress,
          startTime: currentJob.startTime?.toISOString(),
          endTime: currentJob.endTime?.toISOString(),
          errorMessage: currentJob.errorMessage || undefined,
          metadata: {
            userId: currentJob.userId,
            ...metadata,
          },
        });

        state.lastWsBroadcast = now;

        logger.debug("Job progress broadcast via WebSocket", "hashcat", {
          jobId,
          progress,
        });
      }
    } catch (error) {
      logger.warn("Failed to broadcast job update", "hashcat", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  progressStates.set(jobId, state);
}

async function updateJobProgress(
  jobId: string,
  progress: number,
  metadata?: any,
): Promise<void> {
  try {
    const updateData: any = {
      progress: Math.max(0, Math.min(100, progress)),
      updatedAt: new Date(),
    };

    // Only update startTime if it's not already set
    if (progress > 0) {
      updateData.startTime = new Date();
    }

    await db.update(jobs).set(updateData).where(eq(jobs.id, jobId));

    logger.debug("Job progress updated", "hashcat", {
      jobId,
      progress,
    });

    // Broadcast progress update via WebSocket
    try {
      const wsServer = getWebSocketServer();

      // Get current job data for the broadcast
      const currentJob = await db.query.jobs.findFirst({
        where: eq(jobs.id, jobId),
        columns: {
          id: true,
          status: true,
          progress: true,
          startTime: true,
          endTime: true,
          errorMessage: true,
          userId: true,
        },
      });

      if (currentJob) {
        wsServer.broadcastJobUpdate({
          id: currentJob.id,
          status: currentJob.status,
          progress: currentJob.progress,
          startTime: currentJob.startTime?.toISOString(),
          endTime: currentJob.endTime?.toISOString(),
          errorMessage: currentJob.errorMessage || undefined,
          metadata: {
            ...metadata,
            userId: currentJob.userId,
          },
        });
      }
    } catch (wsError) {
      logger.warn("Failed to broadcast progress update", "hashcat", {
        jobId,
        progress,
        error: wsError instanceof Error ? wsError.message : "Unknown error",
      });
    }
  } catch (error) {
    logger.error("Failed to update job progress", "hashcat", {
      jobId,
      progress,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Security audit for Hashcat operations
 */
export async function performHashcatSecurityAudit(jobId: string): Promise<{
  passed: boolean;
  issues: string[];
  recommendations: string[];
}> {
  const issues: string[] = [];
  const recommendations: string[] = [];

  logger.info("Starting Hashcat security audit", "hashcat", { jobId });

  try {
    // Check if jobId is a valid UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(jobId)) {
      issues.push("Invalid jobId format - must be UUID");
    }

    // Check work directory permissions
    const workDir = path.join(process.cwd(), "temp", "hashcat", jobId);
    try {
      await fs.access(workDir, fs.constants.W_OK);
    } catch (error) {
      issues.push("Cannot access work directory");
    }

    // Check if hashcat is available and not running as root
    const hashcatCheck = await checkHashcatAvailability();
    if (!hashcatCheck.available) {
      issues.push("Hashcat is not available");
    }

    // Security recommendations
    if (process.getuid && process.getuid() === 0) {
      recommendations.push("Consider running as non-root user");
    }

    if (env.NODE_ENV !== "production") {
      recommendations.push("Enable production mode for enhanced security");
    }

    // Check file permissions in temp directory
    try {
      const tempDir = path.join(process.cwd(), "temp");
      const stats = await fs.stat(tempDir);
      // Check if directory has appropriate permissions (not world-writable)
      if ((stats.mode & 0o002) !== 0) {
        issues.push("Temp directory is world-writable");
        recommendations.push(
          "Remove world-write permissions from temp directory",
        );
      }
    } catch (error) {
      issues.push("Cannot check temp directory permissions");
    }

    logger.info("Hashcat security audit completed", "hashcat", {
      jobId,
      issuesFound: issues.length,
      recommendations: recommendations.length,
    });

    return {
      passed: issues.length === 0,
      issues,
      recommendations,
    };
  } catch (error) {
    logger.error("Hashcat security audit failed", "hashcat", {
      jobId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      passed: false,
      issues: ["Security audit failed to complete"],
      recommendations: ["Review system configuration and try again"],
    };
  }
}
