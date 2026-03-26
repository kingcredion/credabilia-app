# Dual-Score Trust System Implementation

## Overview
Upgraded the item credibility system from a single authenticity meter to a dual-score trust model with dynamic weighting. This prevents single votes from swinging the score dramatically and makes trust calculations transparent and stable.

---

## Architecture

### Files Changed
1. **`src/utils/trustScore.js`** - Core trust calculation utilities
2. **`entities/Item.json`** - Added new trust fields to Item schema
3. **`src/components/CredibilityMeter.jsx`** - Refactored UI to show dual scores
4. **`src/pages/ItemDetails.jsx`** - Updated vote submission to recalculate trust

---

## Data Model

### New Item Fields
```json
{
  "authenticator_score": 0-100,      // Expert/authenticator confidence
  "community_score": 0-100,          // Community vote-based score
  "final_trust_score": 0-100,        // Weighted blend (final judgment)
  "authenticator_weight": 0-100,     // % weight for authenticator
  "community_weight": 0-100,         // % weight for community
  "authenticity_meter": 0-100        // Legacy: mirrors final_trust_score
}
```

**Backward Compatibility:** Old items without new fields gracefully fall back to `authenticity_meter` or `ai_confidence`.

---

## Formulas & Calculations

### 1. Authenticator Score (Expert Trust)

**Inputs:**
- `item.authenticator` - Grading company (PSA, BGS, SGC, etc.)
- `item.ai_confidence` - AI analysis (0-100)
- `vendor.vendor_credibility` - Vendor credibility % (light modifier)

**Formula:**
```
IF trusted_authenticator EXISTS:
  score = TRUSTED_AUTHENTICATORS[authenticator]  // 85-95
ELSE IF ai_confidence > 0:
  score = ai_confidence  // 0-100
ELSE IF vendor_credibility EXISTS:
  score = MIN(70, 50 + (vendor_credibility * 0.2))
ELSE:
  score = 60  // neutral baseline
```

**Trusted Authenticator Mapping:**
- PSA, BGS, Beckett: 95
- SGC, Sotheby's, Christie's: 92-95
- eBay Authenticity Guarantee: 80

---

### 2. Community Score (Vote-Based)

**Inputs:**
- `votes[]` - Array of vote objects with vote_type ("authentic", "suspicious", "counterfeit") and weight (1-3 based on voter rank)

**Formula (with Baseline Smoothing):**
```
BASELINE_VOTES = 5
BASELINE_SCORE = 50

authenticWeight = SUM(votes[type=authentic].weight)
counterfeitWeight = SUM(votes[type=counterfeit].weight)
totalWeight = SUM(votes[*].weight)

netScore = authenticWeight - counterfeitWeight + BASELINE_VOTES
totalVotes = totalWeight + BASELINE_VOTES

communityScore = (netScore / totalVotes) * 100
communityScore = CLAMP(0, 100, communityScore)  // 0-100 range
```

**Why Baseline Smoothing?**
- Prevents early single votes from causing dramatic swings
- Keeps score near 50 until sufficient real votes accumulate
- Counterfeit votes appropriately reduce the score
- Weighted by voter rank (gold=3x, silver=2x, bronze=1x)

---

### 3. Dynamic Weighting (Vote Thresholds)

As more votes accumulate, influence shifts from expert to community.

**Thresholds:**
```
0-9 votes:      80% authenticator, 20% community
10-24 votes:    65% authenticator, 35% community
25-99 votes:    50% authenticator, 50% community
100+ votes:     35% authenticator, 65% community
```

**Rationale:**
- Early items: rely heavily on expert authentication
- Established items: community consensus becomes more important
- Scaling: democratizes trust as evidence accumulates

---

### 4. Final Trust Score (Weighted Blend)

**Formula:**
```
finalTrustScore = (authenticator_score * weight_auth) 
                + (community_score * weight_comm)

weight_auth + weight_comm = 100%
```

**Example Scenario:**
```
Item with:
- Authenticator Score: 92 (PSA certified)
- Community Score: 65 (12 votes: 10 authentic, 2 counterfeit)
- Total Votes: 12 (65/35 weighting)

Final = (92 * 0.65) + (65 * 0.35)
      = 59.8 + 22.75
      = 82.55 → 83 (rounded)
```

---

## Fallback Behavior (Backward Compatibility)

For items **without** new trust fields:

```javascript
function getFallbackTrustScore(item) {
  // Priority order
  1. If final_trust_score exists → use it
  2. Else if authenticity_meter exists → use it
  3. Else if ai_confidence exists → use it
  4. Else → default to 50
}
```

**Result:** Existing items display correctly until recalculated on next vote.

---

## UI Components

