# DM-Based Quote + Payment System Implementation Guide

## Overview

A complete quote and payment system built into the Messages (DM) feature, using Stripe PaymentIntents and Stripe Elements for secure payment processing. The system follows the **webhook-as-source-of-truth** pattern for all payment finalization.

---

## Architecture

### Data Flow

```
1. Vendor sends quote in DM
   └─ sendQuote.ts creates Quote record
   └─ Displays as QuoteMessageCard in conversation

2. Buyer clicks "Pay Now"
   └─ createQuotePaymentIntent.ts creates Transaction + PaymentIntent
   └─ Returns clientSecret to QuotePaymentModal

3. Stripe Elements modal opens
   └─ Buyer enters card details
   └─ Clicks "Pay"

4. Stripe.confirmPayment() submits to Stripe
   └─ Returns control to frontend (frontend does NOT finalize state)

5. Stripe webhook fires: payment_intent.succeeded
   └─ stripeWebhook.ts marks Quote status='paid'
   └─ Marks Transaction status='completed'
   └─ Creates vendor transfer
   └─ Deducts credits
   └─ Sends notifications

6. Messages page updates via React Query refetch
   └─ Quote card shows "✅ Paid"
```

### Files Created/Modified

| File | Type | Purpose |
|------|------|---------|
| `entities/Quote.json` | Entity | New Quote data model |
| `functions/sendQuote.ts` | Function | Create quote + message in DM |
| `functions/createQuotePaymentIntent.ts` | Function | Create PaymentIntent for quote payment |
| `components/SendQuoteDialog.jsx` | Component | Dialog to send quotes |
| `components/QuoteMessageCard.jsx` | Component | Display quote in DM with Pay button |
| `components/QuotePaymentModal.jsx` | Component | Stripe Elements payment modal |
| `pages/Messages.jsx` | Modified | Integrated quote system into DMs |
| `functions/stripeWebhook.ts` | Modified | Added quote payment finalization |

---

## Quote Entity Schema

```json
{
  "buyer_email": "string (required)",
  "buyer_id": "string",
  "vendor_email": "string (required)",
  "vendor_id": "string",
  "conversation_id": "string (required)",
  "amount": "number in cents, e.g., 5000 = $50.00 (required)",
  "description": "string (required)",
  "status": "enum: pending | paid | expired | cancelled",
  "stripe_payment_intent_id": "string",
  "transaction_id": "string (relation to Transaction)",
  "expires_at": "datetime (default: 48 hours from creation)",
  "service_type": "enum: frame_shop | artist_commission | custom_service | item_sale",
  "shipping_required": "boolean",
  "address_id": "string (optional)",
  "message_id": "string (optional)"
}
```

---

## Backend Functions

### 1. sendQuote.ts

**Purpose:** Vendor sends a quote to a buyer in a DM thread.

**Endpoint:** `POST /functions/sendQuote`

**Input:**
```javascript
{
  buyer_email: "buyer@example.com",          // Required
  conversation_id: "buyer@example.com",      // Required (email-based ID)
  amount: 5000,                              // Required (cents: 5000 = $50.00)
  description: "Custom frame service",       // Required
  service_type: "frame_shop",                // Optional: frame_shop | artist_commission | custom_service | item_sale
  shipping_required: false,                  // Optional
  address_id: "addr_123"                     // Optional
}
```

**Output:**
```javascript
{
  quote_id: "quote_abc123",
  amount: 5000,
  description: "Custom frame service",
  expires_at: "2026-03-25T12:00:00Z",
  buyer_email: "buyer@example.com",
  vendor_email: "vendor@example.com",
  message_id: "msg_xyz"
}
```

**Business Logic:**
- Validates sender is vendor (has `stripe_charges_enabled` or `user_type` in ['picture_frame_shop', 'artist'])
- Creates Quote record with 48-hour expiration
- Creates accompanying Message record for display in conversation
- Prevents duplicate customer creation via idempotency key

---

### 2. createQuotePaymentIntent.ts

**Purpose:** Create Stripe PaymentIntent when buyer clicks "Pay Now"

