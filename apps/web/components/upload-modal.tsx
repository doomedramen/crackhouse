"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Uppy from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { Button } from "@workspace/ui/components/button";
import {
  Upload,
  X,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
  Wifi,
  BookOpen,
} from "lucide-react";

interface UploadModalProps {
  children: React.ReactNode;
  defaultTab?: "pcap" | "dictionary";
  onUploadSuccess?: (type: "pcap" | "dictionary") => void;
}

type UploadType = "pcap" | "dictionary";

export function UploadModal({
  children,
  defaultTab = "pcap",
  onUploadSuccess,
}: UploadModalProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<UploadType>(defaultTab);
  const [uppyInstances, setUppyInstances] = useState<{
    pcap: Uppy | null;
    dictionary: Uppy | null;
  }>({ pcap: null, dictionary: null });
  const [uploadProgress, setUploadProgress] = useState<{
    pcap: number;
    dictionary: number;
  }>({ pcap: 0, dictionary: 0 });
  const [uploadStatus, setUploadStatus] = useState<{
    pcap: "idle" | "uploading" | "success" | "error";
    dictionary: "idle" | "uploading" | "success" | "error";
  }>({ pcap: "idle", dictionary: "idle" });
  const [, forceUpdate] = useState({});
  const pcapDashboardRef = useRef<HTMLDivElement>(null);
  const dictionaryDashboardRef = useRef<HTMLDivElement>(null);

  const initializeUppy = useCallback((type: UploadType) => {
    const uppy = new Uppy({
      id: `crackhouse-uppy-${type}`,
      autoProceed: false,
      restrictions: {
        maxFileSize:
          type === "pcap" ? 500 * 1024 * 1024 : 10 * 1024 * 1024 * 1024, // 500MB for PCAP, 10GB for dictionaries
        maxNumberOfFiles: 10, // Allow multiple files
        allowedFileTypes:
          type === "pcap"
            ? [".pcap", ".cap"]
            : [".txt", ".lst", ".dict", ".wordlist"],
      },
      debug: process.env.NODE_ENV === "development",
    });

    // Add XHR Upload plugin - use correct endpoint based on type
    const uploadEndpoint =
      type === "pcap" ? "/api/upload" : "/api/dictionaries/upload";
    uppy.use(XHRUpload, {
      endpoint: uploadEndpoint,
      method: "POST",
      fieldName: "file",
      headers: {
        // Add auth headers when we have real auth
        // 'Authorization': `Bearer ${token}`,
      },
      timeout: type === "pcap" ? 120000 : 600000, // 2 min for PCAP, 10 min for large dictionaries
      limit: 3, // Number of concurrent uploads
    });

    // Handle upload progress
    uppy.on("upload-progress", (data: any) => {
      setUploadProgress((prev) => ({ ...prev, [type]: data?.progress ?? 0 }));
    });

    // Handle upload success
    uppy.on("upload-success", (file, response) => {
      setUploadStatus((prev) => ({ ...prev, [type]: "success" }));

      if (type === "pcap") {
        // Show success message with auto-extraction info
        console.log(
          "PCAP uploaded successfully - networks will be extracted automatically",
        );
      }

      // Notify parent component to refresh data
      onUploadSuccess?.(type);
    });

    // Handle upload error
    uppy.on("upload-error", (file, error) => {
      setUploadStatus((prev) => ({ ...prev, [type]: "error" }));
    });

    // Handle complete event
    uppy.on("complete", (result: any) => {
      if (result.successful?.length > 0) {
        setUploadStatus((prev) => ({ ...prev, [type]: "success" }));
        setTimeout(() => {
          setUploadStatus((prev) => ({ ...prev, [type]: "idle" }));
          setUploadProgress((prev) => ({ ...prev, [type]: 0 }));
        }, 3000);
      }
    });

    return uppy;
  }, []);

  // Reset active tab when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  // Initialize Uppy instances when modal opens
  useEffect(() => {
    if (open) {
      const pcapUppy = initializeUppy("pcap");
      const dictionaryUppy = initializeUppy("dictionary");
      setUppyInstances({ pcap: pcapUppy, dictionary: dictionaryUppy });
    }

    // Cleanup when modal closes
    return () => {
      if (!open) {
        // Clean up Uppy instances safely
        const instances = uppyInstances as any;
        if (instances.pcap && typeof instances.pcap.close === "function") {
          instances.pcap.close();
        }
        if (
          instances.dictionary &&
          typeof instances.dictionary.close === "function"
        ) {
          instances.dictionary.close();
        }
        setUppyInstances({ pcap: null, dictionary: null });
        setUploadStatus({ pcap: "idle", dictionary: "idle" });
        setUploadProgress({ pcap: 0, dictionary: 0 });
      }
    };
  }, [open, initializeUppy]);

  const handleUpload = (type: UploadType) => {
    const uppy = uppyInstances[type];
    if (uppy) {
      const files = uppy.getFiles();
      if (files.length > 0) {
        setUploadStatus((prev) => ({ ...prev, [type]: "uploading" }));
        uppy.upload();
      }
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setActiveTab(defaultTab);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getStatusIcon = (
    status: "idle" | "uploading" | "success" | "error",
  ) => {
    switch (status) {
      case "idle":
        return <FileText className="h-5 w-5" />;
      case "uploading":
        return <Loader2 className="h-5 w-5 animate-spin" />;
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusMessage = (type: UploadType) => {
    const status = uploadStatus[type];
    switch (status) {
      case "idle":
        return "";
      case "uploading":
        return `Uploading... ${Math.round(uploadProgress[type])}%`;
      case "success":
        return "Upload completed successfully!";
      case "error":
        return "Upload failed. Please try again.";
    }
  };

  const renderUploadArea = (type: UploadType) => {
    const Icon = type === "pcap" ? Wifi : BookOpen;
    const title =
      type === "pcap" ? "Network Captures" : "Password Dictionaries";
    const description =
      type === "pcap"
        ? "Upload PCAP files - Networks will be automatically extracted"
        : "Upload TXT dictionary files for password cracking (up to 10GB)";
    const acceptedTypes = type === "pcap" ? ".pcap" : ".txt";
    const uppy = uppyInstances[type];
    const files = uppy ? uppy.getFiles() : [];

    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <Icon className="h-8 w-8 mx-auto text-muted-foreground" />
          <h3 className="text-lg font-semibold font-mono uppercase">{title}</h3>
          <p className="text-sm text-muted-foreground font-mono">
            {description}
          </p>
        </div>

        {/* Uppy Dashboard */}
        <div className="border rounded-lg p-4">
          <div>
            {uppy && (
              <>
                <input
                  type="file"
                  data-testid={`file-input-${type}`}
                  className="hidden"
                  multiple
                  accept={acceptedTypes}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach((file) => {
                      try {
                        uppy.addFile({
                          name: file.name,
                          size: file.size,
                          type: file.type,
                          data: file,
                        });
                      } catch (err) {
                        // File might already exist in Uppy
                        console.warn("File already added:", file.name);
                      }
                    });
                    // Reset input so same file can be selected again
                    e.target.value = "";
                    // Force re-render to show selected files
                    forceUpdate({});
                  }}
                />
                <div
                  className="min-h-[200px] border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-500 cursor-pointer"
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files);
                    files.forEach((file) => {
                      try {
                        uppy.addFile(file);
                      } catch (err) {
                        console.warn("File already added:", file.name);
                      }
                    });
                    forceUpdate({});
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => {
                    const input = document.querySelector(
                      `[data-testid="file-input-${type}"]`,
                    ) as HTMLInputElement;
                    input?.click();
                  }}
                >
                  <div className="text-center">
                    <Upload className="mx-auto h-12 w-12 mb-4" />
                    <p>Drop files here or click to browse</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Selected Files */}
        {files.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold font-mono uppercase text-muted-foreground">
              Selected Files ({files.length})
            </h4>
            <div
              className="border rounded-md divide-y max-h-40 overflow-y-auto"
              data-testid={`selected-files-${type}`}
            >
              {files.map((file: any) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3"
                  data-testid={`file-item-${type}-${file.name}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium font-mono truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {formatFileSize(file.size || 0)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      uppy?.removeFile(file.id);
                      forceUpdate({});
                    }}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {uploadStatus[type] === "uploading" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono">Uploading...</span>
              <span className="font-mono">
                {Math.round(uploadProgress[type])}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress[type]}%` }}
              />
            </div>
          </div>
        )}

        {/* Success Message */}
        {uploadStatus[type] === "success" && (
          <div
            className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md"
            data-testid={`upload-success-${type}`}
          >
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-800 font-mono">
              {type === "pcap"
                ? "PCAP uploaded successfully! Networks are being extracted automatically."
                : "Dictionary uploaded successfully!"}
            </span>
          </div>
        )}

        {/* Upload Button */}
        <div className="flex justify-end">
          <Button
            onClick={() => handleUpload(type)}
            disabled={files.length === 0 || uploadStatus[type] === "uploading"}
            className="font-mono"
            data-testid={`upload-button-${type}`}
          >
            {uploadStatus[type] === "uploading" ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload {type === "pcap" ? "Captures" : "Dictionaries"}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="sm:max-w-[700px] h-[85vh] max-h-[85vh] p-0 gap-0"
        data-testid="upload-modal"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 font-mono uppercase">
            <Upload className="h-5 w-5" />
            Upload Files
          </DialogTitle>
          <DialogDescription className="font-mono">
            Upload PCAP files (auto-extract networks) and dictionaries for
            password cracking.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as UploadType)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <div className="px-6 pt-4 pb-2 border-b">
            <TabsList className="grid w-full grid-cols-2 bg-muted text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg p-[3px]">
              <TabsTrigger
                value="pcap"
                className="font-mono flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
              >
                <Wifi className="h-4 w-4" />
                Captures
              </TabsTrigger>
              <TabsTrigger
                value="dictionary"
                className="font-mono flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
              >
                <BookOpen className="h-4 w-4" />
                Dictionaries
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="pcap" className="mt-6 p-6 h-full">
              {renderUploadArea("pcap")}
            </TabsContent>
            <TabsContent value="dictionary" className="mt-6 p-6 h-full">
              {renderUploadArea("dictionary")}
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex justify-end p-4 border-t">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="font-mono"
            data-testid="upload-modal-close"
          >
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
