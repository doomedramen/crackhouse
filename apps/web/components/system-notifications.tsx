"use client";

import React, { useEffect, useState } from "react";
import { useSystemMessages } from "@/lib/use-websocket";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
  Bell,
  X,
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface SystemNotificationsProps {
  className?: string;
  maxVisible?: number;
}

export function SystemNotifications({
  className = "",
  maxVisible = 5,
}: SystemNotificationsProps) {
  const { messages, clearMessages, isConnected } = useSystemMessages();
  const [isOpen, setIsOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const visibleMessages = showAll
    ? messages
    : messages.slice(-maxVisible).reverse();

  const unreadCount = messages.filter((msg) => {
    // Simple heuristic: consider messages from last 30 seconds as unread
    const messageTime = new Date(msg.timestamp).getTime();
    const thirtySecondsAgo = Date.now() - 30000;
    return messageTime > thirtySecondsAgo;
  }).length;

  const getMessageIcon = (level: string) => {
    switch (level) {
      case "info":
        return <Info className="h-4 w-4 text-blue-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getMessageColor = (level: string) => {
    switch (level) {
      case "info":
        return "border-blue-200 bg-blue-50 text-blue-800";
      case "warning":
        return "border-yellow-200 bg-yellow-50 text-yellow-800";
      case "error":
        return "border-red-200 bg-red-50 text-red-800";
      default:
        return "border-gray-200 bg-gray-50 text-gray-800";
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (messages.length === 0) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Bell className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          No system messages
        </span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Notification Bell */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative items-center gap-2"
      >
        <Bell
          className={`h-4 w-4 ${!isConnected ? "text-muted-foreground" : ""}`}
        />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        )}
        <span className="text-xs">
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </span>
        {!isConnected && (
          <span className="text-xs text-red-500">Disconnected</span>
        )}
      </Button>

      {/* Notifications Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-background border rounded-md shadow-lg z-50 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b">
            <h3 className="font-medium text-sm">System Notifications</h3>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(!showAll)}
                className="text-xs p-1 h-auto"
              >
                {showAll ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-xs p-1 h-auto"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Messages List */}
          <div className="overflow-y-auto max-h-80">
            {visibleMessages.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No notifications to display
              </div>
            ) : (
              <div className="divide-y">
                {visibleMessages.map((message, index) => (
                  <div
                    key={`${message.timestamp}-${index}`}
                    className={`p-3 ${getMessageColor(message.level)}`}
                  >
                    <div className="flex items-start gap-2">
                      {getMessageIcon(message.level)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <Badge
                            variant="outline"
                            className="text-xs capitalize"
                          >
                            {message.level}
                          </Badge>
                          <span className="text-xs opacity-75">
                            {formatTime(message.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm mt-1 break-words">
                          {message.message}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {messages.length > 0 && (
            <div className="flex items-center justify-between p-3 border-t bg-muted/50">
              <span className="text-xs text-muted-foreground">
                {showAll
                  ? `Showing all ${messages.length} messages`
                  : `Showing last ${Math.min(maxVisible, messages.length)} messages`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearMessages}
                className="text-xs"
              >
                Clear All
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