**Endpoint:** `POST /functions/createQuotePaymentIntent`

**Input:**
```javascript
{
  quote_id: "quote_abc123"  // Required
}
```

**Output:**
```javascript
{
  clientSecret: "pi_xxx_secret_yyy",
  quote_id: "quote_abc123",
  transaction_id: "txn_123",
  amount: 50.00,
  description: "Custom frame service",
  vendor_email: "vendor@example.com",
  stripe_pi_id: "pi_xxx"
}
```

**Business Logic:**
- Validates buyer is current user
- Validates quote status = 'pending' and not expired
- Creates Transaction record in 'escrow_held' status (only webhook can finalize)
- Creates Stripe PaymentIntent with `capture_method: 'manual'`
  - Idempotency key: `pi-{quote_id}` prevents duplicate PaymentIntents on retry
  - Metadata includes quote_id, transaction_id, vendor/buyer emails
- Stores PaymentIntent ID on both Quote and Transaction
- Returns `clientSecret` for frontend

**CRITICAL:** This function does NOT finalize payment state. The frontend will submit to Stripe, and the webhook handles all state changes.

---

## Frontend Components

### 1. SendQuoteDialog

**Trigger:** Vendor clicks "Send Quote" button in DM

**Features:**
- Input fields: Amount (USD), Description, Service Type (dropdown)
- Validation: Amount > 0, description not empty
- Calls `sendQuote` function
- Shows success/error states

**Usage:**
```jsx
<SendQuoteDialog
  open={open}
  onClose={() => setOpen(false)}
  conversationEmail="buyer@example.com"
  conversationName="John Doe"
  onQuoteSent={(quote) => {
    // Quote was sent, refresh quotes list
    refetchQuotes();
  }}
/>
```

---

### 2. QuoteMessageCard

**Trigger:** Quote displayed in DM thread (auto-rendered from conversationQuotes)

**Displays:**
- Amount (large bold text)
- Description
- Status badge (Pending/Paid/Expired/Cancelled)
- Vendor name
- Expiration countdown (if pending)
- "Pay Now" button (for buyers, if pending & not expired)

**Status Styling:**
- **Pending:** Yellow badge, "Pay Now" button visible
- **Paid:** Green badge, "✅ Payment Received"
- **Expired:** Gray badge, no action possible
- **Cancelled:** Red badge, no action possible

**Usage:**
```jsx
<QuoteMessageCard
  quote={quote}
  isSender={isVendor}
  currentUserEmail={user.email}
  onPayClick={(quote) => {
    setSelectedQuote(quote);
    setShowPaymentModal(true);
  }}
/>
```

---

### 3. QuotePaymentModal

**Trigger:** Buyer clicks "Pay Now" on QuoteMessageCard

**Features:**
- Calls `createQuotePaymentIntent` to get clientSecret
- Loads Stripe PaymentElement (supports cards, Apple Pay, Google Pay)
- Shows quote amount and description
- On submit: calls `stripe.confirmPayment()` and redirects
- **Does NOT finalize payment** — webhook handles state

**Payment Element Features:**
- Saves payment method for future use
- Accepts cards, Apple Pay, Google Pay
- Auto-detects payment method
- Full error handling and validation

**Error States:**
- Missing quote
- Quote already paid/expired
- Stripe errors (decline, validation, etc.)
- Network errors

**Success State:**
- Shows "Payment Successful" message
- Auto-closes after 2 seconds
- Triggers `onSuccess` callback

**Usage:**
```jsx
<QuotePaymentModal
  open={open}
  onClose={() => setOpen(false)}
  quote={selectedQuote}
  onSuccess={(quoteId) => {
    // Webhook will finalize state
    // Just refresh local data
    refetchQuotes();
  }}
/>
```

---

## Stripe Webhook Integration

### Event: `payment_intent.succeeded`

**Metadata Check:**
```javascript
const { quote_id, transaction_id, buyer_email, vendor_email, transfer_group } = pi.metadata;
```

