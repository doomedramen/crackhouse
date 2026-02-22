import * as nodemailer from "nodemailer";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Email service for sending transactional emails
 */
class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  /**
   * Initialize SMTP transporter
   */
  private async initialize() {
    if (this.transporter) return this.transporter;

    // Check if SMTP is configured
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      logger.warn(
        "SMTP not configured, emails will be logged to console",
        "email",
      );
      return null;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: parseInt(env.SMTP_PORT),
        secure: parseInt(env.SMTP_PORT) === 465, // true for 465, false for other ports
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });

      // Verify connection configuration
      await this.transporter.verify();
      logger.info("SMTP connection verified successfully", "email");
      return this.transporter;
    } catch (error) {
      logger.error("Failed to initialize SMTP transporter", "email", error);
      this.transporter = null;
      return null;
    }
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    const { to, subject, html, text } = options;

    // Development mode: just log the email
    if (env.NODE_ENV === "development") {
      logger.info("Email would be sent (development mode)", "email", {
        to,
        subject,
        htmlLength: html.length,
      });
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   📧 EMAIL (Development)                     ║
╠══════════════════════════════════════════════════════════════╣
║ To: ${to.padEnd(54)} ║
║ Subject: ${subject.padEnd(50)} ║
╠══════════════════════════════════════════════════════════════╣
║ ${text || html.substring(0, 100)}
╚══════════════════════════════════════════════════════════════╝
      `);
      return true;
    }

    try {
      const transporter = await this.initialize();

      if (!transporter) {
        logger.warn("SMTP not configured, email not sent", "email", {
          to,
          subject,
        });
        return false;
      }

      const info = await transporter.sendMail({
        from: env.SMTP_FROM || env.SMTP_USER,
        to,
        subject,
        text: text || html.replace(/<[^>]*>/g, ""), // Strip HTML tags for text version
        html,
      });

      logger.info("Email sent successfully", "email", {
        to,
        subject,
        messageId: info.messageId,
      });

      return true;
    } catch (error) {
      logger.error("Failed to send email", "email", error, { to, subject });
      return false;
    }
  }

  /**
   * Send email verification email
   */
  async sendVerificationEmail(
    to: string,
    verificationUrl: string,
  ): Promise<boolean> {
    const subject = "Verify your email address - AutoPWN";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #2c3e50; margin-top: 0;">Verify Your Email Address</h1>
    <p>Thank you for signing up for AutoPWN! Please verify your email address to activate your account.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${verificationUrl}"
         style="background-color: #3498db; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        Verify Email Address
      </a>
    </div>

    <p style="font-size: 14px; color: #7f8c8d;">
      Or copy and paste this link into your browser:<br>
      <a href="${verificationUrl}" style="color: #3498db; word-break: break-all;">${verificationUrl}</a>
    </p>

    <hr style="border: none; border-top: 1px solid #e1e8ed; margin: 30px 0;">

    <p style="font-size: 12px; color: #95a5a6;">
      If you didn't create an account with AutoPWN, you can safely ignore this email.
    </p>

    <p style="font-size: 12px; color: #95a5a6;">
      This link will expire in 24 hours for security reasons.
    </p>
  </div>

  <div style="text-align: center; font-size: 12px; color: #95a5a6;">
    <p>CrackHouse - where handshakes go to break</p>
    <p>This is an automated message, please do not reply.</p>
  </div>
</body>
</html>
    `;

    const text = `
Verify Your Email Address

Thank you for signing up for AutoPWN! Please verify your email address to activate your account.

Click the link below to verify your email:
${verificationUrl}

If you didn't create an account with AutoPWN, you can safely ignore this email.

This link will expire in 24 hours for security reasons.

---
CrackHouse - where handshakes go to break
This is an automated message, please do not reply.
    `;

    return this.sendEmail({ to, subject, html, text });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
    const subject = "Reset your password - AutoPWN";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
    <h1 style="color: #2c3e50; margin-top: 0;">Reset Your Password</h1>
    <p>We received a request to reset your password for your AutoPWN account.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}"
         style="background-color: #e74c3c; color: white; padding: 14px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
        Reset Password
      </a>
    </div>

    <p style="font-size: 14px; color: #7f8c8d;">
      Or copy and paste this link into your browser:<br>
      <a href="${resetUrl}" style="color: #e74c3c; word-break: break-all;">${resetUrl}</a>
    </p>

    <hr style="border: none; border-top: 1px solid #e1e8ed; margin: 30px 0;">

    <p style="font-size: 12px; color: #95a5a6;">
      If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
    </p>

    <p style="font-size: 12px; color: #95a5a6;">
      This link will expire in 1 hour for security reasons.
    </p>
  </div>

  <div style="text-align: center; font-size: 12px; color: #95a5a6;">
    <p>CrackHouse - where handshakes go to break</p>
    <p>This is an automated message, please do not reply.</p>
  </div>
</body>
</html>
    `;

    const text = `
Reset Your Password

We received a request to reset your password for your AutoPWN account.

Click the link below to reset your password:
${resetUrl}

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

This link will expire in 1 hour for security reasons.

---
CrackHouse - where handshakes go to break
This is an automated message, please do not reply.
    `;

    return this.sendEmail({ to, subject, html, text });
  }
}

// Export singleton instance
export const emailService = new EmailService();
