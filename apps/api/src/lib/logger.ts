import { env } from "@/config/env";

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

/**
 * Log entry structure
 */
interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  userId?: string;
  requestId?: string;
  error?: Error;
  metadata?: Record<string, any>;
}

/**
 * Logger configuration
 */
interface LoggerConfig {
  level: LogLevel;
  enableColors: boolean;
  enableStructuredOutput: boolean;
  includeStackTrace: boolean;
  maxLogSize: number;
}

/**
 * Custom error classes for better error categorization
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context: string;
  public readonly userId?: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: string,
    userId?: string,
    requestId?: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context || "application";
    this.userId = userId || "";
    this.requestId = requestId || "";

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    code: string = "VALIDATION_ERROR",
    context?: string,
  ) {
    super(message, code, 400, true, context || "validation");
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, code: string = "AUTH_ERROR", context?: string) {
    super(message, code, 401, true, context || "authentication");
  }
}

export class AuthorizationError extends AppError {
  constructor(
    message: string,
    code: string = "AUTHORIZATION_ERROR",
    context?: string,
  ) {
    super(message, code, 403, true, context || "authorization");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code: string = "NOT_FOUND", context?: string) {
    super(message, code, 404, true, context || "resource");
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string = "CONFLICT", context?: string) {
    super(message, code, 409, true, context || "conflict");
  }
}

export class RateLimitError extends AppError {
  constructor(
    message: string,
    code: string = "RATE_LIMIT_EXCEEDED",
    context?: string,
  ) {
    super(message, code, 429, true, context || "rate_limit");
  }
}

export class DatabaseError extends AppError {
  constructor(
    message: string,
    code: string = "DATABASE_ERROR",
    context?: string,
    originalError?: Error,
  ) {
    super(message, code, 500, true, context || "database");
    if (originalError) {
      this.stack = originalError.stack || "";
    }
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    message: string,
    code: string = "EXTERNAL_SERVICE_ERROR",
    context?: string,
  ) {
    super(message, code, 502, true, context || "external_service");
  }
}

export class FileSystemError extends AppError {
  constructor(
    message: string,
    code: string = "FILESYSTEM_ERROR",
    context?: string,
  ) {
    super(message, code, 500, true, context || "filesystem");
  }
}

/**
 * Logger class with structured logging capabilities
 */
export class Logger {
  private config: LoggerConfig;
  private readonly colors = {
    ERROR: "\x1b[31m", // Red
    WARN: "\x1b[33m", // Yellow
    INFO: "\x1b[36m", // Cyan
    DEBUG: "\x1b[37m", // White
    RESET: "\x1b[0m", // Reset
  };

  constructor(config?: Partial<LoggerConfig>) {
    const defaultConfig: LoggerConfig = {
      level: env.NODE_ENV === "production" ? LogLevel.INFO : LogLevel.DEBUG,
      enableColors: env.NODE_ENV !== "production",
      enableStructuredOutput: env.NODE_ENV === "production",
      includeStackTrace: env.NODE_ENV === "development",
      maxLogSize: 10000, // 10KB max log size
    };

    this.config = { ...defaultConfig, ...config };
  }

  private formatMessage(entry: LogEntry): string {
    const {
      level,
      message,
      timestamp,
      context,
      userId,
      requestId,
      error,
      metadata,
    } = entry;

    // Base log format
    let formattedMessage = `[${timestamp}] ${LogLevel[level]}: ${message}`;

    // Add context if available
    if (context) {
      formattedMessage += ` [${context}]`;
    }

    // Add request ID if available
    if (requestId) {
      formattedMessage += ` [req:${requestId}]`;
    }

    // Add user ID if available (sanitized)
    if (userId) {
      const sanitizedUserId = this.sanitizeUserId(userId);
      formattedMessage += ` [user:${sanitizedUserId}]`;
    }

    // Add metadata if available
    if (metadata && Object.keys(metadata).length > 0) {
      const sanitizedMetadata = this.sanitizeMetadata(metadata);
      formattedMessage += ` ${JSON.stringify(sanitizedMetadata)}`;
    }

    // Add error details if available
    if (error) {
      formattedMessage += `\nError: ${error.message}`;
      if (error.stack && this.config.includeStackTrace) {
        formattedMessage += `\nStack Trace:\n${error.stack}`;
      }
    }

    return formattedMessage;
  }

