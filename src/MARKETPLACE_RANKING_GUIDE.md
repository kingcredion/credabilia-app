# Marketplace Ranking System

## Overview

The marketplace ranking system layers engagement and conversion signals on top of the existing **trust**, **audit**, and **referral** systems without modifying core logic.

### Key Principles
- **Trust is strongest**: `final_trust_score` controls baseline ranking; low trust = low visibility
- **Engagement boosts visibility**: Likes, votes, and conversions improve positioning
- **Referrals amplify reach**: Influencer-driven sales get extra boost
- **Recency matters**: New items get small temporary lift (fades after 30 days)

---

## Entity Fields

Added to `Item` entity:
- **ranking_score** (number, 0-100): Primary marketplace ordering signal
- **like_count** (number, default 0): User engagement
- **conversion_count** (number, default 0): Purchase count
- **referral_conversion_count** (number, default 0): Referral-driven purchases

Added `ItemLike` entity:
- **item_id** (string): ID of liked item
- **user_email** (string): Email of user who liked

---

## Ranking Score Calculation

Uses `calculateRankingScore(item)` from `src/utils/marketplaceRanking.js`:

### Inputs
- `final_trust_score` (0-100): From audit system
- `total_votes`: Count of audit votes
- `like_count`: User likes
- `conversion_count`: Purchases
- `referral_conversion_count`: Referral purchases
- `created_date`: For recency boost

### Formula (Simplified)
```
score = (
  (trust / 100) * 0.60 +
  (votes / 20) * 0.15 +
  (likes + conversions*2) / 10 * 0.15 +
  (referral_conversions / 5) * 0.10 +
  recency_factor * 0.05
) * 100

Clamped to 0-100.
```

### Weights
- **Trust** (60%): Primary driver; low trust = low rank
- **Vote confidence** (15%): More votes = more confidence (saturates at 20)
- **Engagement** (15%): Likes and conversions boost visibility
- **Referral boost** (10%): Influencer-driven sales get extra lift
- **Recency** (5%): New items fade boost after 30 days

---

## When to Recalculate

Call `calculateRankingScore(item)` and persist to `item.ranking_score` after:

1. **Audit submitted** → After trust update
   - On successful vote in VettingQueue
   - Recalculate once votes recorded

2. **Like added/removed** → Immediately
   - Toggle like in Marketplace
   - Decrement/increment `like_count`
   - Recalculate ranking

3. **Purchase completed** → On success
   - In StripeCheckoutDialog (line ~300)
   - Increment `conversion_count`
   - If referral exists, increment `referral_conversion_count`
   - Recalculate ranking

4. **Item created** → On item creation
   - Initialize `ranking_score` via `calculateRankingScore()`

---

## Integration Points

### Marketplace.jsx (sorting)
```javascript
if (sortBy === "ranking") {
  scoredItems.sort((a, b) => (b.ranking_score || 0) - (a.ranking_score || 0));
}
```
✅ Already implemented (line 436-437)

### Like System (Marketplace.jsx)
```javascript
// Toggle like button (line ~250)
const toggleLikeMutation = useMutation({
  mutationFn: async (item) => {
    if (existingLike) {
      await base44.entities.ItemLike.delete(existingLike.id);
      await base44.entities.Item.update(item.id, {
        like_count: Math.max(0, (item.like_count || 0) - 1)
      });
    } else {
      await base44.entities.ItemLike.create({ item_id: item.id, user_email: user.email });
      await base44.entities.Item.update(item.id, {
        like_count: (item.like_count || 0) + 1
      });
    }
  }
});
```
✅ Already implemented

### Conversion Tracking (StripeCheckoutDialog.jsx)
After successful purchase:
```javascript
import { calculateRankingScore } from "@/utils/marketplaceRanking";

await base44.entities.Item.update(item.id, {
  conversion_count: (item.conversion_count || 0) + 1,
  referral_conversion_count: item.referral_driven ? (item.referral_conversion_count || 0) + 1 : undefined
});

const updatedItem = await base44.entities.Item.get(item.id);
const newScore = calculateRankingScore(updatedItem);
await base44.entities.Item.update(item.id, { ranking_score: newScore });
```
⚠️ **TODO**: Implement in StripeCheckoutDialog

### Audit Vote (VettingQueue.jsx)
After vote submission:
```javascript
import { calculateRankingScore } from "@/utils/marketplaceRanking";

// After trust recalculation...
const updatedItem = await base44.entities.Item.get(item.id);
const newScore = calculateRankingScore(updatedItem);
await base44.entities.Item.update(item.id, { ranking_score: newScore });
```
⚠️ **TODO**: Implement in VettingQueue

### Item Details (ItemDetails.jsx)
Like button + conversion tracking:
```javascript
// Like toggle (already exists, uses ranking recalc if implemented)
// Conversion tracking (redirect to checkout which will update ranking)
```
⚠️ **Partially implemented**: Like button exists; conversion tracking via StripeCheckoutDialog

---

## Ordering Logic

**Marketplace default sort:** `ranking` (line 112 in Marketplace.jsx)

**Sort priority:**
1. Educational items (always first on page 1)
2. Personalized matches by `ranking_score` DESC
3. Discovery items by `ranking_score` DESC
4. Boosts applied to personalization (not ranking)

---

## Safety Rules

✅ **Trust system intact:**
- Low trust automatically = low ranking (no override)
- Audit penalties respected (can't be boosted away)

✅ **Referral system intact:**
- No modifications to signup, commission, or credit logic
- Referral purchases tracked separately (for visibility boost only)

✅ **Rewards system intact:**
- Audits still reward XP, council credits, leaderboard
- Like/conversion stats don't affect reward eligibility

---

## File Reference

- `src/utils/marketplaceRanking.js` — Ranking calculation
- `src/entities/ItemLike.json` — Like entity schema
- `src/pages/Marketplace.jsx` — Like UI + sorting
- `src/pages/ItemDetails.jsx` — Like button (edit to track conversions)
- `src/pages/VettingQueue.jsx` — Vote tracking (edit to recalculate ranking)
- `src/components/StripeCheckoutDialog.jsx` — Purchase tracking (edit to recalculate ranking)

---

## Testing

1. **Like system**: Open Marketplace, click like button, confirm `like_count` increments
2. **Ranking sort**: Ensure items sort by `ranking_score` when sort="ranking"
3. **Audit impact**: Submit audit votes, confirm ranking updates
4. **Conversions**: Complete purchase, confirm `conversion_count` increments and ranking recalculates

---

## Future Enhancements

- Cache ranking calculations for high-traffic items
- Implement real-time ranking updates via subscriptions
- Add audit penalty decay (old audits have less impact)
- Support custom ranking weights per role (seller premium, etc.)