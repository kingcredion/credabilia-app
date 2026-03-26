import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import TermsAcceptanceCheckbox from "./TermsAcceptanceCheckbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, AlertCircle, CheckCircle2, Coins, Lock, MapPin, Plus, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import SuccessScreen from "./StripeCheckoutSuccess";

async function loadStripeJs() {
  if (window.Stripe) return;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://js.stripe.com/v3/"]');
    if (existing) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Stripe.js"));
    document.body.appendChild(script);
  });
}

const EMPTY_ADDR = { full_name: "", line1: "", line2: "", city: "", state: "", postal_code: "", country: "US", phone: "" };

export default function StripeCheckoutDialog({ open, onOpenChange, item, onSuccess }) {
  const [step, setStep] = useState("summary"); // summary | address | payment | done
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [useCredits, setUseCredits] = useState(false);
  const [transactionId, setTransactionId] = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  const [elementReady, setElementReady] = useState(false);
  const [user, setUser] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Address state
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showNewAddrForm, setShowNewAddrForm] = useState(false);
  const [newAddr, setNewAddr] = useState(EMPTY_ADDR);
  const [saveNewAddr, setSaveNewAddr] = useState(true);

  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const paymentElRef = useRef(null);
  const mountNodeRef = useRef(null);
  const mountedRef = useRef(false);

  const itemTotal = item ? (item.price || 0) + (item.shipping_cost || 0) + (item.handling_fee || 0) : 0;
  const creditsToUse = useCredits ? Math.min(creditsBalance, itemTotal * 100) : 0;
  const creditDeduction = creditsToUse / 100;
  const chargeAmount = Math.max(itemTotal - creditDeduction, 0);

  useEffect(() => {
    if (!open) return;
    base44.auth.me().then(u => {
      setUser(u);
      if (!u?.email) return;
      base44.entities.CouncilCredit.filter({ user_email: u.email }).then(credits => {
        if (credits.length > 0) setCreditsBalance(credits[0].credits_balance || 0);
      });
    });
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("summary");
      setError(null);
      setUseCredits(false);
      setTransactionId(null);
      setPaymentIntentId(null);
      setElementReady(false);
      setSelectedAddressId(null);
      setShowNewAddrForm(false);
      setNewAddr(EMPTY_ADDR);
      mountedRef.current = false;
      if (paymentElRef.current) {
        try { paymentElRef.current.destroy(); } catch (_) {}
        paymentElRef.current = null;
      }
      stripeRef.current = null;
      elementsRef.current = null;
    }
  }, [open]);

  // Load saved addresses
  const { data: savedAddresses = [] } = useQuery({
    queryKey: ["user-addresses", user?.email],
    queryFn: () => base44.entities.UserAddress.filter({ user_email: user.email }, "-created_date"),
    enabled: !!user?.email,
  });

  // Auto-select default address when addresses load or step changes to address
  useEffect(() => {
    if (step === "address" && savedAddresses.length > 0 && !selectedAddressId) {
      const def = savedAddresses.find(a => a.is_default) || savedAddresses[0];
      setSelectedAddressId(def.id);
    }
  }, [savedAddresses, step]);

  // Get the selected address object or the new address form data
  const selectedAddress = selectedAddressId === "new"
    ? newAddr
    : savedAddresses.find(a => a.id === selectedAddressId);

  const getShippingPayload = () => {
    if (!selectedAddress) return null;
    if (selectedAddressId === "new") {
      return {
        name: newAddr.full_name,
        address: {
          line1: newAddr.line1,
          line2: newAddr.line2 || "",
          city: newAddr.city,
          state: newAddr.state,
          postal_code: newAddr.postal_code,
          country: newAddr.country,
        },
        phone: newAddr.phone || "",
      };
    }
    return {
      name: selectedAddress.full_name,
      address: {
        line1: selectedAddress.line1,
        line2: selectedAddress.line2 || "",
        city: selectedAddress.city,
        state: selectedAddress.state,
        postal_code: selectedAddress.postal_code,
        country: selectedAddress.country,
      },
      phone: selectedAddress.phone || "",
    };
  };

  // Mount Payment Element once step === "payment"
  useEffect(() => {
    if (step !== "payment" || mountedRef.current) return;

    const initPayment = async () => {
      setIsLoading(true);
      setError(null);
      try {
        await loadStripeJs();

        const shippingDetails = getShippingPayload();

        const [pkRes, piRes, csRes] = await Promise.all([
          base44.functions.invoke("stripeCustomer", { action: "get_publishable_key" }),
          base44.functions.invoke("createStripeCheckout", {
            action: "create_payment_intent",
            itemId: item.id,
            creditsToUse,
            shippingDetails,
          }),
          base44.functions.invoke("stripeCustomer", { action: "create_customer_session", context: "checkout" }).catch(() => ({ data: {} })),
        ]);

        const pk = pkRes.data?.publishableKey;
        const clientSecret = piRes.data?.clientSecret;
        const txnId = piRes.data?.transactionId;
        const piId = piRes.data?.stripe_pi_id;
        const customerSessionClientSecret = csRes.data?.customerSessionClientSecret;

        if (!pk) throw new Error("Could not load Stripe publishable key");
        if (!clientSecret) throw new Error("Failed to create payment intent");

        setTransactionId(txnId);
        setPaymentIntentId(piId);

        // If new address and user wants to save it, do it now
        if (selectedAddressId === "new" && saveNewAddr && user?.email) {
          const isFirst = savedAddresses.length === 0;
          base44.entities.UserAddress.create({
            user_email: user.email,
            label: "Home",
            ...newAddr,
            is_default: isFirst,
          }).catch((error) => {
            console.warn("Failed to save new address as fallback:", error);
          });
        }

        stripeRef.current = window.Stripe(pk);
        const elementsOptions = { clientSecret, appearance: { theme: "stripe" } };
        if (customerSessionClientSecret) elementsOptions.customerSessionClientSecret = customerSessionClientSecret;
        elementsRef.current = stripeRef.current.elements(elementsOptions);

        let attempts = 0;
        const tryMount = () => {
          const node = mountNodeRef.current;
          if (node && node.isConnected) {
            mountedRef.current = true;
            paymentElRef.current = elementsRef.current.create("payment");
            paymentElRef.current.on("ready", () => setElementReady(true));
            paymentElRef.current.mount(node);
            setIsLoading(false);
          } else if (attempts < 30) {
            attempts++;
            setTimeout(tryMount, 100);
          } else {
            throw new Error("Could not initialize payment form. Please try again.");
          }
        };
        tryMount();
      } catch (err) {
        setError(err.message);
        setIsLoading(false);
      }
    };

    initPayment();
  }, [step]);

  const handleConfirmPayment = async () => {
    if (!stripeRef.current || !elementsRef.current || !elementReady) return;
    setIsLoading(true);
    setError(null);
    try {
      // 1. Submit the payment via Stripe.js
      const { error: stripeError } = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: { return_url: `${window.location.origin}/CheckoutSuccess?transaction_id=${transactionId}` },
        redirect: "if_required",
      });

      if (stripeError) { setError(stripeError.message); setIsLoading(false); return; }

      // 2. Capture the PaymentIntent (if still requires_capture).
      //    WEBHOOK SOURCE OF TRUTH: State finalization (Transaction completed, Item sold,
      //    vendor transfer) happens exclusively in stripeWebhook.ts — not here.
      await base44.functions.invoke("createStripeCheckout", {
        action: "confirm_payment",
        paymentIntentId,
        transactionId,
      });

      // 3. Send immediate notification (fallback for test mode / webhook delay)
      if (user?.email) {
        base44.entities.Notification.create({
          user_email: user.email,
          type: 'payment_confirmed',
          title: '✅ Payment Confirmed',
          message: `Payment confirmed for "${item.title}". Your payment is secured until delivery.`,
          read: false,
          related_item_id: item.id,
          link_url: '/MyCollection',
        }).catch(err => console.warn('Notification send failed:', err.message));
      }

      // 4. Show success — webhook will finalize backend state asynchronously
      setStep("done");
      if (onSuccess) onSuccess(transactionId);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreditOnlyPurchase = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const shippingDetails = getShippingPayload();

      // Save new address if needed
      if (selectedAddressId === "new" && saveNewAddr && user?.email) {
        base44.entities.UserAddress.create({
          user_email: user.email, label: "Home", ...newAddr, is_default: savedAddresses.length === 0
        }).catch(err => console.warn("Failed to save address:", err));
      }

      // Route through the single credit-only backend — no duplicate logic here
      const res = await base44.functions.invoke("createTransactionRecord", {
        itemId: item.id,
        creditsToUse,
        shippingDetails: shippingDetails || null,
      });

      if (res.data?.error) throw new Error(res.data.error);

      setStep("done");
      if (onSuccess) onSuccess(res.data?.id);
    } catch (err) {
      setError(err.message || "Purchase failed. Please try again.");
      console.error("[StripeCheckoutDialog] Credit purchase error:", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const canProceedToPayment = selectedAddressId && selectedAddressId !== "new"
    ? true
    : (newAddr.full_name && newAddr.line1 && newAddr.city && newAddr.state && newAddr.postal_code);

  const nf = (field) => (e) => setNewAddr(p => ({ ...p, [field]: e.target.value }));

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto dark:bg-white/[0.08] dark:border-white/15 dark:backdrop-blur-lg dark:shadow-2xl bg-white/95 border-gray-200">
        <DialogHeader>
          <DialogTitle>
            {step === "done" ? "Payment Successful!" : "Complete Your Purchase"}
          </DialogTitle>
          <DialogDescription>
            {step === "summary" && "Review your order"}
            {step === "address" && "Where should we ship your order?"}
            {step === "payment" && "Enter your payment details below"}
            {step === "done" && "Your order has been confirmed"}
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: ORDER SUMMARY */}
        {step === "summary" && (
          <div className="space-y-4 pb-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <p className="font-semibold text-gray-900">{item.title}</p>
              <div className="flex justify-between text-gray-600"><span>Item Price</span><span>${(item.price || 0).toFixed(2)}</span></div>
              {item.shipping_cost > 0 && <div className="flex justify-between text-gray-600"><span>Shipping</span><span>${item.shipping_cost.toFixed(2)}</span></div>}
              {item.handling_fee > 0 && <div className="flex justify-between text-gray-600"><span>Handling</span><span>${item.handling_fee.toFixed(2)}</span></div>}
              <div className="border-t pt-2 flex justify-between font-semibold text-gray-900"><span>Total</span><span>${itemTotal.toFixed(2)}</span></div>
            </div>

            {creditsBalance > 0 && (
              <div
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${useCredits ? "border-green-500 bg-green-50" : "border-gray-200 hover:border-green-300"}`}
                onClick={() => setUseCredits(!useCredits)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium">Use Credion Credits</span>
                    <Badge className="bg-green-100 text-green-700 text-xs">{creditsBalance} credits · 100 = $1</Badge>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 ${useCredits ? "bg-green-500 border-green-500" : "border-gray-300"}`} />
                </div>
                {useCredits && <p className="text-xs text-green-700 mt-1">Saves ${creditDeduction.toFixed(2)} with Credion Credits — remaining charge: ${chargeAmount.toFixed(2)}</p>}
              </div>
            )}

            <Button onClick={() => setStep("address")} className="w-full bg-blue-600 hover:bg-blue-700">
              <MapPin className="w-4 h-4 mr-2" />
              Continue to Shipping
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* STEP 2: SHIPPING ADDRESS */}
        {step === "address" && (
          <div className="space-y-4 pb-4">
            {/* Quick default address button */}
            {savedAddresses.length > 0 && !showNewAddrForm && (() => {
              const defaultAddr = savedAddresses.find(a => a.is_default) || savedAddresses[0];
              return defaultAddr ? (
                <Button 
                  onClick={() => setSelectedAddressId(defaultAddr.id)} 
                  variant="outline" 
                  className="w-full border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700"
                >
                  Use Default Address: {defaultAddr.full_name}, {defaultAddr.city}
                </Button>
              ) : null;
            })()}

            {/* Saved addresses */}
            {savedAddresses.length > 0 && !showNewAddrForm && (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {savedAddresses.map((addr) => (
                  <div
                    key={addr.id}
                    onClick={() => { setSelectedAddressId(addr.id); setShowNewAddrForm(false); }}
                    className={`border rounded-lg p-3 cursor-pointer transition-all ${
                      selectedAddressId === addr.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 ${selectedAddressId === addr.id ? "bg-blue-500 border-blue-500" : "border-gray-300"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{addr.label}</span>
                          {addr.is_default && <Badge className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0 h-auto">Default</Badge>}
                        </div>
                        <p className="text-sm text-gray-700">{addr.full_name}</p>
                        <p className="text-xs text-gray-500">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {addr.state} {addr.postal_code}</p>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => { setSelectedAddressId("new"); setShowNewAddrForm(true); }}
                  className="w-full border border-dashed border-gray-300 rounded-lg p-3 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Use a different address
                </button>
              </div>
            )}

            {/* New address form (shown when no saved addresses or user chose "different") */}
            {(savedAddresses.length === 0 || showNewAddrForm) && (
              <div className="space-y-2">
                {showNewAddrForm && (
                  <button onClick={() => { setShowNewAddrForm(false); setSelectedAddressId(savedAddresses[0]?.id || null); }} className="text-xs text-blue-600 hover:underline">
                    ← Back to saved addresses
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                   <div className="col-span-2"><Label className="text-xs">Full Name</Label><Input value={newAddr.full_name} onChange={nf("full_name")} placeholder="Jane Doe" /></div>
                   <div className="col-span-2"><Label className="text-xs">Street Address</Label><Input value={newAddr.line1} onChange={nf("line1")} placeholder="123 Main St" /></div>
                  <div className="col-span-2"><Label className="text-xs">Apt / Suite</Label><Input value={newAddr.line2} onChange={nf("line2")} placeholder="Apt 4B (optional)" /></div>
                  <div><Label className="text-xs">City</Label><Input value={newAddr.city} onChange={nf("city")} /></div>
                  <div><Label className="text-xs">State</Label><Input value={newAddr.state} onChange={nf("state")} placeholder="CA" /></div>
                  <div><Label className="text-xs">ZIP</Label><Input value={newAddr.postal_code} onChange={nf("postal_code")} /></div>
                  <div><Label className="text-xs">Country</Label><Input value={newAddr.country} onChange={nf("country")} /></div>
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer text-gray-600 mt-1">
                  <input type="checkbox" checked={saveNewAddr} onChange={e => setSaveNewAddr(e.target.checked)} className="rounded" />
                  Save this address for future orders
                </label>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("summary")} className="flex-1">Back</Button>
              {chargeAmount === 0 ? (
                <Button onClick={handleCreditOnlyPurchase} disabled={isLoading || !canProceedToPayment} className="flex-1 bg-green-600 hover:bg-green-700">
                  {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Coins className="w-4 h-4 mr-2" />}
                  Pay with Credion Credits
                </Button>
              ) : (
                <Button onClick={() => setStep("payment")} disabled={!canProceedToPayment} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Pay ${chargeAmount.toFixed(2)}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: PAYMENT */}
         {step === "payment" && (
           <div className="space-y-4 pb-4">
             <div className="bg-gray-50 rounded-lg p-3 flex justify-between text-sm font-medium">
               <span className="text-gray-700">{item.title}</span>
               <span className="text-gray-900">${chargeAmount.toFixed(2)}</span>
             </div>

             <TermsAcceptanceCheckbox 
               checked={termsAccepted}
               onChange={setTermsAccepted}
               variant="checkout"
             />

            {selectedAddress && (
              <div className="flex items-start gap-2 text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <MapPin className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                <span>
                  Shipping to: {selectedAddress.full_name || selectedAddress.name} — {selectedAddress.line1 || selectedAddress.address?.line1}, {selectedAddress.city || selectedAddress.address?.city}
                </span>
              </div>
            )}

            {isLoading && !elementReady && (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
            )}

            <div
               ref={mountNodeRef}
               style={{ minHeight: "220px", visibility: (isLoading && !elementReady) ? "hidden" : "visible" }}
               className="rounded-lg border border-gray-200 p-3 bg-white"
             />

            {error && (
              <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
              </div>
            )}

            <div className="flex gap-2">
               <Button variant="outline" onClick={() => setStep("address")} disabled={isLoading} className="flex-1">Back</Button>
               <Button onClick={handleConfirmPayment} disabled={isLoading || !elementReady || !termsAccepted} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : <><Lock className="w-4 h-4 mr-2" />Pay ${chargeAmount.toFixed(2)}</>}
              </Button>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Lock className="w-3 h-3" />
              <span>Secured by Stripe. Credabilia never stores your card details.</span>
            </div>
          </div>
        )}

        {/* STEP 4: SUCCESS */}
        {step === "done" && (
          <SuccessScreen onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}