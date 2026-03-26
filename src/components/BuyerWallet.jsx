import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Plus, Trash2, Star, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Publishable key is fetched from backend to avoid env var issues

const CARD_BRANDS = {
  visa: '💳 Visa',
  mastercard: '💳 Mastercard',
  amex: '💳 Amex',
  discover: '💳 Discover',
  default: '💳 Card'
};

export default function BuyerWallet() {
  const [cards, setCards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddCard, setShowAddCard] = useState(false);
  const [error, setError] = useState(null);

  const loadCards = async () => {
    setIsLoading(true);
    try {
      const res = await base44.functions.invoke("stripeCustomer", { action: "get_payment_methods" });
      setCards(res.data?.payment_methods || []);
    } catch (e) {
      setError("Failed to load payment methods");
    }
    setIsLoading(false);
  };

  useEffect(() => { loadCards(); }, []);

  const handleSetDefault = async (pmId) => {
    await base44.functions.invoke("stripeCustomer", { action: "set_default", paymentMethodId: pmId });
    setCards(prev => prev.map(c => ({ ...c, is_default: c.id === pmId })));
  };

  const handleDelete = async (pmId) => {
    await base44.functions.invoke("stripeCustomer", { action: "detach", paymentMethodId: pmId });
    setCards(prev => prev.filter(c => c.id !== pmId));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Saved Payment Methods</h3>
          <p className="text-sm text-gray-500">Cards saved for faster checkout</p>
        </div>
        <Button onClick={() => setShowAddCard(true)} size="sm" variant="outline" className="gap-2">
          <Plus className="w-4 h-4" /> Add Card
        </Button>
      </div>

      {error && (
        <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : cards.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
          <CreditCard className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No saved cards yet</p>
          <Button onClick={() => setShowAddCard(true)} size="sm" className="mt-3">Add a Card</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map(card => (
            <div key={card.id} className={`flex items-center justify-between p-3 rounded-xl border-2 transition-colors ${card.is_default ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <CreditCard className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900 capitalize text-sm">{card.brand} ···· {card.last4}</p>
                    {card.is_default && <Badge className="bg-blue-600 text-white text-xs">Default</Badge>}
                  </div>
                  <p className="text-xs text-gray-500">Expires {card.exp_month}/{card.exp_year}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!card.is_default && (
                  <Button onClick={() => handleSetDefault(card.id)} size="sm" variant="ghost" className="text-xs text-gray-500 hover:text-blue-600 px-2">
                    <Star className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline ml-1">Default</span>
                  </Button>
                )}
                <Button onClick={() => handleDelete(card.id)} size="sm" variant="ghost" className="text-red-400 hover:text-red-600 hover:bg-red-50 px-2">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddCardDialog open={showAddCard} onOpenChange={setShowAddCard} onSuccess={() => { setShowAddCard(false); loadCards(); }} />
    </div>
  );
}

function AddCardDialog({ open, onOpenChange, onSuccess }) {
  const [clientSecret, setClientSecret] = useState(null);
  const [stripePk, setStripePk] = useState(null);
  const [isLoadingIntent, setIsLoadingIntent] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [elementReady, setElementReady] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const mountNodeRef = useRef(null);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const elementRef = useRef(null);
  const mountedRef = useRef(false);

  // Reset everything when dialog closes
  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setStripePk(null);
      setError(null);
      setSuccess(false);
      setElementReady(false);
      setIsLoadingIntent(false);
      mountedRef.current = false;
      if (elementRef.current) {
        try { elementRef.current.destroy(); } catch (_) {}
        elementRef.current = null;
      }
      stripeRef.current = null;
      elementsRef.current = null;
    }
  }, [open]);

  // Step 1: Load Stripe.js + fetch setup intent when dialog opens
  useEffect(() => {
    if (!open) return;
    const fetchSecret = async () => {
      setIsLoadingIntent(true);
      setError(null);
      try {
        if (!window.Stripe) {
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
        const [pkRes, siRes] = await Promise.all([
          base44.functions.invoke("stripeCustomer", { action: "get_publishable_key" }),
          base44.functions.invoke("stripeCustomer", { action: "create_setup_intent" }),
        ]);
        const pk = pkRes.data?.publishableKey;
        const secret = siRes.data?.clientSecret;
        if (!pk) throw new Error("Could not load Stripe publishable key");
        if (!secret) throw new Error("No client secret returned from server");
        setStripePk(pk);
        setClientSecret(secret);
      } catch (e) {
        setError(e.message);
        setError(e.message);
      } finally {
        setIsLoadingIntent(false);
      }
    };
    fetchSecret();
  }, [open]);

  // Step 2: Mount Card Element after clientSecret + pk are ready — poll for DOM node
  useEffect(() => {
    if (!clientSecret || !stripePk || mountedRef.current) return;

    let attempts = 0;
    const tryMount = () => {
      const node = mountNodeRef.current;
      if (node && node.isConnected) {
        mountedRef.current = true;
        stripeRef.current = window.Stripe(stripePk);
        // Use legacy Elements (no clientSecret) + CardElement for maximum compatibility
        elementsRef.current = stripeRef.current.elements({
          appearance: { theme: 'stripe' },
        });
        elementRef.current = elementsRef.current.create("card", {
          style: {
            base: {
              fontSize: '16px',
              color: '#30313d',
              fontFamily: 'system-ui, sans-serif',
              '::placeholder': { color: '#aab7c4' },
            },
          },
          hidePostalCode: false,
        });
        elementRef.current.on('ready', () => {
          setElementReady(true);
        });
        elementRef.current.on('change', (e) => {
          if (e.error) setError(e.error.message);
          else setError(null);
        });
        elementRef.current.mount(node);
      } else if (attempts < 20) {
        attempts++;
        setTimeout(tryMount, 100);
      } else {
        setError("Could not initialize payment form. Please close and try again.");
      }
    };
    tryMount();
  }, [clientSecret, stripePk]);

  const handleSave = async () => {
    if (!stripeRef.current || !elementRef.current || !elementReady) return;
    setIsConfirming(true);
    setError(null);
    const { error: stripeError } = await stripeRef.current.confirmCardSetup(clientSecret, {
      payment_method: { card: elementRef.current },
    });
    if (stripeError) {
      setError(stripeError.message);
    } else {
      setSuccess(true);
      setTimeout(() => onSuccess(), 1500);
    }
    setIsConfirming(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
      <DialogContent
        className="max-w-md w-full"
        style={{ minWidth: '350px', display: 'flex', flexDirection: 'column', gap: '16px' }}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Add Payment Method</DialogTitle>
          <DialogDescription>Save a card for faster checkout in the future.</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
            <p className="font-semibold text-gray-900">Card saved successfully!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {isLoadingIntent && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            )}

            {/* Mount node — always in DOM, never hidden, Card Element mounts here */}
            <div
              ref={mountNodeRef}
              style={{
                width: '100%',
                minWidth: '320px',
                minHeight: '44px',
                padding: '12px',
                border: '1px solid #e0e6eb',
                borderRadius: '6px',
                backgroundColor: '#fff',
                visibility: isLoadingIntent ? 'hidden' : 'visible',
              }}
            />

            {error && (
              <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            )}
            {!isLoadingIntent && !success && (
              <>
                <Button onClick={handleSave} disabled={isConfirming || !elementReady} className="w-full">
                  {isConfirming ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : "Save Card"}
                </Button>
                <p className="text-xs text-center text-gray-500">Your card details are encrypted and stored securely by Stripe.</p>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}