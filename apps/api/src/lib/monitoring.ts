import { logger } from "./logger";
import { ErrorMonitor } from "./error-handler";
import { createHash, randomBytes } from "crypto";

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: "low" | "medium" | "high" | "critical";
  timestamp: Date;
  userId?: string;
  ip: string;
  userAgent?: string;
  path: string;
  method: string;
  details: Record<string, any>;
  metadata?: Record<string, any>;
}

export enum SecurityEventType {
  // Authentication events
  LOGIN_SUCCESS = "LOGIN_SUCCESS",
  LOGIN_FAILURE = "LOGIN_FAILURE",
  LOGOUT = "LOGOUT",
  SUSPICIOUS_LOGIN = "SUSPICIOUS_LOGIN",
  BRUTE_FORCE_DETECTED = "BRUTE_FORCE_DETECTED",

  // Authorization events
  UNAUTHORIZED_ACCESS = "UNAUTHORIZED_ACCESS",
  FORBIDDEN_ACCESS = "FORBIDDEN_ACCESS",
  PRIVILEGE_ESCALATION = "PRIVILEGE_ESCALATION",

  // Rate limiting events
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  SUSPICIOUS_REQUEST_PATTERN = "SUSPICIOUS_REQUEST_PATTERN",

  // File upload events
  MALICIOUS_FILE_DETECTED = "MALICIOUS_FILE_DETECTED",
  SUSPICIOUS_FILE_UPLOAD = "SUSPICIOUS_FILE_UPLOAD",
  FILE_QUOTA_EXCEEDED = "FILE_QUOTA_EXCEEDED",

  // Data events
  DATA_ACCESS_PATTERN = "DATA_ACCESS_PATTERN",
  SENSITIVE_DATA_ACCESS = "SENSITIVE_DATA_ACCESS",
  DATA_EXFILTRATION_ATTEMPT = "DATA_EXFILTRATION_ATTEMPT",

  // System events
  SYSTEM_ERROR = "SYSTEM_ERROR",
  SECURITY_MISCONFIGURATION = "SECURITY_MISCONFIGURATION",
  ANOMALOUS_BEHAVIOR = "ANOMALOUS_BEHAVIOR",

  // Network events
  SUSPICIOUS_IP = "SUSPICIOUS_IP",
  MALICIOUS_REQUEST = "MALICIOUS_REQUEST",
  INJECTION_ATTEMPT = "INJECTION_ATTEMPT",
  XSS_ATTEMPT = "XSS_ATTEMPT",
}

export interface SecurityAlert {
  id: string;
  eventId: string;
  type: SecurityEventType;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "resolved" | "false_positive";
  timestamp: Date;
  title: string;
  description: string;
  recommendations: string[];
  metadata: Record<string, any>;
}

export interface SecurityMetrics {
  totalEvents: number;
  eventsByType: Record<SecurityEventType, number>;
  eventsBySeverity: Record<string, number>;
  criticalEvents: number;
  alertsByStatus: Record<string, number>;
  topOffenders: Array<{
    ip: string;
    eventCount: number;
    lastSeen: Date;
  }>;
  recentEvents: SecurityEvent[];
}

class SecurityMonitoringService {
  private events: SecurityEvent[] = [];
  private alerts: SecurityAlert[] = [];
  private alertThresholds = {
    critical: 1, // Immediate alert for critical events
    high: 3, // Alert after 3 high severity events in 1 hour
    medium: 10, // Alert after 10 medium severity events in 1 hour
    low: 25, // Alert after 25 low severity events in 1 hour
  };

  /**
   * Log a security event
   */
  logEvent(event: Omit<SecurityEvent, "id" | "timestamp">): string {
    const securityEvent: SecurityEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      ...event,
    };

    this.events.push(securityEvent);

    // Log to console (in production, this would go to a logging service)
    logger.security(securityEvent.type, securityEvent.severity, {
      id: securityEvent.id,
      ip: securityEvent.ip,
      path: securityEvent.path,
      userId: securityEvent.userId,
      timestamp: securityEvent.timestamp.toISOString(),
      ...securityEvent.details,
    });

    // Check if we need to generate an alert
    this.evaluateAlerts(securityEvent);

    // Keep only last 10000 events in memory
    if (this.events.length > 10000) {
      this.events = this.events.slice(-10000);
    }

