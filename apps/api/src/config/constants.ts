/**
 * Centralized configuration constants
 *
 * Use these named constants instead of magic numbers throughout the codebase.
 * This improves maintainability and makes it easier to adjust values globally.
 */

/**
 * Timeout values in milliseconds
 */
export const TIMEOUTS = {
  /** Short timeout: 5 seconds - for quick operations */
  short: 5_000,

  /** Default timeout: 30 seconds - for standard operations */
  default: 30_000,

  /** Long timeout: 60 seconds - for slow operations */
  long: 60_000,

  /** Database connection timeout: 10 seconds */
  database: 10_000,

  /** Database idle timeout: 30 seconds */
  databaseIdle: 30_000,

  /** Database acquire timeout: 60 seconds */
  databaseAcquire: 60_000,

  /** Database create timeout: 30 seconds */
  databaseCreate: 30_000,

  /** Database destroy timeout: 5 seconds */
  databaseDestroy: 5_000,

  /** Redis command timeout: 10 seconds */
  redis: 10_000,

  /** Redis connection timeout: 30 seconds */
  redisConnect: 30_000,

  /** Job timeout: 5 minutes */
  job: 300_000,

  /** Rate limit window: 1 minute */
  rateLimitWindow: 60_000,

  /** Health check interval: 30 seconds */
  healthCheck: 30_000,

  /** WebSocket ping interval: 30 seconds */
  websocketPing: 30_000,

  /** WebSocket connection timeout: 60 seconds */
  websocketConnect: 60_000,

  /** Virus scan timeout: 30 seconds */
  virusScan: 30_000,

  /** DB update interval for workers: 5 seconds */
  workerDbUpdate: 5_000,

  /** Retry delay base: 100ms (exponential backoff) */
  retryDelayBase: 100,

  /** Max retry delay: 30 seconds */
  retryDelayMax: 30_000,
} as const;

/**
 * Size limits in bytes
 */
export const LIMITS = {
  /** Max request body size: 10MB */
  maxBodySize: 10 * 1024 * 1024,

  /** Max body size for detailed validation: 100KB */
  maxBodyValidationSize: 100_000,

  /** Min body size for validation: 10KB */
  minBodyValidationSize: 10_000,

  /** Max events to keep in monitoring: 10,000 */
  maxMonitoringEvents: 10_000,

  /** Max records for audit export: 10,000 */
  maxAuditExport: 10_000,
} as const;

/**
 * Rate limiting defaults
 */
export const RATE_LIMITS = {
  /** Default max requests per window */
  defaultMax: 100,

  /** Strict max requests per window */
  strictMax: 20,

  /** Upload max requests per window */
  uploadMax: 10,

  /** Window duration in milliseconds */
  windowMs: 60_000,
} as const;

/**
 * Pagination defaults
 */
export const PAGINATION = {
  /** Default page size */
  defaultLimit: 50,

  /** Max page size */
  maxLimit: 100,

  /** Default offset */
  defaultOffset: 0,
} as const;

/**
 * Backoff configuration for retries
 */
export const BACKOFF = {
  /**
   * Calculate exponential backoff delay
   * @param attempt - The attempt number (1-based)
   * @param base - Base delay in ms (default: 100ms)
   * @param max - Maximum delay in ms (default: 30 seconds)
   */
  exponential(
    attempt: number,
    base: number = TIMEOUTS.retryDelayBase,
    max: number = TIMEOUTS.retryDelayMax,
  ): number {
    return Math.min(base * Math.pow(2, attempt - 1), max);
  },
} as const;
