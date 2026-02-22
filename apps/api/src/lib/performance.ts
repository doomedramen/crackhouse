import { logger } from "./logger";
import { getCache } from "./cache";
import { getDbOptimizer } from "./db-optimizer";

/**
 * Performance metrics interface
 */
interface PerformanceMetrics {
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  uptime: number;
  requestCount: number;
  avgResponseTime: number;
  errorRate: number;
  activeConnections: number;
  cacheHitRate: number;
  databaseQueries: number;
  slowQueries: number;
}

/**
 * Request performance data
 */
interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  timestamp: number;
  userId?: string;
  userAgent?: string;
  cached: boolean;
  error?: string;
}

/**
 * Performance monitoring and optimization service
 */
export class PerformanceMonitor {
  private cache;
  private dbOptimizer;
  private metrics: PerformanceMetrics;
  private requestMetrics: RequestMetrics[];
  private readonly METRICS_KEY = "autopwn:performance:metrics";
  private readonly REQUESTS_KEY = "autopwn:performance:requests";
  private readonly MAX_REQUEST_SAMPLES = 10000;

  constructor() {
    this.cache = getCache({
      defaultTTL: 900, // 15 minutes
      keyPrefix: "autopwn:perf:",
      enableCompression: false, // Don't compress metrics
    });

    this.dbOptimizer = getDbOptimizer();

    this.metrics = {
      memory: {
        rss: 0,
        heapTotal: 0,
        heapUsed: 0,
        external: 0,
        arrayBuffers: 0,
      },
      cpu: { user: 0, system: 0 },
      uptime: 0,
      requestCount: 0,
      avgResponseTime: 0,
      errorRate: 0,
      activeConnections: 0,
      cacheHitRate: 0,
      databaseQueries: 0,
      slowQueries: 0,
    };

    this.requestMetrics = [];
    this.loadMetrics();
    this.startPeriodicCollection();
  }

  /**
   * Record request metrics
   */
  async recordRequest(metrics: RequestMetrics): Promise<void> {
    // Add to request metrics
    this.requestMetrics.push(metrics);

    // Keep only recent samples
    if (this.requestMetrics.length > this.MAX_REQUEST_SAMPLES) {
      this.requestMetrics = this.requestMetrics.slice(
        -this.MAX_REQUEST_SAMPLES,
      );
    }

    // Update real-time metrics
    await this.updateRealtimeMetrics();

    // Log slow requests
    if (metrics.responseTime > 5000) {
      // > 5 seconds
      logger.warn("Slow request detected", "performance", {
        method: metrics.method,
        path: metrics.path,
        responseTime: metrics.responseTime,
        statusCode: metrics.statusCode,
      });
    }

    // Log errors
    if (metrics.error || metrics.statusCode >= 400) {
      logger.error("Request error", "performance", {
        method: metrics.method,
        path: metrics.path,
        statusCode: metrics.statusCode,
        error: metrics.error,
      });
    }
  }

  /**
   * Get current performance metrics
   */
  async getMetrics(): Promise<PerformanceMetrics> {
    await this.updateRealtimeMetrics();
    return { ...this.metrics };
  }

