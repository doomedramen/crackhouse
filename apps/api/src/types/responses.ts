/**
 * Standard API Response Types
 *
 * Use these types for consistent API responses across all routes.
 * The error-handler.ts already handles error responses consistently.
 */

/**
 * Pagination metadata for list endpoints
 */
export interface PaginationMeta {
  /** Current page number (1-based) */
  page: number;

  /** Number of items per page */
  limit: number;

  /** Total number of items */
  total: number;

  /** Total number of pages */
  totalPages: number;

  /** Whether there's a next page */
  hasNext?: boolean;

  /** Whether there's a previous page */
  hasPrev?: boolean;
}

/**
 * Simple count metadata
 */
export interface CountMeta {
  /** Total count of items */
  count: number;
}

/**
 * Standard success response with data
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: PaginationMeta | CountMeta | Record<string, unknown>;
}

/**
 * Standard error response
 * Note: Error responses are also handled by error-handler.ts
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Union type for all API responses
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Response helper functions
 */
export const ResponseHelpers = {
  /**
   * Create a success response with data
   */
  success<T>(data: T, meta?: PaginationMeta | CountMeta | Record<string, unknown>): ApiSuccessResponse<T> {
    const response: ApiSuccessResponse<T> = {
      success: true,
      data,
    };
    if (meta) {
      response.meta = meta;
    }
    return response;
  },

  /**
   * Create a success response with count metadata
   */
  successWithCount<T>(data: T, count: number): ApiSuccessResponse<T> {
    return this.success(data, { count });
  },

  /**
   * Create a success response with pagination metadata
   */
  successWithPagination<T>(
    data: T,
    options: {
      page: number;
      limit: number;
      total: number;
    }
  ): ApiSuccessResponse<T> {
    const totalPages = Math.ceil(options.total / options.limit);
    return this.success(data, {
      page: options.page,
      limit: options.limit,
      total: options.total,
      totalPages,
      hasNext: options.page < totalPages,
      hasPrev: options.page > 1,
    });
  },

  /**
   * Create a simple error response
   * Note: Prefer throwing AppError subclasses which are handled by error-handler.ts
   */
  error(message: string, code?: string, details?: unknown): ApiErrorResponse {
    const response: ApiErrorResponse = {
      success: false,
      error: message,
    };
    if (code) {
      response.code = code;
    }
    if (details) {
      response.details = details;
    }
    return response;
  },
} as const;

/**
 * Type guard to check if a response is a success
 */
export function isSuccessResponse<T>(response: ApiResponse<T>): response is ApiSuccessResponse<T> {
  return response.success === true;
}

/**
 * Type guard to check if a response is an error
 */
export function isErrorResponse<T>(response: ApiResponse<T>): response is ApiErrorResponse {
  return response.success === false;
}
