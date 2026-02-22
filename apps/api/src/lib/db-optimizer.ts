import { getSecureDbOptimizer } from "./secure-db-optimizer";
import { logger } from "./logger";

/**
 * Database connection pool configuration
 */
interface PoolConfig {
  min: number;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  acquireTimeoutMillis: number;
  createTimeoutMillis: number;
  destroyTimeoutMillis: number;
  reapIntervalMillis: number;
  createRetryIntervalMillis: number;
}

/**
 * Query optimization options
 */
interface QueryOptions {
  enableCache: boolean;
  cacheTTL: number;
  cacheKey: string;
  cacheTags: string[];
  timeout?: number;
  retries?: number;
}

/**
 * Query execution result with metadata
 */
interface QueryResult {
  data: any[];
  executionTime: number;
  cached: boolean;
  affectedRows?: number;
  queryPlan?: any;
}

/**
 * Database optimizer with connection pooling, query caching, and performance monitoring
 */
export class DatabaseOptimizer {
  private cache;
  private poolConfig: PoolConfig;
  private queryStats: Map<
    string,
    { count: number; totalTime: number; avgTime: number }
  >;
  private readonly STATS_KEY = "autopwn:db:stats";

  constructor() {
    this.cache = getCache({
      defaultTTL: 600, // 10 minutes for database cache
      keyPrefix: "autopwn:db:",
      enableCompression: true,
    });

    this.poolConfig = {
      min: 2, // Minimum 2 connections
      max: 10, // Maximum 10 connections
      idleTimeoutMillis: 30000, // 30 seconds
      connectionTimeoutMillis: 10000, // 10 seconds
      acquireTimeoutMillis: 60000, // 60 seconds
      createTimeoutMillis: 30000, // 30 seconds
      destroyTimeoutMillis: 5000, // 5 seconds
      reapIntervalMillis: 1000, // 1 second
      createRetryIntervalMillis: 200, // 200ms
    };

    this.queryStats = new Map();
    this.loadQueryStats();
  }

  /**
   * Get optimized database instance with connection pooling
   */
  getDb() {
    return drizzle(env.DATABASE_URL, {
      schema: {},
      logger: true,
      connection: this.poolConfig,
    });
  }

