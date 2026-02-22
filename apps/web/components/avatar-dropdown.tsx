"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { useAuthSession, useLogout } from "@/lib/api-hooks";

export function AvatarDropdown() {
  const { data: session } = useAuthSession();
  const { mutate: logout } = useLogout();

  const handleSignOut = () => {
    logout();
  };

  // Fallback user data if session is not available
  const user = session?.user || {
    name: "Admin User",
    email: "admin@crackhouse.local",
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="h-8 w-8 cursor-pointer" data-testid="user-menu">
          <AvatarFallback className="bg-primary text-primary-foreground">
            {user.name?.charAt(0) || "A"}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56"
        align="end"
        forceMount
        data-testid="avatar-dropdown"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user.name || "Admin User"}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email || "admin@crackhouse.local"}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" data-testid="settings-link">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
