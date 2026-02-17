'use client';

import { useJobs } from '@/lib/api-hooks';
import { formatDate, formatDuration, getStatusColor } from '@/lib/utils';
import { Button } from '@workspace/ui/components/button';
import { CreateJobModal } from '@/components/create-job-modal';
import { JobProgressBar } from '@/components/job-progress-bar';
import { JobDetailModal } from '@/components/job-detail-modal';
import {
  Play,
  Pause,
  Square,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Key,
  Zap,
  Settings,
  Eye,
  Package,
  Activity,
  Loader2
} from 'lucide-react';

interface JobsTabProps {
  className?: string;
}

export function JobsTab({ className }: JobsTabProps) {
  const { data: jobsData, isLoading, error, refetch } = useJobs();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4" />;
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'paused':
        return <Pause className="h-4 w-4" />;
      case 'cancelled':
        return <Square className="h-4 w-4" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getAttackModeIcon = (mode: string) => {
    switch (mode) {
      case 'straight':
        return <Key className="h-4 w-4" />;
      case 'combination':
        return <Settings className="h-4 w-4" />;
      case 'brute-force':
        return <Zap className="h-4 w-4" />;
      case 'mask':
        return <Eye className="h-4 w-4" />;
      case 'hybrid':
        return <Activity className="h-4 w-4" />;
      default:
        return <Key className="h-4 w-4" />;
    }
  };

  if (error) {
    return (
      <div className={className}>
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <h3 className="text-destructive font-medium mb-2">
            Error Loading Jobs
          </h3>
          <p className="text-muted-foreground mb-4">
            Failed to load jobs. Please try again.
          </p>
          <Button onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`} data-testid="jobs-tab-content">
      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between font-mono">
        <div></div>
        <CreateJobModal>
          <Button className="font-mono text-sm" data-testid="create-job-button">
            <Package className="h-4 w-4 mr-2" />
            create job
          </Button>
        </CreateJobModal>
      </div>

      {/* Jobs List */}
      <div className="bg-card rounded-lg shadow">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : jobsData?.data.length === 0 ? (
          <div className="text-center py-12 font-mono px-6" data-testid="jobs-empty-state">
            <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">
              no jobs found
            </h3>
            <p className="text-muted-foreground mb-4">
              create your first cracking job to get started
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Attack Mode
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Networks
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Dictionaries
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Results
                    </th>
                  </tr>
                </thead>
            <tbody className="bg-card divide-y">
              {jobsData?.data.map((job: any) => (
                <tr key={job.id} className="hover:bg-muted/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <JobDetailModal jobId={job.id}>
                        <button className="text-sm font-medium text-left hover:text-primary transition-colors">
                          {job.name}
                        </button>
                      </JobDetailModal>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(job.createdAt)}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex flex-col">
                      <span className={`inline-flex items-center gap-1 ${getStatusColor(job.status)}`}>
                        <span>{getStatusIcon(job.status)}</span>
                        {job.status}
                      </span>
                      {job.status === 'failed' && job.errorMessage && (
                        <span className="text-[10px] text-destructive mt-1 max-w-[150px] truncate font-mono" title={job.errorMessage}>
                          {job.errorMessage}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <JobProgressBar
                      jobId={job.id}
                      initialStatus={job.status}
                      initialProgress={job.progress}
                      showDetails={false}
                      className="min-w-[200px]"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="inline-flex items-center gap-1">
                      <span>{getAttackModeIcon(job.attackMode)}</span>
                      {job.attackMode}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {(job.networks || []).length}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {(job.dictionaries || []).length}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {job.startedAt && (
                      <div className="text-sm text-muted-foreground">
                        {formatDuration(job.startedAt, job.completedAt)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {job.results && job.results.length > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                        {job.results.length} found
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        None
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}