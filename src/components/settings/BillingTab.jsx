import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CreditCard, Building, ExternalLink, CheckCircle2, Wallet, Crown, Coins } from "lucide-react";
import { toast } from "sonner";
import AddCardDialog from "@/components/AddCardDialog";
import EmbeddedStripeConnect from "@/components/EmbeddedStripeConnect";
import SubscriptionCheckoutDialog from "@/components/SubscriptionCheckoutDialog";
import { hasLiveStripeConnect, isSimulatedStripeAccount } from "@/lib/stripeStatus";

export default function BillingTab({ user }) {
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: credionCredits } = useQuery({
    queryKey: ['credion-credits-billing', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const records = await base44.entities.CouncilCredit.filter({ user_email: user.email });
      return records[0] || null;
    },
    enabled: !!user?.email,
  });
  const creditBalance = credionCredits?.credits_balance || 0;
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showAddCardDialog, setShowAddCardDialog] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);

  // Clean up simulated Stripe accounts on mount
  useEffect(() => {
    if (user && isSimulatedStripeAccount(user)) {
      const resetAccount = async () => {
        try {
          await base44.functions.invoke('stripeConnect', { action: 'reset_account' });
          await queryClient.invalidateQueries({ queryKey: ['user'] });
          toast.info('We refreshed your payout setup. Please reconnect Stripe to go live.');
        } catch (err) {
          console.error('Failed to reset simulated Stripe account:', err);
        }
      };
      resetAccount();
    }
  }, [user?.id]);

  // Only truly connected if they have a REAL live stripe_account_id AND charges are enabled
  const hasStripeConnect = hasLiveStripeConnect(user);

  // Fetch live Stripe status for the embedded component
  const { data: stripeStatus, refetch: refetchStripeStatus } = useQuery({
    queryKey: ['stripe-status-billing', user?.id],
    queryFn: async () => {
      const res = await base44.functions.invoke('stripeConnect', { action: 'get_status' });
      return res.data;
    },
    enabled: !!user?.stripe_account_id,
  });

  // Listen for onboarding exit event to refresh status
  useEffect(() => {
    const handler = () => refetchStripeStatus();
    window.addEventListener("stripe-onboarding-exit", handler);
    return () => window.removeEventListener("stripe-onboarding-exit", handler);
  }, [refetchStripeStatus]);

  // Fallback: open Stripe onboarding in a new tab (used when embedded fails)
  const handleFallbackOnboarding = async () => {
    setIsConnecting(true);
    try {
      const returnUrl = window.location.origin + '/Settings';
      const response = await base44.functions.invoke('stripeConnect', { action: 'create_account', returnUrl });
      if (response.data?.url) {
        const newWin = window.open(response.data.url, '_blank', 'noopener,noreferrer');
        if (!newWin) window.location.href = response.data.url;
      }
    } catch (err) {
      toast.error(err?.message || "Failed to connect Stripe.");
    } finally {
      setIsConnecting(false);
    }
  };

  // Fallback: open Stripe dashboard in a new tab
  const handleFallbackDashboard = async () => {
    setIsDashboardLoading(true);
    try {
      const response = await base44.functions.invoke('stripeConnect', { action: 'create_login_link' });
      const url = response?.data?.url;
      if (url) {
        if (/iPhone|iPad|Android/i.test(navigator.userAgent)) {
          window.location.href = url;
        } else {
          window.open(url, '_blank');
        }
      } else {
        toast.error("Could not open Stripe dashboard.");
      }
    } catch (e) {
      toast.error("Could not open Stripe dashboard.");
    } finally {
      setIsDashboardLoading(false);
    }
  };

  // Initial connect (no Stripe account yet)
  const connectStripeMutation = useMutation({
    mutationFn: async () => {
      const returnUrl = window.location.origin + '/Settings';
      const response = await base44.functions.invoke('stripeConnect', { action: 'create_account', returnUrl });
      if (response.data?.url) {
        const newWin = window.open(response.data.url, '_blank', 'noopener,noreferrer');
        if (!newWin) window.location.href = response.data.url;
      }
    },
    onSuccess: () => setIsConnecting(false),
    onError: (error) => {
      const msg = error?.message || "Failed to connect Stripe.";
      if (msg.includes("platform profile") || msg.includes("questionnaire") || msg.includes("managing losses")) {
        const stripeUrl = msg.includes("managing losses")
          ? "https://dashboard.stripe.com/settings/connect/platform-profile"
          : "https://dashboard.stripe.com/connect/accounts/overview";
        toast.error("Stripe setup incomplete. Please review your platform profile.", {
          description: "Click 'Open Stripe' and complete all required sections.",
          action: { label: "Open Stripe", onClick: () => window.open(stripeUrl, "_blank") },
          duration: 10000
        });
      } else {
        toast.error(msg, { duration: 8000 });
      }
      setIsConnecting(false);
    }
  });

  const { data: paymentMethods = [], isLoading: isLoadingCards, refetch: refetchCards } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const response = await base44.functions.invoke('stripeManagePaymentMethod', {
        action: 'list_payment_methods'
      });
      return response.data?.paymentMethods || [];
    }
  });

  const removeCardMutation = useMutation({
    mutationFn: async (paymentMethodId) => {
      await base44.functions.invoke('stripeManagePaymentMethod', {
        action: 'detach_payment_method',
        paymentMethodId
      });
    },
    onSuccess: () => {
      setShowRemoveDialog(false);
      setSelectedCardId(null);
      toast.success("Card removed successfully");
      refetchCards();
    },
    onError: () => {
      toast.error("Failed to remove card. Please try again.");
    }
  });

  const handleRemoveCard = () => {
    if (selectedCardId) {
      removeCardMutation.mutate(selectedCardId);
    }
  };

  const handleAddCard = () => {
    setShowAddCardDialog(true);
  };

  return (
    <>
    <SubscriptionCheckoutDialog
      open={showSubscriptionDialog}
      onClose={() => setShowSubscriptionDialog(false)}
      onSuccess={() => { setShowSubscriptionDialog(false); toast.success("You're now a Pro member!"); }}
    />
    <AddCardDialog open={showAddCardDialog} onOpenChange={setShowAddCardDialog} onSuccess={() => refetchCards()} />
    <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Card?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove this card? You can add it back later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {selectedCardId && paymentMethods.find(pm => pm.id === selectedCardId) && (
          <div className="py-2">
            <p className="text-sm font-medium text-gray-900">
              {paymentMethods.find(pm => pm.id === selectedCardId)?.brand.toUpperCase()} ending in {paymentMethods.find(pm => pm.id === selectedCardId)?.last4}
            </p>
          </div>
        )}
        <div className="flex gap-3">
          <AlertDialogCancel>Keep Card</AlertDialogCancel>
          <AlertDialogAction 
            className="bg-red-600 hover:bg-red-700"
            onClick={handleRemoveCard}
            disabled={removeCardMutation.isPending}
          >
            {removeCardMutation.isPending ? "Removing..." : "Remove Card"}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
    <div className="space-y-6">
      {/* Vendor Pro Subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-600" />
            Vendor Pro Subscription
          </CardTitle>
          <CardDescription>Unlock bulk uploads, Shopify import, and advanced analytics.</CardDescription>
        </CardHeader>
        <CardContent>
          {user.is_pro_vendor ? (
            <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-900">Pro Plan Active</p>
                  <p className="text-sm text-amber-700">You have access to all Pro features.</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowSubscriptionDialog(true)}>
                Manage
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <div>
                <p className="font-semibold text-gray-900">Free Plan</p>
                <p className="text-sm text-gray-500">Upgrade to unlock premium features.</p>
              </div>
              <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setShowSubscriptionDialog(true)}>
                <Crown className="w-4 h-4 mr-2" />
                Upgrade to Pro
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payout Methods (For Sellers/Shops) */}
      {(
        <Card>
          <CardHeader>
            <CardTitle>Payout Settings</CardTitle>
            <CardDescription>Manage how you get paid for sales and services.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 border rounded-xl bg-gradient-to-br from-gray-50 to-white">
              {/* Header row */}
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-100 rounded-lg flex-shrink-0">
                  <Building className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">Stripe Connect</h4>
                  <p className="text-sm text-gray-500">
                    {hasStripeConnect ? "Connected and ready for payouts" : "Connect to receive payouts directly to your bank"}
                  </p>
                </div>
              </div>

              {/* No account yet — prompt initial connection */}
              {!user.stripe_account_id && (
                <Button
                  onClick={() => { setIsConnecting(true); connectStripeMutation.mutate(); }}
                  disabled={isConnecting || connectStripeMutation.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto"
                >
                  {isConnecting || connectStripeMutation.isPending ? "Connecting..." : "Connect Bank Account"}
                </Button>
              )}

              {/* Embedded Stripe components (onboarding / management / payouts) */}
              {user.stripe_account_id && (
                <EmbeddedStripeConnect
                  user={user}
                  stripeStatus={stripeStatus}
                  onFallbackOnboarding={handleFallbackOnboarding}
                  onFallbackDashboard={handleFallbackDashboard}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Methods (For Buyers) */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
          <CardDescription>Manage cards used for purchases.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingCards ? (
            <div className="text-center py-4 text-gray-500">Loading payment methods...</div>
          ) : paymentMethods.length > 0 ? (
            paymentMethods.map(card => (
              <div key={card.id} className="flex items-center justify-between p-4 border rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <CreditCard className="w-6 h-6 text-gray-600" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{card.brand.toUpperCase()} ending in {card.last4}</h4>
                    <p className="text-xs text-gray-500">Expires {card.expMonth}/{card.expYear}{card.isDefault ? ' • Default' : ''}</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setSelectedCardId(card.id);
                    setShowRemoveDialog(true);
                  }}
                >
                  Remove
                </Button>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-gray-500 text-sm">No payment methods saved</div>
          )}

          <Button 
            variant="outline" 
            className="w-full border-dashed"
            onClick={handleAddCard}
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            Add New Card
          </Button>
        </CardContent>
      </Card>

      {/* Credion Credits */}
      <Card>
        <CardHeader>
          <CardTitle>Credion Credits</CardTitle>
          <CardDescription>Your Credion Credits balance — earned through audits and redeemable at checkout.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-yellow-100 rounded-full">
                <Coins className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-yellow-800">Available Credion Credits</p>
                <h3 className="text-2xl font-bold text-gray-900">{creditBalance.toLocaleString()} Credion Credits</h3>
                <p className="text-xs text-yellow-700 mt-0.5">${(creditBalance / 100).toFixed(2)} value · 100 Credion Credits = $1.00</p>
              </div>
            </div>
            <Button variant="outline" className="bg-white hover:bg-yellow-50 border-yellow-200 text-yellow-800">
              View History
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
    </>
  );
}


function PlusIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}