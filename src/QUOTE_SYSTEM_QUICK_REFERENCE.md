# Quote System - Quick Reference Card

## API Endpoints

### `sendQuote`
```javascript
const response = await base44.functions.invoke('sendQuote', {
  buyer_email: "buyer@example.com",
  conversation_id: "buyer@example.com",
  amount: 5000,  // cents
  description: "Custom frame",
  service_type: "frame_shop"  // optional
});
// Returns: { quote_id, amount, expires_at, message_id }
```

### `createQuotePaymentIntent`
```javascript
const response = await base44.functions.invoke('createQuotePaymentIntent', {
  quote_id: "quote_123"
});
// Returns: { clientSecret, transaction_id, amount, stripe_pi_id }
```

---

## Component Usage

### SendQuoteDialog
```jsx
<SendQuoteDialog
  open={showDialog}
  onClose={() => setShowDialog(false)}
  conversationEmail={email}
  conversationName="John Doe"
  onQuoteSent={(quote) => refetchQuotes()}
/>
```

### QuoteMessageCard
```jsx
<QuoteMessageCard
  quote={quote}
  isSender={isVendor}
  currentUserEmail={user.email}
  onPayClick={(quote) => setShowPaymentModal(true)}
/>
```

### QuotePaymentModal
```jsx
<QuotePaymentModal
  open={showModal}
  onClose={() => setShowModal(false)}
  quote={selectedQuote}
  onSuccess={(quoteId) => refetchQuotes()}
/>
```

---

## Database Schema

### Quote Record
```javascript
{
  id: "quote_123",
  buyer_email: "buyer@example.com",
  buyer_id: "user_456",
  vendor_email: "vendor@example.com",
  vendor_id: "user_789",
  conversation_id: "buyer@example.com",
  amount: 5000,  // cents
  description: "Custom wooden frame",
  status: "pending",  // pending | paid | expired | cancelled
  stripe_payment_intent_id: "pi_123abc",
  transaction_id: "txn_456def",
  expires_at: "2026-03-25T12:00:00Z",
  service_type: "frame_shop",  // frame_shop | artist_commission | custom_service | item_sale
  shipping_required: false,
  address_id: null,
  message_id: "msg_789ghi",
  created_date: "2026-03-23T12:00:00Z",
  updated_date: "2026-03-23T12:00:00Z"
}
```

---

## Webhook Handler

### Event: `payment_intent.succeeded`
```javascript
{
  type: "payment_intent.succeeded",
  data: {
    object: {
      id: "pi_123abc",
      status: "succeeded",
      client_secret: "pi_123abc_secret_xyz",
      latest_charge: "ch_123",
      metadata: {
        quote_id: "quote_123",
        transaction_id: "txn_456def",
        buyer_email: "buyer@example.com",
        vendor_email: "vendor@example.com",
        transfer_group: "QUOTE-quote_123-1234567890"
      }
    }
  }
}
```

**Webhook Actions:**
1. Update `Quote.status = 'paid'`
2. Update `Transaction.status = 'completed'`
3. Create Stripe transfer (idempotency key: `transfer-{transaction_id}`)
4. Deduct credits (if used)
5. Send notifications

---

## Status Lifecycle

### Quote Status
```
pending ─→ paid
   ├──→ expired (48h timeout)
   └──→ cancelled (vendor cancels)
```

### Transaction Status
```
escrow_held ─→ completed (webhook fires)
    ├──────→ cancelled (payment failed)
    └──────→ refunded (buyer refunds)
```

---

## Error Codes

| Code | Message | Solution |
|------|---------|----------|
| 403 | "Only vendors can send quotes" | Vendor must have `stripe_charges_enabled` |
| 403 | "Only the quote recipient can pay" | Buyer email must match quote.buyer_email |
| 400 | "Quote has expired" | Quote lifetime is 48 hours, contact vendor for new quote |
| 400 | "Quote is already paid" | Quote already paid, no further payment needed |
| 404 | "Quote not found" | Quote ID invalid or deleted |
| 404 | "Buyer not found" | Buyer email not registered in system |
| 500 | Stripe errors | Check Stripe Dashboard for payment failure reason |

---

## Testing Commands

### Send Quote
```javascript
await base44.functions.invoke('sendQuote', {
  buyer_email: "test@example.com",
  conversation_id: "test@example.com",
  amount: 4999,  // $49.99
  description: "Test custom frame"
});
```

