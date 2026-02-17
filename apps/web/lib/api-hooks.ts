"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiClient, ResultsApi } from "./api";
import type {
  User,
  LoginRequest,
  AuthResponse,
  Network,
  Dictionary,
  Job,
  JobResult,
  PaginatedResponse,
} from "./types";

import { authClient } from "./auth";

// Real API hooks that connect to our backend

// Authentication hooks using better-auth
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: LoginRequest) => {
      const response = await authClient.signIn.email({
        email: data.email,
        password: data.password,
        callbackURL: "/",
      });

      // Better Auth returns { data, error } - throw if error exists
      if (response.error) {
        throw new Error(response.error.message || "Sign in failed");
      }

      return response;
    },
    onSuccess: (data: any) => {
      queryClient.setQueryData(["auth", "session"], data);
      queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            // Redirect after signout completes
            window.location.href = "/sign-in";
          },
        },
      }),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useAuthSession() {
  return useQuery({
    queryKey: ["auth", "session"],
    queryFn: async () => {
      const response = await authClient.getSession();
      // Return the full response containing both session and user
      return response?.data || null;
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes if needed
  });
}

// Network hooks
export function useNetworks() {
  return useQuery({
    queryKey: ["networks"],
    queryFn: () => ApiClient.get("/api/networks"),
    staleTime: 30 * 1000,
    select: (data: any) => ({
      data: data.data || [],
      count: data.count || 0,
    }),
  });
}

export function useNetwork(id: string) {
  return useQuery({
    queryKey: ["networks", id],
    queryFn: () => ApiClient.get(`/api/networks/${id}`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useCreateNetwork() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Network>) =>
      ApiClient.post("/api/networks", data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["networks"] });
    },
  });
}

export function useUpdateNetwork(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Network>) =>
      ApiClient.put(`/api/networks/${id}`, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["networks"] });
      queryClient.invalidateQueries({ queryKey: ["networks", id] });
    },
  });
}

export function useDeleteNetwork(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => ApiClient.delete(`/api/networks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["networks"] });
    },
  });
}

// Dictionary hooks
export function useDictionaries() {
  return useQuery({
    queryKey: ["dictionaries"],
    queryFn: () => ApiClient.get("/api/dictionaries"),
    staleTime: 30 * 1000,
    select: (data: any) => ({
      data: data.data || [],
      count: data.count || 0,
    }),
  });
}

export function useDictionary(id: string) {
  return useQuery({
    queryKey: ["dictionaries", id],
    queryFn: () => ApiClient.get(`/api/dictionaries/${id}`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useCreateDictionary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Dictionary>) =>
      ApiClient.post("/api/dictionaries", data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["dictionaries"] });
    },
  });
}

export function useUpdateDictionary(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Dictionary>) =>
      ApiClient.put(`/api/dictionaries/${id}`, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["dictionaries"] });
      queryClient.invalidateQueries({ queryKey: ["dictionaries", id] });
    },
  });
}

export function useDeleteDictionary(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => ApiClient.delete(`/api/dictionaries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dictionaries"] });
    },
  });
}

export function useMergeDictionaries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      dictionaryIds: string[];
      removeDuplicates?: boolean;
      validationRules?: {
        minLength?: number;
        maxLength?: number;
        excludePatterns?: string[];
      };
    }) => ApiClient.post("/api/dictionaries/merge", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dictionaries"] });
    },
  });
}