  private sanitizeUserId(userId: string): string {
    // Only show first 4 and last 4 characters for privacy
    if (userId.length <= 8) {
      return userId.substring(0, 2) + "****";
    }
    return (
      userId.substring(0, 4) + "****" + userId.substring(userId.length - 4)
    );
  }

  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(metadata)) {
      // Skip sensitive fields
      if (this.isSensitiveField(key)) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "string" && value.length > 1000) {
        // Truncate long string values
        sanitized[key] = value.substring(0, 1000) + "...[TRUNCATED]";
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      "password",
      "secret",
      "token",
      "key",
      "auth",
      "authorization",
      "credential",
      "private",
      "confidential",
      "ssn",
      "socialSecurityNumber",
      "creditCard",
      "bankAccount",
      "apiKey",
      "sessionId",
      "cookie",
    ];

    return sensitiveFields.some((sensitive) =>
      fieldName.toLowerCase().includes(sensitive.toLowerCase()),
    );
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: string,
    error?: Error,
    metadata?: Record<string, any>,
  ): LogEntry {
    // Handle test environments where Date might be mocked
    let timestamp: string;
    try {
      timestamp = new Date().toISOString();
    } catch {
      // Fallback for test environments
      timestamp = new Date(Date.now()).toISOString();
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp,
    };

    if (context) entry.context = context;
    if (metadata?.userId) entry.userId = metadata.userId;
    if (metadata?.requestId) entry.requestId = metadata.requestId;
    if (error) entry.error = error;
    if (metadata) entry.metadata = metadata;

    return entry;
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.config.level;
  }

  private outputLog(formattedMessage: string, entry: LogEntry): void {
    if (this.config.enableStructuredOutput) {
      // Structured JSON logging for production
      console.log(
        JSON.stringify({
          timestamp: entry.timestamp,
          level: LogLevel[entry.level],
          message: entry.message,
          context: entry.context,
          userId: entry.userId,
          requestId: entry.requestId,
          error: entry.error
            ? {
                message: entry.error.message,
                stack: entry.error.stack,
              }
            : undefined,
          metadata: entry.metadata,
        }),
      );
    } else {
      // Human-readable console output with colors
      if (this.config.enableColors) {
        const color =
          this.colors[LogLevel[entry.level] as keyof typeof this.colors];
        console.log(`${color}${formattedMessage}${this.colors.RESET}`);
      } else {
        console.log(formattedMessage);
      }
    }
  }

  public error(
    message: string,
    context?: string,
    error?: Error,
    metadata?: Record<string, any>,
  ): void {
    const entry = this.createLogEntry(
      LogLevel.ERROR,
      message,
      context,
      error,
      metadata,
    );
    if (this.shouldLog(LogLevel.ERROR)) {
      const formattedMessage = this.formatMessage(entry);
      this.outputLog(formattedMessage, entry);
    }
  }

  public warn(
    message: string,
    context?: string,
    metadata?: Record<string, any>,
  ): void {
    const entry = this.createLogEntry(
      LogLevel.WARN,
      message,
      context,
      undefined,
      metadata,
    );
    if (this.shouldLog(LogLevel.WARN)) {
      const formattedMessage = this.formatMessage(entry);
      this.outputLog(formattedMessage, entry);
    }
  }

  public info(
    message: string,
    context?: string,
    metadata?: Record<string, any>,
  ): void {
    const entry = this.createLogEntry(
      LogLevel.INFO,
      message,
      context,
      undefined,
      metadata,
    );
    if (this.shouldLog(LogLevel.INFO)) {
      const formattedMessage = this.formatMessage(entry);
      this.outputLog(formattedMessage, entry);
    }
  }

  public debug(
    message: string,
    context?: string,
    metadata?: Record<string, any>,
  ): void {
    const entry = this.createLogEntry(
      LogLevel.DEBUG,
      message,
      context,
      undefined,
      metadata,
    );
    if (this.shouldLog(LogLevel.DEBUG)) {
      const formattedMessage = this.formatMessage(entry);
      this.outputLog(formattedMessage, entry);
    }
  }

  /**
   * Log security-related events with additional context
   */
  public security(
    event: string,
    severity: "low" | "medium" | "high" | "critical",
    details?: Record<string, any>,
  ): void {
    const metadata = {
      ...details,
      securityEvent: event,
      severity,
      category: "security",
    };

    this.warn(`Security Event: ${event}`, "security", metadata);
  }

  /**
   * Log performance metrics
   */
  public performance(
    operation: string,
    duration: number,
    metadata?: Record<string, any>,
  ): void {
    const perfMetadata = {
      ...metadata,
      operation,
      duration,
      category: "performance",
    };

    this.info(
      `Performance: ${operation} completed in ${duration}ms`,
      "performance",
      perfMetadata,
    );
  }

  /**
   * Log database operations
   */
  public database(
    operation: string,
    table?: string,
    duration?: number,
    metadata?: Record<string, any>,
  ): void {
    const dbMetadata = {
      ...metadata,
      operation,
      table,
      duration,
      category: "database",
    };

    this.debug(
      `Database: ${operation}${table ? ` on ${table}` : ""}${duration ? ` (${duration}ms)` : ""}`,
      "database",
      dbMetadata,
    );
  }

  /**
   * Log HTTP requests
   */
  public http(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
    userId?: string,
    requestId?: string,
  ): void {
    const httpMetadata = {
      method,
      path,
      statusCode,
      duration,
      category: "http",
      userId,
      requestId,
    };

    const level =
      statusCode >= 500
        ? LogLevel.ERROR
        : statusCode >= 400
          ? LogLevel.WARN
          : LogLevel.INFO;
    const entry = this.createLogEntry(
      level,
      `HTTP ${method} ${path} ${statusCode} (${duration}ms)`,
      "http",
      undefined,
      httpMetadata,
    );

    if (this.shouldLog(level)) {
      const formattedMessage = this.formatMessage(entry);
      this.outputLog(formattedMessage, entry);
    }
  }
}

// Create a default logger instance
export const logger = new Logger();

// Export a function to create child loggers with context
export const createChildLogger = (
  context: string,
  additionalConfig?: Partial<LoggerConfig>,
) => {
  const config = { ...additionalConfig };
  return new Logger({
    ...config,
    // We'll add context to each log entry via metadata in the future
  });
};

// Utility function to extract request context for logging
export const extractRequestContext = (
  req: Request,
): {
  requestId?: string;
  userAgent?: string;
  ip?: string;
  method?: string;
  path?: string;
} => {
  const url = new URL(
    req.url,
    `http://${req.headers.get("host") || "localhost"}`,
  );

  const result: {
    requestId?: string;
    userAgent?: string;
    ip?: string;
    method?: string;
    path?: string;
  } = {};

  const requestId =
    req.headers.get("x-request-id") || req.headers.get("x-amzn-requestid");
  if (requestId) result.requestId = requestId;

  const userAgent = req.headers.get("user-agent");
  if (userAgent) result.userAgent = userAgent;

  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
  if (ip) result.ip = ip;

  result.method = req.method;
  result.path = url.pathname + url.search;

  return result;
};
