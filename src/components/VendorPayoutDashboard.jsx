import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Clock, CheckCircle2, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { format } from "date-fns";

export default function VendorPayoutDashboard({ user }) {
  const [balance, setBalance] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user?.stripe_account_id) loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, payoutRes, earningsRes] = await Promise.all([
        base44.functions.invoke("stripeVendorPayouts", { action: "get_balance" }).catch(err => ({ data: { available: 0, pending: 0 }, error: true })),
        base44.functions.invoke("stripeVendorPayouts", { action: "list_payouts" }).catch(err => ({ data: { payouts: [] }, error: true })),
        base44.functions.invoke("stripeVendorPayouts", { action: "get_earnings" }).catch(err => ({ data: { transactions: [] }, error: true }))
      ]);
      setBalance(balRes.data || { available: 0, pending: 0 });
      setPayouts(payoutRes.data?.payouts || []);
      setEarnings(earningsRes.data?.transactions || []);
      
      const hasError = balRes.error || payoutRes.error || earningsRes.error;
      if (hasError) {
        setError("Unable to load payout data. Please try again later.");
      }
    } catch (err) {
      setError(err.message || "Failed to load payout information");
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPayout = async () => {
    setPayoutLoading(true);
    try {
      const res = await base44.functions.invoke("stripeVendorPayouts", { action: "request_payout" });
      if (res.data?.id) {
        await loadData();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPayoutLoading(false);
    }
  };

  const handleOpenStripeDashboard = async () => {
    const res = await base44.functions.invoke("stripeConnect", { action: "create_login_link" });
    if (res.data?.url) {
      // WKWebView blocks window.open — fall back to same-tab navigation on mobile
      const newWin = window.open(res.data.url, "_blank", "noopener,noreferrer");
      if (!newWin) window.location.href = res.data.url;
    }
  };

  if (!user?.stripe_account_id) {
    return (
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="p-6 text-center">
          <AlertCircle className="w-8 h-8 text-orange-500 mx-auto mb-3" />
          <p className="font-medium text-orange-900">Connect your Stripe account to receive payouts</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  const payoutStatusColor = {
    paid: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    in_transit: "bg-blue-100 text-blue-700",
    failed: "bg-red-100 text-red-700",
    canceled: "bg-gray-100 text-gray-700"
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-sm text-green-700 font-medium">Available to Pay Out</span>
            </div>
            <p className="text-3xl font-bold text-green-800">${(balance?.available || 0).toFixed(2)}</p>
            {balance?.available > 0 && (
              <Button
                onClick={handleRequestPayout}
                disabled={payoutLoading}
                size="sm"
                className="mt-3 bg-green-600 hover:bg-green-700 w-full"
              >
                {payoutLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Request Payout
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm text-blue-700 font-medium">Pending</span>
            </div>
            <p className="text-3xl font-bold text-blue-800">${(balance?.pending || 0).toFixed(2)}</p>
            <p className="text-xs text-blue-600 mt-1">Will be available in 2–7 days</p>
          </CardContent>
        </Card>
      </div>

      <Button variant="outline" onClick={handleOpenStripeDashboard} className="w-full">
        <ExternalLink className="w-4 h-4 mr-2" />
        Open Full Stripe Dashboard
      </Button>

      {/* Recent Payouts */}
      {payouts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Recent Payouts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {payouts.map(p => (
                <div key={p.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm font-medium">${p.amount.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">
                      {p.arrival_date
                        ? `Arrives ${format(new Date(p.arrival_date * 1000), 'MMM d, yyyy')}`
                        : format(new Date(p.created * 1000), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <Badge className={payoutStatusColor[p.status] || "bg-gray-100 text-gray-700"}>
                    {p.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Earnings History */}
      {earnings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Earnings History
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-64 overflow-y-auto">
              {earnings.map(t => (
                <div key={t.id} className="flex items-center justify-between px-6 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate text-gray-800">{t.description || "Sale"}</p>
                    <p className="text-xs text-gray-500">{format(new Date(t.created * 1000), 'MMM d, yyyy')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-700">+${t.net.toFixed(2)}</p>
                    <p className="text-xs text-gray-400">fee: ${t.fee.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}