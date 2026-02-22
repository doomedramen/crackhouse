import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

export function formatDuration(start: string, end?: string): string {
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const duration = endTime - startTime;

  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "completed":
      return "text-green-600 dark:text-green-400";
    case "running":
      return "text-blue-600 dark:text-blue-400";
    case "pending":
      return "text-yellow-600 dark:text-yellow-400";
    case "failed":
      return "text-red-600 dark:text-red-400";
    case "paused":
      return "text-orange-600 dark:text-orange-400";
    case "cancelled":
      return "text-gray-600 dark:text-gray-400";
    default:
      return "text-gray-600 dark:text-gray-400";
  }
}

export function getEncryptionColor(encryption: string): string {
  switch (encryption) {
    case "OPEN":
      return "text-green-600 dark:text-green-400";
    case "WPA":
    case "WPA2":
    case "WPA3":
      return "text-yellow-600 dark:text-yellow-400";
    case "WEP":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-gray-600 dark:text-gray-400";
  }
}

export function truncateMiddle(
  str: string,
  startLength = 8,
  endLength = 8,
): string {
  if (str.length <= startLength + endLength) {
    return str;
  }
  return `${str.slice(0, startLength)}...${str.slice(-endLength)}`;
}
