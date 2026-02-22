import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "@/config/env";
import { logger } from "./logger";
import { getCache } from "./cache";
import { logSecurityEvent, SecurityEventType } from "./monitoring";

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
 * Safe query templates for common operations
 */
const SAFE_QUERY_TEMPLATES = {
  analyzeTable: "ANALYZE",
  vacuumAnalyzeTable: (table: string) => {
    // Validate table name to prevent SQL injection
    const validTables = [
      "users",
      "networks",
      "dictionaries",
      "jobs",
      "job_results",
      "sessions",
      "accounts",
      "verifications",
    ];
    if (!validTables.includes(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }
    return `VACUUM ANALYZE ${table}`;
  },
  countRecords: (table: string, condition?: string) => {
    const validTables = [
      "users",
      "networks",
      "dictionaries",
      "jobs",
      "job_results",
    ];
    if (!validTables.includes(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }

    const baseQuery = `SELECT COUNT(*) as count FROM ${table}`;
    return condition ? `${baseQuery} WHERE ${condition}` : baseQuery;
  },
  selectRecent: (table: string, limit: number, condition?: string) => {
    const validTables = [
      "users",
      "networks",
      "dictionaries",
      "jobs",
      "job_results",
    ];
    if (!validTables.includes(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }

    if (limit < 1 || limit > 1000) {
      throw new Error(`Invalid limit: ${limit}. Must be between 1 and 1000`);
    }

    const baseQuery = `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT ${limit}`;
    return condition ? `${baseQuery} WHERE ${condition}` : baseQuery;
  },
};

/**
 * Database optimizer with security-focused connection pooling, query caching, and performance monitoring
 */
export class SecureDatabaseOptimizer {
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
   * Execute safe parameterized query with caching and optimization
   */
  async executeSafeQuery<T = any>(
    queryTemplate: keyof typeof SAFE_QUERY_TEMPLATES,
    params: any[] = [],
    options: QueryOptions = { enableCache: true, cacheTTL: 300, cacheTags: [] },
  ): Promise<QueryResult> {
    let query: string;

    // Build query from safe template
    if (typeof SAFE_QUERY_TEMPLATES[queryTemplate] === "function") {
      query = (SAFE_QUERY_TEMPLATES[queryTemplate] as any)(...params);
    } else {
      query = SAFE_QUERY_TEMPLATES[queryTemplate] as string;
    }

    return this.executeQuery(query, [], options);
  }

  /**
   * Execute query with security validation, caching and optimization
   */
  async executeQuery<T = any>(
    query: string,
    params: any[] = [],
    options: QueryOptions = { enableCache: true, cacheTTL: 300, cacheTags: [] },
  ): Promise<QueryResult> {
    const startTime = Date.now();
    const queryHash = this.generateQueryHash(query, params);

    try {
      // Security validation
      this.validateQuerySecurity(query, params);

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

      // Log potential SQL injection attempts
      if (this.isSuspectedInjectionAttempt(query, params, error)) {
        await logSecurityEvent({
          type: SecurityEventType.INJECTION_ATTEMPT,
          severity: "high",
          ip: "unknown", // Should be set by caller
          path: "/database",
          method: "QUERY",
          details: {
            query: query.substring(0, 200), // Limit logged query length
            params: params.length,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          },
        });
      }

      logger.error("Query execution failed", "database", {
        queryHash,
        executionTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate query security to prevent SQL injection
   */
  private validateQuerySecurity(query: string, params: any[]): void {
    // Check for dangerous SQL patterns
    const dangerousPatterns = [
      /;\s*drop\s+table/i,
      /;\s*delete\s+from/i,
      /;\s*insert\s+into/i,
      /;\s*update\s+/i,
      /;\s*create\s+/i,
      /;\s*alter\s+/i,
      /;\s*exec\s*\(/i,
      /;\s*execute\s+/i,
      /;\s*truncate\s+/i,
      /union\s+select/i,
      /\bor\s+1\s*=\s*1\b/i,
      /\band\s+1\s*=\s*1\b/i,
      /--/,
      /\/\*/,
      /\*\//,
      /xp_cmdshell/i,
      /sp_executesql/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(query)) {
        throw new Error(
          `Potentially dangerous SQL pattern detected: ${pattern.source}`,
        );
      }
    }

    // Validate parameter types
    params.forEach((param, index) => {
      if (typeof param === "string" && param.length > 10000) {
        throw new Error(
          `Parameter ${index} is too long: ${param.length} characters`,
        );
      }
    });

    // Check for unusual query length (could indicate injection)
    if (query.length > 10000) {
      throw new Error(`Query too long: ${query.length} characters`);
    }

    // Validate that query doesn't contain unsafe concatenations
    if (query.includes("${") || query.includes("%{")) {
      throw new Error("Unsafe string interpolation detected in query");
    }
  }

  /**
   * Check if this might be an SQL injection attempt
   */
  private isSuspectedInjectionAttempt(
    query: string,
    params: any[],
    error: any,
  ): boolean {
    const errorMessage = error?.message?.toLowerCase() || "";

    // Common SQL injection error patterns
    const injectionErrorPatterns = [
      "syntax error",
      "unclosed quotation mark",
      "incorrect syntax near",
      "invalid column name",
      "ambiguous column name",
      "conversion failed",
      "operand type clash",
    ];

    // Check if error message indicates injection
    const hasInjectionError = injectionErrorPatterns.some((pattern) =>
      errorMessage.includes(pattern),
    );

    // Check for suspicious query patterns
    const suspiciousPatterns = [
      /union\s+select/i,
      /\bor\s+\d+\s*=\s*\d+/i,
      /\band\s+\d+\s*=\s*\d+/i,
      /'.*'='/,
      /".*"="/,
      /1\s*=\s*1/,
      /true\s*=\s*true/i,
    ];

    const hasSuspiciousPattern = suspiciousPatterns.some((pattern) =>
      pattern.test(query),
    );

    return hasInjectionError || hasSuspiciousPattern;
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
   * Securely optimize database with safe operations only
   */
  async optimize(): Promise<void> {
    const db = this.getDb();

    try {
      logger.info("Starting secure database optimization", "database");

      // Use safe template for ANALYZE
      await this.executeQuery(SAFE_QUERY_TEMPLATES.analyzeTable, [], {
        enableCache: false,
        cacheTTL: 0,
      });

      // Use safe templates for table optimization
      const tables = [
        "users",
        "networks",
        "dictionaries",
        "jobs",
        "job_results",
      ];

      for (const table of tables) {
        try {
          const query = SAFE_QUERY_TEMPLATES.vacuumAnalyzeTable(table);
          await this.executeQuery(query, [], {
            enableCache: false,
            cacheTTL: 0,
          });
          logger.debug(`Optimized table: ${table}`, "database");
        } catch (error) {
          logger.warn(`Failed to optimize table: ${table}`, "database", error);
        }
      }

      logger.info("Secure database optimization completed", "database");
    } catch (error) {
      logger.error("Database optimization failed", "database", error);
      throw error;
    }
  }

  /**
   * Warm up cache with safe queries only
   */
  async warmupCache(): Promise<void> {
    try {
      logger.info("Starting secure database cache warmup", "database");

      // Safe warmup queries using templates
      const warmupQueries = [
        {
          template: "countRecords" as const,
          params: ["users", "role = 'superuser'"],
          tags: ["users", "count"],
        },
        {
          template: "selectRecent" as const,
          params: ["networks", 10, "status = 'ready'"],
          tags: ["networks", "recent"],
        },
        {
          template: "selectRecent" as const,
          params: ["dictionaries", 5, "status = 'ready'"],
          tags: ["dictionaries", "recent"],
        },
      ];

      for (const { template, params, tags } of warmupQueries) {
        try {
          await this.executeSafeQuery(template, params, {
            enableCache: true,
            cacheTTL: 1800, // 30 minutes
            cacheTags: tags,
          });
          logger.debug("Cache warmup query executed", "database", {
            template,
            params,
          });
        } catch (error) {
          logger.warn("Cache warmup query failed", "database", {
            template,
            params,
            error,
          });
        }
      }

      logger.info("Secure database cache warmup completed", "database");
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

// Export singleton instance
let secureDbOptimizerInstance: SecureDatabaseOptimizer | null = null;

export function getSecureDbOptimizer(): SecureDatabaseOptimizer {
  if (!secureDbOptimizerInstance) {
    secureDbOptimizerInstance = new SecureDatabaseOptimizer();
  }
  return secureDbOptimizerInstance;
}
