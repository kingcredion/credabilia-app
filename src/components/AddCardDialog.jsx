import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { getStripeInstance } from "@/lib/stripeLoader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AddCardDialog({ open, onOpenChange, onSuccess }) {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1); // 1 = confirm, 2 = payment form
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const paymentElementRef = useRef(null);
  const clientSecretRef = useRef(null);

  useEffect(() => {
    if (!open || step !== 2) return;

    let isMounted = true;

    const initStripe = async () => {
      try {
        setIsLoading(true);

        // Load Stripe + setup intent + customer session via shared loader
        const [stripe, setupResult, csResult] = await Promise.all([
          getStripeInstance(),
          base44.functions.invoke("stripeManagePaymentMethod", { action: "create_setup_intent" }),
          base44.functions.invoke("stripeCustomer", { action: "create_customer_session", context: "wallet" }).catch(() => ({ data: {} })),
        ]);

        if (!isMounted) return;

        stripeRef.current = stripe;

        const clientSecret = setupResult.data?.clientSecret || setupResult.clientSecret;
        if (!clientSecret) {
          console.error("Setup result:", setupResult);
          throw new Error("Failed to create setup intent");
        }

        clientSecretRef.current = clientSecret;

        const customerSessionClientSecret = csResult.data?.customerSessionClientSecret;

        // Initialize Elements — attach CustomerSession if available for saved method redisplay
        const elementsOptions = { clientSecret };
        if (customerSessionClientSecret) {
          elementsOptions.customerSessionClientSecret = customerSessionClientSecret;
        }
        elementsRef.current = stripeRef.current.elements(elementsOptions);

        // Wait for DOM to be ready
        await new Promise(resolve => setTimeout(resolve, 200));

        if (!isMounted) return;

        const mountPoint = document.getElementById("payment-element");
        
        if (mountPoint && !paymentElementRef.current) {
          paymentElementRef.current = elementsRef.current.create("payment");
          paymentElementRef.current.mount("#payment-element");
        }
        
        setIsLoading(false);
      } catch (error) {
        if (isMounted) {
          console.error("Stripe initialization error:", error);
          toast.error(error.message || "Failed to load payment form. Please refresh and try again.");
          setIsLoading(false);
        }
      }
    };

    initStripe();

    // Cleanup on unmount or when dialog closes / step changes
    return () => {
      isMounted = false;
      if (paymentElementRef.current) {
        try {
          paymentElementRef.current.destroy();
        } catch (error) {
          console.warn("Payment element destroy cleanup failed:", error);
        }
        paymentElementRef.current = null;
      }
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, [open, step]);

  const handleAddCard = async () => {
    if (!stripeRef.current || !paymentElementRef.current) {
      toast.error("Payment form not ready. Please try again.");
      return;
    }

    setIsLoading(true);
    try {
      // Confirm the setup with Payment Element (no raw card data sent)
      const { setupIntent, error } = await stripeRef.current.confirmSetup({
        elements: elementsRef.current,
        confirmParams: {
          return_url: `${window.location.origin}`,
        },
        redirect: "if_required",
      });

      if (error) {
        console.error("Stripe error:", error);
        toast.error(error.message || "Payment method setup failed");
        setIsLoading(false);
        return;
      }

      if (setupIntent?.status === "succeeded") {
        toast.success("Payment method added successfully!");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error("Payment method setup incomplete");
      }
    } catch (error) {
      console.error("Setup error:", error);
      toast.error(error.message || "Failed to add payment method. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) setStep(1);
      onOpenChange(newOpen);
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Payment Method</DialogTitle>
          <DialogDescription>
            Securely add a card, digital wallet, or other payment method
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === 1 ? (
            <>
              <p className="text-sm text-gray-600">
                You'll securely add a card, digital wallet, or other payment method. Your information is encrypted and never stored on our servers.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  disabled={isLoading}
                >
                  {isLoading ? "Loading..." : "Continue"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div id="payment-element" className="p-3 border border-gray-300 rounded-lg min-h-16" />

              <Button
                onClick={handleAddCard}
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Setting Up...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Add Payment Method
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}