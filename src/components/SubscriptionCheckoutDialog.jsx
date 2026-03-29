import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripePromise } from "@/lib/stripeLoader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, Check, Zap, Loader2, CheckCircle } from "lucide-react";

const stripePromise = getStripePromise();

const SUBSCRIPTION_PLANS = [
  {
    id: "monthly",
    name: "Monthly Pro",
    price: 9.99,
    period: "month",
    features: [
      "Bulk upload (up to 100 items)",
      "Import from Shopify/eBay",
      "Advanced analytics",
      "Priority support",
    ],
  },
  {
    id: "annual",
    name: "Annual Pro",
    price: 99.99,
    period: "year",
    savings: "Save 17%",
    features: [
      "Bulk upload (unlimited)",
      "Import from Shopify/eBay",
      "Advanced analytics",
      "Priority support",
    ],
  },
];

// Inner form — rendered inside <Elements> provider
function PaymentForm({ plan, subscriptionId, onSuccess, onCancel }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setIsProcessing(true);
    setError(null);

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message);
      setIsProcessing(false);
      return;
    }

    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      // Store subscription in database
      try {
        const user = await base44.auth.me();
        // Upsert subscription record
        const existing = await base44.entities.VendorSubscription.filter({ vendor_email: user.email });
        const subData = {
          vendor_id: user.id,
          vendor_email: user.email,
          plan_name: "pro",
          plan_interval: plan.id,
          status: "active",
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: user.stripe_customer_id,
          subscription_start_date: new Date().toISOString(),
        };
        if (existing.length > 0) {
          await base44.entities.VendorSubscription.update(existing[0].id, subData);
        } else {
          await base44.entities.VendorSubscription.create(subData);
        }
        // Update user pro flag
        await base44.auth.updateMe({ is_pro_vendor: true });
      } catch (dbErr) {
        console.error("DB update error:", dbErr);
      }
      onSuccess(plan);
    } else {
      setError("Payment was not completed. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-center gap-2">
        <Crown className="w-4 h-4 text-amber-600 shrink-0" />
        <span>
          <strong>{plan.name}</strong> — ${plan.price}/{plan.period}
        </span>
      </div>

      <PaymentElement />

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1" disabled={isProcessing}>
          Back
        </Button>
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Crown className="w-4 h-4 mr-2" />
              Subscribe Now
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export default function SubscriptionCheckoutDialog({ open, onClose, onSuccess }) {
  const [selectedPlan, setSelectedPlan] = useState("monthly");
  const [step, setStep] = useState("select"); // "select" | "payment" | "success"
  const [clientSecret, setClientSecret] = useState(null);
  const [subscriptionId, setSubscriptionId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);
  const [successPlan, setSuccessPlan] = useState(null);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep("select");
        setClientSecret(null);
        setSubscriptionId(null);
        setError(null);
        setSuccessPlan(null);
      }, 300);
    }
  }, [open]);

  const handleProceedToPayment = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const response = await base44.functions.invoke("createSubscription", {
        planId: selectedPlan,
      });
      if (response.data?.error) throw new Error(response.data.error);
      setClientSecret(response.data.clientSecret);
      setSubscriptionId(response.data.subscriptionId);
      setStep("payment");
    } catch (err) {
      setError(err.message || "Failed to initialize payment. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSuccess = (plan) => {
    setSuccessPlan(plan);
    setStep("success");
    onSuccess?.(plan);
  };

  const plan = SUBSCRIPTION_PLANS.find((p) => p.id === selectedPlan);

  const elementsOptions = clientSecret
    ? {
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: { colorPrimary: "#d97706" },
        },
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2 border-b">
          <div className="flex items-center gap-2 justify-center mb-2">
            <Crown className="w-6 h-6 text-amber-600" />
            <DialogTitle>Upgrade to Pro</DialogTitle>
            <Crown className="w-6 h-6 text-amber-600" />
          </div>
          <DialogDescription className="text-center text-sm">
            Unlock premium features for your listings
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {/* Step: Select Plan */}
          {step === "select" && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-6">
                {SUBSCRIPTION_PLANS.map((p) => (
                  <Card
                    key={p.id}
                    className={`cursor-pointer transition-all ${
                      selectedPlan === p.id
                        ? "ring-2 ring-amber-500 border-amber-500"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => setSelectedPlan(p.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between mb-2">
                        <CardTitle className="text-lg">{p.name}</CardTitle>
                        {p.savings && (
                          <Badge className="bg-green-100 text-green-700 text-xs">{p.savings}</Badge>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">${p.price}</span>
                        <span className="text-sm text-gray-600">/{p.period}</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {p.features.map((feature, idx) => (
                          <li key={idx} className="flex items-center gap-2 text-sm">
                            <Check className="w-4 h-4 text-green-600 shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-900 mb-1">What You Get</p>
                    <ul className="text-sm text-amber-800 space-y-1">
                      <li>✓ Bulk upload multiple items at once</li>
                      <li>✓ Import products from Shopify, eBay, and more</li>
                      <li>✓ Advanced sales analytics and insights</li>
                      <li>✓ Priority customer support</li>
                    </ul>
                  </div>
                </div>
              </div>

              {error && (
                <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</p>
              )}
            </>
          )}

          {/* Step: Payment */}
          {step === "payment" && clientSecret && (
            <Elements stripe={stripePromise} options={elementsOptions}>
              <PaymentForm
                plan={plan}
                subscriptionId={subscriptionId}
                onSuccess={handleSuccess}
                onCancel={() => setStep("select")}
              />
            </Elements>
          )}

          {/* Step: Success */}
          {step === "success" && (
            <div className="py-8 flex flex-col items-center gap-4 text-center">
              <CheckCircle className="w-16 h-16 text-green-500" />
              <h3 className="text-xl font-bold">You're now a Pro member!</h3>
              <p className="text-gray-600 text-sm">
                Your <strong>{successPlan?.name}</strong> subscription is active. Enjoy unlimited
                access to all Pro features.
              </p>
              <Button onClick={onClose} className="bg-amber-600 hover:bg-amber-700 text-white px-8">
                Get Started
              </Button>
            </div>
          )}
        </div>

        {/* Footer: only shown on plan select step */}
        {step === "select" && (
          <div className="flex gap-3 px-6 py-4 border-t bg-gray-50 shrink-0">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleProceedToPayment}
              disabled={isCreating}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Preparing...
                </>
              ) : (
                <>
                  <Crown className="w-4 h-4 mr-2" />
                  Proceed to Payment
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}