import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import { getStripePromise } from "@/lib/stripeLoader";

/**
 * EmbeddedStripeConnect
 * Renders embedded Stripe Connect UI components inside the app.
 * Falls back to new-tab flows if initialization fails.
 *
 * Props:
 *  - user: current user object (must have stripe_account_id, stripe_charges_enabled)
 *  - stripeStatus: { connected, charges_enabled, payouts_enabled, details_submitted }
 *  - onFallbackOnboarding: () => void  — called when user clicks "Open in Stripe" fallback
 *  - onFallbackDashboard: () => void   — called when user clicks "Open Dashboard" fallback
 */
export default function EmbeddedStripeConnect({
  user,
  stripeStatus,
  onFallbackOnboarding,
  onFallbackDashboard,
}) {
  const [clientSecret, setClientSecret] = useState(null);
  const [stripeConnect, setStripeConnect] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);

  const onboardingRef = useRef(null);
  const managementRef = useRef(null);
  const payoutsRef = useRef(null);

  const isFullyConnected = stripeStatus?.connected && stripeStatus?.charges_enabled && stripeStatus?.payouts_enabled;
  const isPending = stripeStatus?.connected && (!stripeStatus?.charges_enabled || !stripeStatus?.payouts_enabled);

  const fetchClientSecret = async () => {
    const res = await base44.functions.invoke("stripeConnect", { action: "create_account_session" });
    if (res.data?.error) throw new Error(res.data.error);
    return res.data.client_secret;
  };

  const initialize = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch publishable key from backend — single authoritative source
      const keyRes = await base44.functions.invoke('stripeCustomer', { action: 'get_publishable_key' });
      const publishableKey = keyRes?.data?.publishableKey;
      if (!publishableKey) throw new Error("Stripe publishable key not configured.");

      // Log key prefix only — never full key
      const prefix = publishableKey.startsWith('pk_test_') ? 'pk_test_' : publishableKey.startsWith('pk_live_') ? 'pk_live_' : 'pk_???_';
      console.log(`[EmbeddedStripeConnect] Key prefix: ${prefix}`);

      const instance = await loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret,
        appearance: {
          overlays: "dialog",
          variables: {
            colorPrimary: "#4f46e5",
            fontFamily: "inherit",
            borderRadius: "8px",
          },
        },
      });

      setStripeConnect(instance);
      setInitialized(true);
    } catch (err) {
      console.error("EmbeddedStripeConnect init error:", err);
      setError(err.message || "Failed to initialize Stripe components.");
    } finally {
      setLoading(false);
    }
  };

  // Mount embedded components once initialized
  useEffect(() => {
    if (!initialized || !stripeConnect) return;

    // Account onboarding (incomplete setup)
    if (isPending && onboardingRef.current) {
      onboardingRef.current.innerHTML = "";
      const el = stripeConnect.create("account-onboarding");
      el.setOnExit(() => {
        // Refresh status after user exits onboarding
        window.dispatchEvent(new CustomEvent("stripe-onboarding-exit"));
      });
      onboardingRef.current.appendChild(el);
    }

    // Account management (bank account details, settings)
    if (isFullyConnected && managementRef.current) {
      managementRef.current.innerHTML = "";
      const el = stripeConnect.create("account-management");
      managementRef.current.appendChild(el);
    }

    // Payouts (history + schedule)
    if (isFullyConnected && payoutsRef.current) {
      payoutsRef.current.innerHTML = "";
      const el = stripeConnect.create("payouts");
      payoutsRef.current.appendChild(el);
    }
  }, [initialized, stripeConnect, isPending, isFullyConnected]);

  // Auto-initialize when we have an account
  useEffect(() => {
    if (user?.stripe_account_id && !initialized && !loading) {
      initialize();
    }
  }, [user?.stripe_account_id]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-6 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        <span className="text-sm">Loading payout settings...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Could not load embedded Stripe components. You can still manage your account via Stripe directly.</span>
        </div>
        <div className="flex gap-2">
          {isPending && onFallbackOnboarding && (
            <Button variant="outline" size="sm" onClick={onFallbackOnboarding} className="text-indigo-600">
              <ExternalLink className="w-3 h-3 mr-1" />
              Resume Onboarding
            </Button>
          )}
          {isFullyConnected && onFallbackDashboard && (
            <Button variant="outline" size="sm" onClick={onFallbackDashboard} className="text-indigo-600">
              <ExternalLink className="w-3 h-3 mr-1" />
              Open Stripe Dashboard
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={initialize} className="text-gray-600">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!user?.stripe_account_id) return null;

  return (
    <div className="space-y-4">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        {isFullyConnected ? (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Connected
          </Badge>
        ) : isPending ? (
          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Setup Incomplete
          </Badge>
        ) : null}
      </div>

      {/* Embedded onboarding for pending accounts */}
      {isPending && initialized && (
        <div className="rounded-xl border border-yellow-200 overflow-hidden">
          <div ref={onboardingRef} className="w-full min-h-[400px]" />
        </div>
      )}

      {/* Embedded account management + payouts for fully connected accounts */}
      {isFullyConnected && initialized && (
        <>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Bank Account &amp; Settings</p>
            </div>
            <div ref={managementRef} className="w-full min-h-[300px]" />
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Payouts</p>
            </div>
            <div ref={payoutsRef} className="w-full min-h-[300px]" />
          </div>
        </>
      )}

      {/* Fallback links (always visible as secondary option) */}
      {initialized && (
        <div className="flex gap-2 pt-1">
          {isPending && onFallbackOnboarding && (
            <Button variant="ghost" size="sm" onClick={onFallbackOnboarding} className="text-gray-400 hover:text-gray-600 text-xs">
              <ExternalLink className="w-3 h-3 mr-1" />
              Open in new tab instead
            </Button>
          )}
          {isFullyConnected && onFallbackDashboard && (
            <Button variant="ghost" size="sm" onClick={onFallbackDashboard} className="text-gray-400 hover:text-gray-600 text-xs">
              <ExternalLink className="w-3 h-3 mr-1" />
              Open Stripe Dashboard in new tab
            </Button>
          )}
        </div>
      )}
    </div>
  );
}