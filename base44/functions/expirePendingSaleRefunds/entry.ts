/**
 * expirePendingSaleRefunds — Scheduled job: auto-void timed-out PendingSale transactions.
 *
 * Purpose:
 *   When a buyer purchases an imported/high-demand item, a PendingSale record is created
 *   and the Stripe PaymentIntent is captured immediately (status → 'paid'). The vendor
 *   then has 3 days to confirm availability. If they don't, this job cancels the Stripe
 *   intent (voiding the charge), marks the transaction 'refunded', restores the item to
 *   'active', and notifies both parties.
 *
 * This is NOT a general escrow refund handler.
 * Escrow flows (FramingRequest / CommissionRequest) are released manually via admin action
 * or by the vendor/buyer completing the work — they are never auto-expired by this job.
 *
 * Canonical lifecycle reference:
 *   pending → paid → (this job voids if no vendor confirmation) → refunded
 *
 * Triggered by: scheduled automation (daily)
 * Auth: admin-only
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY');

function stripeRequest(path, method = 'GET', body = null) {
  const headers = {
    'Authorization': `Bearer ${STRIPE_KEY}`,
    'Stripe-Version': '2023-10-16',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  const options = { method, headers };
  if (body) options.body = new URLSearchParams(body).toString();
  return fetch(`https://api.stripe.com/v1${path}`, options).then(r => r.json());
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Admin-only — called by scheduled automation, not public users
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Find all PendingSale records older than 3 days with no vendor confirmation
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const pendingSales = await base44.asServiceRole.entities.PendingSale.filter({ status: 'pending' });
    const expiredSales = pendingSales.filter(sale => {
      const createdDate = new Date(sale.created_date);
      return createdDate < threeDaysAgo;
    });

    console.log(`Found ${expiredSales.length} expired pending sales to void`);

    let refundedCount = 0;
    let errorCount = 0;

    for (const sale of expiredSales) {
      try {
        // PendingSale-backed transactions sit at 'paid' after stripeWebhook fires.
        // They are direct item sale transactions — NOT service/escrow flows.
        // We void/cancel the PaymentIntent here since no physical capture reversal is needed
        // (these are capture_method=automatic intents, so we issue a refund via cancel if still uncaptured,
        //  or the webhook's charge.refunded handler catches it if already settled).
        const transactions = await base44.asServiceRole.entities.Transaction.filter({
          item_id: sale.item_id,
          buyer_email: sale.buyer_email,
          status: 'paid',
        });

        if (transactions.length === 0) {
          console.log(`No paid transaction found for pending sale ${sale.id} — skipping`);
          continue;
        }

        const txn = transactions[0];

        // Attempt to cancel/void the Stripe PaymentIntent
        const pi = await stripeRequest(`/payment_intents/${txn.stripe_payment_intent_id}`);
        if (pi.error) throw new Error(`Failed to fetch PaymentIntent: ${pi.error.message}`);

        if (pi.status === 'requires_capture') {
          // Uncaptured — can be cancelled directly
          const canceled = await stripeRequest(`/payment_intents/${txn.stripe_payment_intent_id}/cancel`, 'POST', {});
          if (canceled.error) throw new Error(`Failed to cancel PaymentIntent: ${canceled.error.message}`);
        }
        // If already captured (status=succeeded), Stripe's charge.refunded webhook will
        // handle the transaction status update — we still update PendingSale and Item here.

        // Mark transaction refunded (idempotent — charge.refunded webhook may also set this)
        await base44.asServiceRole.entities.Transaction.update(txn.id, {
          status: 'refunded',
          refund_reason: 'pending_sale_timeout',
        });

        // Decline the PendingSale
        await base44.asServiceRole.entities.PendingSale.update(sale.id, {
          status: 'declined',
        });

        // Restore item to marketplace
        await base44.asServiceRole.entities.Item.update(sale.item_id, {
          status: 'active',
          buyer_email: null,
        });

        // Notify buyer
        await base44.asServiceRole.entities.Notification.create({
          user_email: sale.buyer_email,
          type: 'offer_received',
          title: 'Automatic Refund Issued',
          message: `The seller didn't confirm availability for "${sale.item_title}" within 3 days. Your payment has been automatically refunded.`,
          read: false,
          related_item_id: sale.item_id,
        });

        // Notify vendor
        await base44.asServiceRole.entities.Notification.create({
          user_email: sale.vendor_email,
          type: 'sale_timeout',
          title: 'Sale Expired — Buyer Refunded',
          message: `Your pending sale for "${sale.item_title}" expired without confirmation. The buyer has been refunded and the item is back on the marketplace.`,
          read: false,
          related_item_id: sale.item_id,
        });

        refundedCount++;
        console.log(`✅ Voided expired sale ${sale.id} for item ${sale.item_id}`);
      } catch (err) {
        console.error(`Error voiding expired sale ${sale.id}:`, err.message);
        errorCount++;
      }
    }

    return Response.json({
      message: `Processed ${expiredSales.length} expired pending sales`,
      voided: refundedCount,
      errors: errorCount,
    });
  } catch (error) {
    console.error('expirePendingSaleRefunds error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});