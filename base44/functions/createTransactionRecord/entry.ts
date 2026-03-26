/**
 * createTransactionRecord — Credit-only purchase path.
 *
 * Used ONLY when chargeAmount === 0 (entire payment covered by Credion Credits).
 * Stripe-based purchases go through createStripeCheckout + stripeWebhook.
 *
 * Fee model (identical to Stripe path — platform always takes 12%):
 *   - Platform fee   = gross × 12%
 *   - Auditor pool   = gross × 1%
 *   - Stripe fee     = $0.00  (no Stripe charge on credit-only purchases)
 *   - Vendor net     = gross − platformFee − auditorPool − influencerCommission
 *
 * Status: 'paid' immediately (no Stripe PI, no async webhook needed).
 * Vendor still ships; Shippo webhook advances to shipped/delivered/completed.
 *
 * CreditLedger written for every deduction — full audit trail.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const PLATFORM_FEE_PCT  = 0.12;
const AUDITOR_POOL_PCT  = 0.01;

function calcFees(gross, influencerCommission = 0) {
  const platformFee  = Math.round(gross * PLATFORM_FEE_PCT * 100) / 100;
  const auditorPool  = Math.round(gross * AUDITOR_POOL_PCT * 100) / 100;
  const stripeFee    = 0; // no Stripe charge on credit-only purchases
  const vendorNet    = Math.round((gross - platformFee - auditorPool - influencerCommission) * 100) / 100;
  return { platformFee, auditorPool, stripeFee, vendorNet };
}

async function applyCredits(base44, { userEmail, delta, source, transactionId = null, note = '', isReversal = false }) {
  // CouncilCredit is the Credion Credits wallet — entity table name is kept for backward compat
  const creditRecords = await base44.asServiceRole.entities.CouncilCredit.filter({ user_email: userEmail });
  const record = creditRecords[0] || null;
  const currentBalance = record ? (record.credits_balance || 0) : 0;
  const newBalance = Math.max(0, currentBalance + delta);

  if (record) {
    const updatePayload = { credits_balance: newBalance };
    if (delta < 0) {
      updatePayload.credits_redeemed = (record.credits_redeemed || 0) + Math.abs(delta);
    }
    await base44.asServiceRole.entities.CouncilCredit.update(record.id, updatePayload);
  }

  await base44.asServiceRole.entities.CreditLedger.create({
    user_email:     userEmail,
    transaction_id: transactionId || null,
    amount:         delta,
    balance_after:  newBalance,
    source,
    is_reversal:    isReversal,
    note:           note || (delta < 0 ? `Deducted ${Math.abs(delta)} credits` : `Added ${delta} credits`),
  }).catch(e => console.warn('[applyCredits] Ledger write failed:', e.message));

  console.log(`💳 Credits: ${delta > 0 ? '+' : ''}${delta} → balance=${newBalance} (${userEmail}) [${source}]`);
  return newBalance;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { itemId, creditsToUse = 0, shippingDetails = null } = await req.json();
    if (!itemId) return Response.json({ error: 'itemId is required' }, { status: 400 });

    const items = await base44.asServiceRole.entities.Item.filter({ id: itemId });
    if (!items.length) return Response.json({ error: 'Item not found' }, { status: 404 });
    const item = items[0];
    if (item.status === 'sold') return Response.json({ error: 'Item already sold' }, { status: 400 });

    // Gross = full item price + shipping + handling
    const gross = Math.round(((item.price || 0) + (item.shipping_cost || 0) + (item.handling_fee || 0)) * 100) / 100;

    // Validate Credion Credits — must cover 100% of the gross amount
    const creditRecords = await base44.asServiceRole.entities.CouncilCredit.filter({ user_email: user.email });
    const balance = creditRecords.length > 0 ? (creditRecords[0].credits_balance || 0) : 0;
    const approvedCredits = Math.min(creditsToUse, balance, Math.round(gross * 100));
    const creditDeduction = approvedCredits / 100;

    if (creditDeduction < gross) {
      return Response.json({ error: 'Insufficient credits for credit-only purchase' }, { status: 400 });
    }

    // Influencer commission
    let influencerCommission = 0;
    let influencerId = null;
    if (user.referred_by) {
      const influencers = await base44.asServiceRole.entities.Influencer.filter({ referral_code: user.referred_by, status: 'active' });
      if (influencers.length > 0) {
        const inf        = influencers[0];
        influencerCommission = Math.round(gross * (inf.commission_rate || 0.005) * 100) / 100;
        influencerId     = inf.id;
      }
    }

    const { platformFee, auditorPool, stripeFee, vendorNet } = calcFees(gross, influencerCommission);
    const now = new Date().toISOString();

    // Create transaction with status='paid' — no Stripe PI, so we set immediately
    const transaction = await base44.asServiceRole.entities.Transaction.create({
      item_id:                   item.id,
      item_title:                item.title,
      vendor_email:              item.vendor_email,
      buyer_email:               user.email,
      buyer_referral_code:       user.referred_by || null,
      sale_amount:               gross,
      shipping_amount:           item.shipping_cost || 0,
      handling_amount:           item.handling_fee || 0,
      payment_method:            'credits',
      status:                    'paid',
      // Fee breakdown
      platform_fee_percentage:   PLATFORM_FEE_PCT * 100,
      platform_fee_amount:       platformFee,
      auditor_pool_contribution: auditorPool,
      influencer_id:             influencerId,
      influencer_commission:     influencerCommission,
      // Credits
      credits_used:              approvedCredits,
      credits_restored:          false,
      final_stripe_charge_amount: 0,  // no Stripe charge
      // Vendor
      vendor_net_amount:         vendorNet,
      // Shipping
      shipping_status:           'pending',
      shipping_details:          shippingDetails || null,
      shipping_address_status:   shippingDetails ? 'captured' : 'missing',
      shipping_address_updated_at: shippingDetails ? now : null,
    });

    // Deduct credits via ledger (authoritative write)
    await applyCredits(base44, {
      userEmail:     user.email,
      delta:         -approvedCredits,
      source:        'purchase_deduction',
      transactionId: transaction.id,
      note:          `Credits applied to purchase: ${item.title}`,
    });

    // Mark item sold
    await base44.asServiceRole.entities.Item.update(item.id, {
      status:      'sold',
      buyer_email: user.email,
    });

    // Update vendor stats
    const vendorUsers = await base44.asServiceRole.entities.User.filter({ email: item.vendor_email });
    if (vendorUsers.length > 0) {
      const vendor = vendorUsers[0];
      await base44.asServiceRole.entities.User.update(vendor.id, {
        successful_sales:  (vendor.successful_sales || 0) + 1,
        vendor_total_sales: (vendor.vendor_total_sales || 0) + 1,
      });
    }

    // Referral attribution
    if (influencerId && user.referred_by) {
      const influencerRecords = await base44.asServiceRole.entities.Influencer.filter({ id: influencerId });
      await base44.asServiceRole.entities.ReferralAttribution.create({
        referrer_id:       influencerId,
        referrer_email:    influencerRecords[0]?.user_email || '',
        referred_email:    user.email,
        referral_code:     user.referred_by,
        event_type:        'purchase',
        transaction_id:    transaction.id,
        commission_amount: Math.round(influencerCommission * 100),
        timestamp:         now,
      }).catch(err => console.warn('Referral attribution failed:', err.message));
    }

    // Notifications
    await Promise.all([
      base44.asServiceRole.entities.Notification.create({
        user_email:      user.email,
        type:            'payment_confirmed',
        title:           '✅ Payment Confirmed',
        message:         `Payment confirmed for "${item.title}". Your payment is secured until delivery.`,
        link_url:        '/MyCollection',
        related_item_id: item.id,
      }),
      base44.asServiceRole.entities.Notification.create({
        user_email:      item.vendor_email,
        type:            'item_sold',
        title:           'Sale Confirmed 🎉',
        message:         `"${item.title}" sold for $${gross.toFixed(2)} (paid with Credion Credits) — please ship promptly.`,
        related_item_id: item.id,
      }),
    ]);

    console.log(`✅ Credit-only purchase complete: txn=${transaction.id}, gross=$${gross}, platformFee=$${platformFee}, auditorPool=$${auditorPool}, vendorNet=$${vendorNet}, credits=${approvedCredits}`);

    return Response.json({ id: transaction.id, status: 'paid' });
  } catch (error) {
    console.error('createTransactionRecord error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});