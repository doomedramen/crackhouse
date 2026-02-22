/**
 * Frontend configuration
 *
 * Centralizes all configuration values used across the frontend.
 * Uses validated environment variables from env.ts with sensible defaults.
 */

import { env } from "./env";

export const config = {
  /**
   * API server URL
   * Used for all API requests from the frontend
   */
  apiUrl: env.NEXT_PUBLIC_API_URL || "http://localhost:3001",

  /**
   * WebSocket server URL
   * Used for real-time updates
   */
  wsUrl: env.NEXT_PUBLIC_WS_URL || "ws://localhost:3002",

  /**
   * Application environment
   */
  get env() {
    return process.env.NODE_ENV || "development";
  },

  /**
   * Whether we're in production
   */
  get isProduction() {
    return this.env === "production";
  },

  /**
   * Whether we're in development
   */
  get isDevelopment() {
    return this.env === "development";
  },

  /**
   * Whether we're in test mode
   */
  get isTest() {
    return this.env === "test";
  },
} as const;

/**
 * Auth configuration
 * Builds the auth base URL from the API URL
 */
export const authConfig = {
  /**
   * Base URL for auth endpoints
   * Uses the web server's origin so cookies work correctly
   * Next.js rewrites will proxy /api/auth/* to the backend API server
   */
  get baseURL() {
    // For auth, we use the frontend URL (not the API URL) since Next.js proxies
    // the auth requests to the backend
    const frontendUrl = env.NEXT_PUBLIC_FRONTEND_URL || "http://localhost:3000";
    return frontendUrl.replace(/\/$/, "") + "/api/auth";
  },
} as const;

/**
 * Timeouts for frontend operations (in milliseconds)
 */
export const timeouts = {
  /** Short timeout: 5 seconds - for quick operations */
  short: 5_000,

  /** Default timeout: 30 seconds - for standard operations */
  default: 30_000,

  /** Long timeout: 60 seconds - for slow operations */
  long: 60_000,

  /** API request timeout: 30 seconds */
  api: 30_000,

  /** WebSocket reconnect delay: 5 seconds */
  wsReconnect: 5_000,
} as const;

/**
 * Query client defaults for React Query
 */
export const queryDefaults = {
  /** Default stale time: 30 seconds */
  staleTime: 30_000,

  /** Auth session stale time: 5 minutes */
  authStaleTime: 5 * 60 * 1000,

  /** Job data stale time: 5 seconds (jobs update frequently) */
  jobStaleTime: 5_000,

  /** Job refetch interval: 5 seconds */
  jobRefetchInterval: 5_000,

  /** Dictionary stale time: 30 seconds */
  dictionaryStaleTime: 30_000,

  /** User data stale time: 1 minute */
  userStaleTime: 60_000,

  /** Config stale time: 1 minute */
  configStaleTime: 60_000,

  /** Health check stale time: 30 seconds */
  healthStaleTime: 30_000,
} as const;