  /**
   * Get detailed request statistics
   */
  async getRequestStats(hours: number = 1): Promise<any> {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const recentRequests = this.requestMetrics.filter(
      (r) => r.timestamp >= cutoff,
    );

    if (recentRequests.length === 0) {
      return {
        total: 0,
        avgResponseTime: 0,
        errorRate: 0,
        topEndpoints: [],
        statusCodes: {},
        methods: {},
      };
    }

    const total = recentRequests.length;
    const avgResponseTime =
      recentRequests.reduce((sum, r) => sum + r.responseTime, 0) / total;
    const errorCount = recentRequests.filter(
      (r) => r.statusCode >= 400 || r.error,
    ).length;
    const errorRate = (errorCount / total) * 100;

    // Top endpoints by request count
    const endpointCounts = new Map<string, number>();
    for (const req of recentRequests) {
      const count = endpointCounts.get(req.path) || 0;
      endpointCounts.set(req.path, count + 1);
    }

    const topEndpoints = Array.from(endpointCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }));

    // Status code distribution
    const statusCodes: Record<string, number> = {};
    for (const req of recentRequests) {
      const code = req.statusCode.toString();
      statusCodes[code] = (statusCodes[code] || 0) + 1;
    }

    // Method distribution
    const methods: Record<string, number> = {};
    for (const req of recentRequests) {
      const method = req.method;
      methods[method] = (methods[method] || 0) + 1;
    }

    // Cache hit rate
    const cacheHits = recentRequests.filter((r) => r.cached).length;
    const cacheHitRate = (cacheHits / total) * 100;

    return {
      total,
      avgResponseTime: Math.round(avgResponseTime),
      errorRate: Math.round(errorRate * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      topEndpoints,
      statusCodes,
      methods,
      timeRange: `${hours} hour(s)`,
    };
  }

  /**
   * Get database performance statistics
   */
  async getDatabaseStats(): Promise<any> {
    const queryStats = await this.dbOptimizer.getQueryStats();
    const slowQueries = this.dbOptimizer.getSlowQueries(20);

    return {
      totalQueries: Object.keys(queryStats).length,
      slowQueries: slowQueries.length,
      avgQueryTime: this.calculateAverageQueryTime(queryStats),
      topSlowQueries: slowQueries.slice(0, 5),
      queryStats,
    };
  }

  /**
   * Get cache performance statistics
   */
  async getCacheStats(): Promise<any> {
    try {
      const stats = await this.cache.getStats();
      const hitRate =
        stats.hits + stats.misses > 0
          ? (stats.hits / (stats.hits + stats.misses)) * 100
          : 0;

      return {
        ...stats,
        hitRate: Math.round(hitRate * 100) / 100,
        efficiency: stats.sets > 0 ? (stats.hits / stats.sets) * 100 : 0,
      };
    } catch (error) {
      logger.error("Failed to get cache stats", "performance", error);
      return null;
    }
  }

  /**
   * Optimize system performance
   */
  async optimizeSystem(): Promise<void> {
    logger.info("Starting system performance optimization", "performance");

    try {
      // Optimize database
      await this.dbOptimizer.optimize();

      // Warm up cache
      await this.dbOptimizer.warmupCache();

      // Clear old metrics
      await this.clearOldMetrics();

      logger.info("System performance optimization completed", "performance");
    } catch (error) {
      logger.error(
        "System performance optimization failed",
        "performance",
        error,
      );
    }
  }

  /**
   * Get performance recommendations
   */
  async getRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    const metrics = await this.getMetrics();

    // Memory recommendations
    if (metrics.memory.heapUsed / metrics.memory.heapTotal > 0.8) {
      recommendations.push(
        "High memory usage detected (>80%). Consider increasing memory limits or optimizing memory usage.",
      );
    }

    // Response time recommendations
    if (metrics.avgResponseTime > 2000) {
      recommendations.push(
        "High average response time detected (>2s). Check for slow queries or consider scaling.",
      );
    }

    // Error rate recommendations
    if (metrics.errorRate > 5) {
      recommendations.push(
        "High error rate detected (>5%). Check application logs for issues.",
      );
    }

    // Cache hit rate recommendations
    const cacheStats = await this.getCacheStats();
    if (cacheStats && cacheStats.hitRate < 50) {
      recommendations.push(
        "Low cache hit rate detected (<50%). Consider adjusting cache TTL or cache keys.",
      );
    }

    // Database recommendations
    const dbStats = await this.getDatabaseStats();
    if (dbStats.slowQueries > 10) {
      recommendations.push(
        `High number of slow queries detected (${dbStats.slowQueries}). Consider database optimization.`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "Performance looks good! No immediate recommendations.",
      );
    }

    return recommendations;
  }

  /**
   * Start periodic metrics collection
   */
  private startPeriodicCollection(): void {
    // Update metrics every 30 seconds
    setInterval(async () => {
      await this.updateRealtimeMetrics();
      await this.saveMetrics();
    }, 30000);

    // Cleanup old request metrics every 5 minutes
    setInterval(async () => {
      await this.clearOldMetrics();
    }, 300000);

    // Auto-optimize every hour
    setInterval(async () => {
      await this.optimizeSystem();
    }, 3600000);
  }

  /**
   * Update real-time metrics
   */
  private async updateRealtimeMetrics(): Promise<void> {
    try {
      // Update system metrics
      this.metrics.memory = process.memoryUsage();
      this.metrics.cpu = process.cpuUsage();
      this.metrics.uptime = process.uptime();

      // Calculate recent request metrics
      const recentRequests = this.requestMetrics.slice(-1000); // Last 1000 requests
      if (recentRequests.length > 0) {
        this.metrics.avgResponseTime =
          recentRequests.reduce((sum, r) => sum + r.responseTime, 0) /
          recentRequests.length;
        this.metrics.requestCount = recentRequests.length;
        this.metrics.errorRate =
          (recentRequests.filter((r) => r.statusCode >= 400 || r.error).length /
            recentRequests.length) *
          100;

        // Cache hit rate
        const cacheHits = recentRequests.filter((r) => r.cached).length;
        this.metrics.cacheHitRate = (cacheHits / recentRequests.length) * 100;
      }

      // Database metrics
      const dbStats = await this.getDatabaseStats();
      this.metrics.databaseQueries = dbStats.totalQueries;
      this.metrics.slowQueries = dbStats.slowQueries;
    } catch (error) {
      logger.error("Failed to update real-time metrics", "performance", error);
    }
  }

  /**
   * Save metrics to cache
   */
  private async saveMetrics(): Promise<void> {
    try {
      await this.cache.set(this.METRICS_KEY, this.metrics, 900); // 15 minutes TTL
      await this.cache.set(
        this.REQUESTS_KEY,
        this.requestMetrics.slice(-1000),
        900,
      ); // Keep last 1000 requests
    } catch (error) {
      logger.error("Failed to save metrics", "performance", error);
    }
  }

  /**
   * Load metrics from cache
   */
  private async loadMetrics(): Promise<void> {
    try {
      const cachedMetrics = await this.cache.get(this.METRICS_KEY);
      if (cachedMetrics) {
        this.metrics = { ...this.metrics, ...cachedMetrics };
      }

      const cachedRequests = await this.cache.get(this.REQUESTS_KEY);
      if (cachedRequests && Array.isArray(cachedRequests)) {
        this.requestMetrics = cachedRequests;
      }
    } catch (error) {
      logger.error("Failed to load metrics", "performance", error);
    }
  }

  /**
   * Clear old metrics
   */
  private async clearOldMetrics(): Promise<void> {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // Keep only last 24 hours
    const originalCount = this.requestMetrics.length;

    this.requestMetrics = this.requestMetrics.filter(
      (r) => r.timestamp >= cutoff,
    );

    if (this.requestMetrics.length < originalCount) {
      logger.debug("Cleared old performance metrics", "performance", {
        removed: originalCount - this.requestMetrics.length,
        remaining: this.requestMetrics.length,
      });
    }
  }

  /**
   * Calculate average query time
   */
  private calculateAverageQueryTime(queryStats: Record<string, any>): number {
    const times = Object.values(queryStats).map(
      (stat: any) => stat.avgTime || 0,
    );
    return times.length > 0
      ? times.reduce((sum, time) => sum + time, 0) / times.length
      : 0;
  }

  /**
   * Reset performance metrics
   */
  async resetMetrics(): Promise<void> {
    this.requestMetrics = [];
    this.metrics = {
      memory: {
        rss: 0,
        heapTotal: 0,
        heapUsed: 0,
        external: 0,
        arrayBuffers: 0,
      },
      cpu: { user: 0, system: 0 },
      uptime: 0,
      requestCount: 0,
      avgResponseTime: 0,
      errorRate: 0,
      activeConnections: 0,
      cacheHitRate: 0,
      databaseQueries: 0,
      slowQueries: 0,
    };

    try {
      await this.cache.delete(this.METRICS_KEY);
      await this.cache.delete(this.REQUESTS_KEY);
      logger.info("Performance metrics reset", "performance");
    } catch (error) {
      logger.error("Failed to reset metrics", "performance", error);
    }
  }
}

// Export singleton instance
let performanceMonitorInstance: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitorInstance) {
    performanceMonitorInstance = new PerformanceMonitor();
  }
  return performanceMonitorInstance;
}