**Idempotency Guards:**
1. Check `transaction.status === 'completed'` — skip if already finalized
2. Check `transaction.stripe_transfer_id` — skip if transfer already created

**Actions (in order):**
1. Mark Transaction `status = 'completed'`
2. Mark Quote `status = 'paid'`
3. Create vendor transfer with idempotency key `transfer-{transaction_id}`
4. Deduct credits (if used)
5. Send notifications to buyer and vendor

**Code:**
```typescript
if (quoteId) {
  const quotes = await base44.asServiceRole.entities.Quote.filter({ id: quoteId });
  if (quotes.length > 0 && quotes[0].status !== 'paid') {
    await base44.asServiceRole.entities.Quote.update(quoteId, { status: 'paid' });
  }
}
```

---

## Integration with Messages Page

### Message Display

Messages are merged with Quotes and sorted by timestamp:

```jsx
[
  ...messages.map(m => ({ ...m, type: 'message' })),
  ...quotes.map(q => ({ ...q, type: 'quote-dm' }))
].sort((a, b) => new Date(a.created_date) - new Date(b.created_date))
```

### Action Buttons

**For Vendors:**
- "Send Quote" button (always visible if vendor)
- Quote card shows vendor sent it

**For Buyers:**
- Quote card shows "Pay Now" if pending and not expired
- After payment: shows "✅ Payment Received"

### Real-time Updates

After quote is sent or paid:
```javascript
refetchQuotes(); // Refresh quotes from Query
queryClient.invalidateQueries({ queryKey: ['user-messages'] }); // Refresh messages
```

---

## Payment Flow Walkthrough

### Step 1: Vendor Sends Quote
```
1. Vendor clicks "Send Quote" button in DM
2. Dialog opens with form
3. Enters amount: $49.99, description: "Custom matted frame"
4. Clicks "Send Quote"
5. sendQuote.ts creates Quote record
6. QuoteMessageCard displays in DM with "Pay Now" button
```

### Step 2: Buyer Initiates Payment
```
1. Buyer sees quote in DM
2. Clicks "Pay Now"
3. QuotePaymentModal opens
4. createQuotePaymentIntent is called
   - Creates Transaction (pending)
   - Creates Stripe PaymentIntent with metadata
   - Returns clientSecret
5. Stripe PaymentElement loads with card form
```

### Step 3: Buyer Pays
```
1. Buyer enters card details (or uses Apple Pay/Google Pay)
2. Clicks "Pay $49.99"
3. stripe.confirmPayment() submits to Stripe
4. Stripe processes payment
5. Modal shows "Payment Successful"
6. Frontend returns control (does NOT finalize state)
```

### Step 4: Webhook Finalizes
```
1. Stripe calls webhook: payment_intent.succeeded
2. Webhook verifies signature
3. Webhook marks Quote.status = 'paid'
4. Webhook marks Transaction.status = 'completed'
5. Webhook creates vendor transfer (idempotent)
6. Webhook deducts credits (if used)
7. Webhook sends notifications
```

### Step 5: Frontend Updates
```
1. React Query refetch detects quote is now paid
2. QuoteMessageCard re-renders
3. Shows "✅ Payment Received" instead of "Pay Now"
4. Buyer and vendor see success state
```

---

## Testing

### Manual Test (End-to-End)

1. **Setup:**
   - Have two test accounts: one vendor, one buyer
   - Vendor should have `stripe_charges_enabled = true` or `user_type = 'picture_frame_shop'`
   - Both should have stripe_customer_id saved

2. **Send Quote:**
   - Log in as vendor
   - Navigate to Messages with buyer
   - Click "Send Quote"
   - Enter: Amount: $10.00, Description: "Test quote"
   - Click "Send Quote"
   - Quote appears in DM

3. **Pay Quote:**
   - Log in as buyer
   - Open same DM
   - See vendor's quote
   - Click "Pay Now"
   - Modal opens with Stripe Payment Element
   - Use test card: `4242 4242 4242 4242`, exp: 12/25, CVC: 123
   - Click "Pay $10.00"
   - See success message
   - Wait 2-3 seconds for webhook to process