    return securityEvent.id;
  }

  /**
   * Evaluate if an alert should be generated based on the event
   */
  private evaluateAlerts(event: SecurityEvent): void {
    // Immediate alerts for critical events
    if (event.severity === "critical") {
      this.createAlert(event, {
        title: `Critical Security Event: ${event.type}`,
        description: `A critical security event was detected requiring immediate attention.`,
        recommendations: this.getRecommendations(event.type),
      });
      return;
    }

    // Check for patterns that trigger alerts
    const recentEvents = this.getRecentEvents(3600000); // Last hour
    const eventsByType = recentEvents.filter((e) => e.type === event.type);

    if (this.shouldAlert(event.type, eventsByType.length)) {
      this.createAlert(event, {
        title: `Security Alert: ${event.type}`,
        description: `Multiple ${event.type} events detected in the last hour.`,
        recommendations: this.getRecommendations(event.type),
      });
    }

    // Check for suspicious patterns
    this.detectSuspiciousPatterns(event, recentEvents);
  }

  /**
   * Check if we should alert based on event count
   */
  private shouldAlert(type: SecurityEventType, count: number): boolean {
    const threshold = this.getThreshold(type);
    return count >= threshold;
  }

  /**
   * Get alert threshold for event type
   */
  private getThreshold(type: SecurityEventType): number {
    const criticalTypes = [
      SecurityEventType.BRUTE_FORCE_DETECTED,
      SecurityEventType.MALICIOUS_FILE_DETECTED,
      SecurityEventType.DATA_EXFILTRATION_ATTEMPT,
      SecurityEventType.INJECTION_ATTEMPT,
    ];

    const highTypes = [
      SecurityEventType.UNAUTHORIZED_ACCESS,
      SecurityEventType.PRIVILEGE_ESCALATION,
      SecurityEventType.SUSPICIOUS_IP,
      SecurityEventType.XSS_ATTEMPT,
    ];

    if (criticalTypes.includes(type)) return this.alertThresholds.critical;
    if (highTypes.includes(type)) return this.alertThresholds.high;

    // Default to medium threshold
    return this.alertThresholds.medium;
  }

  /**
   * Detect suspicious patterns across multiple events
   */
  private detectSuspiciousPatterns(
    event: SecurityEvent,
    recentEvents: SecurityEvent[],
  ): void {
    const eventsFromSameIP = recentEvents.filter((e) => e.ip === event.ip);

    // Check for brute force patterns
    if (
      event.type === SecurityEventType.LOGIN_FAILURE &&
      eventsFromSameIP.length >= 5
    ) {
      // Add event directly to avoid recursion
      const bruteForceEvent: SecurityEvent = {
        id: this.generateEventId(),
        timestamp: new Date(),
        type: SecurityEventType.BRUTE_FORCE_DETECTED,
        severity: "high",
        ip: event.ip,
        path: event.path,
        method: event.method,
        details: {
          failureCount: eventsFromSameIP.filter(
            (e) => e.type === SecurityEventType.LOGIN_FAILURE,
          ).length,
          timeWindow: "1 hour",
        },
      };
      this.events.push(bruteForceEvent);
      logger.security(
        bruteForceEvent.type,
        bruteForceEvent.severity,
        bruteForceEvent.details,
      );
    }

    // Check for suspicious request patterns
    if (eventsFromSameIP.length >= 50) {
      // Add event directly to avoid recursion
      const suspiciousPatternEvent: SecurityEvent = {
        id: this.generateEventId(),
        timestamp: new Date(),
        type: SecurityEventType.SUSPICIOUS_REQUEST_PATTERN,
        severity: "medium",
        ip: event.ip,
        path: event.path,
        method: event.method,
        details: {
          requestCount: eventsFromSameIP.length,
          timeWindow: "1 hour",
          uniquePaths: [...new Set(eventsFromSameIP.map((e) => e.path))].length,
        },
      };
      this.events.push(suspiciousPatternEvent);
      logger.security(
        suspiciousPatternEvent.type,
        suspiciousPatternEvent.severity,
        suspiciousPatternEvent.details,
      );
    }

    // Check for data access patterns
    const dataAccessEvents = eventsFromSameIP.filter(
      (e) =>
        e.type === SecurityEventType.DATA_ACCESS_PATTERN ||
        e.type === SecurityEventType.SENSITIVE_DATA_ACCESS,
    );

    if (dataAccessEvents.length >= 20) {
      // Add event directly to avoid recursion
      const exfiltrationEvent: SecurityEvent = {
        id: this.generateEventId(),
        timestamp: new Date(),
        type: SecurityEventType.DATA_EXFILTRATION_ATTEMPT,
        severity: "high",
        ip: event.ip,
        path: event.path,
        method: event.method,
        details: {
          dataAccessCount: dataAccessEvents.length,
          timeWindow: "1 hour",
        },
      };
      this.events.push(exfiltrationEvent);
      logger.security(
        exfiltrationEvent.type,
        exfiltrationEvent.severity,
        exfiltrationEvent.details,
      );
    }
  }

  /**
   * Create a security alert
   */
  private createAlert(
    event: SecurityEvent,
    options: {
      title: string;
      description: string;
      recommendations: string[];
    },
  ): void {
    const alert: SecurityAlert = {
      id: this.generateAlertId(),
      eventId: event.id,
      type: event.type,
      severity: event.severity,
      status: "open",
      timestamp: new Date(),
      ...options,
      metadata: {
        eventIp: event.ip,
        eventPath: event.path,
        eventUserId: event.userId,
      },
    };

    this.alerts.push(alert);

    // Log alert (in production, this would send notifications)
    logger.security("ALERT_GENERATED", alert.severity, {
      alertId: alert.id,
      title: alert.title,
      description: alert.description,
      recommendations: alert.recommendations,
    });
  }

  /**
   * Get recommendations for a specific event type
   */
  private getRecommendations(type: SecurityEventType): string[] {
    const recommendations: Record<SecurityEventType, string[]> = {
      [SecurityEventType.LOGIN_FAILURE]: [
        "Monitor for additional failed login attempts",
        "Consider implementing account lockout policies",
        "Verify if MFA is enabled for the account",
      ],
      [SecurityEventType.BRUTE_FORCE_DETECTED]: [
        "Block the IP address temporarily",
        "Implement rate limiting for login attempts",
        "Notify user of suspicious activity",
      ],
      [SecurityEventType.UNAUTHORIZED_ACCESS]: [
        "Review user permissions and access controls",
        "Audit recent access logs for the affected resource",
        "Consider additional authentication measures",
      ],
      [SecurityEventType.MALICIOUS_FILE_DETECTED]: [
        "Quarantine the uploaded file immediately",
        "Scan user's other uploads for malware",
        "Review user's account for suspicious activity",
      ],
      [SecurityEventType.INJECTION_ATTEMPT]: [
        "Block the requesting IP address",
        "Review and validate input sanitization",
        "Audit database logs for potential compromises",
      ],
      [SecurityEventType.XSS_ATTEMPT]: [
        "Block the requesting IP address",
        "Review and strengthen output encoding",
        "Audit user input validation mechanisms",
      ],
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: [
        "Monitor for continued abuse",
        "Consider adjusting rate limits",
        "Review legitimate traffic patterns",
      ],
      [SecurityEventType.DATA_EXFILTRATION_ATTEMPT]: [
        "Immediately block the IP address",
        "Review data access logs for the past 24 hours",
        "Consider temporarily restricting user account",
      ],
      [SecurityEventType.SUSPICIOUS_IP]: [
        "Investigate the source of the traffic",
        "Consider blocking the IP address",
        "Review geolocation and reputation data",
      ],
      [SecurityEventType.ANOMALOUS_BEHAVIOR]: [
        "Conduct a thorough security audit",
        "Review user activity patterns",
        "Consider additional monitoring",
      ],

      // Add missing event types with default recommendations
      [SecurityEventType.LOGIN_SUCCESS]: [
        "Monitor for successful login patterns",
        "Verify login location consistency",
      ],
      [SecurityEventType.LOGOUT]: [
        "Review session termination",
        "Monitor for concurrent sessions",
      ],
      [SecurityEventType.SUSPICIOUS_LOGIN]: [
        "Investigate login anomaly",
        "Consider temporary account lock",
      ],
      [SecurityEventType.FORBIDDEN_ACCESS]: [
        "Review permission settings",
        "Audit access control configuration",
      ],
      [SecurityEventType.PRIVILEGE_ESCALATION]: [
        "Investigate privilege escalation attempt",
        "Review role assignments",
      ],
      [SecurityEventType.SUSPICIOUS_REQUEST_PATTERN]: [
        "Analyze request patterns",
        "Consider IP blocking",
      ],
      [SecurityEventType.SUSPICIOUS_FILE_UPLOAD]: [
        "Scan uploaded files",
        "Review file access patterns",
      ],
      [SecurityEventType.FILE_QUOTA_EXCEEDED]: [
        "Review storage usage",
        "Contact user about quota limits",
      ],
      [SecurityEventType.DATA_ACCESS_PATTERN]: [
        "Audit data access logs",
        "Review user permissions",
      ],
      [SecurityEventType.SENSITIVE_DATA_ACCESS]: [
        "Investigate sensitive data access",
        "Review authorization context",
      ],
      [SecurityEventType.SYSTEM_ERROR]: [
        "Review system logs",
        "Monitor for recurring errors",
      ],
      [SecurityEventType.SECURITY_MISCONFIGURATION]: [
        "Audit security settings",
        "Review configuration files",
      ],
      [SecurityEventType.MALICIOUS_REQUEST]: [
        "Block malicious requests",
        "Investigate request patterns",
      ],
    };

    return (
      recommendations[type] || [
        "Review the security event details",
        "Monitor for related activity",
        "Investigate the source and cause",
      ]
    );
  }

  /**
   * Get recent events within a time window
   */
  private getRecentEvents(timeWindowMs: number): SecurityEvent[] {
    const cutoff = new Date(Date.now() - timeWindowMs);
    return this.events.filter((event) => event.timestamp >= cutoff);
  }

  /**
   * Get security metrics
   */
  getMetrics(): SecurityMetrics {
    const recentEvents = this.getRecentEvents(86400000); // Last 24 hours
    const eventsByType = {} as Record<SecurityEventType, number>;
    const eventsBySeverity = {} as Record<string, number>;
    const ipCounts = {} as Record<string, number>;

    recentEvents.forEach((event) => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsBySeverity[event.severity] =
        (eventsBySeverity[event.severity] || 0) + 1;
      ipCounts[event.ip] = (ipCounts[event.ip] || 0) + 1;
    });

    const topOffenders = Object.entries(ipCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([ip, eventCount]) => ({
        ip,
        eventCount,
        lastSeen: recentEvents.filter((e) => e.ip === ip).pop()!.timestamp,
      }));

    const alertsByStatus = {} as Record<string, number>;
    this.alerts.forEach((alert) => {
      alertsByStatus[alert.status] = (alertsByStatus[alert.status] || 0) + 1;
    });

    return {
      totalEvents: recentEvents.length,
      eventsByType,
      eventsBySeverity,
      criticalEvents: eventsBySeverity.critical || 0,
      alertsByStatus,
      topOffenders,
      recentEvents: recentEvents.slice(-50),
    };
  }

  /**
   * Get alerts with optional filtering
   */
  getAlerts(filters?: {
    status?: SecurityAlert["status"];
    severity?: SecurityAlert["severity"];
    limit?: number;
  }): SecurityAlert[] {
    let alerts = [...this.alerts];

    if (filters?.status) {
      alerts = alerts.filter((alert) => alert.status === filters.status);
    }

    if (filters?.severity) {
      alerts = alerts.filter((alert) => alert.severity === filters.severity);
    }

    // Sort by timestamp descending
    alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters?.limit) {
      alerts = alerts.slice(0, filters.limit);
    }

    return alerts;
  }

  /**
   * Update alert status
   */
  updateAlertStatus(alertId: string, status: SecurityAlert["status"]): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.status = status;
      logger.security("ALERT_STATUS_UPDATED", "low", {
        alertId,
        newStatus: status,
      });
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${randomBytes(8).toString("hex")}`;
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${randomBytes(8).toString("hex")}`;
  }

  /**
   * Clear old data (for maintenance)
   */
  cleanup(): void {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Remove old events
    this.events = this.events.filter(
      (event) => event.timestamp >= thirtyDaysAgo,
    );

    // Remove old resolved alerts
    this.alerts = this.alerts.filter(
      (alert) =>
        alert.status === "open" ||
        alert.status === "investigating" ||
        alert.timestamp >= thirtyDaysAgo,
    );

    logger.info("Security monitoring cleanup completed", "system", {
      eventsRemaining: this.events.length,
      alertsRemaining: this.alerts.length,
    });
  }
}