  /**
   * Execute query with caching and optimization
   */
  async executeQuery<T = any>(
    query: string,
    params: any[] = [],
    options: QueryOptions = { enableCache: true, cacheTTL: 300, cacheTags: [] },
  ): Promise<QueryResult> {
    const startTime = Date.now();
    const queryHash = this.generateQueryHash(query, params);

    try {
      // Check cache first
      if (options.enableCache) {
        const cachedResult = await this.cache.get<QueryResult>(
          options.cacheKey || queryHash,
          ["query", ...options.cacheTags],
        );

        if (cachedResult) {
          logger.debug("Query result from cache", "database", {
            queryHash,
            cacheHit: true,
            executionTime: Date.now() - startTime,
          });
          return {
            ...cachedResult,
            cached: true,
          };
        }
      }

      // Execute query with timeout
      const db = this.getDb();
      let result: any[];

      if (options.retries && options.retries > 0) {
        result = await this.executeWithRetry(
          db,
          query,
          params,
          options.retries,
        );
      } else {
        result = await this.executeWithTimeout(
          db,
          query,
          params,
          options.timeout,
        );
      }

      const executionTime = Date.now() - startTime;
      const queryResult: QueryResult = {
        data: result,
        executionTime,
        cached: false,
      };

      // Cache successful result
      if (options.enableCache && result.length > 0) {
        await this.cache.set(
          options.cacheKey || queryHash,
          queryResult,
          options.cacheTTL,
          ["query", ...options.cacheTags],
        );
      }

      // Update query statistics
      await this.updateQueryStats(queryHash, executionTime);

      // Log slow queries
      if (executionTime > 1000) {
        // Queries taking >1 second
        logger.warn("Slow query detected", "database", {
          queryHash,
          executionTime,
          queryLength: query.length,
          paramCount: params.length,
        });
      }

      return queryResult;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error("Query execution failed", "database", {
        queryHash,
        executionTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute query with retry logic
   */
  private async executeWithRetry<T>(
    db: any,
    query: string,
    params: any[],
    maxRetries: number,
  ): Promise<T[]> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await db.execute(query, params);
      } catch (error) {
        lastError = error;

        // Don't retry certain errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        // Exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.min(100 * Math.pow(2, attempt), 5000);
          logger.debug(`Query retry attempt ${attempt + 1}`, "database", {
            queryHash: this.generateQueryHash(query, params),
            attempt: attempt + 1,
            delay,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute query with timeout
   */
  private async executeWithTimeout<T>(
    db: any,
    query: string,
    params: any[],
    timeoutMs: number = 30000, // 30 seconds default
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Query timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      db.execute(query, params)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Check if error is non-retryable
   */
  private isNonRetryableError(error: any): boolean {
    const message = error?.message?.toLowerCase() || "";

    // SQL syntax errors, constraint violations, etc.
    const nonRetryablePatterns = [
      "syntax error",
      "constraint violation",
      "duplicate key",
      "foreign key constraint",
      "invalid input",
      "permission denied",
      "division by zero",
    ];

    return nonRetryablePatterns.some((pattern) => message.includes(pattern));
  }

  /**
   * Generate consistent query hash
   */
  private generateQueryHash(query: string, params: any[]): string {
    const normalizedQuery = query.replace(/\s+/g, " ").trim().toLowerCase();
    const paramsStr = JSON.stringify(params);
    return Buffer.from(`${normalizedQuery}|${paramsStr}`).toString("base64");
  }

  /**
   * Update query performance statistics
   */
  private async updateQueryStats(
    queryHash: string,
    executionTime: number,
  ): Promise<void> {
    try {
      const existing = this.queryStats.get(queryHash) || {
        count: 0,
        totalTime: 0,
        avgTime: 0,
      };

      const updated = {
        count: existing.count + 1,
        totalTime: existing.totalTime + executionTime,
        avgTime: (existing.totalTime + executionTime) / (existing.count + 1),
      };

      this.queryStats.set(queryHash, updated);

      // Keep only top 1000 queries in memory
      if (this.queryStats.size > 1000) {
        const sorted = Array.from(this.queryStats.entries()).sort(
          ([, a], [, b]) => a.totalTime - b.totalTime,
        );

        // Remove bottom 20% queries
        const toRemove = sorted.slice(Math.floor(sorted.length * 0.8));
        toRemove.forEach(([hash]) => this.queryStats.delete(hash));
      }

      await this.cache.set(
        this.STATS_KEY,
        Object.fromEntries(this.queryStats),
        3600,
      ); // 1 hour
    } catch (error) {
      logger.error("Failed to update query stats", "database", error);
    }
  }

  /**
   * Load query statistics from cache
   */
  private async loadQueryStats(): Promise<void> {
    try {
      const stats = await this.cache.get(this.STATS_KEY);
      if (stats) {
        this.queryStats = new Map(Object.entries(stats));
      }
    } catch (error) {
      logger.error("Failed to load query stats", "database", error);
    }
  }

  /**
   * Get query performance statistics
   */
  async getQueryStats(): Promise<Record<string, any>> {
    return Object.fromEntries(this.queryStats);
  }

  /**
   * Optimize database with common patterns
   */
  async optimize(): Promise<void> {
    const db = this.getDb();

    try {
      logger.info("Starting database optimization", "database");

      // Analyze table statistics
      await db.execute(`ANALZE`);

      // Update table statistics for better query planning
      const tables = [
        "users",
        "networks",
        "dictionaries",
        "jobs",
        "job_results",
      ];

      for (const table of tables) {
        try {
          await db.execute(`VACUUM ANALYZE ${table}`);
          logger.debug(`Optimized table: ${table}`, "database");
        } catch (error) {
          logger.warn(`Failed to optimize table: ${table}`, "database", error);
        }
      }

      logger.info("Database optimization completed", "database");
    } catch (error) {
      logger.error("Database optimization failed", "database", error);
      throw error;
    }
  }

  /**
   * Warm up cache with common queries
   */
  async warmupCache(): Promise<void> {
    const db = this.getDb();

    try {
      logger.info("Starting database cache warmup", "database");

      // Common queries to warm up
      const warmupQueries = [
        {
          query: "SELECT COUNT(*) FROM users WHERE role = ?",
          params: ["superuser"],
          tags: ["users", "count"],
        },
        {
          query:
            "SELECT * FROM networks WHERE status = ? ORDER BY created_at DESC LIMIT 10",
          params: ["ready"],
          tags: ["networks", "recent"],
        },
        {
          query:
            "SELECT * FROM dictionaries WHERE status = ? ORDER BY created_at DESC LIMIT 5",
          params: ["ready"],
          tags: ["dictionaries", "recent"],
        },
      ];

      for (const { query, params, tags } of warmupQueries) {
        try {
          await this.executeQuery(query, params, {
            enableCache: true,
            cacheTTL: 1800, // 30 minutes
            cacheTags: tags,
          });
          logger.debug("Cache warmup query executed", "database", {
            query: query.substring(0, 50),
          });
        } catch (error) {
          logger.warn("Cache warmup query failed", "database", {
            query: query.substring(0, 50),
            error,
          });
        }
      }

      logger.info("Database cache warmup completed", "database");
    } catch (error) {
      logger.error("Database cache warmup failed", "database", error);
    }
  }

  /**
   * Get slow queries
   */
  getSlowQueries(
    limit: number = 10,
  ): Array<{ query: string; avgTime: number; count: number }> {
    return Array.from(this.queryStats.entries())
      .map(([query, stats]) => ({ query, ...stats }))
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, limit);
  }

  /**
   * Clear query statistics
   */
  async clearQueryStats(): Promise<void> {
    this.queryStats.clear();
    await this.cache.delete(this.STATS_KEY);
    logger.info("Query statistics cleared", "database");
  }
}

// Legacy wrapper for backward compatibility
// All database operations are now routed through the secure optimizer

export function getDbOptimizer() {
  logger.warn(
    "Using legacy dbOptimizer - consider migrating to getSecureDbOptimizer()",
    "database",
  );
  return getSecureDbOptimizer();
}

// Export the secure optimizer as the recommended default
export { getSecureDbOptimizer };
export { SecureDatabaseOptimizer as DatabaseOptimizer } from "./secure-db-optimizer";