4. **Verify Payment:**
   - Quote card should show "✅ Payment Received"
   - Both users should receive notifications
   - Check Stripe Dashboard: new PaymentIntent in succeeded state
   - Check Stripe Dashboard: new transfer to vendor account
   - Check Transaction record: status should be 'completed'
   - Check Quote record: status should be 'paid'

### Test Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Expired quote | "Pay Now" button disabled, shows "Expired" |
| Already paid quote | Shows "✅ Payment Received", no Pay button |
| Non-buyer tries to pay | Error: "Only the quote recipient can pay" |
| Non-vendor sends quote | Error: "Only vendors can send quotes" |
| Card declined | Payment fails, shows error message, quote stays pending |
| Webhook retried | Idempotency guards prevent duplicate transfer |
| Browser closes mid-payment | Webhook still finalizes when Stripe confirms |

---

## Security & Safeguards

### Frontend Safety
- ✅ Frontend does NOT mark quote as paid
- ✅ Frontend does NOT create transfers
- ✅ Frontend does NOT deduct credits
- ✅ Frontend does NOT finalize any state

### Backend Safety
- ✅ Webhook signature verification (HMAC-SHA256)
- ✅ Webhook timestamp validation (±5 min tolerance)
- ✅ Idempotency keys on all Stripe API calls
- ✅ Database guards on transfer creation (`stripe_transfer_id` check)
- ✅ Status checks before any mutation (e.g., `status === 'completed'`)

### Payment Intent Safety
- ✅ `capture_method: 'manual'` prevents auto-capture
- ✅ Metadata includes all transaction details for audit
- ✅ PaymentIntent linked to specific quote (prevents payment of wrong quote)

---

## Environment Variables

Required secrets (already set):
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `VITE_STRIPE_PUBLISHABLE_KEY`

---

## Troubleshooting

### "Only vendors can send quotes"
- Check user's `stripe_charges_enabled` or `user_type`
- Only `picture_frame_shop`, `artist`, or users with `stripe_charges_enabled` can send quotes

### Payment element won't load
- Verify `VITE_STRIPE_PUBLISHABLE_KEY` is set in frontend env
- Check browser console for Stripe.js load errors
- Verify `clientSecret` is being returned from `createQuotePaymentIntent`

### Webhook not firing
- Verify `STRIPE_WEBHOOK_SECRET` is set correctly
- Check Stripe Dashboard > Webhooks > recent deliveries
- Confirm payment_intent.succeeded event occurred in Stripe

### Quote not showing as paid after payment
- Webhook may still be processing (takes 1-2 seconds)
- Manually refresh page or wait for React Query refetch
- Check Stripe Dashboard for PaymentIntent succeeded event
- Check database: Transaction.status should be 'completed'

### Duplicate transfers created
- Should NOT happen due to idempotency key `transfer-{transaction_id}`
- If it does, check webhook logs for errors
- Verify both transfer calls used same idempotency key

---

## Future Enhancements

- **Partial payments:** Allow multiple payments toward one quote
- **Installment plans:** Offer payment plans for large quotes
- **Quote variations:** Counter-offers with automatic decline of originals
- **Service history:** Track all quotes sent/received by vendor
- **Auto-renew:** Extend quote expiration with one click
- **Quote templates:** Save common quotes as templates
- **Bulk quotes:** Send same quote to multiple buyers

---

## Summary

This quote system provides a secure, user-friendly way for vendors to send quotes and accept payments directly in messages. The webhook-as-source-of-truth design ensures payment finalization cannot be bypassed or duplicated, and idempotency keys prevent race conditions on retry scenarios.

Key files to understand:
1. **Backend:** `sendQuote.ts` → `createQuotePaymentIntent.ts` → `stripeWebhook.ts`
2. **Frontend:** `SendQuoteDialog` → `QuoteMessageCard` → `QuotePaymentModal`
3. **Data:** `Quote` entity + `Transaction` linking

All state finalization (paying, transferring, deducting) happens exclusively in the webhook, ensuring a single source of truth.