// Global security monitoring instance
export const securityMonitor = new SecurityMonitoringService();

// Export convenience functions
export const logSecurityEvent = (
  event: Omit<SecurityEvent, "id" | "timestamp">,
) => {
  return securityMonitor.logEvent(event);
};

export const getSecurityMetrics = () => securityMonitor.getMetrics();
export const getSecurityAlerts = (
  filters?: Parameters<SecurityMonitoringService["getAlerts"]>[0],
) => securityMonitor.getAlerts(filters);
export const updateAlertStatus = (
  alertId: string,
  status: SecurityAlert["status"],
) => securityMonitor.updateAlertStatus(alertId, status);

/**
 * Application health and monitoring utilities
 */
export class AppMonitor {
  private static startTime: number = Date.now();
  private static readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private static healthCheckInterval: NodeJS.Timeout | null = null;

  /**
   * Start application monitoring
   */
  static start(): void {
    logger.info("Starting application monitoring", "system");
    this.startTime = Date.now();

    // Start periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);

    // Log application startup
    logger.info("Application monitoring started", "system", {
      startTime: new Date(this.startTime).toISOString(),
      healthCheckInterval: this.HEALTH_CHECK_INTERVAL,
    });
  }

  /**
   * Stop application monitoring
   */
  static stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info("Application monitoring stopped", "system");
    }
  }

  /**
   * Perform health check and log any issues
   */
  private static performHealthCheck(): void {
    const uptime = Date.now() - this.startTime;
    const uptimeMinutes = Math.floor(uptime / 60000);
    const uptimeHours = Math.floor(uptimeMinutes / 60);
    const uptimeDays = Math.floor(uptimeHours / 24);

    // Check error rates
    const errorStats = ErrorMonitor.getErrorStats();
    const hasHighErrorRate = Object.values(errorStats).some(
      (stats) => stats.thresholdExceeded,
    );

    // Check memory usage (basic)
    const memUsage = process.memoryUsage();
    const memoryUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memoryLimitMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const memoryUsagePercent = Math.round(
      (memUsage.heapUsed / memUsage.heapTotal) * 100,
    );

    // Log periodic health status
    const healthData = {
      uptime: {
        milliseconds: uptime,
        minutes: uptimeMinutes,
        hours: uptimeHours,
        days: uptimeDays,
      },
      memory: {
        usedMB: memoryUsageMB,
        limitMB: memoryLimitMB,
        usagePercent: memoryUsagePercent,
      },
      errors: errorStats,
    };

    logger.debug("Health check completed", "monitoring", healthData);

    // Alert on high error rate
    if (hasHighErrorRate) {
      logger.security("high_error_rate_detected", "high", {
        errorStats,
        uptime: uptimeMinutes,
        memoryUsage: memoryUsagePercent,
      });
    }

    // Alert on high memory usage (> 80%)
    if (memoryUsagePercent > 80) {
      logger.warn("High memory usage detected", "monitoring", {
        memoryUsage: memoryUsagePercent,
        threshold: 80,
        memoryStats: {
          used: memoryUsageMB,
          limit: memoryLimitMB,
        },
      });
    }
  }

  /**
   * Log application shutdown gracefully
   */
  static shutdown(reason: string): void {
    const uptime = Date.now() - this.startTime;

    logger.info("Application shutdown initiated", "system", {
      reason,
      uptime: Math.floor(uptime / 1000),
      timestamp: new Date().toISOString(),
    });

    this.stop();

    // Log final error summary
    const finalErrorStats = ErrorMonitor.getErrorStats();
    logger.info("Final error statistics", "system", finalErrorStats);
  }

  /**
   * Get application metrics for monitoring endpoints
   */
  static getMetrics(): {
    uptime: number;
    memory: NodeJS.MemoryUsage;
    errors: Record<string, any>;
    timestamp: string;
  } {
    const uptime = Date.now() - this.startTime;
    const memUsage = process.memoryUsage();
    const errorStats = ErrorMonitor.getErrorStats();

    return {
      uptime: Math.floor(uptime / 1000),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024),
        arrayBuffers: Math.round((memUsage.arrayBuffers || 0) / 1024 / 1024),
      },
      errors: errorStats,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log performance metrics with context
   */
  static logPerformance(
    operation: string,
    duration: number,
    metadata?: Record<string, any>,
  ): void {
    logger.performance(operation, duration, {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      ...metadata,
    });
  }

  /**
   * Log database operation performance
   */
  static logDatabasePerformance(
    operation: string,
    table?: string,
    duration?: number,
    metadata?: Record<string, any>,
  ): void {
    logger.database(operation, table, duration, {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      ...metadata,
    });
  }

  /**
   * Log security events with application context
   */
  static logSecurityEvent(
    event: string,
    severity: "low" | "medium" | "high" | "critical",
    details?: Record<string, any>,
  ): void {
    const context = {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memory: process.memoryUsage(),
    };

    logger.security(event, severity, {
      ...details,
      ...context,
    });
  }
}
