import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');

// ── Fee constants ─────────────────────────────────────────────────────────────
const PLATFORM_FEE_PCT   = 0.12;   // 12% of gross sale
const AUDITOR_POOL_PCT   = 0.01;   // 1% of gross sale (taken from platform fee — distributed to top auditors)
const STRIPE_PCT         = 0.029;  // 2.9% Stripe processing rate
const STRIPE_FIXED       = 0.30;   // $0.30 Stripe fixed fee per charge

/**
 * Canonical fee calculation for a Stripe-charged purchase.
 *
 * - Platform fee   = gross × 12%   (platform retains this)
 * - Auditor pool   = gross × 1%    (subset of platform fee — distributed to top auditors)
 * - Stripe fee     = chargeAmount × 2.9% + $0.30  (deducted from platform's share, never from vendor)
 * - Vendor net     = gross − platformFee − auditorPool − influencerCommission
 *
 * No Stripe fee is ever added to the customer price or subtracted from vendor net.
 * Stripe fee comes entirely out of the platform's 12%.
 */
function calcFees({ gross, chargeAmount, influencerCommission = 0 }) {
  const platformFee       = Math.round(gross * PLATFORM_FEE_PCT * 100) / 100;
  const auditorPool       = Math.round(gross * AUDITOR_POOL_PCT * 100) / 100;
  const stripeFee         = chargeAmount > 0
    ? Math.round((chargeAmount * STRIPE_PCT + STRIPE_FIXED) * 100) / 100
    : 0;
  const vendorNet         = Math.round((gross - platformFee - auditorPool - influencerCommission) * 100) / 100;
  return { platformFee, auditorPool, stripeFee, vendorNet };
}

