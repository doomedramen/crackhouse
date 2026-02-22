"use client";

import Link from "next/link";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { ArrowLeft } from "lucide-react";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-mono uppercase">
            Password Reset
          </CardTitle>
          <CardDescription className="font-mono">
            Email-based password reset is not currently available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center font-mono">
            Please contact an administrator to reset your password.
          </p>

          <div className="text-center">
            <Link href="/sign-in">
              <Button variant="ghost" className="font-mono text-sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Sign In
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
