import { Queue, Worker, Job } from "bullmq";
import { Redis } from "ioredis";
import { configService } from "@/services/config.service";
import { logger } from "@/lib/logger";
import { emailService } from "@/services/email.service";
import { env } from "@/config/env";

export interface EmailJobData {
  type:
    | "job_completed"
    | "job_failed"
    | "health_degraded"
    | "health_critical"
    | "security_alert"
    | "password_reset"
    | "email_verification"
    | "test_email";
  to: string | string[];
  data: Record<string, any>;
  priority?: number;
  attempts?: number;
}

export interface EmailJobResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class EmailQueue {
  private queue: Queue<EmailJobData> | null = null;
  private worker: Worker<EmailJobData, EmailJobResult> | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    try {
      const connection = new Redis({
        host: env.REDIS_HOST,
        port: parseInt(env.REDIS_PORT),
        maxRetriesPerRequest: null, // Required by BullMQ
      });

      this.queue = new Queue<EmailJobData>("email", {
        connection,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 200,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        },
      });

      this.worker = new Worker<EmailJobData, EmailJobResult>(
        "email",
        async (job: Job<EmailJobData, EmailJobResult>) => {
          return this.processEmailJob(job);
        },
        {
          connection,
          concurrency: 3, // Process up to 3 emails concurrently
          limiter: {
            max: 10, // Max 10 emails per 5 seconds
            duration: 5000, // 5 second window
          },
        },
      );

      this.initialized = true;
      logger.info("Email queue and worker initialized", "email-queue");
    } catch (error) {
      logger.error("Failed to initialize email queue", "email-queue", {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  async sendJobEmail(
    jobData: EmailJobData,
  ): Promise<Job<EmailJobData, EmailJobResult>> {
    if (!this.queue) {
      throw new Error("Email queue not initialized");
    }

    const priority = jobData.priority || 5;
    const emailType = jobData.type;

    let jobName = `email-${emailType}`;
    let jobId: Job<EmailJobData, EmailJobResult>;

    switch (emailType) {
      case "security_alert":
        // Security alerts have highest priority
        jobId = await this.queue.add("security-alert", jobData, {
          priority: 1,
          jobId: `security-${Date.now()}`,
        });
        break;

      case "health_critical":
        // Critical health alerts have high priority
        jobId = await this.queue.add("health-critical", jobData, {
          priority: 2,
          jobId: `health-crit-${Date.now()}`,
        });
        break;

      case "health_degraded":
        // Degraded health alerts have medium priority
        jobId = await this.queue.add("health-degraded", jobData, {
          priority: 3,
          jobId: `health-deg-${Date.now()}`,
        });
        break;

      case "test_email":
        // Test emails have high priority
        jobId = await this.queue.add("test-email", jobData, {
          priority: 2,
          jobId: `test-${Date.now()}`,
        });
        break;

      default:
        // Regular emails (job notifications, etc.) have normal priority
        jobId = await this.queue.add(jobName, jobData, { priority });
        break;
    }

    return jobId;
  }

  async sendBulkEmails(
    emailJobs: EmailJobData[],
  ): Promise<Job<EmailJobData, EmailJobResult>[]> {
    if (!this.queue) {
      throw new Error("Email queue not initialized");
    }

    const bulkJob = await this.queue.add("bulk-email", emailJobs);

    return bulkJob;
  }

  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    if (!this.queue) {
      throw new Error("Email queue not initialized");
    }

    const waiting = await this.queue.getWaiting();
    const active = await this.queue.getActive();
    const completed = await this.queue.getCompleted();
    const failed = await this.queue.getFailed();
    const delayed = await this.queue.getDelayed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  async retryFailedJob(jobId: string): Promise<void> {
    if (!this.queue) {
      throw new Error("Email queue not initialized");
    }

    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.retry();
    logger.info("Retrying failed email job", "email-queue", { jobId });
  }

  async removeJob(jobId: string): Promise<void> {
    if (!this.queue) {
      throw new Error("Email queue not initialized");
    }

    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await job.remove();
    logger.info("Removed email job from queue", "email-queue", { jobId });
  }

  private async processEmailJob(
    job: Job<EmailJobData, EmailJobResult>,
  ): Promise<EmailJobResult> {
    const { type, to, data } = job.data;

    logger.info("Processing email job", "email-worker", {
      jobId: job.id,
      type,
      to,
    });

    try {
      let result: boolean;

      switch (type) {
        case "job_completed":
          result = await emailService.sendJobCompletedEmail(
            Array.isArray(to) ? to[0] : to,
            data,
          );
          break;

        case "job_failed":
          result = await emailService.sendJobCompletedEmail(
            Array.isArray(to) ? to[0] : to,
            data,
          );
          break;

        case "health_degraded":
        case "health_critical":
          result = await emailService.sendHealthAlertEmail(
            Array.isArray(to) ? to[0] : to,
            data,
          );
          break;

        case "password_reset":
          result = await emailService.sendPasswordResetEmail(
            Array.isArray(to) ? to[0] : to,
            data,
          );
          break;

        case "email_verification":
          result = await emailService.sendEmailVerificationEmail(
            Array.isArray(to) ? to[0] : to,
            data,
          );
          break;

        case "security_alert":
          result = await emailService.sendSecurityAlertEmail(
            Array.isArray(to) ? to[0] : to,
            data,
          );
          break;

        case "test_email":
          result = await emailService.sendTestEmail(
            Array.isArray(to) ? to[0] : to,
          );
          break;

        default:
          throw new Error(`Unknown email type: ${type}`);
      }

      const jobResult: EmailJobResult = {
        success: result,
      };

      if (result) {
        logger.info("Email sent successfully", "email-worker", {
          jobId: job.id,
          type,
        });
      }

      return jobResult;
    } catch (error) {
      logger.error("Failed to process email job", "email-worker", {
        jobId: job.id,
        type,
        error: error instanceof Error ? error : new Error(String(error)),
      });

      return {
        success: false,
        error: String(error),
      };
    }
  }

  async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      logger.info("Email worker closed", "email-queue");
    }

    if (this.queue) {
      await this.queue.close();
      logger.info("Email queue closed", "email-queue");
    }

    this.initialized = false;
  }

  async pause(): Promise<void> {
    if (this.worker) {
      await this.worker.pause();
      logger.info("Email worker paused", "email-queue");
    }
  }

  async resume(): Promise<void> {
    if (this.worker) {
      await this.worker.resume();
      logger.info("Email worker resumed", "email-queue");
    }
  }

  isReady(): boolean {
    return this.initialized && this.queue !== null && this.worker !== null;
  }
}

export const emailQueue = new EmailQueue();