function stripeRequest(path, method = 'GET', body = null, stripeAccount = null) {
  const headers = {
    'Authorization': `Bearer ${STRIPE_KEY}`,
    'Stripe-Version': '2023-10-16',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (stripeAccount) headers['Stripe-Account'] = stripeAccount;
  const options = { method, headers };
  if (body) options.body = new URLSearchParams(body).toString();
  return fetch(`https://api.stripe.com/v1${path}`, options).then(r => r.json());
}

Deno.serve(async (req) => {
  let body;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    body = await req.json();
    const { action, itemId, creditsToUse = 0, shippingDetails = null } = body;

    // ── CREATE PAYMENT INTENT ────────────────────────────────────────────────
    if (action === 'create_payment_intent') {
      if (!STRIPE_KEY) return Response.json({ error: 'Stripe is not configured.' }, { status: 500 });

      const items = await base44.asServiceRole.entities.Item.filter({ id: itemId });
      if (!items.length) return Response.json({ error: 'Item not found' }, { status: 404 });
      const item = items[0];
      if (item.status === 'sold') return Response.json({ error: 'Item already sold' }, { status: 400 });

      // Gross amount = full item price + shipping + handling
      const gross = Math.round(((item.price || 0) + (item.shipping_cost || 0) + (item.handling_fee || 0)) * 100) / 100;

      // Server-side Credion Credits validation — credits are capped at gross value
      let approvedCredits = creditsToUse;
      if (creditsToUse > 0) {
        // CouncilCredit is the Credion Credits wallet — entity table name kept for backward compat
        const creditRecords = await base44.asServiceRole.entities.CouncilCredit.filter({ user_email: user.email });
        const balance = creditRecords.length > 0 ? (creditRecords[0].credits_balance || 0) : 0;
        approvedCredits = Math.min(creditsToUse, balance, Math.round(gross * 100));
      }

      const creditDeduction    = approvedCredits / 100;  // dollar value of credits
      const chargeAmount       = Math.round(Math.max(gross - creditDeduction, 0) * 100) / 100;
      const amountCents        = Math.round(chargeAmount * 100);

      // Influencer commission (fraction of platform fee)
      let influencerCommission = 0;
      let influencerId         = null;
      if (user.referred_by) {
        const influencers = await base44.asServiceRole.entities.Influencer.filter({ referral_code: user.referred_by, status: 'active' });
        if (influencers.length > 0) {
          const inf        = influencers[0];
          influencerCommission = Math.round(gross * (inf.commission_rate || 0.005) * 100) / 100;
          influencerId     = inf.id;
        }
      }

      // Canonical fee calculation
      const { platformFee, auditorPool, stripeFee, vendorNet } = calcFees({
        gross,
        chargeAmount,
        influencerCommission,
      });

      // Ensure Stripe customer (always verify it exists in current mode)
      let customerId = user.stripe_customer_id;
      let customerExists = false;

      if (customerId) {
        const existingCustomer = await stripeRequest(`/customers/${customerId}`);
        customerExists = !existingCustomer.error;
      }

      if (!customerId || !customerExists) {
        const customer = await stripeRequest('/customers', 'POST', {
          email: user.email,
          name: user.full_name || '',
          'metadata[base44_user_id]': user.id,
        });
        if (customer.error) throw new Error(customer.error.message);
        customerId = customer.id;
        await base44.auth.updateMe({ stripe_customer_id: customerId });
      }

      // ── Vendor payout-readiness gate ──────────────────────────────────────────
      // Vendors must have a connected Stripe account with payouts enabled before
      // a destination charge can be created. We check this here so the buyer gets
      // a clear error rather than a cryptic Stripe failure.
      const vendorUsers = await base44.asServiceRole.entities.User.filter({ email: item.vendor_email });
      const vendor = vendorUsers[0];
      if (!vendor?.stripe_account_id) {
        return Response.json({ error: 'Vendor has not connected their Stripe account yet. Please try again later or contact the seller.' }, { status: 400 });
      }
      if (!vendor?.stripe_charges_enabled) {
        return Response.json({ error: 'Vendor Stripe account setup is incomplete. Please try again later or contact the seller.' }, { status: 400 });
      }

      const now = new Date().toISOString();

      // application_fee_amount = platform fee + auditor pool (cents)
      // Stripe routes (gross - application_fee_amount) directly to the vendor's connected account.
      const applicationFeeCents = Math.round((platformFee + auditorPool + influencerCommission) * 100);

      // Create transaction record (status=pending; stripeWebhook advances on payment_intent.succeeded)
      const transaction = await base44.asServiceRole.entities.Transaction.create({
        item_id:                   item.id,
        item_title:                item.title,
        vendor_email:              item.vendor_email,
        buyer_email:               user.email,
        sale_amount:               gross,
        shipping_amount:           item.shipping_cost || 0,
        handling_amount:           item.handling_fee || 0,
        payment_method:            'stripe',
        status:                    'pending',
        // Fee breakdown
        platform_fee_percentage:   PLATFORM_FEE_PCT * 100,
        platform_fee_amount:       platformFee,
        auditor_pool_contribution: auditorPool,
        influencer_id:             influencerId,
        influencer_commission:     influencerCommission,
        credits_used:              approvedCredits,
        credits_restored:          false,
        final_stripe_charge_amount: chargeAmount,
        vendor_net_amount:         vendorNet,
        // Shipping
        shipping_status:           'pending',
        shipping_details:          shippingDetails || null,
        shipping_address_status:   shippingDetails ? 'captured' : 'missing',
        shipping_address_updated_at: shippingDetails ? now : null,
        buyer_referral_code:       user.referred_by || null,
      });

      // ── Destination charge PaymentIntent ─────────────────────────────────────
      // Stripe automatically splits the charge: vendor receives (amount - application_fee_amount),
      // platform retains application_fee_amount. No manual transfer needed.
      const piParams = {
        amount:                             String(amountCents),
        currency:                           'usd',
        customer:                           customerId,
        'payment_method_types[0]':          'card',
        setup_future_usage:                 'off_session',
        'transfer_data[destination]':       vendor.stripe_account_id,
        application_fee_amount:             String(applicationFeeCents),
        capture_method:                     'manual',
        'metadata[itemId]':                 item.id,
        'metadata[transactionId]':          transaction.id,
        'metadata[buyer_email]':            user.email,
        'metadata[vendor_email]':           item.vendor_email,
        'metadata[credits_used]':           String(approvedCredits),
        'metadata[vendor_stripe_account]':  vendor.stripe_account_id,
        description:                        `Credabilia: ${item.title}`,
      };

      const pi = await stripeRequest('/payment_intents', 'POST', piParams);
      if (pi.error) throw new Error(`Stripe error: ${pi.error.message} (${pi.error.code})`);

      // Store PI id on transaction so webhook can find it by PI
      await base44.asServiceRole.entities.Transaction.update(transaction.id, {
        stripe_payment_intent_id: pi.id,
      });

      console.log(`✅ Destination charge PI created: pi=${pi.id}, txn=${transaction.id}, gross=$${gross}, charge=$${chargeAmount}, appFee=$${applicationFeeCents / 100}, vendorNet=$${vendorNet}, vendor=${vendor.stripe_account_id}`);

      return Response.json({
        clientSecret:        pi.client_secret,
        transactionId:       transaction.id,
        // Amounts for UI display
        gross,
        chargeAmount,
        creditDeduction,
        platformFee,
        auditorPool,
        stripeFee,
        vendorNet,
        influencerCommission,
        stripe_pi_id:        pi.id,
        stripe_status:       pi.status,
        // Legacy aliases (keep for frontend compat)
        itemTotal:           gross,
        platformFeeAmount:   platformFee,
      });
    }

    // ── CONFIRM PAYMENT ──────────────────────────────────────────────────────
    // Only captures the authorized PI. All post-payment side effects live in stripeWebhook.
    if (action === 'confirm_payment') {
      const { paymentIntentId, transactionId } = body;

      const pi = await stripeRequest(`/payment_intents/${paymentIntentId}`);
      if (pi.error) throw new Error(pi.error.message);

      if (pi.status === 'requires_capture') {
        const captured = await stripeRequest(`/payment_intents/${paymentIntentId}/capture`, 'POST', {});
        if (captured.error) throw new Error(captured.error.message);
        console.log(`✅ PaymentIntent captured: pi=${paymentIntentId}, txn=${transactionId}`);
      }

      return Response.json({ status: pi.status });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('❌ createStripeCheckout error:', error.message, { action: body?.action });
    return Response.json({ error: error.message }, { status: 500 });
  }
});