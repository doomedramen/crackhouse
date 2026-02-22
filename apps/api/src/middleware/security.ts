import { Context, Next } from "hono";
import { env } from "@/config/env";

/**
 * Security middleware configurations
 */
export interface SecurityConfig {
  maxRequestSize?: number;
  allowedOrigins?: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  trustProxy?: boolean;
}

const defaultConfig: SecurityConfig = {
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  allowedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://localhost:3000",
    "https://localhost:3001",
  ],
  allowedMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-API-Key",
    "Accept",
  ],
  trustProxy: false,
};

/**
 * Request size limiting middleware
 * Protects against large request bodies that could cause DoS
 */
export const requestSizeLimit = (config: SecurityConfig = {}) => {
  const { maxRequestSize = defaultConfig.maxRequestSize, ...restConfig } =
    config;

  return async (c: Context, next: Next) => {
    const contentLength = c.req.header("content-length");

    if (contentLength && parseInt(contentLength) > maxRequestSize) {
      return c.json(
        {
          success: false,
          error: "Request entity too large",
          code: "PAYLOAD_TOO_LARGE",
          message: `Request size ${contentLength} exceeds maximum allowed size of ${maxRequestSize} bytes`,
          maxSize: maxRequestSize,
        },
        413,
      );
    }

    await next();
  };
};

/**
 * Enhanced security headers middleware
 * Adds comprehensive security headers to responses with environment-specific configurations
 */
export const securityHeaders = (config: SecurityConfig = {}) => {
  const {
    allowedOrigins = defaultConfig.allowedOrigins,
    allowedMethods = defaultConfig.allowedMethods,
    trustProxy = defaultConfig.trustProxy,
    ...restConfig
  } = config;

  const isProduction = env.NODE_ENV === "production";
  const isDevelopment = env.NODE_ENV === "development";

  return async (c: Context, next: Next) => {
    // Basic security headers
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set("X-Frame-Options", "DENY");
    c.res.headers.set("X-XSS-Protection", "1; mode=block");

    // Enhanced HTTP Strict Transport Security (HSTS)
    if (isProduction) {
      c.res.headers.set(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload",
      );
    } else {
      c.res.headers.set("Strict-Transport-Security", "max-age=3600"); // 1 hour for development
    }

    // Referrer Policy - more restrictive in production
    c.res.headers.set(
      "Referrer-Policy",
      isProduction
        ? "strict-origin-when-cross-origin"
        : "strict-origin-when-cross-origin",
    );

    // Enhanced Permissions Policy
    const permissionsPolicy = [
      "geolocation=()",
      "microphone=()",
      "camera=()",
      "payment=()",
      "usb=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
      "ambient-light-sensor=()",
      "autoplay=()",
      "encrypted-media=()",
      "fullscreen=(self)",
      "picture-in-picture=(self)",
      "sync-xhr=(self)",
    ].join(", ");

    c.res.headers.set("Permissions-Policy", permissionsPolicy);

    // Cross-Origin Embedder Policy
    c.res.headers.set("Cross-Origin-Embedder-Policy", "require-corp");

    // Cross-Origin Opener Policy
    c.res.headers.set("Cross-Origin-Opener-Policy", "same-origin");

    // Cross-Origin Resource Policy
    c.res.headers.set("Cross-Origin-Resource-Policy", "same-origin");

    // Content Security Policy - more restrictive in production
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self'" +
        (isDevelopment
          ? " 'unsafe-inline' 'unsafe-eval'"
          : " 'nonce-<random>'"),
      "style-src 'self'" + (isDevelopment ? " 'unsafe-inline'" : ""),
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self'" + (isDevelopment ? " ws: wss:" : ""),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "media-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      "child-src 'self'",
      "frame-src 'none'",
      "prefetch-src 'self'",
    ].join("; ");

    c.res.headers.set("Content-Security-Policy", cspDirectives);

    // Additional security headers
    c.res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
    c.res.headers.set("X-Download-Options", "noopen");
    c.res.headers.set(
      "X-Robots-Tag",
      "noindex, nofollow, nosnippet, noarchive",
    );

    // Server information hiding
    c.res.headers.set("Server", ""); // Remove server signature
    c.res.headers.set("X-Powered-By", ""); // Remove powered by header

    // Cache control for security-sensitive endpoints
    if (
      c.req.path.startsWith("/auth") ||
      c.req.path.startsWith("/security") ||
      c.req.path.startsWith("/virus-scanner")
    ) {
      c.res.headers.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      );
      c.res.headers.set("Pragma", "no-cache");
      c.res.headers.set("Expires", "0");
    }

    // Content type protection
    if (c.req.path.endsWith(".json")) {
      c.res.headers.set("Content-Type", "application/json; charset=utf-8");
    }

    await next();
  };
};

/**
 * CORS middleware with proper configuration
 */
