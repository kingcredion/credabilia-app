import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Lock } from "lucide-react";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const resetToken = searchParams.get("token") || searchParams.get("resetToken") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!resetToken) {
      toast.error("Missing reset token. Please use the link from your email.");
      return;
    }

    if (!newPassword || !confirmPassword) {
      toast.error("Please complete all password fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    try {
      setIsSubmitting(true);
      await base44.auth.resetPassword({
        resetToken,
        newPassword,
      });
      toast.success("Password reset successful. Redirecting to login...");
      setTimeout(() => {
        navigate("/Login");
      }, 1500);
    } catch (error) {
      toast.error(error?.message || "Failed to reset password");
      console.error("Reset password error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!resetToken) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center p-4 safe-top">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-full">
                <Lock className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <CardTitle>Invalid Reset Link</CardTitle>
            <CardDescription>
              The reset link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please request a new password reset from your account settings.
            </p>
            <Button onClick={() => navigate("/Settings")} className="w-full min-h-[44px]">
              Go to Settings
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/Marketplace")}
              className="w-full min-h-[44px]"
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center p-4 safe-top">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-full">
              <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <CardTitle>Reset Your Password</CardTitle>
          <CardDescription>
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Enter your new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="min-h-[44px]"
                required
              />
              <p className="text-xs text-muted-foreground">
                Minimum 8 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="min-h-[44px]"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[44px]"
            >
              {isSubmitting ? "Resetting..." : "Set New Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}