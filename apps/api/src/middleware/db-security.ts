import { Context, Next } from "hono";
import { logSecurityEvent, SecurityEventType } from "../lib/monitoring";
import { logger } from "../lib/logger";

/**
 * Database security middleware for detecting SQL injection attempts
 */
export const dbSecurityMiddleware = () => {
  const suspiciousPatterns = [
    // Classic SQL injection patterns
    /(\bor\b|\band\b)\s+\d+\s*=\s*\d+/i,
    /(\bor\b|\band\b)\s+['"]?\w+['"]?\s*=\s*['"]?\w+['"]?/i,
    /union\s+select/i,
    /select\s+.*\s+from\s+information_schema/i,
    /select\s+.*\s+from\s+mysql\.user/i,
    /select\s+.*\s+from\s+pg_user/i,
    /select\s+.*\s+from\s+sys\./i,

    // String-based injection patterns
    /'.*'='/,
    /".*"="/,
    /1\s*=\s*1/,
    /true\s*=\s*true/i,
    /false\s*=\s*false/i,

    // Comment-based attacks
    /--.*$/m,
    /\/\*.*\*\//,
    /;\s*drop\s+/i,
    /;\s*delete\s+/i,
    /;\s*insert\s+/i,
    /;\s*update\s+/i,

    // Function-based attacks
    /xp_cmdshell/i,
    /sp_executesql/i,
    /exec\s*\(/i,
    /execute\s+/i,
    /eval\s*\(/i,

    // Encoding-based attacks
    /%27/i, // Encoded single quote
    /%22/i, // Encoded double quote
    /%3B/i, // Encoded semicolon
    /%2D%2D/i, // Encoded double dash

    // Note: Removed base64 pattern as it causes false positives on session tokens

    // Time-based blind SQL injection
    /waitfor\s+delay/i,
    /sleep\s*\(/i,
    /benchmark\s*\(/i,
    /pg_sleep\s*\(/i,

    // Boolean-based blind SQL injection
    /and\s+.*\s+like\s+/i,
    /or\s+.*\s+like\s+/i,
    /and\s+.*\s+in\s*\(/i,
    /or\s+.*\s+in\s*\(/i,

    // Advanced injection techniques
    /substring\s*\(/i,
    /ascii\s*\(/i,
    /char\s*\(/i,
    /concat\s*\(/i,
    /length\s*\(/i,
    /version\s*\(/i,
    /@@version/i,
    /database\s*\(/i,
    /user\s*\(/i,
    /current_user/i,
    /system_user/i,
  ];

  /**
   * Check if input contains suspicious SQL injection patterns
   */
  function containsSuspiciousPatterns(input: string): {
    isSuspicious: boolean;
    patterns: string[];
  } {
    const detectedPatterns: string[] = [];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(input)) {
        detectedPatterns.push(pattern.source);
      }
    }

    return {
      isSuspicious: detectedPatterns.length > 0,
      patterns: detectedPatterns,
    };
  }

  /**
   * Extract and analyze request data for SQL injection attempts
   */
  async function analyzeRequestForInjection(c: Context): Promise<void> {
    const clientIP =
      c.req.header("x-forwarded-for") ||
      c.req.header("x-real-ip") ||
      c.req.header("cf-connecting-ip") ||
      "unknown";

    const userAgent = c.req.header("user-agent") || "unknown";
    const path = c.req.path;
    const method = c.req.method;

    // Analyze query parameters
    const url = new URL(c.req.url, "http://localhost");
    url.searchParams.forEach((value, key) => {
      const analysis = containsSuspiciousPatterns(value);
      if (analysis.isSuspicious) {
        logSuspiciousActivity("query_parameter", {
          parameter: key,
          value: value.substring(0, 100), // Limit logged value length
          patterns: analysis.patterns,
          url: path,
        });
      }
    });

    // Analyze path parameters
    const pathSegments = path
      .split("/")
      .filter((segment) => segment.length > 0);
    for (const segment of pathSegments) {
      const analysis = containsSuspiciousPatterns(segment);
      if (analysis.isSuspicious) {
        logSuspiciousActivity("path_parameter", {
          segment: segment.substring(0, 100),
          patterns: analysis.patterns,
          path,
        });
      }
    }

    // Analyze request body for POST/PUT requests
    // Skip body analysis for multipart/form-data (file uploads) as reading the body
    // would consume it and prevent downstream handlers from processing the file
    const contentType = c.req.header("content-type") || "";
    if (
      ["POST", "PUT", "PATCH"].includes(method) &&
      !contentType.includes("multipart/form-data")
    ) {
      try {
        const body = await c.req.text();
        if (body && body.length > 0 && body.length < 10000) {
          // Reasonable size check
          const analysis = containsSuspiciousPatterns(body);
          if (analysis.isSuspicious) {
            logSuspiciousActivity("request_body", {
              bodyLength: body.length,
              patterns: analysis.patterns,
              path,
              contentType,
            });
          }
        }
      } catch (error) {
        // If we can't read the body, just log and continue
        logger.debug(
          "Could not analyze request body for SQL injection",
          "db_security",
          {
            path,
            method,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    // Analyze headers for injection attempts
    const suspiciousHeaders = [
      "x-forwarded-for",
      "x-real-ip",
      "x-original-url",
      "referer",
      "cookie",
    ];

    for (const header of suspiciousHeaders) {
      const value = c.req.header(header);
      if (value) {
        const analysis = containsSuspiciousPatterns(value);
        if (analysis.isSuspicious) {
          logSuspiciousActivity("header", {
            header,
            value: value.substring(0, 100),
            patterns: analysis.patterns,
          });
        }
      }
    }

    /**
     * Log suspicious SQL injection activity
     */
    function logSuspiciousActivity(
      location: string,
      details: Record<string, any>,
    ): void {
      logSecurityEvent({
        type: SecurityEventType.INJECTION_ATTEMPT,
        severity: "high",
        ip: clientIP,
        path,
        method,
        details: {
          injectionType: "sql_injection",
          location,
          userAgent,
          ...details,
          timestamp: new Date().toISOString(),
        },
      });

      logger.warn("SQL injection attempt detected", "db_security", {
        ip: clientIP,
        path,
        method,
        location,
        patterns: details.patterns,
        userAgent,
      });
    }
  }

  return async (c: Context, next: Next) => {
    try {
      // Analyze request for SQL injection patterns
      await analyzeRequestForInjection(c);

      await next();
    } catch (error) {
      // Check if the error might be related to SQL injection
      const errorMessage =
        error instanceof Error
          ? error.message.toLowerCase()
          : String(error).toLowerCase();

      const sqlErrorPatterns = [
        "syntax error",
        "unclosed quotation mark",
        "incorrect syntax near",
        "invalid column name",
        "ambiguous column name",
        "conversion failed when converting",
        "operand type clash",
      ];

      const isSQLError = sqlErrorPatterns.some((pattern) =>
        errorMessage.includes(pattern),
      );

      if (isSQLError) {
        const clientIP =
          c.req.header("x-forwarded-for") ||
          c.req.header("x-real-ip") ||
          "unknown";

        logSecurityEvent({
          type: SecurityEventType.INJECTION_ATTEMPT,
          severity: "high",
          ip: clientIP,
          path: c.req.path,
          method: c.req.method,
          details: {
            injectionType: "sql_injection",
            detectedVia: "database_error",
            errorMessage:
              error instanceof Error ? error.message : String(error),
            userAgent: c.req.header("user-agent"),
            timestamp: new Date().toISOString(),
          },
        });

        logger.error(
          "Potential SQL injection detected via database error",
          "db_security",
          {
            ip: clientIP,
            path: c.req.path,
            method,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }

      throw error;
    }
  };
};

/**
 * Enhanced parameter validation middleware
 */
export const parameterValidationMiddleware = () => {
  return async (c: Context, next: Next) => {
    const clientIP =
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";

    const path = c.req.path;
    const method = c.req.method;

    try {
      // Validate query parameters
      const url = new URL(c.req.url, "http://localhost");
      url.searchParams.forEach((value, key) => {
        // Check for parameter pollution
        if (url.searchParams.getAll(key).length > 1) {
          logSecurityEvent({
            type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
            severity: "medium",
            ip: clientIP,
            path,
            method,
            details: {
              issue: "parameter_pollution",
              parameter: key,
              values: url.searchParams.getAll(key),
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Check for oversized parameters
        if (value.length > 1000) {
          logSecurityEvent({
            type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
            severity: "medium",
            ip: clientIP,
            path,
            method,
            details: {
              issue: "oversized_parameter",
              parameter: key,
              size: value.length,
              timestamp: new Date().toISOString(),
            },
          });
        }
      });

      // Validate request size
      const contentLength = c.req.header("content-length");
      if (contentLength) {
        const size = parseInt(contentLength);
        if (size > 50 * 1024 * 1024) {
          // 50MB limit
          logSecurityEvent({
            type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
            severity: "medium",
            ip: clientIP,
            path,
            method,
            details: {
              issue: "oversized_request",
              size,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      await next();
    } catch (error) {
      throw error;
    }
  };
};
