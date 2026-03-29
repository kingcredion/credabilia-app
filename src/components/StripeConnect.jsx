import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  CheckCircle, 
  AlertCircle, 
  ArrowRight, 
  DollarSign, 
  ExternalLink,
  Loader2
} from "lucide-react";

export default function StripeConnect({ user, returnUrl, className }) {
  const queryClient = useQueryClient();

  // Build the return URL server-side-safe: use current origin + path, strip query params
  const safeReturnUrl = returnUrl || (window.location.origin + window.location.pathname);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['stripe-status', user?.id],
    queryFn: async () => {
      const res = await base44.functions.invoke('stripeConnect', { action: 'get_status' });
      return res.data;
    },
    enabled: !!user,
    refetchInterval: (data) => (data?.connected && (!data?.charges_enabled || !data?.payouts_enabled) ? 3000 : false)
  });

  // Handle Stripe return/refresh states on page load
  useEffect(() => {
    if (!user?.id) return;
    const params = new URLSearchParams(window.location.search);
    const stripeState = params.get('stripe_connect');

    if (stripeState === 'refresh') {
      // Stripe says the link expired — immediately request a fresh one
      openStripeOnboarding();
    } else if (stripeState === 'success') {
      // Invalidate so we re-fetch the latest account status
      queryClient.invalidateQueries({ queryKey: ['stripe-status', user?.id] });
    }
  }, [user?.id]);

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);

  const openStripeOnboarding = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await base44.functions.invoke('stripeConnect', {
        action: 'create_account',
        returnUrl: safeReturnUrl,
      });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.data?.url) {
        // Redirect in the same tab — most reliable across mobile/desktop/webview
        window.location.href = res.data.url;
      }
    } catch (err) {
      console.error('Stripe connect error:', err);
      setConnectError(err.message || 'Failed to connect to Stripe. Please try again.');
      setConnecting(false);
    }
  };

  const openDashboard = async () => {
    try {
      const res = await base44.functions.invoke('stripeConnect', { action: 'create_login_link' });
      if (res.data?.error) throw new Error(res.data.error);
      window.open(res.data.url, '_blank');
    } catch (err) {
      console.error('Stripe dashboard error:', err);
      setConnectError(err.message || 'Failed to open Stripe Dashboard.');
    }
  };

  if (statusLoading) return <div className="h-20 animate-pulse bg-gray-100 rounded-lg"></div>;

  // Require both charges_enabled AND payouts_enabled to consider setup complete
  const isConnected = status?.connected && status?.charges_enabled && status?.payouts_enabled;
  const isPending = status?.connected && (!status?.charges_enabled || !status?.payouts_enabled);

  return (
    <Card className={`border-l-4 ${isConnected ? 'border-l-green-500' : 'border-l-blue-500'} ${className}`}>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-bold text-lg text-gray-900">Payout Settings</h3>
              {isConnected ? (
                <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Active
                </Badge>
              ) : isPending ? (
                <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-200">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Pending Setup
                </Badge>
              ) : (
                <Badge variant="outline" className="text-gray-500">
                  Not Connected
                </Badge>
              )}
            </div>
            
            <p className="text-sm text-gray-600 max-w-xl">
              {isConnected 
                ? "Your Stripe account is connected. You receive payouts automatically for your sales."
                : "Connect your bank account via Stripe to receive payouts from your sales safely and securely."}
            </p>
          </div>

          <div>
            {!status?.connected ? (
              <Button 
                onClick={openStripeOnboarding}
                disabled={connecting}
                className="bg-[#635BFF] hover:bg-[#544ee0] text-white font-medium"
              >
                {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
                {connecting ? 'Redirecting...' : 'Connect with Stripe'}
              </Button>
            ) : isPending ? (
               <Button 
                onClick={openStripeOnboarding}
                disabled={connecting}
                variant="outline"
                className="border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
              >
                {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {connecting ? 'Redirecting...' : 'Complete Setup'}
                {!connecting && <ArrowRight className="w-4 h-4 ml-2" />}
              </Button>
            ) : (
              <Button 
                onClick={openDashboard}
                variant="outline"
                className="text-gray-700 hover:text-[#635BFF] hover:border-[#635BFF]"
              >
                View Payouts Dashboard
                <ExternalLink className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>

        {connectError && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{connectError}</span>
          </div>
        )}
        
        {!isConnected && !isPending && !connectError && (
            <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                <div className="flex -space-x-2">
                    <div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white"></div>
                    <div className="w-6 h-6 rounded-full bg-gray-300 border-2 border-white"></div>
                </div>
                <span>Trusted by millions of businesses worldwide</span>
            </div>
        )}
      </CardContent>
    </Card>
  );
}