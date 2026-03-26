# Quote System - Quick Test Instructions

## Prerequisites

1. **Two test accounts:** Vendor account + Buyer account
2. **Vendor setup:**
   - Has `stripe_charges_enabled = true` OR `user_type = 'picture_frame_shop'` or `'artist'`
   - Has valid Stripe customer in Stripe Dashboard
3. **Stripe test keys** already configured
4. **Webhook endpoint** registered in Stripe Dashboard

---

## Test Scenario: Send & Pay Quote

### Phase 1: Send Quote (Vendor)

**Step 1:** Log in as **vendor** account

**Step 2:** Navigate to Messages and start conversation with buyer (or use existing)

**Step 3:** Click **"Send Quote"** button
- Expect: Dialog opens with form

**Step 4:** Fill form:
```
Amount:      $49.99
Description: Custom wooden frame with UV glass
Service:     Frame Shop Service
```

**Step 5:** Click **"Send Quote"**
- Expect: 
  - Dialog closes
  - Quote appears in DM as card
  - Vendor sees quote with no "Pay Now" button
  - Shows quote expiration (48 hours)

### Phase 2: Initiate Payment (Buyer)

**Step 6:** Log in as **buyer** account

**Step 7:** Open same DM conversation
- Expect: Quote card visible from vendor

**Step 8:** Click **"Pay Now"** button on quote card
- Expect:
  - Modal opens titled "Complete Payment"
  - Shows amount: **$49.99**
  - Shows description
  - Loading spinner appears briefly
  - Stripe Payment Element loads with card form

### Phase 3: Submit Payment (Buyer)

**Step 9:** In Payment Element modal, fill card:
```
Card Number: 4242 4242 4242 4242
Expiry:      12 / 25
CVC:         123
Name:        Test User
```

**Step 10:** Click **"Pay $49.99"**
- Expect:
  - Button shows loading spinner
  - Card is submitted to Stripe
  - Success message appears: "Payment Successful"
  - Modal auto-closes after 2 seconds

### Phase 4: Verify Webhook Processed

**Step 11:** Wait **2-3 seconds** for webhook to process

**Step 12:** Refresh Messages page or wait for React Query refetch
- Expect:
  - Quote card now shows: **"✅ Payment Received"**
  - No "Pay Now" button
  - Status changed from "Pending" to "Paid"

**Step 13:** Check as **vendor**
- Log in as vendor
- Open same DM
- Expect: Quote shows "✅ Payment Received" (green badge)

### Phase 5: Verify Backend State

**Step 14:** Check Stripe Dashboard:
- Go to Payments → PaymentIntents
- Find newest PaymentIntent with `pi_` ID
- Status should be: **`succeeded`**
- Metadata should contain: `quote_id`, `transaction_id`

**Step 15:** Check Transfers:
- Go to Transfers
- Should see transfer to vendor Stripe account
- Amount: ~$43.99 (after 12% platform fee + 1% council pool)
- Status: **`succeeded`** or `in_transit`

**Step 16:** Verify in app database:
- Quote record: `status = 'paid'`
- Transaction record: `status = 'completed'`
- Transaction record: `stripe_transfer_id` is populated

---

## Test Expired Quote

### Phase 1: Create Quote

**Step 1:** Vendor sends quote (same as above)

**Step 2:** **Wait 48+ hours** OR manually update Quote in database:
```
SET expires_at = NOW() - INTERVAL 1 hour
```

### Phase 2: Try to Pay Expired Quote

**Step 3:** Buyer tries to click "Pay Now"
- Expect: Button is **disabled** or clicking shows "Quote has expired" error

**Step 4:** Or buyer manually tries calling `createQuotePaymentIntent`:
- Expect: Error response: `"Quote has expired"`

---

## Test Error Cases

### Case 1: Non-Vendor Tries to Send Quote

**Setup:** Log in as regular buyer account (no `stripe_charges_enabled`)

**Action:** Try clicking "Send Quote"
- Expect: Button may be hidden or disabled

**Or:** Manually call sendQuote function
- Expect: Error: `"Only vendors can send quotes for services"`

### Case 2: Non-Buyer Tries to Pay Quote

**Setup:** Get a quote ID intended for different buyer

**Action:** Different user tries calling `createQuotePaymentIntent` with quote_id
- Expect: Error: `"Only the quote recipient can pay"`

### Case 3: Card Declined

**Setup:** Quote payment modal open

**Action:** Use test card: `4000 0000 0000 0002` (declined)

**Step:** Click "Pay"
- Expect: Error message: "Your card was declined"
- Quote stays in "Pending" status
- User can retry with different card

### Case 4: Webhook Retry (Idempotency)

**Setup:** Payment succeeded, check webhook logs

**Action:** Manually trigger same `payment_intent.succeeded` event twice (in test mode)

**Expected:** Second webhook call should:
- Skip updating Quote (already `status = 'paid'`)
- Skip creating transfer (already `stripe_transfer_id` set)
- Return 200 OK (acknowledged)
- NOT create duplicate transfer

---

## Checklist

- [ ] Quote entity created in database
- [ ] `sendQuote.ts` function deployed
- [ ] `createQuotePaymentIntent.ts` function deployed
- [ ] `SendQuoteDialog` component loads
- [ ] `QuoteMessageCard` displays in DM
- [ ] `QuotePaymentModal` opens and Stripe Element loads
- [ ] Test card `4242...` accepts payment
- [ ] Webhook fires and marks quote as paid
- [ ] Quote card updates to show "✅ Payment Received"
- [ ] Vendor transfer created in Stripe
- [ ] Transaction marked as completed
- [ ] Expired quote prevents payment
- [ ] Non-vendor cannot send quote
- [ ] Non-buyer cannot pay quote

---

## Debug Tips

**If quote doesn't send:**
- Check browser console for errors
- Verify vendor has `stripe_charges_enabled` or correct `user_type`
- Check network tab: POST to `/functions/sendQuote` should return 200

**If payment element doesn't load:**
- Check browser console: Stripe.js should load without errors
- Verify `VITE_STRIPE_PUBLISHABLE_KEY` in frontend .env
- Check network: GET to `https://js.stripe.com/...` should succeed
- Check function response: `createQuotePaymentIntent` should return `clientSecret`

**If webhook doesn't fire:**
- Go to Stripe Dashboard > Webhooks > Recent Deliveries
- Check if `payment_intent.succeeded` event appears
- If not: payment may not have actually succeeded
- If yes but state not updating: check webhook endpoint logs

**If quote doesn't update after payment:**
- Wait 2-3 more seconds (webhook processing)
- Manually refresh page: `Cmd+Shift+R` (hard refresh)
- Check React Query devtools: refetch `conversation-quotes-dm` query
- Check database: Quote.status should be 'paid'

---

## Success Criteria

**Quote System is working when:**

1. ✅ Vendor can send quote in DM
2. ✅ Quote displays as card with "Pay Now" button
3. ✅ Buyer can click "Pay Now"
4. ✅ Stripe Payment Element loads
5. ✅ Card payment processes without error
6. ✅ Modal shows "Payment Successful"
7. ✅ Quote updates to "✅ Payment Received"
8. ✅ Stripe Dashboard shows succeeded PaymentIntent
9. ✅ Vendor transfer created in Stripe
10. ✅ Transaction marked completed in database
11. ✅ Expired quotes prevent payment
12. ✅ Wrong users cannot send/pay quotes