### Create PaymentIntent
```javascript
await base44.functions.invoke('createQuotePaymentIntent', {
  quote_id: "PASTE_QUOTE_ID_HERE"
});
```

### Test Card Numbers
```
✅ Succeeds: 4242 4242 4242 4242
❌ Declines: 4000 0000 0000 0002
❌ Requires Auth: 4000 0025 0000 3155
```

---

## Common Flows

### Vendor Send Quote
1. Open Messages with buyer
2. Click "Send Quote"
3. Enter amount + description
4. Click "Send Quote"
5. Quote appears in thread

### Buyer Pay Quote
1. See quote in Messages
2. Click "Pay Now"
3. Modal opens with Stripe Payment Element
4. Enter card (or Apple/Google Pay)
5. Click "Pay"
6. See success message
7. Quote updates to "✅ Paid"

### Webhook Finalizes
1. Stripe calls webhook: `payment_intent.succeeded`
2. Webhook marks Quote → paid
3. Webhook marks Transaction → completed
4. Webhook creates vendor transfer
5. Both users get notifications

---

## File Locations

| File | Location | Type |
|------|----------|------|
| Quote Entity | `entities/Quote.json` | JSON Schema |
| Send Quote | `functions/sendQuote.ts` | Backend Function |
| Create PaymentIntent | `functions/createQuotePaymentIntent.ts` | Backend Function |
| Webhook | `functions/stripeWebhook.ts` | Backend Function (modified) |
| Send Dialog | `components/SendQuoteDialog.jsx` | React Component |
| Quote Card | `components/QuoteMessageCard.jsx` | React Component |
| Payment Modal | `components/QuotePaymentModal.jsx` | React Component |
| Messages Page | `pages/Messages.jsx` | React Page (modified) |

---

## Key Rules (CRITICAL!)

✅ **What Webhook MUST Do**
- ✅ Mark Quote as paid
- ✅ Mark Transaction as completed
- ✅ Create vendor transfer
- ✅ Deduct credits

❌ **What Frontend MUST NOT Do**
- ❌ Mark quote as paid
- ❌ Create vendor transfer
- ❌ Update transaction status
- ❌ Deduct credits

🔒 **Safety Features**
- ✅ Webhook signature verification
- ✅ Timestamp tolerance check
- ✅ Idempotency keys on all Stripe calls
- ✅ Database guards on state updates
- ✅ Permission validation on all operations

---

## Performance Metrics

| Operation | Time | Notes |
|-----------|------|-------|
| Send quote | ~500ms | DB create + message |
| Create PaymentIntent | ~800ms | Stripe API call |
| Stripe Payment | ~2s | Card processing |
| Webhook processing | ~1-2s | Mark paid + transfer |
| UI refresh | ~500ms | React Query refetch |
| **Total end-to-end** | ~6-7s | Full payment cycle |

---

## Monitoring

### Check Webhook Status
```
Stripe Dashboard → Webhooks → Recent Deliveries
Filter: payment_intent.succeeded
Status: 200 OK expected
```

### Check PaymentIntent
```
Stripe Dashboard → Payments → PaymentIntents
Status: succeeded expected
Metadata: quote_id, transaction_id should be present
```

### Check Transfer
```
Stripe Dashboard → Transfers
Look for transfer to vendor account
Status: succeeded or in_transit expected
Amount: sale_amount - fees - credits
```

### Database Check
```
Quote.status should be 'paid'
Transaction.status should be 'completed'
Transaction.stripe_transfer_id should be populated
```

---

## Support Tiers

### Tier 1: Documentation
- `QUOTE_SYSTEM_SUMMARY.md` — Overview
- `QUOTE_SYSTEM_GUIDE.md` — Full docs
- `QUOTE_SYSTEM_TEST.md` — Testing

### Tier 2: Debugging
- Check Stripe Dashboard webhooks
- Check app database records
- Check React Query devtools

### Tier 3: Code Review
- Backend: `functions/sendQuote.ts`, `functions/createQuotePaymentIntent.ts`, `functions/stripeWebhook.ts`
- Frontend: `components/QuoteMessageCard.jsx`, `components/QuotePaymentModal.jsx`, `components/SendQuoteDialog.jsx`

---

*Print this page for quick reference during development & testing*
*Last Updated: 2026-03-23*