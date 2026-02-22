"use client";

import React from "react";
import { useJob } from "@/lib/api-hooks";
import { Progress } from "@workspace/ui/components/progress";
import { Badge } from "@workspace/ui/components/badge";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Zap,
  Activity,
} from "lucide-react";

interface JobProgressBarProps {
  jobId: string;
  initialStatus?: string;
  initialProgress?: number;
  showDetails?: boolean;
  className?: string;
}

export function JobProgressBar({
  jobId,
  initialStatus = "pending",
  initialProgress = 0,
  showDetails = false,
  className = "",
}: JobProgressBarProps) {
  const { data: jobData } = useJob(jobId);
  const job = jobData?.data;

  // Use polled data if available, otherwise fall back to initial values
  const status = job?.status || initialStatus;
  const progress = job?.progress !== undefined ? job.progress : initialProgress;
  const metadata = job?.metadata;

  const getStatusIcon = () => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "cancelled":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getProgressColor = () => {
    if (status === "failed" || status === "cancelled") {
      return "bg-destructive";
    }
    if (status === "completed") {
      return "bg-green-500";
    }
    return "bg-primary";
  };

  const formatDuration = (startTime?: string, endTime?: string) => {
    if (!startTime) return null;

    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);

    if (duration < 60) {
      return `${duration}s`;
    } else if (duration < 3600) {
      return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    } else {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

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

  const formatNumber = (num: number): string => {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(2)}B`;
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toString();
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-sm font-medium capitalize">{status}</span>
          {showDetails && metadata?.type && (
            <Badge variant="outline" className="text-xs">
              {metadata.type === "dictionary_generation"
                ? "Dictionary"
                : "Cracking"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{progress}%</span>
          {showDetails && (
            <>
              {job?.startTime && (
                <>
                  <Clock className="h-3 w-3" />
                  {formatDuration(job.startTime, job.endTime)}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <Progress
          value={progress}
          className="h-2"
          // Override the progress bar color based on status
          style={
            {
              "--progress-background": getProgressColor(),
            } as React.CSSProperties
          }
        />
      </div>

      {/* Additional Details */}
      {showDetails && (
        <div className="space-y-2">
          {/* Current Action with Stage */}
          {status === "running" && metadata?.currentAction && (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Zap className="h-3 w-3" />
                <span>{metadata.currentAction}</span>
              </div>
              {metadata.eta !== undefined && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>ETA: {formatETA(metadata.eta)}</span>
                </div>
              )}
            </div>
          )}

          {/* Speed and Progress Metrics */}
          {status === "running" && metadata?.passwordsPerSecond > 0 && (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-blue-600">
                <Activity className="h-3 w-3" />
                <span>Speed: {formatSpeed(metadata.passwordsPerSecond)}</span>
              </div>
              {metadata?.dictionaryProgress && (
                <span className="text-muted-foreground">
                  {formatNumber(metadata.dictionaryProgress.current)} /{" "}
                  {formatNumber(metadata.dictionaryProgress.total)}
                </span>
              )}
            </div>
          )}

          {/* Error Message */}
          {job?.errorMessage && status === "failed" && (
            <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
              <strong>Error:</strong> {job.errorMessage}
            </div>
          )}

          {/* Success Result */}
          {job?.result && status === "completed" && (
            <div className="text-xs text-green-600 bg-green-50 p-2 rounded border border-green-200">
              <strong>Success:</strong>{" "}
              {typeof job.result === "object" &&
              job.result.passwordsFound !== undefined
                ? `Found ${job.result.passwordsFound} password(s)`
                : JSON.stringify(job.result)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
