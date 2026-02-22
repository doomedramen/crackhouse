"use client";

import { useState } from "react";
import { useNetworks, useDeleteNetwork, useCreateJob } from "@/lib/api-hooks";
import { formatDate, getStatusColor, getEncryptionColor } from "@/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { UploadModal } from "@/components/upload-modal";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
  Wifi,
  WifiOff,
  Shield,
  ShieldOff,
  Lock,
  Unlock,
  Signal,
  Upload,
  Search,
  Filter,
  Download,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Radar,
  Activity,
  Trash2,
  ArrowRight,
  Loader2,
  X,
  CheckSquare,
  Square,
} from "lucide-react";

interface NetworksTabProps {
  className?: string;
}

export function NetworksTab({ className }: NetworksTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNetworks, setSelectedNetworks] = useState<Set<string>>(
    new Set(),
  );
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterEncryption, setFilterEncryption] = useState<string>("all");

  const { data: networksData, isLoading, error, refetch } = useNetworks();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ready":
        return <CheckCircle className="h-4 w-4" />;
      case "processing":
        return <Clock className="h-4 w-4" />;
      case "failed":
        return <XCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedNetworks);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedNetworks(newSelected);
  };

  const handleSelectAll = () => {
    const filteredNetworks =
      networksData?.data.filter((network: any) => {
        const matchesStatus =
          filterStatus === "all" || network.status === filterStatus;
        const matchesEncryption =
          filterEncryption === "all" || network.encryption === filterEncryption;
        const matchesSearch =
          searchTerm === "" ||
          network.ssid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          network.bssid?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesEncryption && matchesSearch;
      }) || [];

    if (filteredNetworks.length === selectedNetworks.size) {
      setSelectedNetworks(new Set());
    } else {
      setSelectedNetworks(new Set(filteredNetworks.map((n: any) => n.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedNetworks.size === 0) {
      return;
    }
    if (!confirm(`Delete ${selectedNetworks.size} selected networks?`)) {
      return;
    }
    for (const id of Array.from(selectedNetworks)) {
      try {
        const deleteMut = useDeleteNetwork(id);
        await deleteMut.mutateAsync();
      } catch (error) {
        console.error("Failed to delete network:", id, error);
      }
    }
    setSelectedNetworks(new Set());
    refetch();
  };

  const filteredNetworks =
    networksData?.data.filter((network: any) => {
      const matchesStatus =
        filterStatus === "all" || network.status === filterStatus;
      const matchesEncryption =
        filterEncryption === "all" || network.encryption === filterEncryption;
      const matchesSearch =
        searchTerm === "" ||
        network.ssid?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        network.bssid?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesEncryption && matchesSearch;
    }) || [];

  const allSelected =
    filteredNetworks.length > 0 &&
    filteredNetworks.every((n: any) => selectedNetworks.has(n.id));

  if (error) {
    return (
      <div className={className}>
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <h3 className="text-destructive font-medium mb-2">
            Error Loading Networks
          </h3>
          <p className="text-muted-foreground mb-4">
            Failed to load networks. Please try again.
          </p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Search, Filters, and Actions */}
      <div className="flex flex-col gap-4 font-mono">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="scan networks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border rounded-md bg-background font-mono text-sm"
            />
          </div>
          <UploadModal
            defaultTab="pcap"
            onUploadSuccess={(type) => {
              if (type === "pcap") {
                refetch();
              }
            }}
          >
            <Button
              variant="outline"
              className="font-mono text-sm"
              data-testid="networks-upload-pcap-button"
            >
              <Upload className="h-4 w-4 mr-2" />
              upload pcap
            </Button>
          </UploadModal>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border rounded-md bg-background font-mono text-sm"
          >
            <option value="all">all statuses</option>
            <option value="ready">ready</option>
            <option value="processing">processing</option>
            <option value="failed">failed</option>
          </select>
          <select
            value={filterEncryption}
            onChange={(e) => setFilterEncryption(e.target.value)}
            className="px-3 py-2 border rounded-md bg-background font-mono text-sm"
          >
            <option value="all">all encryptions</option>
            <option value="OPEN">OPEN</option>
            <option value="WPA">WPA</option>
            <option value="WPA2">WPA2</option>
            <option value="WPA3">WPA3</option>
            <option value="WEP">WEP</option>
          </select>
          <Button
            variant="outline"
            onClick={handleSelectAll}
            className="font-mono text-sm"
          >
            {allSelected ? (
              <>
                <Square className="h-4 w-4 mr-2" />
                deselect all ({filteredNetworks.length})
              </>
            ) : (
              <>
                <CheckSquare className="h-4 w-4 mr-2" />
                select all ({filteredNetworks.length})
              </>
            )}
          </Button>
          {selectedNetworks.size > 0 && (
            <>
              <Button
                variant="outline"
                onClick={() => setSelectedNetworks(new Set())}
                className="font-mono text-sm"
              >
                <X className="h-4 w-4 mr-2" />
                clear selection ({selectedNetworks.size})
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                className="font-mono text-sm"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                delete selected ({selectedNetworks.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Networks List */}
      <div className="bg-card rounded-lg shadow font-mono">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredNetworks.length === 0 ? (
          <div className="text-center py-12 font-mono px-6">
            <Radar className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">no networks found</h3>
            <p className="text-muted-foreground mb-4">
              upload pcap files to start scanning networks
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider w-12">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={handleSelectAll}
                        className="mx-auto"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      SSID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      BSSID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Encryption
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Capture Date
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y">
                  {filteredNetworks.map((network: any) => (
                    <tr key={network.id} className="hover:bg-muted/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Checkbox
                          checked={selectedNetworks.has(network.id)}
                          onCheckedChange={() => handleToggleSelect(network.id)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {network.ssid || "<Hidden>"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-muted-foreground">
                        {network.bssid}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEncryptionColor(network.encryption)}`}
                        >
                          {network.encryption}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`inline-flex items-center gap-1 ${getStatusColor(network.status)}`}
                        >
                          {getStatusIcon(network.status)}
                          <span className="font-mono text-xs uppercase">
                            {network.status}
                          </span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(network.captureDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1">
                          <NetworkActions network={network} />
                        </div>
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

interface NetworkActionsProps {
  network: any;
}

function NetworkActions({ network }: NetworkActionsProps) {
  const createJobMutation = useCreateJob();

  const handleCreateJob = () => {
    // TODO: Integrate with create job modal
    console.log("Create job for network:", network.id);
    // For now, just create a job with this network pre-selected
    createJobMutation.mutate({
      networkId: network.id,
      dictionaryId: "", // User needs to select dictionary
      attackMode: "handshake",
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCreateJob}
        title="Create Cracking Job"
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
