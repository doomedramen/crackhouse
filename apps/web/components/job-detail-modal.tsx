"use client";

import React, { useState } from "react";
import { useJob, useCancelJob, useRetryJob } from "@/lib/api-hooks";
import { formatDate, formatDuration, formatFileSize } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { JobProgressBar } from "@/components/job-progress-bar";
import {
  Eye,
  Copy,
  Download,
  RefreshCw,
  X,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Activity,
  Zap,
  Shield,
  Key,
  Hash,
  Calendar,
  FileText,
  Settings,
  Play,
  Square,
  Loader2,
} from "lucide-react";

interface JobDetailModalProps {
  children: React.ReactNode;
  jobId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function JobDetailModal({
  children,
  jobId,
  open: controlledOpen,
  onOpenChange,
}: JobDetailModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "results" | "config" | "logs"
  >("overview");

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = isControlled ? onOpenChange || (() => {}) : setInternalOpen;

  const { data: jobData, isLoading, error, refetch } = useJob(jobId);
  const cancelMutation = useCancelJob(jobId);
  const retryMutation = useRetryJob(jobId);

  const job = jobData?.data;
  const realTimeStatus = job?.status;
  const realTimeProgress = job?.progress;

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Formatting helpers for progress metrics
  const formatSpeed = (speed: number): string => {
    if (speed === 0) return "0 H/s";
    if (speed >= 1000000000) return `${(speed / 1000000000).toFixed(2)} GH/s`;
    if (speed >= 1000000) return `${(speed / 1000000).toFixed(2)} MH/s`;
    if (speed >= 1000) return `${(speed / 1000).toFixed(2)} kH/s`;
    return `${speed.toFixed(0)} H/s`;
  };

  const formatETA = (seconds: number): string => {
    if (!seconds || seconds <= 0) return "Calculating...";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const handleDownloadResults = () => {
    if (!job?.results || job.results.length === 0) return;

    const resultsData = job.results.map((result: any) => ({
      type: result.type,
      data: result.data,
      createdAt: result.createdAt,
    }));

    const blob = new Blob([JSON.stringify(resultsData, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-${job.id}-results.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCancel = () => {
    if (confirm("Are you sure you want to cancel this job?")) {
      cancelMutation.mutate();
    }
  };

  const handleRetry = () => {
    retryMutation.mutate();
  };

  const getStatusIcon = () => {
    switch (realTimeStatus) {
      case "pending":
        return <Clock className="h-5 w-5" />;
      case "running":
        return <Loader2 className="h-5 w-5 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "cancelled":
        return <Square className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5" />;
    }
  };

  const getStatusColor = () => {
    switch (realTimeStatus) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "running":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "failed":
        return "bg-red-100 text-red-800 border-red-200";
      case "cancelled":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (error) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Error Loading Job
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 text-center">
            <p className="text-muted-foreground">
              Failed to load job details. Please try again.
            </p>
            <Button onClick={() => refetch()} className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (isLoading || !job) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading Job Details
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Loading job information...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 font-mono">
              {getStatusIcon()}
              {job.name}
            </DialogTitle>
            <Badge variant="outline" className={getStatusColor()}>
              {realTimeStatus}
            </Badge>
          </div>
          <DialogDescription className="font-mono">
            Detailed information and results for this job
          </DialogDescription>
        </DialogHeader>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 p-4 border-b">
          <JobProgressBar
            jobId={job.id}
            initialStatus={job.status}
            initialProgress={job.progress}
            showDetails={true}
            className="flex-1"
          />
          <div className="flex items-center gap-2">
            {(realTimeStatus === "pending" || realTimeStatus === "failed") && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={retryMutation.isPending}
                className="font-mono"
              >
                {retryMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Retry
              </Button>
            )}
            {(realTimeStatus === "pending" || realTimeStatus === "running") && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
                className="font-mono"
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                Cancel
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="font-mono"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex-1 py-3 px-4 font-mono text-sm border-b-2 transition-colors ${
              activeTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Activity className="h-4 w-4 mr-2" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab("results")}
            className={`flex-1 py-3 px-4 font-mono text-sm border-b-2 transition-colors ${
              activeTab === "results"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4 mr-2" />
            Results ({job.results?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`flex-1 py-3 px-4 font-mono text-sm border-b-2 transition-colors ${
              activeTab === "logs"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertCircle className="h-4 w-4 mr-2" />
            Logs
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={`flex-1 py-3 px-4 font-mono text-sm border-b-2 transition-colors ${
              activeTab === "config"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings className="h-4 w-4 mr-2" />
            Configuration
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === "overview" && (
            <div className="p-6 space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold font-mono flex items-center gap-2">
                    <Hash className="h-5 w-5" />
                    Job Information
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground font-mono">
                        ID:
                      </span>
                      <span className="text-sm font-mono">
                        {job.id}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyToClipboard(job.id)}
                          className="ml-2 h-6 w-6 p-0"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground font-mono">
                        Type:
                      </span>
                      <Badge
                        variant="outline"
                        className="text-xs font-mono capitalize"
                      >
                        {job.config?.type || "Unknown"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground font-mono">
                        Created:
                      </span>
                      <span className="text-sm font-mono">
                        {formatDate(job.createdAt)}
                      </span>
                    </div>
                    {job.startTime && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground font-mono">
                          Started:
                        </span>
                        <span className="text-sm font-mono">
                          {formatDate(job.startTime)}
                        </span>
                      </div>
                    )}
                    {job.endTime && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground font-mono">
                          Completed:
                        </span>
                        <span className="text-sm font-mono">
                          {formatDate(job.endTime)}
                        </span>
                      </div>
                    )}
                    {job.startTime && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground font-mono">
                          Duration:
                        </span>
                        <span className="text-sm font-mono">
                          {formatDuration(job.startTime, job.endTime)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold font-mono flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Associated Resources
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground font-mono">
                        Network:
                      </span>
                      <div className="text-right">
                        {job.network ? (
                          <div>
                            <span className="text-sm font-medium">
                              {job.network.ssid}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono block">
                              {job.network.bssid}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Not found
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground font-mono">
                        Dictionary:
                      </span>
                      <div className="text-right">
                        {job.dictionary ? (
                          <div>
                            <span className="text-sm font-medium">
                              {job.dictionary.name}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono block">
                              {formatFileSize(job.dictionary.size || 0)} •{" "}
                              {job.dictionary.wordCount || 0} words
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Not found
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              {job.description && (
                <div>
                  <h3 className="text-lg font-semibold font-mono mb-3">
                    Description
                  </h3>
                  <p className="text-sm text-muted-foreground font-mono bg-muted/50 p-3 rounded">
                    {job.description}
                  </p>
                </div>
              )}

              {/* Error Message */}
              {job.errorMessage && (
                <div>
                  <h3 className="text-lg font-semibold font-mono mb-3 flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                    Error Information
                  </h3>
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
                    {job.errorMessage}
                  </div>
                </div>
              )}

              {/* Progress Metrics */}
              {realTimeStatus === "running" && job?.metadata && (
                <div>
                  <h3 className="text-lg font-semibold font-mono mb-3 flex items-center gap-2">
                    <Zap className="h-5 w-5 text-purple-500" />
                    Cracking Progress
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {job.metadata.passwordsPerSecond > 0 && (
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                        <div className="text-xs text-blue-600 font-mono mb-1">
                          Speed
                        </div>
                        <div className="text-2xl font-bold text-blue-900">
                          {formatSpeed(job.metadata.passwordsPerSecond)}
                        </div>
                      </div>
                    )}

                    {job.metadata.eta > 0 && (
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                        <div className="text-xs text-purple-600 font-mono mb-1">
                          Time Remaining
                        </div>
                        <div className="text-2xl font-bold text-purple-900">
                          {formatETA(job.metadata.eta)}
                        </div>
                      </div>
                    )}

                    {job.metadata.passwordsTested > 0 && (
                      <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                        <div className="text-xs text-green-600 font-mono mb-1">
                          Passwords Tested
                        </div>
                        <div className="text-2xl font-bold text-green-900">
                          {job.metadata.passwordsTested.toLocaleString()}
                        </div>
                      </div>
                    )}

                    {job.metadata.hashcatStatus?.recovered && (
                      <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 p-4 rounded-lg border border-yellow-200">
                        <div className="text-xs text-yellow-600 font-mono mb-1">
                          Recovered
                        </div>
                        <div className="text-2xl font-bold text-yellow-900">
                          {job.metadata.hashcatStatus.recovered}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Live Status */}
              {realTimeStatus === "running" && job && (
                <div>
                  <h3 className="text-lg font-semibold font-mono mb-3 flex items-center gap-2">
                    <Activity className="h-5 w-5 text-blue-500" />
                    Live Status
                  </h3>
                  <div className="text-sm text-muted-foreground font-mono bg-blue-50 p-3 rounded border border-blue-200">
                    <div className="space-y-1">
                      <div>
                        Status:{" "}
                        <span className="font-medium">{job.status}</span>
                      </div>
                      <div>
                        Progress:{" "}
                        <span className="font-medium">{job.progress}%</span>
                      </div>
                      {job.metadata?.stage && (
                        <div>
                          Stage:{" "}
                          <span className="font-medium capitalize">
                            {job.metadata.stage.replace(/_/g, " ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "results" && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold font-mono flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Job Results
                </h3>
                {job.results && job.results.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadResults}
                    className="font-mono"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download JSON
                  </Button>
                )}
              </div>

              {!job.results || job.results.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2 font-mono">
                    No Results Yet
                  </h3>
                  <p className="text-muted-foreground font-mono">
                    {realTimeStatus === "completed"
                      ? "This job completed without any results."
                      : realTimeStatus === "running"
                        ? "Results will appear here as the job progresses."
                        : "Start the job to see results."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {job.results.map((result: any, index: number) => (
                    <div key={result.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {result.type === "password" && (
                            <Key className="h-4 w-4 text-green-500" />
                          )}
                          {result.type === "handshake" && (
                            <Shield className="h-4 w-4 text-blue-500" />
                          )}
                          {result.type === "error" && (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <Badge
                            variant="outline"
                            className="text-xs font-mono capitalize"
                          >
                            {result.type}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground font-mono">
                          {formatDate(result.createdAt)}
                        </span>
                      </div>
                      <div className="text-sm">
                        {result.type === "password" &&
                          result.data?.password && (
                            <div className="flex items-center gap-2">
                              <span className="font-mono bg-green-100 text-green-800 px-2 py-1 rounded">
                                {result.data.password}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleCopyToClipboard(result.data.password)
                                }
                                className="h-6 w-6 p-0"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        {result.type === "handshake" && (
                          <div className="text-muted-foreground">
                            Handshake captured successfully
                          </div>
                        )}
                        {result.type === "error" && (
                          <div className="text-red-600">
                            <strong>Error:</strong>{" "}
                            {result.data?.error || "Unknown error"}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "logs" && (
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold font-mono flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Execution Logs & Errors
              </h3>

              <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-xs overflow-y-auto max-h-[400px] border border-muted">
                <div className="mb-2 text-muted-foreground">
                  # system logs initialized for job {job.id}
                </div>
                <div className="mb-1 text-muted-foreground">
                  [{formatDate(job.createdAt)}] job created
                </div>
                {job.startTime && (
                  <div className="mb-1 text-muted-foreground">
                    [{formatDate(job.startTime)}] job execution started
                  </div>
                )}

                {job.errorMessage && (
                  <div className="mt-4 p-2 bg-destructive/20 border border-destructive/50 text-red-400 rounded">
                    <span className="font-bold">[ERROR]</span>{" "}
                    {job.errorMessage}
                  </div>
                )}

                {job.results
                  ?.filter((r: any) => r.type === "error")
                  .map((err: any, i: number) => (
                    <div
                      key={i}
                      className="mt-2 p-2 bg-destructive/10 border border-destructive/30 text-red-300 rounded"
                    >
                      <span className="font-bold">[ERROR]</span>{" "}
                      {err.data?.error || JSON.stringify(err.data)}
                      <div className="text-[10px] opacity-70">
                        at {formatDate(err.createdAt)}
                      </div>
                    </div>
                  ))}

                {job.endTime && (
                  <div className="mt-4 text-muted-foreground">
                    [{formatDate(job.endTime)}] job execution finished with
                    status: {job.status}
                  </div>
                )}

                {job.status === "completed" && !job.errorMessage && (
                  <div className="mt-2 text-green-500 font-bold">
                    [SUCCESS] hashcat process completed successfully
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "config" && (
            <div className="p-6">
              <h3 className="text-lg font-semibold font-mono mb-4 flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Job Configuration
              </h3>
              <div className="bg-muted/50 rounded-lg p-4">
                <pre className="text-sm font-mono text-wrap">
                  {JSON.stringify(job.config, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            className="font-mono"
          >
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
