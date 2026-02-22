import nodemailer from "nodemailer";
import { configService } from "./config.service";
import { logger } from "../lib/logger";
import { env } from "@/config/env";
import { db } from "../db/index";
import { auditLogs } from "../db/schema";
import { eq } from "drizzle-orm";

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

interface EmailTemplateData {
  recipientName?: string;
  recipientEmail?: string;
  data?: Record<string, any>;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private initialized = false;
  private retryAttempts = 3;
  private retryDelay = 5000; // 5 seconds

  /**
   * Initialize email service with SMTP configuration
   */
  async initialize(): Promise<void> {
    try {
      const config: EmailConfig = {
        host: await configService.getString("email-host", "localhost"),
        port: await configService.getNumber("email-port", 587),
        secure: await configService.getBoolean("email-secure", false),
        auth: {
          user: await configService.getString("email-user", ""),
          pass: await configService.getString("email-password", ""),
        },
        from: await configService.getString(
          "email-from",
          "noreply@crackhouse.local",
        ),
      };

      this.transporter = nodemailer.createTransporter({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.auth.user,
          pass: config.auth.pass,
        },
      });

      await this.transporter.verify();

      this.initialized = true;
      logger.info("Email service initialized successfully", "email-service", {
        host: config.host,
        from: config.from,
      });
    } catch (error) {
      logger.error("Failed to initialize email service", "email-service", {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  /**
   * Send email with retry logic
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        if (!this.transporter) {
          throw new Error("Email transporter not initialized");
        }

        const info = await this.transporter.sendMail({
          from: await configService.getString(
            "email-from",
            "noreply@crackhouse.local",
          ),
          to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
        });

        logger.info("Email sent successfully", "email-service", {
          to: options.to,
          subject: options.subject,
          messageId: info.messageId,
          attempt,
        });

        await this.logEmailEvent(
          "email_sent",
          options.to,
          options.subject,
          true,
        );

        return true;
      } catch (error) {
        logger.error(`Email send attempt ${attempt} failed`, "email-service", {
          to: options.to,
          subject: options.subject,
          error: error instanceof Error ? error : new Error(String(error)),
        });

        if (attempt === this.retryAttempts) {
          await this.logEmailEvent(
            "email_failed",
            options.to,
            options.subject,
            false,
            String(error),
          );
          return false;
        }

        await this.sleep(this.retryDelay * attempt);
      }
    }

    return false;
  }

  /**
   * Send job completed notification
   */
  async sendJobCompletedEmail(
    to: string,
    jobData: {
      name: string;
      jobId: string;
      status: "completed" | "failed";
      passwordsFound?: number;
      totalHashes?: number;
      duration?: number;
      errorMessage?: string;
    },
  ): Promise<boolean> {
    const template = await this.getJobCompletedTemplate(jobData);
    const textTemplate = await this.getJobCompletedTextTemplate(jobData);

    return this.sendEmail({
      to,
      subject: `Job "${jobData.name}" - ${jobData.status.toUpperCase()}`,
      html: template,
      text: textTemplate,
    });
  }

  /**
   * Send system health alert
   */
  async sendHealthAlertEmail(
    to: string,
    healthData: {
      status: "degraded" | "critical";
      checks: Record<string, any>;
      uptime: number;
    },
  ): Promise<boolean> {
    const template = await this.getHealthAlertTemplate(healthData);
    const textTemplate = await this.getHealthAlertTextTemplate(healthData);

    return this.sendEmail({
      to,
      subject: `[ALERT] System Health - ${healthData.status.toUpperCase()}`,
      html: template,
      text: textTemplate,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    to: string,
    resetData: {
      resetLink: string;
      expiresAt: Date;
      recipientName?: string;
    },
  ): Promise<boolean> {
    const template = await this.getPasswordResetTemplate(resetData);
    const textTemplate = await this.getPasswordResetTextTemplate(resetData);

    await this.logEmailEvent(
      "password_reset_requested",
      to,
      "Password reset",
      true,
    );

    return this.sendEmail({
      to,
      subject: "Password Reset Request",
      html: template,
      text: textTemplate,
    });
  }

  /**
   * Send email verification email
   */
  async sendEmailVerificationEmail(
    to: string,
    verificationData: {
      verificationLink: string;
      expiresAt: Date;
      recipientName?: string;
    },
  ): Promise<boolean> {
    const template = await this.getEmailVerificationTemplate(verificationData);
    const textTemplate =
      await this.getEmailVerificationTextTemplate(verificationData);

    await this.logEmailEvent(
      "email_verification_sent",
      to,
      "Email verification",
      true,
    );

    return this.sendEmail({
      to,
      subject: "Verify Your Email Address",
      html: template,
      text: textTemplate,
    });
  }

  /**
   * Send security event email (failed login, etc.)
   */
  async sendSecurityAlertEmail(
    to: string,
    securityData: {
      eventType: "failed_login" | "suspicious_activity" | "account_locked";
      ipAddress?: string;
      userAgent?: string;
      timestamp: Date;
    },
  ): Promise<boolean> {
    const template = await this.getSecurityAlertTemplate(securityData);
    const textTemplate = await this.getSecurityAlertTextTemplate(securityData);

    await this.logEmailEvent(
      "security_alert",
      to,
      securityData.eventType,
      true,
    );

    return this.sendEmail({
      to,
      subject: `[SECURITY] ${securityData.eventType.replace(/_/g, " ").toUpperCase()}`,
      html: template,
      text: textTemplate,
    });
  }

  /**
   * Test email configuration
   */
  async sendTestEmail(to: string): Promise<boolean> {
    const template = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>AutoPWN Email Test</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #4CAF50; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">AutoPWN Email Test</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
              <p>This is a test email from AutoPWN.</p>
              <p><strong>If you received this email, your email configuration is working correctly!</strong></p>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
              <p style="color: #666; font-size: 12px;">
                Sent at: ${new Date().toISOString()}
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to,
      subject: "AutoPWN Email Test",
      html: template,
    });
  }

  /**
   * Log email event to audit logs
   */
  private async logEmailEvent(
    action: string,
    recipient: string | string[],
    subject: string,
    success: boolean,
    error?: string,
  ): Promise<void> {
    try {
      await db.insert(auditLogs).values({
        userId: "system",
        action,
        entityType: "email",
        entityId: Array.isArray(recipient) ? recipient.join(",") : recipient,
        details: {
          subject,
          success,
          error,
        },
        ipAddress: null,
        userAgent: "email-service",
        success,
      });
    } catch (error) {
      logger.error("Failed to log email event", "email-service", {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Job completed email template
   */
  private async getJobCompletedTemplate(jobData: any): Promise<string> {
    const statusColor = jobData.status === "completed" ? "#4CAF50" : "#f44336";
    const statusText =
      jobData.status === "completed" ? "Completed Successfully" : "Failed";

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Job ${jobData.status.toUpperCase()}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: ${statusColor}; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">Job ${statusText}</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
              <p>Your hashcat job has been completed.</p>
              
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background: #f0f0f0;">
                  <td style="padding: 10px; font-weight: bold;">Job Name</td>
                  <td style="padding: 10px;">${jobData.name}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; font-weight: bold;">Job ID</td>
                  <td style="padding: 10px;">${jobData.jobId}</td>
                </tr>
                <tr style="background: #f0f0f0;">
                  <td style="padding: 10px; font-weight: bold;">Status</td>
                  <td style="padding: 10px; color: ${statusColor}; font-weight: bold;">${jobData.status.toUpperCase()}</td>
                </tr>
                ${
                  jobData.passwordsFound !== undefined
                    ? `
                <tr>
                  <td style="padding: 10px; font-weight: bold;">Passwords Found</td>
                  <td style="padding: 10px;">${jobData.passwordsFound}</td>
                </tr>`
                    : ""
                }
                ${
                  jobData.totalHashes !== undefined
                    ? `
                <tr style="background: #f0f0f0;">
                  <td style="padding: 10px; font-weight: bold;">Total Hashes</td>
                  <td style="padding: 10px;">${jobData.totalHashes}</td>
                </tr>`
                    : ""
                }
                ${
                  jobData.duration !== undefined
                    ? `
                <tr>
                  <td style="padding: 10px; font-weight: bold;">Duration</td>
                  <td style="padding: 10px;">${(jobData.duration / 1000).toFixed(2)} seconds</td>
                </tr>`
                    : ""
                }
                ${
                  jobData.errorMessage
                    ? `
                <tr style="background: #fff3f0;">
                  <td style="padding: 10px; font-weight: bold;">Error</td>
                  <td style="padding: 10px; color: #f44336;">${jobData.errorMessage}</td>
                </tr>`
                    : ""
                }
              </table>
              
              <p style="margin-top: 20px;">
                <a href="${env.FRONTEND_URL}/jobs" style="background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">View Job Details</a>
              </p>
            </div>
            <div style="background: #f0f0f0; padding: 20px; text-align: center; color: #666; font-size: 12px;">
              <p>This is an automated message from AutoPWN.</p>
              <p>Received at: ${new Date().toISOString()}</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private async getJobCompletedTextTemplate(jobData: any): Promise<string> {
    return `
      Your hashcat job "${jobData.name}" has ${jobData.status}.
      
      Job ID: ${jobData.jobId}
      Status: ${jobData.status.toUpperCase()}
      ${jobData.passwordsFound ? `Passwords Found: ${jobData.passwordsFound}` : ""}
      ${jobData.errorMessage ? `Error: ${jobData.errorMessage}` : ""}
      
      Visit ${env.FRONTEND_URL}/jobs/${jobData.jobId} for details.
    `;
  }

  private async getHealthAlertTemplate(healthData: any): Promise<string> {
    const statusColor =
      healthData.status === "critical" ? "#f44336" : "#ff9800";

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>System Health Alert</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: ${statusColor}; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">⚠️ System Health Alert</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
              <p><strong>System Status: ${healthData.status.toUpperCase()}</strong></p>
              <p>System uptime: ${(healthData.uptime / 1000 / 60 / 60).toFixed(2)} hours</p>
              
              <h3>Health Checks:</h3>
              ${Object.entries(healthData.checks)
                .map(
                  ([check, data]: [string, any]) => `
                <div style="margin: 10px 0; padding: 10px; background: ${data.status === "healthy" ? "#e8f5e9" : "#ffebee"}; border-left: 4px solid ${data.status === "healthy" ? "#4CAF50" : "#f44336"};">
                  <strong>${check.charAt(0).toUpperCase() + check.slice(1)}:</strong> ${data.status.toUpperCase()}
                  ${data.message ? `<br><small>${data.message}</small>` : ""}
                </div>
              `,
                )
                .join("")}
              
              <p style="margin-top: 20px;">
                <a href="${env.FRONTEND_URL}/admin/health" style="background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">View Health Dashboard</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private async getHealthAlertTextTemplate(healthData: any): Promise<string> {
    return `
      SYSTEM HEALTH ALERT - ${healthData.status.toUpperCase()}
      
      System Status: ${healthData.status.toUpperCase()}
      Uptime: ${(healthData.uptime / 1000 / 60 / 60).toFixed(2)} hours
      
      Health Checks:
      ${Object.entries(healthData.checks)
        .map(
          ([check, data]: [string, any]) =>
            `- ${check}: ${data.status.toUpperCase()}${data.message ? ` (${data.message})` : ""}`,
        )
        .join("\n")}
      
      Visit ${env.FRONTEND_URL}/admin/health for details.
    `;
  }

  private async getPasswordResetTemplate(resetData: any): Promise<string> {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Password Reset</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #2196F3; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">Password Reset Request</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
              <p>${resetData.recipientName ? `Hello ${resetData.recipientName},` : "Hello,"}</p>
              <p>A password reset has been requested for your AutoPWN account.</p>
              
              <p><strong>This link will expire in 1 hour:</strong></p>
              
              <p style="margin: 20px 0; text-align: center;">
                <a href="${resetData.resetLink}" style="background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
              </p>
              
              <p style="color: #f44336; font-size: 14px;">If you did not request this password reset, please ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private async getPasswordResetTextTemplate(resetData: any): Promise<string> {
    return `
      Hello ${resetData.recipientName || ""}, 
      
      A password reset has been requested for your AutoPWN account.
      
      Click the link below to reset your password (expires in 1 hour):
      ${resetData.resetLink}
      
      If you did not request this, please ignore this email.
    `;
  }

  private async getEmailVerificationTemplate(
    verificationData: any,
  ): Promise<string> {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Verify Email Address</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #4CAF50; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">Verify Your Email</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
              <p>${verificationData.recipientName ? `Hello ${verificationData.recipientName},` : "Hello,"}</p>
              <p>Please verify your email address to complete your AutoPWN registration.</p>
              
              <p style="margin: 20px 0; text-align: center;">
                <a href="${verificationData.verificationLink}" style="background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Verify Email</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private async getEmailVerificationTextTemplate(
    verificationData: any,
  ): Promise<string> {
    return `
      Hello ${verificationData.recipientName || ""}, 
      
      Please verify your email address to complete your AutoPWN registration.
      
      ${verificationData.verificationLink}
      
      This link will expire in 24 hours.
    `;
  }

  private async getSecurityAlertTemplate(securityData: any): Promise<string> {
    const eventDescriptions: Record<string, string> = {
      failed_login: "Multiple failed login attempts detected",
      suspicious_activity: "Suspicious activity detected on your account",
      account_locked: "Your account has been locked due to security concerns",
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Security Alert</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #f44336; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">🔒 Security Alert</h1>
            </div>
            <div style="padding: 20px; background: #f9f9f9;">
              <p><strong>${eventDescriptions[securityData.eventType] || securityData.eventType}</strong></p>
              
              ${securityData.ipAddress ? `<p><strong>IP Address:</strong> ${securityData.ipAddress}</p>` : ""}
              ${securityData.userAgent ? `<p><strong>User Agent:</strong> ${securityData.userAgent}</p>` : ""}
              ${securityData.timestamp ? `<p><strong>Time:</strong> ${new Date(securityData.timestamp).toISOString()}</p>` : ""}
              
              <p style="margin: 20px 0;">
                <a href="${env.FRONTEND_URL}/settings" style="background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Review Account Security</a>
              </p>
              
              <p style="color: #666; font-size: 14px;">If this was not you, please contact support immediately.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private async getSecurityAlertTextTemplate(
    securityData: any,
  ): Promise<string> {
    const eventDescriptions: Record<string, string> = {
      failed_login: "Multiple failed login attempts detected",
      suspicious_activity: "Suspicious activity detected on your account",
      account_locked: "Your account has been locked due to security concerns",
    };

    return `
      SECURITY ALERT
      
      ${eventDescriptions[securityData.eventType] || securityData.eventType}
      ${securityData.ipAddress ? `IP Address: ${securityData.ipAddress}` : ""}
      ${securityData.timestamp ? `Time: ${new Date(securityData.timestamp).toISOString()}` : ""}
      
      Visit ${env.FRONTEND_URL}/settings to review.
      
      If this was not you, please contact support immediately.
    `;
  }
}

export const emailService = new EmailService();
