import axios, { AxiosError } from "axios";
import { config, timeouts } from "./config";

export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

export const apiClient = axios.create({
  baseURL: config.apiUrl,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: timeouts.api,
});

// Request interceptor to add auth token if available
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token from Better Auth session if available
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor for consistent error handling
apiClient.interceptors.response.use(
  (response) => {
    // Our backend returns { success: boolean, data?: any, error?: string }
    if (response.data && typeof response.data === "object") {
      if (!response.data.success && response.data.error) {
        throw new Error(response.data.error);
      }
    }
    return response;
  },
  (error: AxiosError<ApiError>) => {
    // Handle auth errors
    if (error.response?.status === 401) {
      // Redirect to login for auth errors
      window.location.href = "/login";
    }

    // Handle different types of errors
    if (error.response) {
      // Server responded with error status
      const message =
        (error.response.data as any)?.error ||
        error.response.data?.message ||
        error.message;
      throw new Error(message);
    } else if (error.request) {
      // Request was made but no response received
      throw new Error("Network error. Please check your connection.");
    } else {
      // Something else happened
      throw new Error(error.message);
    }
  },
);

export class ApiClient {
  static async get<T>(
    url: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const response = await apiClient.get<T>(url, { params });
    return response.data;
  }

  static async post<T>(url: string, data?: unknown): Promise<T> {
    const response = await apiClient.post<T>(url, data);
    return response.data;
  }

  static async put<T>(url: string, data?: unknown): Promise<T> {
    const response = await apiClient.put<T>(url, data);
    return response.data;
  }

  static async patch<T>(url: string, data?: unknown): Promise<T> {
    const response = await apiClient.patch<T>(url, data);
    return response.data;
  }

  static async delete<T>(
    url: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const response = await apiClient.delete<T>(url, { params });
    return response.data;
  }

  static async upload<T>(
    url: string,
    formData: FormData,
    onProgress?: (progress: number) => void,
  ): Promise<T> {
    const response = await apiClient.post<T>(url, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total,
          );
          onProgress(progress);
        }
      },
    });
    return response.data;
  }
}

// Results API methods
export class ResultsApi {
  static async getResults(params?: {
    jobId?: string;
    networkId?: string;
    type?: "password" | "handshake" | "error";
    limit?: number;
    offset?: number;
  }) {
    return ApiClient.get<{
      success: boolean;
      data: any[];
      count: number;
      pagination: {
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      };
    }>("/api/results", params);
  }

  static async getResultsByJob(jobId: string) {
    return ApiClient.get<{
      success: boolean;
      data: any[];
      count: number;
    }>(`/api/results/by-job/${jobId}`);
  }

  static async getResultsByNetwork(networkId: string) {
    return ApiClient.get<{
      success: boolean;
      data: any[];
      count: number;
      network: {
        id: string;
        ssid: string;
        bssid: string;
        encryption: string;
      };
    }>(`/api/results/by-network/${networkId}`);
  }

  static async getResult(id: string) {
    return ApiClient.get<{
      success: boolean;
      data: any;
    }>(`/api/results/${id}`);
  }

  static async getCrackedPasswords() {
    return ApiClient.get<{
      success: boolean;
      data: any[];
      count: number;
    }>("/api/results/passwords/cracked");
  }

  static async getResultsStats() {
    return ApiClient.get<{
      success: boolean;
      data: {
        byType: Record<string, number>;
        crackedNetworks: number;
        totalNetworks: number;
        crackRate: number;
      };
    }>("/api/results/stats");
  }
}

export default apiClient;
