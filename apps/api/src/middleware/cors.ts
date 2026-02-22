import { cors } from "hono/cors";
import { Context, Next } from "hono";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
// import { logSecurityEvent, SecurityEventType } from '../lib/monitoring'

export interface CORSConfig {
  enabled: boolean;
  mode: "development" | "staging" | "production";
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
  preflightContinue: boolean;
  optionsSuccessStatus: number;
  strictMode: boolean;
}

const defaultCORSConfig: CORSConfig = {
  enabled: true,
  mode:
    (env.NODE_ENV as "development" | "staging" | "production") || "development",
  allowedOrigins: [],
  allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "User-Agent",
    "DNT",
    "Cache-Control",
    "X-Mx-ReqToken",
    "Keep-Alive",
    "X-Requested-With",
    "If-Modified-Since",
  ],
  exposedHeaders: [
    "X-Total-Count",
    "X-File-Hash",
    "X-Rate-Limit-Limit",
    "X-Rate-Limit-Remaining",
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204,
  strictMode: true,
};

/**
 * Get production CORS origins from environment variables
 */
function getProductionOrigins(): string[] {
  const origins: string[] = [];

  // Add CORS_ORIGIN if specified
  if (env.CORS_ORIGIN) {
    origins.push(...env.CORS_ORIGIN.split(",").map((origin) => origin.trim()));
  }

  // Add specific production domains
  const productionDomains = [
    "https://crackhouse.example.com",
    "https://www.crackhouse.example.com",
    "https://admin.crackhouse.example.com",
    "https://staging.crackhouse.example.com",
  ];

  // Only add production domains in production environment
  if (env.NODE_ENV === "production") {
    origins.push(...productionDomains);
  }

  // Add localhost for development
  if (env.NODE_ENV === "development") {
    origins.push(
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://localhost:5173", // Vite dev server
      "http://127.0.0.1:5173",
    );
  }

  return [...new Set(origins)]; // Remove duplicates
}

/**
 * Validate if origin is allowed
 */
function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0) {
    return true; // No restrictions if no origins specified
  }

  // Check for exact matches
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Check for wildcard subdomains (*.example.com)
  for (const allowedOrigin of allowedOrigins) {
    if (allowedOrigin.startsWith("*.")) {
      const domain = allowedOrigin.substring(2);
      if (origin.endsWith(domain) || origin === `https://${domain}`) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Enhanced CORS middleware with security monitoring
 */
export const enhancedCORS = (config: Partial<CORSConfig> = {}) => {
  const corsConfig = { ...defaultCORSConfig, ...config };

  // Set allowed origins based on environment
  if (corsConfig.allowedOrigins.length === 0) {
    corsConfig.allowedOrigins = getProductionOrigins();
  }

  // Log CORS configuration on startup
  logger.info("CORS Configuration initialized", "cors", {
    mode: corsConfig.mode,
    allowedOrigins: corsConfig.allowedOrigins,
    credentials: corsConfig.credentials,
    maxAge: corsConfig.maxAge,
    strictMode: corsConfig.strictMode,
  });

  return async (c: Context, next: Next) => {
    // Skip CORS if disabled
    if (!corsConfig.enabled) {
      await next();
      return;
    }

    const origin = c.req.header("Origin");
    const method = c.req.method;

    // Log CORS-related security events in strict mode
    if (corsConfig.strictMode && origin) {
      // Check for suspicious origins
      if (!isOriginAllowed(origin, corsConfig.allowedOrigins)) {
        // await logSecurityEvent({
        //   type: SecurityEventType.SUSPICIOUS_IP,
        //   severity: 'medium',
        //   ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
        //   path: c.req.path,
        //   method: method,
        //   details: {
        //     reason: 'Unauthorized CORS origin',
        //     origin,
        //     userAgent: c.req.header('user-agent'),
        //     timestamp: new Date().toISOString()
        //   }
        // })
      }
    }

    // Build CORS options
    const corsOptions = {
      origin: (origin, c) => {
        if (!origin) return true; // Same-origin requests

        if (isOriginAllowed(origin, corsConfig.allowedOrigins)) {
          return origin;
        }

        if (corsConfig.strictMode) {
          return false;
        }

        // In non-strict mode, allow unknown origins but log them
        logger.warn("Unauthorized CORS origin attempted", "cors", { origin });
        return origin;
      },
      credentials: corsConfig.credentials,
      allowMethods: corsConfig.allowedMethods,
      allowHeaders: corsConfig.allowedHeaders,
      exposeHeaders: corsConfig.exposedHeaders,
      maxAge: corsConfig.maxAge,
      preflightContinue: corsConfig.preflightContinue,
      optionsSuccessStatus: corsConfig.optionsSuccessStatus,
    };

    // Apply Hono CORS middleware
    const corsMiddleware = cors(corsOptions);
    return corsMiddleware(c, next);
  };
};

/**
 * Development CORS middleware (more permissive)
 */
export const developmentCORS = () => {
  return enhancedCORS({
    mode: "development",
    strictMode: false,
    allowedOrigins: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
    maxAge: 3600, // 1 hour for development
  });
};

/**
 * Production CORS middleware (strict)
 */
export const productionCORS = () => {
  return enhancedCORS({
    mode: "production",
    strictMode: true,
    allowedOrigins: getProductionOrigins(),
    credentials: true,
    maxAge: 86400, // 24 hours for production
    exposedHeaders: [
      "X-Total-Count",
      "X-File-Hash",
      "X-Rate-Limit-Limit",
      "X-Rate-Limit-Remaining",
      "X-Response-Time",
      "X-Request-ID",
    ],
  });
};

/**
 * Staging CORS middleware (moderately strict)
 */
export const stagingCORS = () => {
  return enhancedCORS({
    mode: "staging",
    strictMode: true,
    allowedOrigins: [
      "https://staging.crackhouse.example.com",
      "https://dev.crackhouse.example.com",
      ...getProductionOrigins(),
    ],
    credentials: true,
    maxAge: 43200, // 12 hours for staging
  });
};

/**
 * Environment-aware CORS middleware
 */
export const environmentAwareCORS = () => {
  switch (env.NODE_ENV) {
    case "production":
      return productionCORS();
    case "staging":
      return stagingCORS();
    default:
      return developmentCORS();
  }
};

/**
 * Custom CORS middleware for specific routes
 */
export const customCORS = (
  allowedOrigins: string[],
  options: Partial<CORSConfig> = {},
) => {
  return enhancedCORS({
    allowedOrigins,
    ...options,
  });
};

/**
 * Public API CORS (no credentials required)
 */
export const publicApiCORS = () => {
  return enhancedCORS({
    credentials: false,
    allowedOrigins: ["*"], // Allow all origins for public endpoints
    strictMode: false,
    maxAge: 3600,
  });
};

/**
 * Internal API CORS (for microservices)
 */
export const internalApiCORS = () => {
  return enhancedCORS({
    allowedOrigins: [
      "http://localhost:3001", // API server
      "http://localhost:3002", // Worker service
      "https://internal.crackhouse.example.com",
    ],
    credentials: true,
    strictMode: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Internal-Token",
      "X-Service-Name",
    ],
  });
};
