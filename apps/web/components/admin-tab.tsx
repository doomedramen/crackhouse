"use client";

import { useState } from "react";
import { useAuthSession } from "@/lib/api-hooks";
import { AuditLogsViewer } from "./audit-logs-viewer";
import { HealthDashboard } from "./health-dashboard";
import { QuickActionsPanel } from "./quick-actions-panel";
import { Settings, Shield, Zap, FileText } from "lucide-react";

interface AdminTabProps {
  className?: string;
}

export function AdminTab({ className }: AdminTabProps) {
  const { data: authData } = useAuthSession();
  const [activeTab, setActiveTab] = useState<
    "config" | "health" | "audit" | "actions"
  >("config");

  const isAdmin =
    (authData?.user as any)?.role === "admin" ||
    (authData?.user as any)?.role === "superuser";

  if (!isAdmin) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="h-6 w-6 text-destructive" />
            <h3 className="text-lg font-semibold font-mono uppercase">
              Access Denied
            </h3>
          </div>
          <p className="text-muted-foreground font-mono">
            You do not have permission to access admin settings. This area is
            restricted to administrators only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between font-mono">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <h2 className="text-lg font-semibold uppercase">Admin Dashboard</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("config")}
            className={`px-4 py-2 text-sm font-mono rounded-md transition-colors ${
              activeTab === "config"
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Config
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("health")}
            className={`px-4 py-2 text-sm font-mono rounded-md transition-colors ${
              activeTab === "health"
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Health
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={`px-4 py-2 text-sm font-mono rounded-md transition-colors ${
              activeTab === "audit"
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Audit Logs
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("actions")}
            className={`px-4 py-2 text-sm font-mono rounded-md transition-colors ${
              activeTab === "actions"
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Quick Actions
            </div>
          </button>
        </div>
      </div>

      {activeTab === "config" && (
        <div className="bg-card rounded-lg shadow p-6">
          <div className="text-center text-muted-foreground py-8 font-mono">
            Configuration management is being updated. Please use the API
            endpoints directly or check back later.
          </div>
        </div>
      )}

      {activeTab === "health" && <HealthDashboard />}

      {activeTab === "audit" && <AuditLogsViewer />}

      {activeTab === "actions" && <QuickActionsPanel />}
    </div>
  );
}