export function useValidateDictionary(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => ApiClient.post(`/api/dictionaries/${id}/validate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dictionaries"] });
    },
  });
}

export function useDictionaryStatistics(id: string) {
  return useQuery({
    queryKey: ["dictionaries", id, "statistics"],
    queryFn: () => ApiClient.get(`/api/dictionaries/${id}/statistics`),
    enabled: !!id,
    staleTime: 60 * 1000,
    select: (data: any) => data.data || null,
  });
}

// Job hooks
export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: () => ApiClient.get("/api/jobs"),
    staleTime: 10 * 1000, // Jobs update frequently
    select: (data: any) => ({
      data: data.data || [],
      count: data.count || 0,
    }),
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ["jobs", id],
    queryFn: () => ApiClient.get(`/api/jobs/${id}`),
    enabled: !!id,
    staleTime: 5 * 1000,
    select: (data: any) => ({
      data: data.data,
      success: data.success,
    }),
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => ApiClient.post("/api/jobs", data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useUpdateJob(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<Job>) => ApiClient.put(`/api/jobs/${id}`, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["jobs", id] });
    },
  });
}

export function useDeleteJob(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => ApiClient.delete(`/api/jobs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

// Queue Management hooks
export function useQueueStats() {
  return useQuery({
    queryKey: ["queue", "stats"],
    queryFn: () => ApiClient.get("/api/queue/stats"),
    staleTime: 5 * 1000,
  });
}

export function useStartCrackingJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      networkIds: string[];
      dictionaryIds: string[];
      attackMode?: "pmkid" | "handshake";
    }) => ApiClient.post("/api/queue/crack", data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["networks"] });
      queryClient.invalidateQueries({ queryKey: ["dictionaries"] });
    },
  });
}

export function useGenerateDictionary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      baseWords?: string[];
      rules?: string[];
      transformations?: string[];
      async?: boolean;
    }) => ApiClient.post("/api/queue/dictionary/generate", data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["dictionaries"] });
      queryClient.invalidateQueries({ queryKey: ["queue", "stats"] });
    },
  });
}

export function useDictionaryTemplates() {
  return useQuery({
    queryKey: ["dictionary", "templates"],
    queryFn: () => ApiClient.get("/api/queue/dictionary/templates"),
    staleTime: 60 * 60 * 1000, // Cache templates for 1 hour
  });
}

export function useCancelJob(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => ApiClient.delete(`/api/queue/jobs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["jobs", id] });
    },
  });
}

export function useRetryJob(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => ApiClient.post(`/api/queue/jobs/${id}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["jobs", id] });
    },
  });
}

export function useStartCleanup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { strategy: string; userId?: string }) =>
      ApiClient.post("/api/queue/cleanup", data),
  });
}

// User management hooks
export function useUsers(enabled: boolean = true) {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => ApiClient.get("/api/users"),
    enabled,
    staleTime: process.env.NODE_ENV === 'test' ? undefined : 60 * 1000,
    retry: process.env.NODE_ENV === 'test' ? false : 3,
    select: (data: any) => ({
      data: data.data || [],
      count: data.count || 0,
    }),
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ["users", id],
    queryFn: () => ApiClient.get(`/api/users/${id}`),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<User>) => ApiClient.post("/api/users", data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<User>) =>
      ApiClient.put(`/api/users/${id}`, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["users", id] });
    },
  });
}

