import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import EmbeddedStripeConnect from "@/components/EmbeddedStripeConnect";

/**
 * StripeFinanceSection
 * Renders the vendor's Stripe payout / finance area with 3 states:
 *   1. No Stripe account → polished connect CTA
 *   2. Account exists but onboarding incomplete → embedded onboarding
 *   3. Fully onboarded → embedded balances / payouts / account-management
 */
export default function StripeFinanceSection({ user }) {
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: stripeStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["stripe-status", user?.id],
    queryFn: async () => {
      const res = await base44.functions.invoke("stripeConnect", { action: "get_status" });
      return res.data;
    },
    enabled: !!user?.stripe_account_id,
    // Poll while onboarding is in progress
    refetchInterval: (data) =>
      data?.connected && (!data?.charges_enabled || !data?.payouts_enabled) ? 4000 : false,
  });

  // Refresh status when user returns from Stripe hosted onboarding
  useEffect(() => {
    if (!user?.id) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe_connect") === "success") {
      refetchStatus();
    }
  }, [user?.id]);

  // Refresh when embedded onboarding exits
  useEffect(() => {
    const handler = () => refetchStatus();
    window.addEventListener("stripe-onboarding-exit", handler);
    return () => window.removeEventListener("stripe-onboarding-exit", handler);
  }, [refetchStatus]);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const returnUrl = window.location.origin + window.location.pathname;
      const res = await base44.functions.invoke("stripeConnect", {
        action: "create_account",
        returnUrl,
      });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.url) window.open(res.data.url, "_blank");
    } catch (err) {
      toast.error(err?.message || "Failed to connect Stripe.");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleFallbackOnboarding = async () => {
    try {
      const returnUrl = window.location.origin + window.location.pathname;
      const res = await base44.functions.invoke("stripeConnect", {
        action: "create_account",
        returnUrl,
      });
      if (res.data?.url) window.open(res.data.url, "_blank");
    } catch (err) {
      toast.error("Could not open Stripe onboarding.");
    }
  };

  const handleFallbackDashboard = async () => {
    try {
      const res = await base44.functions.invoke("stripeConnect", { action: "create_login_link" });
      if (res.data?.url) window.open(res.data.url, "_blank");
    } catch (err) {
      toast.error("Could not open Stripe dashboard.");
    }
  };

  const isFullyConnected =
    stripeStatus?.connected && stripeStatus?.charges_enabled && stripeStatus?.payouts_enabled;
  const isPending =
    user?.stripe_account_id &&
    stripeStatus &&
    (!stripeStatus?.charges_enabled || !stripeStatus?.payouts_enabled);

  // ── State 1: No Stripe account ────────────────────────────────────────────
  if (!user?.stripe_account_id) {
    return (
      <Card className="border border-dashed border-gray-300 bg-gray-50">
        <CardContent className="py-10 flex flex-col items-center text-center gap-4">
          <div className="p-4 bg-indigo-100 rounded-full">
            <DollarSign className="w-8 h-8 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Connect Stripe to receive payouts
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              Set up your payout account to access balances, payouts, and earnings.
            </p>
          </div>
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className="bg-[#635BFF] hover:bg-[#544ee0] text-white font-medium"
          >
            {isConnecting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <DollarSign className="w-4 h-4 mr-2" />
            )}
            {isConnecting ? "Connecting…" : "Connect Stripe"}
          </Button>
          <p className="text-xs text-gray-400">Powered by Stripe — trusted by millions of businesses</p>
        </CardContent>
      </Card>
    );
  }

  // While we're still fetching status for an existing account
  if (!stripeStatus) {
    return (
      <div className="flex items-center gap-3 py-6 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        <span className="text-sm">Loading payout settings…</span>
      </div>
    );
  }

  // ── State 2 & 3: Account exists — delegate to EmbeddedStripeConnect ───────
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">
        {isFullyConnected ? "Earnings & Payouts" : "Complete Payout Setup"}
      </h2>
      <Card>
        <CardContent className="p-4 sm:p-6">
          <EmbeddedStripeConnect
            user={user}
            stripeStatus={stripeStatus}
            onFallbackOnboarding={handleFallbackOnboarding}
            onFallbackDashboard={handleFallbackDashboard}
          />
        </CardContent>
      </Card>
    </div>
  );
}