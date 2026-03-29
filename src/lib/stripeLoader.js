/**
 * stripeLoader — Single source for the Stripe publishable key.
 *
 * getStripePromise() — for @stripe/react-stripe-js <Elements> wrappers.
 *   Returns Promise<Stripe> via loadStripe (cached, fires once per page load).
 *
 * getStripeInstance() — for imperative window.Stripe usage (AddCardDialog,
 *   BuyerWallet, StripeCheckoutDialog). Loads stripe.js script once, then
 *   fetches the key from the backend and returns window.Stripe(key).
 *   Also cached so the network call is made at most once per page load.
 */
import { loadStripe } from '@stripe/stripe-js';
import { base44 } from '@/api/base44Client';

// ---------- shared key fetch (cached) ----------
let _keyPromise = null;

function getPublishableKey() {
  if (!_keyPromise) {
    _keyPromise = base44.functions
      .invoke('stripeCustomer', { action: 'get_publishable_key' })
      .then((res) => {
        const key = res?.data?.publishableKey;
        if (!key) throw new Error('[stripeLoader] No publishable key returned from stripeCustomer');
        const prefix = key.startsWith('pk_test_') ? 'pk_test_' : key.startsWith('pk_live_') ? 'pk_live_' : 'pk_???_';
        console.log(`[stripeLoader] Key prefix: ${prefix}`);
        return key;
      })
      .catch((err) => {
        _keyPromise = null; // allow retry on next mount
        throw err;
      });
  }
  return _keyPromise;
}

// ---------- @stripe/stripe-js promise (for <Elements>) ----------
let _stripePromise = null;

export function getStripePromise() {
  if (!_stripePromise) {
    _stripePromise = getPublishableKey()
      .then((key) => loadStripe(key))
      .catch((err) => {
        _stripePromise = null;
        throw err;
      });
  }
  return _stripePromise;
}

// ---------- imperative window.Stripe instance ----------
let _instancePromise = null;

export async function getStripeInstance() {
  if (!_instancePromise) {
    _instancePromise = (async () => {
      // Load stripe.js script once
      if (!window.Stripe) {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector('script[src="https://js.stripe.com/v3/"]');
          if (existing) { resolve(); return; }
          const script = document.createElement('script');
          script.src = 'https://js.stripe.com/v3/';
          script.onload = resolve;
          script.onerror = () => reject(new Error('[stripeLoader] Failed to load Stripe.js'));
          document.body.appendChild(script);
        });
      }
      const key = await getPublishableKey();
      return window.Stripe(key);
    })().catch((err) => {
      _instancePromise = null;
      throw err;
    });
  }
  return _instancePromise;
}