export function useDeleteUser(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => ApiClient.delete(`/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

// File upload hooks (Uppy integration)
export function useFileUploadConfig() {
  return useQuery({
    queryKey: ["upload", "config"],
    queryFn: () => ApiClient.get("/api/upload/config"),
    staleTime: 60 * 1000, // Cache config for 1 minute
  });
}

export function usePresignUpload() {
  return useMutation({
    mutationFn: (data: {
      filename: string;
      type: "pcap" | "dictionary";
      size?: number;
    }) => ApiClient.post("/api/upload/presign", data),
  });
}

export function useUploadStatus(uploadId: string) {
  return useQuery({
    queryKey: ["upload", "status", uploadId],
    queryFn: () => ApiClient.get(`/api/upload/status/${uploadId}`),
    enabled: !!uploadId,
    refetchInterval: 2000, // Poll every 2 seconds
    staleTime: 1000,
  });
}

export function useCompleteUpload() {
  return useMutation({
    mutationFn: (data: {
      uploadId: string;
      filename: string;
      type: "pcap" | "dictionary";
    }) => ApiClient.post("/api/upload/complete", data),
  });
}

export function useDeleteUploadedFile(uploadId: string) {
  return useMutation({
    mutationFn: () => ApiClient.delete(`/api/upload/${uploadId}`),
  });
}

// Results API hooks
export function useResults(params?: {
  jobId?: string;
  networkId?: string;
  type?: "password" | "handshake" | "error";
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["results", params],
    queryFn: () => ResultsApi.getResults(params),
    staleTime: 10 * 1000,
    select: (data: any) => ({
      data: data.data || [],
      count: data.count || 0,
      pagination: data.pagination || {
        total: 0,
        limit: 50,
        offset: 0,
        hasMore: false,
      },
    }),
  });
}

export function useResultsByJob(jobId: string) {
  return useQuery({
    queryKey: ["results", "by-job", jobId],
    queryFn: () => ResultsApi.getResultsByJob(jobId),
    enabled: !!jobId,
    staleTime: 10 * 1000,
    select: (data: any) => ({
      data: data.data || [],
      count: data.count || 0,
    }),
  });
}

export function useResultsByNetwork(networkId: string) {
  return useQuery({
    queryKey: ["results", "by-network", networkId],
    queryFn: () => ResultsApi.getResultsByNetwork(networkId),
    enabled: !!networkId,
    staleTime: 10 * 1000,
    select: (data: any) => ({
      data: data.data || [],
      count: data.count || 0,
      network: data.network,
    }),
  });
}

export function useResult(id: string) {
  return useQuery({
    queryKey: ["results", id],
    queryFn: () => ResultsApi.getResult(id),
    enabled: !!id,
    staleTime: 10 * 1000,
  });
}

export function useCrackedPasswords() {
  return useQuery({
    queryKey: ["results", "cracked-passwords"],
    queryFn: () => ResultsApi.getCrackedPasswords(),
    staleTime: 10 * 1000,
    select: (data: any) => ({
      data: data.data || [],
      count: data.count || 0,
    }),
  });
}

export function useResultsStats() {
  return useQuery({
    queryKey: ["results", "stats"],
    queryFn: () => ResultsApi.getResultsStats(),
    staleTime: 30 * 1000, // Stats change less frequently
    select: (data: any) => ({
      byType: data.data?.byType || {},
      crackedNetworks: data.data?.crackedNetworks || 0,
      totalNetworks: data.data?.totalNetworks || 0,
      crackRate: data.data?.crackRate || 0,
    }),
  });
}

// User profile hooks
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name?: string; image?: string }) =>
      ApiClient.put("/auth/update-user", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: {
      currentPassword: string;
      newPassword: string;
      revokeOtherSessions?: boolean;
    }) => ApiClient.post("/auth/change-password", data),
  });
}

// Email verification hook
export function useSendEmailVerification() {
  return useMutation({
    mutationFn: (data: { callbackURL?: string }) =>
      ApiClient.post("/auth/send-verification-email", data),
  });
}

// Password reset hooks
export function useForgotPassword() {
  return useMutation({
    mutationFn: (data: { email: string; redirectTo?: string }) =>
      ApiClient.post("/auth/forgot-password", data),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: { token: string; newPassword: string }) =>
      ApiClient.post("/auth/reset-password", data),
  });
}

// Storage statistics hooks
export function useStorageStats() {
  return useQuery({
    queryKey: ["storage", "stats"],
    queryFn: () => ApiClient.get("/api/storage/stats"),
    staleTime: 30 * 1000,
    select: (data: any) => data.data || {},
  });
}

export function useSystemStorageStats() {
  return useQuery({
    queryKey: ["storage", "system-stats"],
    queryFn: () => ApiClient.get("/api/storage/system-stats"),
    staleTime: 30 * 1000,
    select: (data: any) => data.data || {},
  });
}

// Health check
export function useHealthCheck() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => ApiClient.get("/health"),
    staleTime: 30 * 1000,
  });
}

// Admin: Config management hooks
export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => ApiClient.get("/api/v1/config"),
    staleTime: 60 * 1000,
    select: (data: any) => data.data || {},
  });
}

export function useConfigItem(id: string) {
  return useQuery({
    queryKey: ["config", id],
    queryFn: () => ApiClient.get(`/api/v1/config/${id}`),
    enabled: !!id,
    staleTime: 60 * 1000,
    select: (data: any) => data.data,
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { updates: Array<{ id: string; value: any }> }) =>
      ApiClient.patch("/api/v1/config", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });
}

export function useReloadConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => ApiClient.post("/api/v1/config/reload"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });
}

// Admin: Audit logs hooks
export function useAuditLogs(params?: {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  startDate?: string;
  endDate?: string;
  success?: boolean;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ["audit", "logs", params],
    queryFn: () => ApiClient.get("/api/v1/audit/logs", { params }),
    staleTime: 30 * 1000,
    select: (data: any) => ({
      data: data.data || [],
      pagination: data.pagination || {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    }),
  });
}

export function useAuditLogById(id: string) {
  return useQuery({
    queryKey: ["audit", "logs", id],
    queryFn: () => ApiClient.get(`/api/v1/audit/logs/${id}`),
    enabled: !!id,
    staleTime: 60 * 1000,
    select: (data: any) => data.data,
  });
}

export function useAuditLogsByUserId(
  userId: string,
  params?: {
    action?: string;
    entityType?: string;
    entityId?: string;
    startDate?: string;
    endDate?: string;
    success?: boolean;
    page?: number;
    limit?: number;
  },
) {
  return useQuery({
    queryKey: ["audit", "user", userId, params],
    queryFn: () => ApiClient.get(`/api/v1/audit/user/${userId}`, { params }),
    enabled: !!userId,
    staleTime: 30 * 1000,
    select: (data: any) => ({
      data: data.data || [],
      pagination: data.pagination || {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      },
    }),
  });
}

export function useAuditStatistics() {
  return useQuery({
    queryKey: ["audit", "statistics"],
    queryFn: () => ApiClient.get("/api/v1/audit/statistics"),
    staleTime: 60 * 1000,
    select: (data: any) => data.data || {},
  });
}

export function useCleanupAuditLogs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { olderThanDays: number }) =>
      ApiClient.delete("/api/v1/audit/cleanup", { params: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit", "logs"] });
      queryClient.invalidateQueries({ queryKey: ["audit", "statistics"] });
    },
  });
}

// Admin: Detailed health check hooks
export function useDetailedHealthCheck() {
  return useQuery({
    queryKey: ["health", "detailed"],
    queryFn: () => ApiClient.get("/api/v1/health"),
    staleTime: 15 * 1000, // Refresh more frequently
    select: (data: any) => data,
  });
}

export function useHealthSummary() {
  return useQuery({
    queryKey: ["health", "summary"],
    queryFn: () => ApiClient.get("/api/v1/health/summary"),
    staleTime: 60 * 1000,
    select: (data: any) => data.summary || {},
  });
}

export function useDatabaseHealth() {
  return useQuery({
    queryKey: ["health", "database"],
    queryFn: () => ApiClient.get("/api/v1/health/database"),
    staleTime: 30 * 1000,
    select: (data: any) => data.database || {},
  });
}

export function useRedisHealth() {
  return useQuery({
    queryKey: ["health", "redis"],
    queryFn: () => ApiClient.get("/api/v1/health/redis"),
    staleTime: 30 * 1000,
    select: (data: any) => data.redis || {},
  });
}

export function useDiskHealth() {
  return useQuery({
    queryKey: ["health", "disk"],
    queryFn: () => ApiClient.get("/api/v1/health/disk"),
    staleTime: 60 * 1000,
    select: (data: any) => data.disk || {},
  });
}

export function useWorkersHealth() {
  return useQuery({
    queryKey: ["health", "workers"],
    queryFn: () => ApiClient.get("/api/v1/health/workers"),
    staleTime: 15 * 1000,
    select: (data: any) => data.workers || {},
  });
}

// Admin: Email config hooks
export function useEmailConfig() {
  return useQuery({
    queryKey: ["config", "email"],
    queryFn: () => ApiClient.get("/api/v1/config/email"),
    staleTime: 60 * 1000,
    select: (data: any) => data.data || {},
  });
}

export function useUpdateEmailConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => ApiClient.patch("/api/v1/config/email", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config", "email"] });
    },
  });
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: (data: { to: string; type: string }) =>
      ApiClient.post("/api/v1/email/test", data),
  });
}