### CredibilityMeter.jsx
**New Display:**
- **Final Judgment** - Large score badge (main focal point)
- **Authenticator Trust** - Expert/certificate score
- **Community Verdict** - Vote-based score
- **Weighting Explanation** - Shows % breakdown
- **Vote Breakdown** - Authentic/Suspicious/Counterfeit counts
- **Dynamic Message** - Contextual trust guidance

**Color Coding:**
- Green (≥80): Highly Credible
- Yellow (60-79): Moderately Credible
- Red (<60): Low Credibility

---

## Vote Recalculation (ItemDetails.jsx)

**When:** After vote submission in `submitVoteMutation`

**Process:**
```javascript
// 1. Fetch all votes for item
const allVotes = await base44.entities.Vote.filter({ item_id: item.id });

// 2. Recalculate using trust utilities
const trustScores = recalculateItemTrust(item, allVotes, vendor);

// 3. Update item with all trust fields
await base44.entities.Item.update(item.id, {
  total_votes,
  authentic_votes,
  suspicious_votes,
  counterfeit_votes,
  authenticator_score: trustScores.authenticator_score,
  community_score: trustScores.community_score,
  final_trust_score: trustScores.final_trust_score,
  authenticator_weight: trustScores.authenticator_weight,
  community_weight: trustScores.community_weight,
  authenticity_meter: trustScores.final_trust_score  // Legacy compat
});
```

---

## Testing Checklist

### Manual Tests
- [ ] **Old Items (no new fields)** - Load item without trust fields → displays fallback score
- [ ] **New Items (with fields)** - Load item with trust fields → displays final_trust_score
- [ ] **Vote Submission** - Submit vote → trust scores recalculate immediately
- [ ] **Baseline Smoothing** - First vote on new item → score stays near 50
- [ ] **Dynamic Weighting** - 5 votes (80/20) vs 50 votes (50/50) → different weights shown
- [ ] **Weighting Display** - UI shows correct authenticator_weight and community_weight %
- [ ] **Vote Breakdown** - Authentic/Suspicious/Counterfeit counts display correctly

### Calculation Tests
```
Test 1: Expert Only
  Item: PSA (authenticator_score=95), no votes
  Expected: final_trust_score = 95 (80% weight on authenticator)

Test 2: Early Votes (1 authentic)
  Item: AI confidence=70, 1 authentic vote
  authenticator_score=70, community_score=66 (with baseline)
  weight: 80/20
  Expected: final_trust_score = (70*0.8) + (66*0.2) = 69

Test 3: Many Votes (50 votes, 45 authentic)
  Item: authenticator_score=75, community_score=80
  weight: 50/50
  Expected: final_trust_score = (75*0.5) + (80*0.5) = 77.5

Test 4: Counterfeit Votes (20 votes: 15 authentic, 5 counterfeit)
  community_score with weighting = (15-5+5)/(20+5) * 100 = 60
  Item: authenticator_score=70
  weight: 65/35
  Expected: final_trust_score = (70*0.65) + (60*0.35) = 66
```

---

## Tuning Parameters

All configurable in `src/utils/trustScore.js`:

```javascript
// Authenticator scores
const TRUSTED_AUTHENTICATORS = { ... }

// Community baseline
const BASELINE_VOTES = 5;
const BASELINE_SCORE = 50;

// Weight thresholds
function getDynamicWeights(totalVotes) {
  if (totalVotes < 10) return { authenticator: 0.8, community: 0.2 };
  // ... adjust these thresholds as needed
}
```

---

## Migration Notes

### For Existing Data
- **No action required** - Old items work via fallback
- **Recalculate on first vote** - Next vote recalculates all trust fields
- **Optional: Batch Recalculation** - Could add a backend function to bulk-recalculate old items

### For New Votes
- All new votes immediately trigger full trust recalculation
- Weighted by voter rank (gold/silver/bronze multipliers)

---

## Wording Improvements

### Before
- "Community-verified authenticity"
- Score was "too volatile"

### After
- "Expert trust + Community vetting"
- Separate display for expert vs community confidence
- Clear explanation of how weighting works
- Contextual trust guidance (what to do based on score)

---

## Performance Impact

- **Vote Submission:** +1 recalculation query per vote (negligible)
- **Display:** Same rendering, just different data fields
- **Backward Compat:** Zero impact on old items until recalculated

---

## Example Score Explanation Flow

**User sees:**
```
Final Judgment: 78%  (Moderately Credible)
├─ Authenticator Trust: 85% (PSA Certificate)
├─ Community Verdict: 72% (14 expert reviews)
├─ Weighting: 50% Expert, 50% Community
└─ Explanation: "Moderate trust. Expert analysis positive but 
   community opinions vary. Additional expert reviews recommended."
```

This clearly shows:
1. What the final judgment is
2. Where it comes from (expert vs community)
3. How much each contributes
4. What the item needs (more reviews? better authentication?)