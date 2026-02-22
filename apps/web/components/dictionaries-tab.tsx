"use client";

import {
  useDictionaries,
  useValidateDictionary,
  useDeleteDictionary,
} from "@/lib/api-hooks";
import { formatDate, formatFileSize, getStatusColor } from "@/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { UploadModal } from "@/components/upload-modal";
import { DictionaryGenerationModal } from "@/components/dictionary-generation-modal";
import { MergeDictionariesModal } from "@/components/merge-dictionaries-modal";
import { DictionaryStatistics } from "@/components/dictionary-statistics";
import {
  BookOpen,
  FileText,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Zap,
  FolderOpen,
  Loader2,
  BarChart3,
  Trash2,
  ShieldCheck,
} from "lucide-react";

interface DictionariesTabProps {
  className?: string;
}

export function DictionariesTab({ className }: DictionariesTabProps) {
  const {
    data: dictionariesData,
    isLoading,
    error,
    refetch,
  } = useDictionaries();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ready":
        return <CheckCircle className="h-4 w-4" />;
      case "uploading":
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "failed":
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "uploaded":
        return <FolderOpen className="h-4 w-4" />;
      case "generated":
        return <Zap className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  interface DictionaryActionsProps {
    dictionary: any;
    onRefresh: () => void;
  }

  function DictionaryActions({
    dictionary,
    onRefresh,
  }: DictionaryActionsProps) {
    const validateMutation = useValidateDictionary(dictionary.id);
    const deleteMutation = useDeleteDictionary(dictionary.id);

    const handleValidate = async () => {
      try {
        await validateMutation.mutateAsync();
        onRefresh();
      } catch (error) {
        console.error("Failed to validate dictionary:", error);
      }
    };

    const handleDelete = async () => {
      if (!confirm(`Delete dictionary "${dictionary.name}"?`)) {
        return;
      }
      try {
        await deleteMutation.mutateAsync();
        onRefresh();
      } catch (error) {
        console.error("Failed to delete dictionary:", error);
      }
    };

    return (
      <div className="flex items-center justify-end gap-1">
        <DictionaryStatistics
          dictionaryId={dictionary.id}
          dictionaryName={dictionary.name}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="View Statistics"
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
        </DictionaryStatistics>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Validate Dictionary"
          onClick={handleValidate}
          disabled={validateMutation.isPending}
        >
          {validateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          title="Delete Dictionary"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <h3 className="text-destructive font-medium mb-2">
            Error Loading Dictionaries
          </h3>
          <p className="text-muted-foreground mb-4">
            Failed to load dictionaries. Please try again.
          </p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between font-mono">
        <div></div>
        <div className="flex gap-2">
          <UploadModal
            defaultTab="dictionary"
            onUploadSuccess={(type) => {
              if (type === "dictionary") {
                refetch();
              }
            }}
          >
            <Button
              variant="outline"
              className="font-mono text-sm"
              data-testid="dictionaries-upload-button"
            >
              Upload Dictionary
            </Button>
          </UploadModal>
          <DictionaryGenerationModal>
            <Button variant="outline" className="font-mono text-sm">
              Generate Dictionary
            </Button>
          </DictionaryGenerationModal>
          <MergeDictionariesModal>
            <Button className="font-mono text-sm">Merge Dictionaries</Button>
          </MergeDictionariesModal>
        </div>
      </div>

      {/* Dictionaries List */}
      <div className="bg-card rounded-lg shadow">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : dictionariesData?.data.length === 0 ? (
          <div className="text-center py-12 font-mono px-6">
            <BookOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">no dictionaries found</h3>
            <p className="text-muted-foreground mb-4">
              upload or generate dictionaries to get started
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
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Words
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y">
                  {dictionariesData?.data.map((dictionary: any) => (
                    <tr key={dictionary.id} className="hover:bg-muted/50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium">
                            {dictionary.name}
                          </div>
                          <div className="text-sm text-muted-foreground font-mono">
                            {dictionary.filename}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className="inline-flex items-center gap-1">
                          <span>{getTypeIcon(dictionary.type)}</span>
                          {dictionary.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`inline-flex items-center gap-1 ${getStatusColor(dictionary.status)}`}
                        >
                          <span>{getStatusIcon(dictionary.status)}</span>
                          {dictionary.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {formatFileSize(dictionary.size)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {dictionary.wordCount
                          ? dictionary.wordCount.toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(dictionary.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <DictionaryActions
                          dictionary={dictionary}
                          onRefresh={refetch}
                        />
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
