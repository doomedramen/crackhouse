import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  getSecurityMetrics,
  getSecurityAlerts,
  updateAlertStatus,
  SecurityEventType,
} from "../lib/monitoring";
import { requireRole } from "../middleware/auth";
import { logger } from "@/lib/logger";

import { authenticate } from "../middleware/auth";

const securityRoutes = new Hono();

// Apply authentication middleware to all routes
securityRoutes.use("*", authenticate);

// Schema for updating alert status
const updateAlertSchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "false_positive"]),
});

// Schema for filtering alerts
const alertsFilterSchema = z.object({
  status: z
    .enum(["open", "investigating", "resolved", "false_positive"])
    .optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
});

/**
 * GET /security/metrics
 * Get security metrics and statistics
 */
securityRoutes.get("/metrics", (c) => {
  try {
    const metrics = getSecurityMetrics();

    return c.json({
      success: true,
      data: {
        overview: {
          totalEvents: metrics.totalEvents,
          criticalEvents: metrics.criticalEvents,
          openAlerts: metrics.alertsByStatus.open || 0,
          investigatingAlerts: metrics.alertsByStatus.investigating || 0,
        },
        eventsByType: metrics.eventsByType,
        eventsBySeverity: metrics.eventsBySeverity,
        topOffenders: metrics.topOffenders,
        recentEvents: metrics.recentEvents.slice(0, 20), // Limit to last 20 events
        alertsByStatus: metrics.alertsByStatus,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error fetching security metrics", "security-monitoring", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return c.json(
      {
        success: false,
        error: "Failed to fetch security metrics",
      },
      500,
    );
  }
});

/**
 * GET /security/alerts
 * Get security alerts with optional filtering
 */
securityRoutes.get("/alerts", zValidator("query", alertsFilterSchema), (c) => {
  try {
    const filters = c.req.valid("query");
    const alerts = getSecurityAlerts(filters);

    return c.json({
      success: true,
      data: {
        alerts,
        total: alerts.length,
        filters: filters,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error fetching security alerts", "security-monitoring", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return c.json(
      {
        success: false,
        error: "Failed to fetch security alerts",
      },
      500,
    );
  }
});

/**
 * PUT /security/alerts/:alertId
 * Update security alert status
 */
securityRoutes.put(
  "/alerts/:alertId",
  zValidator("json", updateAlertSchema),
  (c) => {
    try {
      const alertId = c.req.param("alertId");
      const { status } = c.req.valid("json");

      updateAlertStatus(alertId, status);

      return c.json({
        success: true,
        message: `Alert ${alertId} status updated to ${status}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Error updating alert status", "security-monitoring", {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return c.json(
        {
          success: false,
          error: "Failed to update alert status",
        },
        500,
      );
    }
  },
);

/**
 * GET /security/dashboard
 * Get security dashboard data (summary view)
 */
securityRoutes.get("/dashboard", (c) => {
  try {
    const metrics = getSecurityMetrics();
    const criticalAlerts = getSecurityAlerts({
      severity: "critical",
      status: "open",
      limit: 5,
    });
    const highAlerts = getSecurityAlerts({
      severity: "high",
      status: "open",
      limit: 5,
    });

    return c.json({
      success: true,
      data: {
        summary: {
          totalEvents: metrics.totalEvents,
          criticalEvents: metrics.criticalEvents,
          openAlerts: metrics.alertsByStatus.open || 0,
          topOffender: metrics.topOffenders[0] || null,
        },
        criticalAlerts,
        highAlerts,
        eventsBySeverity: metrics.eventsBySeverity,
        topOffenders: metrics.topOffenders.slice(0, 5),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error fetching security dashboard", "security-monitoring", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return c.json(
      {
        success: false,
        error: "Failed to fetch security dashboard",
      },
      500,
    );
  }
});

/**
 * GET /security/events/summary
 * Get security events summary by type and severity
 */
securityRoutes.get("/events/summary", (c) => {
  try {
    const metrics = getSecurityMetrics();

    // Group events by category
    const eventCategories = {
      authentication: [
        SecurityEventType.LOGIN_SUCCESS,
        SecurityEventType.LOGIN_FAILURE,
        SecurityEventType.LOGOUT,
        SecurityEventType.SUSPICIOUS_LOGIN,
        SecurityEventType.BRUTE_FORCE_DETECTED,
      ],
      authorization: [
        SecurityEventType.UNAUTHORIZED_ACCESS,
        SecurityEventType.FORBIDDEN_ACCESS,
        SecurityEventType.PRIVILEGE_ESCALATION,
      ],
      rateLimiting: [
        SecurityEventType.RATE_LIMIT_EXCEEDED,
        SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
      ],
      fileSecurity: [
        SecurityEventType.MALICIOUS_FILE_DETECTED,
        SecurityEventType.SUSPICIOUS_FILE_UPLOAD,
        SecurityEventType.FILE_QUOTA_EXCEEDED,
      ],
      dataSecurity: [
        SecurityEventType.DATA_ACCESS_PATTERN,
        SecurityEventType.SENSITIVE_DATA_ACCESS,
        SecurityEventType.DATA_EXFILTRATION_ATTEMPT,
      ],
      system: [
        SecurityEventType.SYSTEM_ERROR,
        SecurityEventType.SECURITY_MISCONFIGURATION,
        SecurityEventType.ANOMALOUS_BEHAVIOR,
      ],
      network: [
        SecurityEventType.SUSPICIOUS_IP,
        SecurityEventType.MALICIOUS_REQUEST,
        SecurityEventType.INJECTION_ATTEMPT,
        SecurityEventType.XSS_ATTEMPT,
      ],
    };

    const eventsByCategory: Record<string, number> = {};
    Object.entries(eventCategories).forEach(([category, eventTypes]) => {
      eventsByCategory[category] = eventTypes.reduce((total, eventType) => {
        return total + (metrics.eventsByType[eventType] || 0);
      }, 0);
    });

    return c.json({
      success: true,
      data: {
        eventsByCategory,
        eventsBySeverity: metrics.eventsBySeverity,
        totalEvents: metrics.totalEvents,
        criticalEvents: metrics.criticalEvents,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error fetching events summary", "security-monitoring", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return c.json(
      {
        success: false,
        error: "Failed to fetch events summary",
      },
      500,
    );
  }
});

/**
 * GET /security/health
 * Get security monitoring health status
 */
securityRoutes.get("/health", (c) => {
  try {
    const metrics = getSecurityMetrics();
    const openAlerts = metrics.alertsByStatus.open || 0;
    const criticalAlerts = getSecurityAlerts({
      severity: "critical",
      status: "open",
    }).length;

    // Determine health status
    let status = "healthy";
    if (criticalAlerts > 0) {
      status = "critical";
    } else if (openAlerts > 10) {
      status = "warning";
    } else if (openAlerts > 0) {
      status = "degraded";
    }

    return c.json({
      success: true,
      data: {
        status,
        metrics: {
          totalEvents: metrics.totalEvents,
          openAlerts,
          criticalAlerts,
          topOffenders: metrics.topOffenders.length,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error fetching security health", "security-monitoring", {
      error: error instanceof Error ? error : new Error(String(error)),
    });
    return c.json(
      {
        success: false,
        error: "Failed to fetch security health status",
      },
      500,
    );
  }
});

export { securityRoutes };
