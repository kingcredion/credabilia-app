import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, ArrowDownCircle, RefreshCw, TrendingUp, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

function formatCurrency(amount, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDate(timestamp) {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const txTypeLabels = {
  charge: "Sale",
  refund: "Refund",
  payout: "Payout",
  transfer: "Transfer",
  adjustment: "Adjustment",
  payment: "Payment",
};

const payoutStatusColors = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  in_transit: "bg-blue-100 text-blue-700",
  canceled: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
};

export default function EarningsTab({ user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payingOut, setPayingOut] = useState(false);

  const hasStripeConnect = user.stripe_account_id && user.stripe_charges_enabled;

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("stripeEarnings", { action: "get_dashboard_data" });
      setData(res.data);
    } catch (e) {
      toast.error("Could not load earnings data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (hasStripeConnect) loadData();
    else setLoading(false);
  }, []);

  const handleCashOut = async () => {
    setPayingOut(true);
    try {
      const res = await base44.functions.invoke("stripeEarnings", { action: "create_payout" });
      if (res.data?.payout) {
        toast.success("Payout initiated! Funds will arrive in 1-2 business days.");
        loadData();
      } else {
        toast.error(res.data?.error || "Payout failed.");
      }
    } catch (e) {
      toast.error("Could not initiate payout.");
    } finally {
      setPayingOut(false);
    }
  };

  if (!hasStripeConnect) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          <Wallet className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No connected Stripe account</p>
          <p className="text-sm mt-1">Connect your bank account in the Billing tab to see your earnings.</p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const available = data?.balance?.available?.[0]?.amount || 0;
  const pending = data?.balance?.pending?.[0]?.amount || 0;
  const currency = data?.balance?.available?.[0]?.currency || "usd";

  return (
    <div className="space-y-6">
      {/* Balance Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Wallet className="w-5 h-5 text-indigo-600" />
              </div>
              <p className="text-sm font-medium text-indigo-700">Available Balance</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(available, currency)}</p>
            <Button
              className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700"
              disabled={available <= 0 || payingOut}
              onClick={handleCashOut}
            >
              <ArrowDownCircle className="w-4 h-4 mr-2" />
              {payingOut ? "Processing..." : "Cash Out to Bank"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-50 to-white border-yellow-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
              <p className="text-sm font-medium text-yellow-700">Pending Balance</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(pending, currency)}</p>
            <p className="text-xs text-gray-500 mt-4">Funds typically available within 2 business days</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Your latest activity</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={loadData}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {data?.transactions?.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No transactions yet</p>
          ) : (
            <div className="space-y-3">
              {data?.transactions?.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-full ${tx.amount > 0 ? "bg-green-100" : "bg-red-100"}`}>
                      {tx.amount > 0
                        ? <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                        : <ArrowDownCircle className="w-3.5 h-3.5 text-red-600" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {txTypeLabels[tx.type] || tx.type}
                        {tx.description ? ` — ${tx.description}` : ""}
                      </p>
                      <p className="text-xs text-gray-400">{formatDate(tx.created)}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${tx.amount > 0 ? "text-green-600" : "text-red-600"}`}>
                    {tx.amount > 0 ? "+" : ""}{formatCurrency(tx.amount, tx.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payout History */}
      <Card>
        <CardHeader>
          <CardTitle>Payout History</CardTitle>
          <CardDescription>Bank transfers sent to your account</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.payouts?.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No payouts yet</p>
          ) : (
            <div className="space-y-3">
              {data?.payouts?.map((payout) => (
                <div key={payout.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{formatDate(payout.arrival_date)}</p>
                      <p className="text-xs text-gray-400">Initiated {formatDate(payout.created)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={payoutStatusColors[payout.status] || "bg-gray-100 text-gray-700"}>
                      {payout.status.replace("_", " ")}
                    </Badge>
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(payout.amount, payout.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}