export const cors = (config: SecurityConfig = {}) => {
  const {
    allowedOrigins = defaultConfig.allowedOrigins,
    allowedMethods = defaultConfig.allowedMethods,
    allowedHeaders = defaultConfig.allowedHeaders,
    trustProxy = defaultConfig.trustProxy,
    ...restConfig
  } = config;

  return async (c: Context, next: Next) => {
    const origin = c.req.header("origin");
    const method = c.req.header("access-control-request-method");
    const headers = c.req.header("access-control-request-headers");

    // Check if origin is allowed
    const isOriginAllowed =
      !origin ||
      allowedOrigins.includes("*") ||
      allowedOrigins.includes(origin);

    // Check if method is allowed
    const isMethodAllowed = !method || allowedMethods.includes(method);

    // Check if headers are allowed
    const requestedHeaders = headers
      ? headers.split(",").map((h) => h.trim())
      : [];
    const areHeadersAllowed = requestedHeaders.every(
      (header) =>
        allowedHeaders.includes(header) || allowedHeaders.includes("*"),
    );

    // If preflight request, check access control
    if (method === "OPTIONS") {
      c.res.headers.set(
        "Access-Control-Allow-Origin",
        isOriginAllowed ? origin : "null",
      );
      c.res.headers.set(
        "Access-Control-Allow-Methods",
        allowedMethods.join(", "),
      );
      c.res.headers.set(
        "Access-Control-Allow-Headers",
        areHeadersAllowed ? headers : "",
      );
      c.res.headers.set("Access-Control-Max-Age", "86400");
      c.res.headers.set("Vary", "Origin");
      c.res.headers.set("Access-Control-Allow-Credentials", "true");

      return c.text(null, 204);
    }

    // For actual requests, apply CORS headers if allowed
    if (isOriginAllowed && isMethodAllowed && areHeadersAllowed) {
      c.res.headers.set("Access-Control-Allow-Origin", origin);
      c.res.headers.set(
        "Access-Control-Allow-Methods",
        allowedMethods.join(", "),
      );
      c.res.headers.set(
        "Access-Control-Allow-Headers",
        areHeadersAllowed ? headers : "",
      );
      c.res.headers.set("Access-Control-Allow-Credentials", "true");
      c.res.headers.set(
        "Access-Control-Expose-Headers",
        "X-Total-Count, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset",
      );
    }

    await next();
  };
};

/**
 * IP-based access control middleware
 * Blocks requests from suspicious IPs or applies stricter limits
 */
export const ipAccessControl = (
  options: {
    blockedIPs?: string[];
    suspiciousPatterns?: RegExp[];
    stricterLimits?: boolean;
  } = {},
) => {
  const {
    blockedIPs = [],
    suspiciousPatterns = [
      /bot|crawler|spider|scraper/i,
      /curl|wget|python|java|go|node/i,
    ],
    stricterLimits = false,
    ...restOptions
  } = options;

  return async (c: Context, next: Next) => {
    const clientIP =
      c.req.header("x-forwarded-for") ||
      c.req.header("x-real-ip") ||
      c.env?.get?.("remote_addr") ||
      "unknown";

    // Check if IP is explicitly blocked
    if (blockedIPs.includes(clientIP)) {
      return c.json(
        {
          success: false,
          error: "Access denied",
          code: "IP_BLOCKED",
          message: "Your IP address has been blocked",
        },
        403,
      );
    }

    // Check for suspicious patterns
    const userAgent = c.req.header("user-agent") || "";
    const isSuspicious = suspiciousPatterns.some((pattern) =>
      pattern.test(userAgent),
    );

    if (isSuspicious) {
      c.header("X-Security-Flag", "suspicious-user-agent");

      // Stricter rate limits for suspicious requests
      if (stricterLimits) {
        c.header("X-RateLimit-Limit", "5"); // Very strict limit
        c.header("X-RateLimit-Remaining", "0");
      }
    }

    await next();
  };
};

/**
 * Input validation middleware
 * Validates request data for common attack patterns
 */
export const inputValidation = () => {
  return async (c: Context, next: Next) => {
    const userAgent = c.req.header("user-agent") || "";
    const referer = c.req.header("referer") || "";
    const url = c.req.url;

    // Check for common attack patterns
    const suspiciousPatterns = [
      /(<|%3c|script|javascript|vbscript)/i,
      /(union|select|insert|update|delete|drop|alter|create|exec)/i,
      /(\.\.|\/etc\/|\/proc\/|\\|\\|<|>)/i,
      /base64_decode|eval|exec|system|passthru/i,
    ];

    const isSuspicious = suspiciousPatterns.some(
      (pattern) =>
        pattern.test(userAgent) || pattern.test(referer) || pattern.test(url),
    );

    if (isSuspicious) {
      c.header("X-Security-Flag", "suspicious-input");
      c.header("X-Content-Type-Options", "nosniff");

      return c.json(
        {
          success: false,
          error: "Invalid request detected",
          code: "SUSPICIOUS_INPUT",
          message: "Request contains potentially malicious content",
        },
        400,
      );
    }

    // Additional validation for JSON endpoints
    if (c.req.header("content-type")?.includes("application/json")) {
      const contentType = c.req.header("content-type");
      if (!contentType.includes("application/json")) {
        c.header("X-Security-Flag", "invalid-content-type");
        return c.json(
          {
            success: false,
            error: "Invalid content type",
            code: "INVALID_CONTENT_TYPE",
          },
          400,
        );
      }
    }

    await next();
  };
};

/**
 * Comprehensive security middleware that combines all security features
 * Applies size limits and input validation BEFORE other checks
 */
export const comprehensiveSecurity = (config: SecurityConfig = {}) => {
  return async (c: Context, next: Next) => {
    // First, apply request size limit (should reject early if too large)
    const sizeLimitResult = await requestSizeLimit(config)(c, () =>
      Promise.resolve(undefined),
    );
    if (sizeLimitResult) {
      return sizeLimitResult; // Request too large, stop here
    }

    // Apply input validation
    const validationResult = await inputValidation()(c, () =>
      Promise.resolve(undefined),
    );
    if (validationResult) {
      return validationResult; // Invalid input, stop here
    }

    // Apply IP access control
    const ipResult = await ipAccessControl(config)(c, () =>
      Promise.resolve(undefined),
    );
    // Note: ipAccessControl doesn't return early, it just adds headers

    // Apply security headers and CORS (these add headers but don't reject)
    await securityHeaders(config)(c, () => Promise.resolve(undefined));
    await cors(config)(c, () => Promise.resolve(undefined));

    await next();
  };
};

// Export a default security middleware that combines all features
export const securityMiddleware = comprehensiveSecurity();
