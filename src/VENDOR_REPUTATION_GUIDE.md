# Vendor Reputation System – Bridge between Performance & Ranking

## Overview

The vendor reputation system tracks seller performance and feeds it into marketplace ranking as a **small additive factor (5-10% max influence)** — successful vendors get slight ranking advantage without overriding trust-based filtering.

### Key Principle
- **Trust is still primary** (~60% of ranking)
- **Vendor reputation is conditional bonus** (only applies if trust > 40)
- **Rewards, audits, and referrals unchanged**

---

## Architecture

### 1. Vendor Metrics (on User entity)

Tracked fields:
- **successful_sales** (number): Count of completed sales
- **vendor_total_sales** (number): Total sales for legacy compat
- **vendor_quality_score** (0-100): Calculated from metrics
- **dispute_rate** (0-1, optional): Fraud/refund disputes
- **fulfillment_reliability** (0-1, optional): On-time delivery rate

### 2. Quality Score Calculation

`calculateVendorQualityScore(vendor)` in `src/utils/vendorReputation.js`:

```javascript
salesScore = log(successful_sales + 1) / log(50) * 70
  → First 10 sales = big boost; saturates at 50 sales = 70 points

reliabilityScore = (fulfillment_bonus - dispute_penalty) * 30
  → Max +30 points for perfect reliability
  → Max -30 points for disputes (clamped to 0)

vendor_quality_score = salesScore + reliabilityScore
  → Range: 0-100
```

### 3. Ranking Boost Calculation

In `calculateRankingScore()`, vendor reputation:
- Only applied if **trust_score > 40** (protects low-trust items)
- Adds up to **10 points** (max 10% influence on 0-100 scale)
- Formula: `(vendor_score / 100) * 10`

**Example:**
- Item with 75 trust + vendor_score 100 = +10 ranking boost
- Item with 75 trust + vendor_score 50 = +5 ranking boost
- Item with 35 trust + any vendor_score = 0 ranking boost (trust too low)

---

## Integration Points

### 1. Track Sales (StripeCheckoutDialog.jsx)

After successful payment (both Stripe & credit paths):

```javascript
// After transaction created and item marked sold:
const vendor = await base44.entities.User.filter({ email: item.vendor_email });
const vendorUpdate = incrementVendorSales(vendor[0]);
const newQualityScore = calculateVendorQualityScore({ ...vendor, ...vendorUpdate });
await base44.entities.User.update(vendor.id, {
  ...vendorUpdate,
  vendor_quality_score: newQualityScore
});

// Recalculate item ranking with updated vendor score
const updatedVendor = { ...vendor, ...vendorUpdate, vendor_quality_score: newQualityScore };
const rankingUpdate = await updateMarketplaceRanking(item, updatedVendor);
await base44.entities.Item.update(item.id, rankingUpdate);
```

✅ **Already implemented** (lines 318-335 in StripeCheckoutDialog.jsx)

### 2. Feed into Ranking (marketplaceRanking.js)

`calculateRankingScore(item, vendor = null)` accepts optional vendor:

```javascript
// Only apply if vendor exists + trust > 40
if (vendor && trustScore > 40) {
  const vendorScore = calculateVendorQualityScore(vendor);
  vendorBoost = (vendorScore / 100) * 0.1; // Max 10%
}

// Combine all signals
score = (trust + voteBoost + engagement + referral + vendorBoost + recency) * 100
```

✅ **Integrated** in marketplaceRanking.js

### 3. Optional: Dispute Tracking

To implement dispute-based penalties, add to transactions or separate entity:
- On refund: `dispute_rate = disputes / total_sales`
- Recalculate `vendor_quality_score` after each dispute
- No need to implement unless fraud becomes issue

---

## Safety Guardrails

✅ **Trust system intact:**
- Low-trust items never boosted by vendor rep
- Audit penalties still override vendor reputation

✅ **Rewards unchanged:**
- Audits still award XP, credits, leaderboard
- Vendor sales don't affect reward eligibility

✅ **Referral system unchanged:**
- Influencer commissions still calculated same way
- Referral bonuses separate from vendor rep

✅ **Influence capped:**
- Max 10% of ranking score from vendor rep
- Trust dominates (60% baseline)

---

## File Reference

- `src/utils/vendorReputation.js` — Quality score calculation
- `src/utils/marketplaceRanking.js` — Ranking with vendor boost
- `src/components/StripeCheckoutDialog.jsx` — Sales tracking on purchase
- User entity — Vendor metrics storage

---

## Testing Checklist

1. **Sales tracking:** Complete purchase → `vendor.successful_sales` increments ✓
2. **Quality score:** After 10+ sales → `vendor_quality_score` reaches ~30 ✓
3. **Ranking boost:** Compare items from vendor with 100 sales vs 1 sale (same trust) → higher ranked vendor item ranks ~10 points higher ✓
4. **Trust override:** Item with 30 trust from high-rep vendor → no boost applied ✓
5. **Engagement separate:** High-engagement item from new vendor ranks correctly (without vendor boost) ✓

---

## Future Enhancements

- Track `dispute_rate` on refunds and apply penalty
- Monitor `fulfillment_reliability` from shipping confirmations
- Add vendor tier badges (Gold, Silver, etc.) based on quality_score
- Implement vendor appeal process if reputation damages sales