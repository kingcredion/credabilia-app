import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function DeleteAccountDialog({ open, onOpenChange, userEmail }) {
  const [confirmText, setConfirmText] = useState("");
  const [step, setStep] = useState("warning");

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      // Backend function to handle account deletion
      const response = await base44.functions.invoke('deleteAccount', {
        email: userEmail
      });
      return response;
    },
    onSuccess: () => {
      toast.success("Account deleted successfully. Redirecting...");
      setTimeout(() => {
        base44.auth.logout("/");
      }, 1500);
    },
    onError: () => {
      toast.error("Failed to delete account. Please try again.");
      setStep("warning");
    }
  });

  const handleConfirm = () => {
    if (confirmText !== "delete my account") {
      toast.error("Please type 'delete my account' to confirm");
      return;
    }
    setStep("confirming");
    deleteAccountMutation.mutate();
  };

  const handleReset = () => {
    setConfirmText("");
    setStep("warning");
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        {step === "warning" ? (
          <>
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangle className="w-6 h-6 text-red-600" />
                <AlertDialogTitle>Delete Account?</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="space-y-3 text-left">
                <p className="font-medium text-gray-900">This action cannot be undone.</p>
                <ul className="space-y-2 text-sm text-gray-600 ml-4 list-disc">
                  <li>All your listings will be removed</li>
                  <li>Your collection and favorites will be deleted</li>
                  <li>Your transaction history will be anonymized</li>
                  <li>You will lose access to all features</li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-3 pt-4">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={() => setStep("confirm")}
              >
                Delete My Account
              </Button>
            </div>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
              <AlertDialogDescription className="space-y-4 text-left">
                <p>Type <strong className="font-mono bg-gray-100 px-2 py-1 rounded">delete my account</strong> below to confirm:</p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="delete my account"
                  className="font-mono"
                  disabled={deleteAccountMutation.isPending}
                />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex gap-3 pt-4">
              <AlertDialogCancel disabled={deleteAccountMutation.isPending}>
                Cancel
              </AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={deleteAccountMutation.isPending || confirmText !== "delete my account"}
              >
                {deleteAccountMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Permanently Delete"
                )}
              </Button>
            </div>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}