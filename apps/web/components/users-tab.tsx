"use client";

import { useUsers } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";
import { Button } from "@workspace/ui/components/button";
import {
  Users,
  Shield,
  User,
  Settings,
  Trash2,
  Edit,
  UserPlus,
} from "lucide-react";

interface UsersTabProps {
  className?: string;
}

export function UsersTab({ className }: UsersTabProps) {
  const { data: usersData, isLoading, error, refetch } = useUsers();

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/15 text-destructive">
            <Shield className="h-3 w-3" />
            <span className="font-mono uppercase">{role}</span>
          </span>
        );
      case "user":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary">
            <User className="h-3 w-3" />
            <span className="font-mono uppercase">{role}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
            <User className="h-3 w-3" />
            <span className="font-mono uppercase">{role}</span>
          </span>
        );
    }
  };

  if (error) {
    return (
      <div className={className}>
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <h3 className="text-destructive font-medium mb-2">
            Error Loading Users
          </h3>
          <p className="text-muted-foreground mb-4">
            Failed to load users. Please try again.
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
        <Button disabled className="font-mono text-sm">
          <UserPlus className="h-4 w-4 mr-2" />
          create user
        </Button>
      </div>

      {/* Users List */}
      <div className="bg-card rounded-lg shadow">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : usersData?.data.length === 0 ? (
          <div className="text-center py-12 font-mono px-6">
            <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">no users found</h3>
            <p className="text-muted-foreground mb-4">
              create your first user account to get started
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Last Updated
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y">
                  {usersData?.data.map((user: any) => (
                    <tr key={user.id} className="hover:bg-muted/50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {getRoleBadge(user.role)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(user.updatedAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" disabled>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled
                            className="text-destructive hover:text-destructive"
                          >
                            Delete
                          </Button>
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
