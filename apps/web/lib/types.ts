// User types
export interface User {
  id: string;
  email: string;
  role: "admin" | "user";
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  role?: "admin" | "user";
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  message: string;
}

// Network types
export interface Network {
  id: string;
  ssid: string;
  bssid: string;
  captureDate: string;
  status: "processing" | "ready" | "failed";
  encryption: "WPA" | "WPA2" | "WPA3" | "OPEN" | "WEP";
  channel?: number;
  signalStrength?: number;
  key?: string;
  captureFile?: string;
}

export interface NetworkFilters {
  ssid?: string;
  bssid?: string;
  encryption?: string;
  status?: string;
  sortBy?: "ssid" | "captureDate" | "status";
  sortOrder?: "asc" | "desc";
}

// Dictionary types
export interface Dictionary {
  id: string;
  name: string;
  filename: string;
  size: number;
  type: "uploaded" | "generated";
  status: "uploading" | "processing" | "ready" | "failed";
  createdAt: string;
  uploadedBy?: string;
  wordCount?: number;
  progress?: number;
}

export interface GenerateDictionaryRequest {
  name: string;
  charset?: string;
  minLength: number;
  maxLength: number;
  pattern?: string;
  customWords?: string[];
}

export interface UploadDictionaryRequest {
  file: File;
  name: string;
}

// Job types
export interface Job {
  id: string;
  name: string;
  status:
    | "pending"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled";
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  networks: Network[];
  dictionaries: Dictionary[];
  attackMode: "straight" | "combination" | "brute-force" | "mask" | "hybrid";
  gpuAcceleration: boolean;
  keySpace?: number;
  results?: JobResult[];
  errorMessage?: string;
}

export interface CreateJobRequest {
  name: string;
  networkIds: string[];
  dictionaryIds: string[];
  attackMode: Job["attackMode"];
  gpuAcceleration?: boolean;
  mask?: string;
  ruleFile?: string;
}

// Result types matching backend API
export interface JobResult {
  id: string;
  jobId: string;
  type: "password" | "handshake" | "error";
  data: any; // Contains password, handshake data, or error info
  createdAt: string;
  job?: {
    id: string;
    name: string;
    networkId: string;
    dictionaryId: string;
    status: string;
  };
  network?: {
    id: string;
    ssid: string;
    bssid: string;
    encryption: string;
  };
}

// Legacy JobResult for backward compatibility (for existing jobs)
export interface LegacyJobResult {
  networkId: string;
  network: Network;
  password?: string;
  foundAt: string;
}

// API Response types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

// Common form types
export interface ApiErrorResponse {
  message: string;
  code?: string;
  details?: unknown;
}
