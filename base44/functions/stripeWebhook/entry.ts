/**
 * stripeWebhook — SINGLE SOURCE OF TRUTH for Stripe purchase finalization.
 *
 * Canonical lifecycle (Transaction.status):
 *   pending → paid → escrow → shipped → delivered → completed → refunded | cancelled
 *
 * Stripe drives:  pending → paid (direct sale, PI succeeded)
 *                 pending → escrow (service/commission flow, PI succeeded)
 *                 pending → cancelled (PI failed)
 *                 paid|escrow|shipped|delivered → refunded (charge.refunded)
 * Shippo drives:  paid|escrow → shipped → delivered → completed  (via shippo webhook)
 *
 * CreditLedger is written here for every credit deduction/restoration so we
 * have a full audit trail without mutating the Credion Credits wallet (CouncilCredit) directly in multiple places.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');

// ── Stripe signature verification ────────────────────────────────────────────

async function verifyStripeSignature(rawBody, signature, secret) {
  const parts = {};
  signature.split(',').forEach(part => {
    const [k, v] = part.trim().split('=');
    if (k && v) parts[k.trim()] = v.trim();
  });

  const timestamp = parts['t'];
  const sigHex = parts['v1'];
  if (!timestamp || !sigHex) throw new Error('Malformed Stripe-Signature header');

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - parseInt(timestamp, 10)) > 300) throw new Error('Signature timestamp outside 5-minute window');

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const buf = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
  const computed = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (computed.length !== sigHex.length) throw new Error('Signature mismatch');
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ sigHex.charCodeAt(i);
  if (diff !== 0) throw new Error('Signature mismatch');
}

// ── Stripe REST helper ───────────────────────────────────────────────────────

function stripeRequest(path, method = 'GET', body = null) {
  const headers = {
    'Authorization': `Bearer ${STRIPE_KEY}`,
    'Stripe-Version': '2023-10-16',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const opts = { method, headers };
  if (body) opts.body = new URLSearchParams(body).toString();
  return fetch(`https://api.stripe.com/v1${path}`, opts).then(r => r.json());
}

// ── Inline vendor quality score (no require()) ───────────────────────────────

function calculateVendorQualityScore(vendor) {
  const sales = vendor.successful_sales || 0;
  const reliability = vendor.fulfillment_reliability || 100;
  const disputeRate = vendor.dispute_rate || 0;
  return Math.max(0, Math.min(100, Math.round(
    Math.min(sales / 50, 1) * 60 +
    (reliability / 100) * 30 -
    Math.min(disputeRate * 10, 10)
  )));
}

// ── Credit Ledger helper ─────────────────────────────────────────────────────
// Writes a CreditLedger entry AND updates the Credion Credits wallet (CouncilCredit) atomically.
// Returns the new balance.

async function applyCredits(base44, { userEmail, delta, source, transactionId = null, note = '', isReversal = false }) {
  const creditRecords = await base44.asServiceRole.entities.CouncilCredit.filter({ user_email: userEmail });
  const record = creditRecords[0] || null;
  const currentBalance = record ? (record.credits_balance || 0) : 0;
  const newBalance = Math.max(0, currentBalance + delta);

  // Update Credion Credits wallet balance
  if (record) {
    const updatePayload = { credits_balance: newBalance };
    if (delta < 0) {
      updatePayload.credits_redeemed = (record.credits_redeemed || 0) + Math.abs(delta);
    }
    await base44.asServiceRole.entities.CouncilCredit.update(record.id, updatePayload);
  }

  // Always write ledger entry for audit trail
  await base44.asServiceRole.entities.CreditLedger.create({
    user_email: userEmail,
    transaction_id: transactionId || null,
    amount: delta,
    balance_after: newBalance,
    source,
    is_reversal: isReversal,
    note: note || (delta < 0 ? `Deducted ${Math.abs(delta)} credits` : `Added ${delta} credits`),
  }).catch(e => console.warn('[applyCredits] Ledger write failed:', e.message));

  console.log(`💳 Credits: ${delta > 0 ? '+' : ''}${delta} → balance=${newBalance} (${userEmail}) [${source}]`);
  return newBalance;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event;
  try {
    if (!signature) return new Response('Signature required', { status: 400 });
    await verifyStripeSignature(rawBody, signature, WEBHOOK_SECRET);
    event = JSON.parse(rawBody);
    console.log(`✅ Webhook verified: ${event.type}`);
  } catch (err) {
    console.error('❌ Webhook signature failed:', err.message);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {

      // ── PAYMENT SUCCEEDED ──────────────────────────────────────────────────
      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        const { transactionId, itemId, quoteId, framingRequestId, commissionRequestId } = pi.metadata || {};

        console.log(`📋 payment_intent.succeeded: pi=${pi.id} txn=${transactionId}`);

        if (!transactionId) { console.log('⚠️ No transactionId in metadata — skipping'); break; }

        const txns = await base44.asServiceRole.entities.Transaction.filter({ id: transactionId });
        if (!txns.length) throw new Error(`Transaction ${transactionId} not found`);
        const txn = txns[0];

        // Idempotency guard
        if (txn.status !== 'pending') {
          console.log(`✅ Transaction ${transactionId} already at status="${txn.status}" — skipping`);
          break;
        }

        const now = new Date().toISOString();
        const isEscrowFlow = !!(framingRequestId || commissionRequestId);

        // 1. Advance transaction: escrow flows → 'escrow', direct sales → 'paid'
        const nextStatus = isEscrowFlow ? 'escrow' : 'paid';
        await base44.asServiceRole.entities.Transaction.update(transactionId, {
          status: nextStatus,
          stripe_payment_intent_id: pi.id,
          stripe_charge_id: pi.latest_charge,
        });
        console.log(`✅ Transaction ${transactionId} → ${nextStatus}`);

        // 2. Mark item sold (direct item sales only)
        if (itemId && !isEscrowFlow) {
          await base44.asServiceRole.entities.Item.update(itemId, {
            status: 'sold',
            buyer_email: txn.buyer_email,
          });

          const vendorUsers = await base44.asServiceRole.entities.User.filter({ email: txn.vendor_email });
          if (vendorUsers.length > 0) {
            const vendor = vendorUsers[0];
            const successfulSales = (vendor.successful_sales || 0) + 1;
            await base44.asServiceRole.entities.User.update(vendor.id, {
              successful_sales: successfulSales,
              vendor_total_sales: (vendor.vendor_total_sales || 0) + 1,
              vendor_quality_score: calculateVendorQualityScore({ ...vendor, successful_sales: successfulSales }),
            });
            console.log(`📈 Vendor ${txn.vendor_email} reputation updated`);
          }
        }

        // 3. Deduct credits via ledger
        if (txn.credits_used > 0) {
          await applyCredits(base44, {
            userEmail: txn.buyer_email,
            delta: -txn.credits_used,
            source: 'purchase_deduction',
            transactionId,
            note: `Credits applied to purchase: ${txn.item_title || transactionId}`,
          });
        }

        // 4. Sync escrow-flow related entities
        if (quoteId) {
          await base44.asServiceRole.entities.Quote.update(quoteId, { status: 'paid', paid_at: now });
        }
        if (framingRequestId) {
          await base44.asServiceRole.entities.FramingRequest.update(framingRequestId, {
            payment_status: 'escrow',
            status: 'in_progress',
            escrow_transaction_id: transactionId,
          });
        }
        if (commissionRequestId) {
          await base44.asServiceRole.entities.CommissionRequest.update(commissionRequestId, {
            payment_status: 'escrow',
            status: 'in_progress',
            escrow_transaction_id: transactionId,
          });
        }

        // 5. Vendor payout — direct item sales only
        // vendor_net_amount is pre-computed at transaction creation:
        //   gross − platformFee(12%) − auditorPool(1%) − influencerCommission
        // Stripe fee is absorbed by the platform share, NOT deducted from vendor net.
        if (!isEscrowFlow) {
          const vendors = await base44.asServiceRole.entities.User.filter({ email: txn.vendor_email });
          const vendor = vendors[0];
          if (vendor?.stripe_account_id && vendor?.stripe_charges_enabled && !txn.stripe_transfer_id) {
            // Use the pre-computed vendor_net_amount; fall back to recalculation if missing
            const vendorNet = txn.vendor_net_amount
              ? txn.vendor_net_amount
              : (txn.sale_amount || 0) - (txn.platform_fee_amount || 0) - (txn.auditor_pool_contribution || txn.council_pool_contribution || 0) - (txn.influencer_commission || 0);
            const vendorNetCents = Math.round(vendorNet * 100);
            if (vendorNetCents > 0) {
              const transfer = await stripeRequest('/transfers', 'POST', {
                amount:                    String(vendorNetCents),
                currency:                  'usd',
                destination:               vendor.stripe_account_id,
                transfer_group:            txn.transfer_group || '',
                'metadata[transactionId]': transactionId,
              });
              if (transfer.error) throw new Error(`Transfer failed: ${transfer.error.message}`);
              await base44.asServiceRole.entities.Transaction.update(transactionId, {
                stripe_transfer_id: transfer.id,
                vendor_net_amount:  vendorNetCents / 100,
              });
              console.log(`💸 Transfer ${transfer.id} ($${(vendorNetCents / 100).toFixed(2)}) → vendor ${txn.vendor_email}`);
            }
          }
        }

        // 6. Notifications
        await Promise.all([
          base44.asServiceRole.entities.Notification.create({
            user_email: txn.vendor_email,
            type: 'item_sold',
            title: 'Sale Confirmed 🎉',
            message: `"${txn.item_title}" sold for $${(txn.sale_amount || 0).toFixed(2)} — please ship promptly.`,
            read: false,
            related_item_id: txn.item_id,
          }),
          base44.asServiceRole.entities.Notification.create({
            user_email: txn.buyer_email,
            type: 'payment_confirmed',
            title: '✅ Payment Confirmed',
            message: `Payment confirmed for "${txn.item_title}". Your payment is secured until delivery.`,
            read: false,
            related_item_id: txn.item_id,
            link_url: '/MyCollection',
          }),
        ]);

        console.log(`✅ payment_intent.succeeded fully processed: txn=${transactionId}`);
        break;
      }

      // ── PAYMENT FAILED ─────────────────────────────────────────────────────
      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        const { transactionId } = pi.metadata || {};
        console.log(`❌ payment_intent.payment_failed: pi=${pi.id} txn=${transactionId}`);
        if (transactionId) {
          await base44.asServiceRole.entities.Transaction.update(transactionId, { status: 'cancelled' });
        }
        break;
      }

      // ── CHARGE REFUNDED ────────────────────────────────────────────────────
      case 'charge.refunded': {
        const charge = event.data.object;
        console.log(`🔄 charge.refunded: charge=${charge.id} pi=${charge.payment_intent}`);

        const txns = await base44.asServiceRole.entities.Transaction.filter({
          stripe_payment_intent_id: charge.payment_intent,
        });
        if (!txns.length) { console.warn('No transaction found for refunded charge'); break; }
        const txn = txns[0];

        // Idempotency guard
        if (txn.status === 'refunded') { console.log('Already refunded — skipping'); break; }

        const now = new Date().toISOString();

        // 1. Mark transaction refunded
        await base44.asServiceRole.entities.Transaction.update(txn.id, {
          status: 'refunded',
          refunded_at: now,
        });

        // 2. Restore item to active
        if (txn.item_id) {
          await base44.asServiceRole.entities.Item.update(txn.item_id, {
            status: 'active',
            buyer_email: null,
          });
          console.log(`🔁 Item ${txn.item_id} restored to active`);
        }

        // 3. Restore credits via ledger (idempotent: check credits_restored flag)
        if (txn.credits_used > 0 && !txn.credits_restored) {
          await applyCredits(base44, {
            userEmail: txn.buyer_email,
            delta: +txn.credits_used,
            source: 'purchase_refund',
            transactionId: txn.id,
            note: `Credits restored for refunded purchase: ${txn.item_title || txn.id}`,
            isReversal: true,
          });
          await base44.asServiceRole.entities.Transaction.update(txn.id, { credits_restored: true });
        }

        // 4. Flag referral commission as reversed
        if (txn.influencer_id && !txn.referral_commission_reversed) {
          await base44.asServiceRole.entities.Transaction.update(txn.id, { referral_commission_reversed: true });
          await base44.asServiceRole.entities.ReferralAttribution.create({
            referrer_id: txn.influencer_id,
            referred_email: txn.buyer_email,
            referral_code: txn.buyer_referral_code || '',
            event_type: 'purchase',
            transaction_id: txn.id,
            commission_amount: -Math.round((txn.influencer_commission || 0) * 100),
            timestamp: now,
            referrer_email: '',
          }).catch(e => console.warn('Referral reversal log failed:', e.message));
          console.log(`🔁 Referral commission reversed for txn ${txn.id}`);
        }

        // 5. Roll back vendor sale count
        if (txn.vendor_email) {
          const vendorUsers = await base44.asServiceRole.entities.User.filter({ email: txn.vendor_email });
          if (vendorUsers.length > 0) {
            const vendor = vendorUsers[0];
            await base44.asServiceRole.entities.User.update(vendor.id, {
              successful_sales: Math.max(0, (vendor.successful_sales || 0) - 1),
              vendor_total_sales: Math.max(0, (vendor.vendor_total_sales || 0) - 1),
            });
            console.log(`📉 Vendor ${txn.vendor_email} sale count rolled back`);
          }
        }

        // 6. Sync escrow-flow statuses
        if (txn.framing_request_id) {
          await base44.asServiceRole.entities.FramingRequest.update(txn.framing_request_id, {
            payment_status: 'refunded',
          }).catch(() => {});
        }
        if (txn.commission_request_id) {
          await base44.asServiceRole.entities.CommissionRequest.update(txn.commission_request_id, {
            payment_status: 'refunded',
          }).catch(() => {});
        }
        if (txn.quote_id) {
          await base44.asServiceRole.entities.Quote.update(txn.quote_id, {
            status: 'refunded',
          }).catch(() => {});
        }

        // 7. Notify buyer
        await base44.asServiceRole.entities.Notification.create({
          user_email: txn.buyer_email,
          type: 'refund_issued',
          title: '💸 Refund Issued',
          message: `Refund issued for "${txn.item_title}" — your payment has been returned${txn.credits_used > 0 ? ' and your Credion Credits have been restored' : ''}.`,
          read: false,
          related_item_id: txn.item_id,
        }).catch(() => {});

        console.log(`✅ charge.refunded fully processed: txn=${txn.id}`);
        break;
      }

      // ── STRIPE CONNECT ACCOUNT UPDATED ────────────────────────────────────
      case 'account.updated': {
        const account = event.data.object;
        const users = await base44.asServiceRole.entities.User.filter({ stripe_account_id: account.id });
        if (users.length > 0) {
          await base44.asServiceRole.entities.User.update(users[0].id, {
            stripe_charges_enabled: account.charges_enabled,
            stripe_payouts_enabled: account.payouts_enabled,
            stripe_details_submitted: account.details_submitted,
          });
        }
        break;
      }

      default:
        console.log(`⚠️ Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error(`❌ Error handling ${event.type}:`, err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }

  return Response.json({ received: true });
});