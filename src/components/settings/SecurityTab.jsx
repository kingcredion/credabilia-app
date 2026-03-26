import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Trash2, Lock } from "lucide-react";
import BuyerWallet from "@/components/BuyerWallet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import PasswordChangeCard from "@/components/settings/PasswordChangeCard";

// Detect whether user is local email/password or provider-managed
function detectAuthMode(user) {
  // Check for auth_provider field (Base44 convention)
  if (user?.auth_provider && user.auth_provider !== "password") {
    return { mode: "provider", provider: user.auth_provider };
  }
  // Fallback: if no auth_provider field, assume local password
  return { mode: "password" };
}

export default function SecurityTab({ user }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const authMode = useMemo(() => detectAuthMode(user), [user]);

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('deleteAccount', {
        email: user.email
      });
      return result;
    },
    onSuccess: () => {
      toast.success("Account deleted successfully.");
      setIsDeleting(false);
      // Log out after deletion
      setTimeout(() => {
        base44.auth.logout();
      }, 500);
    },
    onError: (error) => {
      toast.error("Failed to delete account. Please try again.");
      console.error("Delete error:", error);
      setIsDeleting(false);
    }
  });

  return (
    <div className="space-y-6">
      {/* Payment Methods (moved from Account tab) */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
          <CardDescription>Manage your saved cards for faster checkout.</CardDescription>
        </CardHeader>
        <CardContent>
          <BuyerWallet />
        </CardContent>
      </Card>

      {/* Password Card - Conditional based on auth mode */}
      {authMode.mode === "provider" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Password
            </CardTitle>
            <CardDescription>
              Password management is handled by your sign-in provider.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled className="min-h-[44px]">
              Managed by {authMode.provider ? authMode.provider.charAt(0).toUpperCase() + authMode.provider.slice(1) : "Provider"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <PasswordChangeCard user={user} />
      )}

      {/* Delete Account - Danger Zone */}
      <Card className="border-red-200 dark:border-red-400/30 bg-red-50 dark:bg-red-950/20">
        <CardHeader>
          <CardTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Danger Zone
          </CardTitle>
          <CardDescription className="text-red-700 dark:text-red-300">
            Irreversible account actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex gap-3">
              <div>
                <h4 className="font-semibold text-red-900 dark:text-red-200">Delete Account</h4>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  Permanently delete your account and all content. This cannot be undone.
                </p>
              </div>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="shrink-0">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your
                    account and remove your data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setIsDeleting(true);
                      deleteAccountMutation.mutate();
                    }}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {isDeleting ? "Submitting..." : "Yes, delete my account"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}