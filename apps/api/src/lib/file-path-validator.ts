import path from "path";
import { promises as fs } from "fs";
import { createValidationError } from "./error-handler";

/**
 * File path validation and sanitization utilities
 * Prevents path traversal and command injection attacks
 */

export interface PathValidationOptions {
  allowedBasePaths?: string[];
  allowedExtensions?: string[];
  maxPathLength?: number;
  allowSymlinks?: boolean;
  mustExist?: boolean;
}

const defaultOptions: PathValidationOptions = {
  allowedBasePaths: [],
  allowedExtensions: [],
  maxPathLength: 4096,
  allowSymlinks: false,
  mustExist: true,
};

/**
 * Validates and sanitizes a file path
 * @throws ValidationError if path is invalid or unsafe
 */
export async function validateFilePath(
  filePath: string,
  options: PathValidationOptions = {},
): Promise<string> {
  const opts = { ...defaultOptions, ...options };

  // 1. Basic validation
  if (!filePath || typeof filePath !== "string") {
    throw createValidationError(
      "File path is required and must be a string",
      "INVALID_PATH",
    );
  }

  // 2. Check path length
  if (filePath.length > opts.maxPathLength!) {
    throw createValidationError(
      `File path exceeds maximum length of ${opts.maxPathLength} characters`,
      "PATH_TOO_LONG",
    );
  }

  // 3. Normalize path to prevent traversal attacks
  const normalizedPath = path.normalize(filePath);

  // 4. Resolve to absolute path
  const absolutePath = path.isAbsolute(normalizedPath)
    ? normalizedPath
    : path.resolve(process.cwd(), normalizedPath);

  // 5. Check for path traversal attempts
  if (absolutePath.includes("..")) {
    throw createValidationError(
      'Path traversal detected - paths containing ".." are not allowed',
      "PATH_TRAVERSAL",
    );
  }

  // 6. Check for null bytes (command injection attempt)
  if (absolutePath.includes("\0")) {
    throw createValidationError(
      "Null bytes detected in path - potential command injection",
      "NULL_BYTE_DETECTED",
    );
  }

  // 7. Check for suspicious characters
  const suspiciousChars = /[<>"|*?;`$(){}[\]\\]/;
  if (suspiciousChars.test(absolutePath)) {
    throw createValidationError(
      "Path contains suspicious characters that may indicate command injection",
      "SUSPICIOUS_CHARACTERS",
    );
  }

  // 8. Validate against allowed base paths (if specified)
  if (opts.allowedBasePaths && opts.allowedBasePaths.length > 0) {
    const isAllowed = opts.allowedBasePaths.some((basePath) => {
      const absoluteBasePath = path.resolve(process.cwd(), basePath);
      return absolutePath.startsWith(absoluteBasePath);
    });

    if (!isAllowed) {
      throw createValidationError(
        `Path must be within allowed directories: ${opts.allowedBasePaths.join(", ")}`,
        "PATH_NOT_ALLOWED",
      );
    }
  }

  // 9. Validate file extension (if specified)
  if (opts.allowedExtensions && opts.allowedExtensions.length > 0) {
    const ext = path.extname(absolutePath).toLowerCase();
    if (!opts.allowedExtensions.includes(ext)) {
      throw createValidationError(
        `File extension "${ext}" is not allowed. Allowed: ${opts.allowedExtensions.join(", ")}`,
        "INVALID_EXTENSION",
      );
    }
  }

  // 10. Check if file exists (if required)
  if (opts.mustExist) {
    try {
      const stats = await fs.stat(absolutePath);

      // Check if it's a symlink (if not allowed)
      if (!opts.allowSymlinks && stats.isSymbolicLink()) {
        throw createValidationError(
          "Symbolic links are not allowed",
          "SYMLINK_NOT_ALLOWED",
        );
      }

      // Ensure it's a file, not a directory
      if (!stats.isFile()) {
        throw createValidationError(
          "Path must point to a file, not a directory",
          "NOT_A_FILE",
        );
      }
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw createValidationError(
          `File does not exist: ${absolutePath}`,
          "FILE_NOT_FOUND",
        );
      }
      throw error;
    }
  }

  return absolutePath;
}

/**
 * Validates multiple file paths in batch
 */
export async function validateFilePaths(
  filePaths: string[],
  options: PathValidationOptions = {},
): Promise<string[]> {
  const validatedPaths: string[] = [];

  for (const filePath of filePaths) {
    const validated = await validateFilePath(filePath, options);
    validatedPaths.push(validated);
  }

  return validatedPaths;
}

/**
 * Sanitizes a file path for use in shell commands
 * Escapes special characters to prevent command injection
 */
export function sanitizePathForShell(filePath: string): string {
  // Escape special shell characters
  return filePath
    .replace(/\\/g, "\\\\") // Backslashes
    .replace(/"/g, '\\"') // Quotes
    .replace(/'/g, "\\'") // Single quotes
    .replace(/\$/g, "\\$") // Dollar signs
    .replace(/`/g, "\\`") // Backticks
    .replace(/!/g, "\\!"); // Exclamation marks
}

/**
 * Wraps a file path in quotes for shell safety
 * Use this when passing paths to exec() or similar functions
 */
export function quotePathForShell(filePath: string): string {
  return `"${sanitizePathForShell(filePath)}"`;
}

/**
 * Validates that a path belongs to a specific user
 * Useful for multi-tenant applications
 */
export function validatePathOwnership(
  filePath: string,
  userId: string,
): boolean {
  const normalizedPath = path.normalize(filePath);
  // Check if path contains user ID (basic ownership check)
  // In production, you'd check database records for actual ownership
  return (
    normalizedPath.includes(userId) || normalizedPath.includes(`user-${userId}`)
  );
}

/**
 * Create a safe path within a base directory
 * Automatically prevents path traversal
 */
export function createSafePath(baseDir: string, ...segments: string[]): string {
  // Resolve base directory
  const absoluteBaseDir = path.resolve(process.cwd(), baseDir);

  // Join segments and resolve
  const targetPath = path.resolve(absoluteBaseDir, ...segments);

  // Ensure result is still within base directory
  if (!targetPath.startsWith(absoluteBaseDir)) {
    throw createValidationError(
      "Attempted path traversal outside base directory",
      "PATH_TRAVERSAL",
    );
  }

  return targetPath;
}

/**
 * Validates a directory path
 */
export async function validateDirectoryPath(
  dirPath: string,
  options: Omit<PathValidationOptions, "allowedExtensions"> = {},
): Promise<string> {
  const opts = { ...defaultOptions, ...options };

  // Basic validations (same as file)
  if (!dirPath || typeof dirPath !== "string") {
    throw createValidationError(
      "Directory path is required and must be a string",
      "INVALID_PATH",
    );
  }

  const normalizedPath = path.normalize(dirPath);
  const absolutePath = path.isAbsolute(normalizedPath)
    ? normalizedPath
    : path.resolve(process.cwd(), normalizedPath);

  // Path traversal check
  if (absolutePath.includes("..")) {
    throw createValidationError(
      "Path traversal detected in directory path",
      "PATH_TRAVERSAL",
    );
  }

  // Check if directory exists (if required)
  if (opts.mustExist) {
    try {
      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        throw createValidationError(
          "Path must point to a directory, not a file",
          "NOT_A_DIRECTORY",
        );
      }
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw createValidationError(
          `Directory does not exist: ${absolutePath}`,
          "DIR_NOT_FOUND",
        );
      }
      throw error;
    }
  }

  return absolutePath;
}
