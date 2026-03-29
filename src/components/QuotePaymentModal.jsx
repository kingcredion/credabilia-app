/**
 * Stripe Elements Payment Modal for Quotes
 * 
 * WEBHOOK SOURCE OF TRUTH:
 * - This component ONLY:
 *   1. Calls createQuotePaymentIntent to create PaymentIntent
 *   2. Loads Stripe Elements
 *   3. Confirms payment via Stripe.js
 *   4. Shows success/error states
 * 
 * - It does NOT:
 *   - Mark quote as paid
 *   - Update Transaction status
 *   - Create vendor transfer
 *   - Deduct credits
 * 
 * All finalization happens exclusively in stripeWebhook.ts on payment_intent.succeeded
 */
import React, { useState, useEffect, useRef } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { base44 } from '@/api/base44Client';
import { getStripePromise } from '@/lib/stripeLoader';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';

const stripePromise = getStripePromise();

function CheckoutForm({ quote, onSuccess, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (elements) {
      setIsReady(true);
    }
  }, [elements]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Confirm payment via Stripe.js
      // This submits the payment to Stripe but does NOT finalize backend state yet
      const { error: submitError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/Messages`,
        },
        redirect: 'if_required',
      });

      if (submitError) {
        setErrorMessage(submitError.message);
        setIsLoading(false);
        onError?.(submitError.message);
        return;
      }

      // 2. Payment confirmed by Stripe — webhook will finalize everything
      console.log(`✅ Payment confirmed: ${paymentIntent.id}`);
      onSuccess?.(quote.quote_id);

    } catch (err) {
      setErrorMessage(err.message);
      onError?.(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
         <div className="flex justify-between items-center mb-2">
           <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Amount</span>
           <span className="text-xl font-bold text-blue-600 dark:text-blue-400">${(quote.amount / 100).toFixed(2)}</span>
         </div>
         <p className="text-sm text-gray-600 dark:text-gray-400">{quote.description}</p>
       </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <PaymentElement
          options={{
            layout: 'tabs',
            wallets: { applePay: 'auto', googlePay: 'auto' },
          }}
        />
      </div>

      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700 dark:text-red-300">{errorMessage}</div>
        </div>
      )}

      <Button
        type="submit"
        disabled={!stripe || !isReady || isLoading}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        size="lg"
      >
        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
         {isLoading ? 'Processing...' : `Pay $${(quote.amount / 100).toFixed(2)}`}
      </Button>

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        Your payment is secure and handled by Stripe
      </p>
    </form>
  );
}

export default function QuotePaymentModal({ open, onClose, quote, onSuccess }) {
  const [isLoading, setIsLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState(null);
  const [error, setError] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  useEffect(() => {
    if (!open || !quote) return;

    setIsLoading(true);
    setError(null);
    setClientSecret(null);
    setPaymentSuccess(false);

    const initPayment = async () => {
      try {
        // Track analytics
        base44.analytics.track({
          eventName: 'quote_payment_modal_opened',
          properties: {
            quote_id: quote.quote_id || quote.id,
            amount: quote.amount / 100,
          }
        });

        const response = await base44.functions.invoke('createQuotePaymentIntent', {
          quote_id: quote.quote_id || quote.id,
        });

        if (response.data.error) {
          setError(response.data.error);
          return;
        }

        setClientSecret(response.data.clientSecret);
      } catch (err) {
        setError(err.message || 'Failed to initialize payment');
        console.error('Error creating PaymentIntent:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initPayment();
  }, [open, quote]);

  const handlePaymentSuccess = (quoteId) => {
    // Track frontend confirmation (NOT "quote_paid" — webhook confirms actual payment)
    base44.analytics.track({
      eventName: 'quote_payment_confirmed_client',
      properties: {
        quote_id: quoteId,
        amount: quote.amount / 100,
      }
    });

    setPaymentSuccess(true);
    // Don't close immediately — let user see success message
    setTimeout(() => {
      onSuccess?.(quoteId);
      onClose();
    }, 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold">Complete Payment</DialogTitle>
            {!paymentSuccess && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="mt-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground">Loading payment options...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-700 dark:text-red-300">Payment Error</p>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                </div>
              </div>
              <Button
                onClick={onClose}
                variant="outline"
                className="w-full mt-4"
              >
                Close
              </Button>
            </div>
          )}

          {paymentSuccess && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Payment Successful</h3>
              <p className="text-sm text-muted-foreground">
                Your payment has been processed. Redirecting...
              </p>
            </div>
          )}

          {clientSecret && !error && !paymentSuccess && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: document.documentElement.classList.contains('dark') ? 'night' : 'stripe',
                },
              }}
            >
              <CheckoutForm
                quote={quote}
                onSuccess={handlePaymentSuccess}
                onError={(errMsg) => setError(errMsg)}
              />
            </Elements>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}