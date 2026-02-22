import { Context, Next } from "hono";
import { logSecurityEvent, SecurityEventType } from "../lib/monitoring";
import { logger } from "../lib/logger";

/**
 * Security header validation middleware
 * Monitors for attacks that attempt to bypass security headers
 */
export const securityHeaderValidator = () => {
  return async (c: Context, next: Next) => {
    const clientIP =
      c.req.header("x-forwarded-for") ||
      c.req.header("x-real-ip") ||
      c.req.header("cf-connecting-ip") ||
      "unknown";

    const userAgent = c.req.header("user-agent") || "unknown";
    const referer = c.req.header("referer") || "";
    const origin = c.req.header("origin") || "";
    const path = c.req.path;
    const method = c.req.method;

    // Monitor for suspicious request patterns that might indicate header bypass attempts
    await checkSuspiciousRequestPatterns(
      c,
      clientIP,
      userAgent,
      referer,
      origin,
      path,
      method,
    );

    // Monitor for missing or invalid security headers in incoming requests
    await checkIncomingSecurityHeaders(c, clientIP, path, method);

    // Validate content type expectations
    await validateContentTypeSecurity(c, clientIP, path, method);

    await next();

    // Validate outgoing security headers are properly set
    await validateOutgoingSecurityHeaders(c, clientIP, path, method);
  };

  /**
   * Check for suspicious request patterns that might attempt to bypass security headers
   */
  async function checkSuspiciousRequestPatterns(
    c: Context,
    clientIP: string,
    userAgent: string,
    referer: string,
    origin: string,
    path: string,
    method: string,
  ): Promise<void> {
    // Check for common header bypass techniques
    const suspiciousPatterns = [
      // User agents that might be automated tools
      {
        pattern:
          /(bot|crawler|spider|scraper|curl|wget|python|java|go|node|axios|fetch)/i,
        severity: "medium" as const,
      },
      // Request headers that might indicate attempts to manipulate security
      { pattern: /^x-forwarded-/i, severity: "low" as const },
      { pattern: /^x-real-/i, severity: "low" as const },
      { pattern: /^x-originating-/i, severity: "medium" as const },
      // Referer header manipulation
      {
        pattern: /^(null|undefined|about:blank|javascript:|data:)/i,
        severity: "high" as const,
      },
      // Origin header manipulation
      {
        pattern: /^(null|undefined|about:blank|javascript:|data:)/i,
        severity: "high" as const,
      },
    ];

    for (const { pattern, severity } of suspiciousPatterns) {
      if (pattern.test(userAgent)) {
        await logSecurityEvent({
          type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
          severity,
          ip: clientIP,
          path,
          method,
          details: {
            patternType: "suspicious_user_agent",
            userAgent: userAgent.substring(0, 200),
            matchedPattern: pattern.source,
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (pattern.test(referer)) {
        await logSecurityEvent({
          type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
          severity,
          ip: clientIP,
          path,
          method,
          details: {
            patternType: "suspicious_referer",
            referer: referer.substring(0, 200),
            matchedPattern: pattern.source,
            timestamp: new Date().toISOString(),
          },
        });
      }

      if (pattern.test(origin)) {
        await logSecurityEvent({
          type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
          severity,
          ip: clientIP,
          path,
          method,
          details: {
            patternType: "suspicious_origin",
            origin: origin.substring(0, 200),
            matchedPattern: pattern.source,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // Check for excessive header values (might indicate injection attempts)
    const headersToCheck = [
      "user-agent",
      "referer",
      "origin",
      "accept",
      "accept-language",
    ];
    for (const header of headersToCheck) {
      const value = c.req.header(header);
      if (value && value.length > 2000) {
        await logSecurityEvent({
          type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
          severity: "medium",
          ip: clientIP,
          path,
          method,
          details: {
            patternType: "oversized_header",
            header,
            size: value.length,
            value: value.substring(0, 100),
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // Check for request smuggling attempts
    const url = c.req.url;
    if (url.includes("\r") || url.includes("\n") || url.includes("\t")) {
      await logSecurityEvent({
        type: SecurityEventType.MALICIOUS_REQUEST,
        severity: "high",
        ip: clientIP,
        path,
        method,
        details: {
          patternType: "request_smuggling_attempt",
          url: url.substring(0, 200),
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * Check incoming security headers for validation or manipulation attempts
   */
  async function checkIncomingSecurityHeaders(
    c: Context,
    clientIP: string,
    path: string,
    method: string,
  ): Promise<void> {
    const suspiciousIncomingHeaders = [
      "x-forwarded-for",
      "x-real-ip",
      "x-originating-ip",
      "x-cluster-client-ip",
      "x-forwarded-host",
      "x-forwarded-server",
      "x-forwarded-proto",
      "x-arr-ssl",
      "x-forwarded-ssl",
      "x-forwarded-scheme",
    ];

    for (const header of suspiciousIncomingHeaders) {
      const value = c.req.header(header);
      if (value) {
        // Log suspicious incoming headers (might indicate attempts to manipulate request context)
        await logSecurityEvent({
          type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
          severity: "low",
          ip: clientIP,
          path,
          method,
          details: {
            patternType: "suspicious_incoming_header",
            header,
            value: value.substring(0, 100),
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // Check for Content-Type manipulation attempts
    const contentType = c.req.header("content-type");
    if (contentType && method !== "GET" && method !== "HEAD") {
      const suspiciousContentTypes = [
        /\btext\/html\b/i,
        /\bapplication\/xml\b/i,
        /\btext\/xml\b/i,
        /\bmultipart\/form-data.*boundary.*=.*["']/i,
      ];

      for (const pattern of suspiciousContentTypes) {
        if (pattern.test(contentType)) {
          await logSecurityEvent({
            type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
            severity: "medium",
            ip: clientIP,
            path,
            method,
            details: {
              patternType: "suspicious_content_type",
              contentType: contentType.substring(0, 100),
              matchedPattern: pattern.source,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
    }
  }

  /**
   * Validate content type security
   */
  async function validateContentTypeSecurity(
    c: Context,
    clientIP: string,
    path: string,
    method: string,
  ): Promise<void> {
    const contentType = c.req.header("content-type");
    const accept = c.req.header("accept");

    // Check for content-type/accept header mismatches (might indicate content smuggling)
    if (contentType && accept) {
      if (
        contentType.includes("application/json") &&
        !accept.includes("application/json")
      ) {
        await logSecurityEvent({
          type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
          severity: "low",
          ip: clientIP,
          path,
          method,
          details: {
            patternType: "content_type_accept_mismatch",
            contentType: contentType.substring(0, 100),
            accept: accept.substring(0, 100),
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // Validate JSON content for potential attacks
    if (
      contentType?.includes("application/json") &&
      ["POST", "PUT", "PATCH"].includes(method)
    ) {
      try {
        const body = await c.req.text();
        if (body.length > 100000) {
          // 100KB limit
          await logSecurityEvent({
            type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
            severity: "medium",
            ip: clientIP,
            path,
            method,
            details: {
              patternType: "oversized_json_payload",
              size: body.length,
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Check for suspicious JSON content
        const suspiciousJsonPatterns = [
          /<script/i,
          /javascript:/i,
          /data:.*base64/i,
          /\${.*}/,
          /\\u[0-9a-fA-F]{4}/g,
        ];

        for (const pattern of suspiciousJsonPatterns) {
          if (pattern.test(body)) {
            await logSecurityEvent({
              type: SecurityEventType.XSS_ATTEMPT,
              severity: "high",
              ip: clientIP,
              path,
              method,
              details: {
                patternType: "suspicious_json_content",
                matchedPattern: pattern.source,
                bodySize: body.length,
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      } catch (error) {
        // If we can't parse the body, that might be suspicious
        await logSecurityEvent({
          type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
          severity: "medium",
          ip: clientIP,
          path,
          method,
          details: {
            patternType: "invalid_json_payload",
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  }

  /**
   * Validate that outgoing security headers are properly set
   */
  async function validateOutgoingSecurityHeaders(
    c: Context,
    clientIP: string,
    path: string,
    method: string,
  ): Promise<void> {
    const requiredSecurityHeaders = [
      "x-content-type-options",
      "x-frame-options",
      "x-xss-protection",
      "strict-transport-security",
      "referrer-policy",
      "permissions-policy",
      "content-security-policy",
    ];

    const missingHeaders: string[] = [];

    for (const header of requiredSecurityHeaders) {
      if (!c.res.headers.get(header)) {
        missingHeaders.push(header);
      }
    }

    if (missingHeaders.length > 0) {
      logger.error(
        "Missing required security headers",
        "security_header_validator",
        {
          missingHeaders,
          path,
          method,
          ip: clientIP,
        },
      );

      // This is more of a configuration issue than an attack, so lower severity
      await logSecurityEvent({
        type: SecurityEventType.SYSTEM_ERROR,
        severity: "low",
        ip: clientIP,
        path,
        method,
        details: {
          issue: "missing_security_headers",
          missingHeaders,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Validate CSP header content
    const csp = c.res.headers.get("content-security-policy");
    if (csp) {
      const cspIssues = validateCSPHeader(csp);
      if (cspIssues.length > 0) {
        await logSecurityEvent({
          type: SecurityEventType.SECURITY_MISCONFIGURATION,
          severity: "medium",
          ip: clientIP,
          path,
          method,
          details: {
            issue: "csp_header_issues",
            cspIssues,
            csp: csp.substring(0, 200),
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  }

  /**
   * Validate CSP header content for security issues
   */
  function validateCSPHeader(csp: string): string[] {
    const issues: string[] = [];

    // Check for unsafe directives
    const unsafePatterns = [
      { pattern: /'unsafe-inline'/i, issue: "unsafe_inline_in_csp" },
      { pattern: /'unsafe-eval'/i, issue: "unsafe_eval_in_csp" },
      { pattern: /\*/g, issue: "wildcard_in_csp" },
      { pattern: /data:/i, issue: "data_urls_in_csp" },
      { pattern: /http:/i, issue: "http_protocol_in_csp" },
    ];

    for (const { pattern, issue } of unsafePatterns) {
      if (pattern.test(csp)) {
        issues.push(issue);
      }
    }

    // Check for missing important directives
    const requiredDirectives = ["default-src", "script-src", "style-src"];
    for (const directive of requiredDirectives) {
      if (!csp.includes(directive)) {
        issues.push(`missing_${directive}_directive`);
      }
    }

    return issues;
  }
};
