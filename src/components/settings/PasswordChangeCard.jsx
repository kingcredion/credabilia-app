import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { toast } from "sonner";

export default function PasswordChangeCard({ user }) {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Missing user id");
      if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
        throw new Error("Please fill out all password fields");
      }
      if (form.newPassword !== form.confirmPassword) {
        throw new Error("New passwords do not match");
      }

      return await base44.auth.changePassword({
        userId: user.id,
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    },
    onError: (error) => {
      toast.error(error?.message || "Failed to change password");
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error("Missing user email");
      return await base44.auth.resetPasswordRequest(user.email);
    },
    onSuccess: () => {
      toast.success("Password reset email sent. Check your inbox.");
    },
    onError: (error) => {
      toast.error(error?.message || "Failed to send reset email");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="w-5 h-5" />
          Password
        </CardTitle>
        <CardDescription>
          Update your password without leaving the app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="current-password">Current Password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your current password"
            value={form.currentPassword}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, currentPassword: e.target.value }))
            }
            className="min-h-[44px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password">New Password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            placeholder="Enter your new password"
            value={form.newPassword}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, newPassword: e.target.value }))
            }
            className="min-h-[44px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm New Password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm your new password"
            value={form.confirmPassword}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
            }
            className="min-h-[44px]"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => changePasswordMutation.mutate()}
            disabled={changePasswordMutation.isPending}
            className="min-h-[44px]"
          >
            {changePasswordMutation.isPending ? "Updating..." : "Change Password"}
          </Button>

          <Button
            variant="outline"
            onClick={() => resetPasswordMutation.mutate()}
            disabled={resetPasswordMutation.isPending}
            className="min-h-[44px]"
          >
            {resetPasswordMutation.isPending ? "Sending..." : "Send Reset Email"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}