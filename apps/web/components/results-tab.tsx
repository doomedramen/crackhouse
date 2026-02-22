"use client";

import { useState } from "react";
import {
  useResults,
  useResultsStats,
  useCrackedPasswords,
} from "@/lib/api-hooks";
import { formatDate, getStatusColor } from "@/lib/utils";
import { Button } from "@workspace/ui/components/button";
import {
  Key,
  Shield,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  Filter,
  Eye,
  Network,
  Calendar,
  Hash,
  Copy,
} from "lucide-react";

interface ResultsTabProps {
  className?: string;
}

export function ResultsTab({ className }: ResultsTabProps) {
  const [filters, setFilters] = useState({
    type: undefined as "password" | "handshake" | "error" | undefined,
    jobId: "",
    networkId: "",
  });

  const [showCrackedOnly, setShowCrackedOnly] = useState(false);

  const {
    data: resultsData,
    isLoading,
    error,
    refetch,
  } = useResults(
    filters.type || filters.jobId || filters.networkId ? filters : undefined,
  );

  const { data: statsData } = useResultsStats();
  const { data: crackedPasswords } = useCrackedPasswords();

  const getResultIcon = (type: string) => {
    switch (type) {
      case "password":
        return <Key className="h-4 w-4 text-green-500" />;
      case "handshake":
        return <Shield className="h-4 w-4 text-blue-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "password":
        return "text-green-500 bg-green-50";
      case "handshake":
        return "text-blue-500 bg-blue-50";
      case "error":
        return "text-red-500 bg-red-50";
      default:
        return "text-gray-500 bg-gray-50";
    }
  };

  const getDataTypeDisplay = (type: string) => {
    switch (type) {
      case "password":
        return "Cracked";
      case "handshake":
        return "Handshake";
      case "error":
        return "Error";
      default:
        return type;
    }
  };

  const handleExportCSV = () => {
    const dataToExport = showCrackedOnly
      ? crackedPasswords?.data
      : resultsData?.data;
    if (!dataToExport || dataToExport.length === 0) return;

    const csvHeaders = ["Type", "Network", "BSSID", "Job", "Data", "Created"];
    const csvData = dataToExport.map((result: any) => [
      getDataTypeDisplay(result.type),
      result.network?.ssid || "Unknown",
      result.network?.bssid || "Unknown",
      result.job?.name || "Unknown",
      result.type === "password"
        ? result.data.password
        : result.type === "handshake"
          ? "Handshake captured"
          : result.data.error || "Unknown error",
      formatDate(result.createdAt),
    ]);

    const csvContent = [csvHeaders, ...csvData]
      .map((row) => row.join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `results_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyPassword = (password: string) => {
    navigator.clipboard.writeText(password);
  };

  if (error) {
    return (
      <div className={className}>
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <h3 className="text-destructive font-medium mb-2">
            Error Loading Results
          </h3>
          <p className="text-muted-foreground mb-4">
            Failed to load results. Please try again.
          </p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
        <div className="bg-card rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Results</p>
              <p className="text-2xl font-bold">
                {statsData?.byType
                  ? (Object.values(statsData.byType) as number[]).reduce(
                      (a: number, b: number) => a + b,
                      0,
                    )
                  : 0}
              </p>
            </div>
            <div className="text-blue-500">
              <Hash className="h-8 w-8" />
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Cracked Networks</p>
              <p className="text-2xl font-bold text-green-500">
                {statsData?.crackedNetworks || 0}
              </p>
            </div>
            <div className="text-green-500">
              <Key className="h-8 w-8" />
            </div>
          </div>
          <div className="text-sm text-muted-foreground mt-2">
            {statsData?.totalNetworks && statsData.totalNetworks > 0
              ? `${Math.round(statsData.crackRate)}% success rate`
              : "0%"}
          </div>
        </div>

        <div className="bg-card rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Results by Type</p>
              <div className="text-sm mt-2">
                <div className="text-green-500">
                  Passwords: {statsData?.byType?.password || 0}
                </div>
                <div className="text-blue-500">
                  Handshakes: {statsData?.byType?.handshake || 0}
                </div>
                <div className="text-red-500">
                  Errors: {statsData?.byType?.error || 0}
                </div>
              </div>
            </div>
            <div className="text-purple-500">
              <Network className="h-8 w-8" />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between font-mono">
        <div className="flex flex-wrap gap-2">
          <select
            value={filters.type}
            onChange={(e) =>
              setFilters({ ...filters, type: e.target.value as any })
            }
            className="px-3 py-1 border rounded-md text-sm bg-background"
          >
            <option value="">All Types</option>
            <option value="password">Cracked</option>
            <option value="handshake">Handshakes</option>
            <option value="error">Errors</option>
          </select>

          <button
            onClick={() => setShowCrackedOnly(!showCrackedOnly)}
            className={`px-3 py-1 border rounded-md text-sm ${
              showCrackedOnly
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted"
            }`}
          >
            <Key className="h-3 w-3 inline mr-1" />
            Cracked Only
          </button>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="font-mono text-sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Results List */}
      <div className="bg-card rounded-lg shadow">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : resultsData?.data.length === 0 ? (
          <div className="text-center py-12 font-mono px-6">
            <Hash className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">no results found</h3>
            <p className="text-muted-foreground mb-4">
              run cracking jobs to generate results
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Network
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      BSSID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Job
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Result Data
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y">
                  {(showCrackedOnly
                    ? crackedPasswords?.data
                    : resultsData?.data
                  ).map((result: any) => (
                    <tr key={result.id} className="hover:bg-muted/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(result.type)}`}
                        >
                          <span>{getResultIcon(result.type)}</span>
                          {getDataTypeDisplay(result.type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-1">
                          <Network className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {result.network?.ssid || "Unknown Network"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground font-mono">
                        {result.network?.bssid || "Unknown"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="text-muted-foreground">
                          {result.job?.name || "Unknown Job"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {result.type === "password" && result.data?.password ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono bg-green-50 text-green-700 px-2 py-1 rounded">
                              {result.data.password}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleCopyPassword(result.data.password)
                              }
                              className="h-6 w-6 p-0"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : result.type === "handshake" ? (
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-blue-500" />
                            <span className="text-blue-600">
                              {result.data?.hasHandshake
                                ? "Captured"
                                : "No Handshake"}
                            </span>
                            {result.data?.hasPMKID && (
                              <span className="text-blue-600">+ PMKID</span>
                            )}
                          </div>
                        ) : result.type === "error" ? (
                          <div className="text-red-600">
                            <AlertCircle className="h-4 w-4 inline mr-1" />
                            {result.data?.error || "Unknown error"}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            {typeof result.data === "string"
                              ? result.data.substring(0, 50) +
                                (result.data.length > 50 ? "..." : "")
                              : "Unknown data"}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(result.createdAt)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            /* TODO: Show result details */
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {resultsData?.pagination &&
          resultsData.pagination.total > resultsData.pagination.limit && (
            <div className="flex items-center justify-between px-6 py-3 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {resultsData.pagination.offset + 1} to{" "}
                {Math.min(
                  resultsData.pagination.offset + resultsData.pagination.limit,
                  resultsData.pagination.total,
                )}{" "}
                of {resultsData.pagination.total} results
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resultsData.pagination.offset === 0}
                  onClick={() => {
                    const newOffset = Math.max(
                      0,
                      resultsData.pagination.offset -
                        resultsData.pagination.limit,
                    );
                    // TODO: Update pagination
                  }}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!resultsData.pagination.hasMore}
                  onClick={() => {
                    // TODO: Update pagination
                  }}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
