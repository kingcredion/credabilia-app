/**
 * createQuotePaymentIntent — PaymentIntent creation for Quote payments.
 *
 * Fee model (identical to createStripeCheckout):
 *   - Platform fee   = gross × 12%
 *   - Auditor pool   = gross × 1%
 *   - Stripe fee     = chargeAmount × 2.9% + $0.30  (absorbed by platform, not vendor)
 *   - Vendor net     = gross − platformFee − auditorPool − influencerCommission
 *
 * Transaction status starts as 'pending'.
 * stripeWebhook advances it: pending → escrow (service/commission) or pending → paid (item sale).
 *
 * Uses idempotency key pi-{quote_id} to prevent duplicate PaymentIntents on retry.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const STRIPE_KEY        = Deno.env.get('STRIPE_SECRET_KEY');
const PLATFORM_FEE_PCT  = 0.12;
const AUDITOR_POOL_PCT  = 0.01;
const STRIPE_PCT        = 0.029;
const STRIPE_FIXED      = 0.30;

/**
 * Canonical fee calculation — gross is the full dollar amount the buyer pays.
 * chargeAmount = gross (quotes are always fully charged via Stripe, no credits path here).
 */
function calcFees(gross) {
  const platformFee  = Math.round(gross * PLATFORM_FEE_PCT * 100) / 100;
  const auditorPool  = Math.round(gross * AUDITOR_POOL_PCT * 100) / 100;
  const stripeFee    = Math.round((gross * STRIPE_PCT + STRIPE_FIXED) * 100) / 100;
  const vendorNet    = Math.round((gross - platformFee - auditorPool) * 100) / 100;
  return { platformFee, auditorPool, stripeFee, vendorNet };
}

async function stripeRequest(path, method = 'GET', body = null, idempotencyKey = null) {
  if (!STRIPE_KEY) throw new Error('STRIPE_SECRET_KEY is not configured');
  const headers = {
    'Authorization': `Bearer ${STRIPE_KEY}`,
    'Stripe-Version': '2023-10-16',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey && (method === 'POST' || method === 'DELETE')) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const options = { method, headers };
  if (body && (method === 'POST' || method === 'DELETE')) options.body = new URLSearchParams(body).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}`, options);
  const data = await res.json();
  if (!res.ok && !data.error) throw new Error(`Stripe ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function ensureStripeCustomer(base44, user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await stripeRequest('/customers', 'POST', {
    email: user.email,
    name: user.full_name || '',
    'metadata[base44_user_id]': user.id,
  }, `customer-${user.id}`);
  if (customer.error) throw new Error(customer.error.message);
  const customerId = customer.id;
  try { await base44.auth.updateMe({ stripe_customer_id: customerId }); } catch (_) {}
  return customerId;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { quote_id } = body;
    if (!quote_id) return Response.json({ error: 'quote_id required' }, { status: 400 });

    // Fetch and validate quote
    const quotes = await base44.asServiceRole.entities.Quote.filter({ id: quote_id });
    if (!quotes.length) return Response.json({ error: 'Quote not found' }, { status: 404 });
    const quote = quotes[0];

    if (quote.buyer_email !== user.email) {
      return Response.json({ error: 'Only the quote recipient can pay' }, { status: 403 });
    }
    if (quote.status !== 'pending') {
      return Response.json({ error: `Quote is already ${quote.status}` }, { status: 400 });
    }

    const now = new Date();
    if (now > new Date(quote.expires_at)) {
      await base44.asServiceRole.entities.Quote.update(quote_id, { status: 'expired' });
      return Response.json({ error: 'Quote has expired' }, { status: 400 });
    }

    // Quote.amount is stored in cents — convert to dollars for fee math
    const gross       = Math.round(quote.amount) / 100;  // dollars
    const grossCents  = Math.round(quote.amount);         // cents (for Stripe)

    const { platformFee, auditorPool, stripeFee, vendorNet } = calcFees(gross);

    const customerId    = await ensureStripeCustomer(base44, user);
    const transfer_group = `QUOTE-${quote_id}-${Date.now()}`;

    // Create pending transaction with full fee breakdown
    const transaction = await base44.asServiceRole.entities.Transaction.create({
      quote_id,
      vendor_email:              quote.vendor_email,
      buyer_email:               quote.buyer_email,
      sale_amount:               gross,
      payment_method:            'stripe',
      status:                    'pending',
      final_stripe_charge_amount: gross,  // full gross charged (no credits on quote flow)
      credits_used:              0,
      credits_restored:          false,
      // Fee breakdown
      platform_fee_percentage:   PLATFORM_FEE_PCT * 100,
      platform_fee_amount:       platformFee,
      auditor_pool_contribution: auditorPool,
      vendor_net_amount:         vendorNet,
      // Shipping
      shipping_status:           quote.shipping_required ? 'pending' : 'not_applicable',
      transfer_group,
    });

    console.log(`📦 Created transaction ${transaction.id} for quote ${quote_id}: gross=$${gross}, platformFee=$${platformFee}, auditorPool=$${auditorPool}, stripeFee=$${stripeFee}, vendorNet=$${vendorNet}`);

    // Create PaymentIntent (auto-capture; quote payments confirm immediately)
    const piParams = {
      amount:                      String(grossCents),
      currency:                    'usd',
      customer:                    customerId,
      'payment_method_types[0]':   'card',
      setup_future_usage:          'off_session',
      capture_method:              'automatic',
      transfer_group,
      'metadata[quote_id]':        quote_id,
      'metadata[transaction_id]':  transaction.id,
      'metadata[buyer_email]':     quote.buyer_email,
      'metadata[vendor_email]':    quote.vendor_email,
      'metadata[transfer_group]':  transfer_group,
      description:                 `Quote: ${quote.description}`,
    };

    const pi = await stripeRequest('/payment_intents', 'POST', piParams, `pi-${quote_id}`);
    if (pi.error) throw new Error(`Stripe error: ${pi.error.message}`);

    // Link PI to both quote and transaction
    await Promise.all([
      base44.asServiceRole.entities.Quote.update(quote_id, { stripe_payment_intent_id: pi.id }),
      base44.asServiceRole.entities.Transaction.update(transaction.id, { stripe_payment_intent_id: pi.id }),
    ]);

    console.log(`✅ PaymentIntent ${pi.id} created for quote ${quote_id}`);

    return Response.json({
      clientSecret:    pi.client_secret,
      quote_id,
      transaction_id:  transaction.id,
      amount:          gross,
      platformFee,
      auditorPool,
      stripeFee,
      vendorNet,
      description:     quote.description,
      vendor_email:    quote.vendor_email,
      stripe_pi_id:    pi.id,
    });

  } catch (error) {
    console.error('❌ createQuotePaymentIntent error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});