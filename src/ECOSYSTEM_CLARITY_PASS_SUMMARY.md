# Ecosystem Consistency Pass — Account Summary & Layout Semantics

## Overview
Focused cleanup of misleading state language in account summary, layout role presentation, and Founder Circle semantics. **No architectural changes**—only presentation layer refinement.

---

## Files Changed

### 1. **components/settings/AccountSummary.jsx**
**Issue:** Displayed pending applications (entity existence) as if they were active approved roles.

**Fix:**
- Removed `hasFrameShopEntity`, `hasInfluencerEntity`, `hasArtistEntity` from role display logic
- Now shows **only approved/active special roles** via `canAccessFrameShopTools`, `canAccessInfluencerTools`, `canAccessArtistTools`
- Separated into explicit `primaryRoles` array + `approvedSpecialRoles` array for clarity

**Result:** Account Summary badges now accurately reflect earned access, not pending applications.

---

### 2. **layout.jsx**
**Changes:**

#### a. Dashboard Badges (lines 1062–1172)
- Changed **Frame Shop, Influencer, Artist** dashboard badges from `"ACTIVE"` → `"ENABLED"`
- **Rationale:** "ACTIVE" conflates "approved status" with "tool accessibility". "ENABLED" is clearer: the dashboard is enabled for access.

#### b. Founder Circle Presentation (lines 1146–1172)
- Added subtitle under "Founder's Circle": `"Backer Privileges"` (in amber/muted tone)
- Changed badge from `"ELITE"` → `"EXCLUSIVE"` (more accurate semantic)
- **Rationale:** Makes it clear Founder Circle is a gated privilege layer, not a replacement primary role

#### c. Code Comment (line 791)
- Added clarifying comment: "NOTE: Founder Circle is a gated PRIVILEGE, not a primary role. It's shown alongside dashboards, not in role switcher."

---

## Clarity Improvements

### Account Summary
| Before | After |
|--------|-------|
| Shows `picture_frame_shop` if entity exists OR tools accessible | Shows `picture_frame_shop` only if tools accessible (approved) |
| Misleading badge count | Accurate badge count = approved access only |

### Layout Dashboard Access
| Dashboard | Badge Before | Badge After | Why |
|-----------|--------------|-------------|-----|
| Frame Shop | ACTIVE | ENABLED | Approved ≠ Accessible tools |
| Influencer | ACTIVE | ENABLED | Clearer state language |
| Artist | ACTIVE | ENABLED | Clearer state language |
| Founder's Circle | ELITE | EXCLUSIVE (+ subtitle) | Not a role; it's a privilege |

---

## Ecosystem Architecture Intact

✅ **Primary roles remain:** collector, vendor, auditor  
✅ **Special roles stay access layers:** picture_frame_shop, influencer, artist  
✅ **Founder Circle preserved:** Gated privilege for Indiegogo backers + admins  
✅ **Approval flow unchanged:** pending → approved → (activate if special role)  
✅ **No routing changes:** All navigation paths preserved  
✅ **Permission logic untouched:** Central `getSubRoleAccess()` resolver still drives all gates  

---

## Verification Checklist

✅ Account Summary does not misrepresent pending as active  
✅ Primary role vs. special access distinction is clearer  
✅ Founder Circle no longer reads like a primary role  
✅ Dashboard badge language (`ENABLED` vs `ACTIVE`) removes ambiguity  
✅ Founder Circle subtitle + badge clearly mark it as privilege-based access  

---

## Remaining Opportunity (Future)

If you want to push this further, consider:
- **Settings > Roles tab:** Could separate "Primary Roles" from "Special Role Applications" into distinct sections
- **Layout optimization:** The comment suggests splitting sidebar into `SidebarNavigation`, `SidebarDashboards`, `SidebarPrivileges` sub-components (helps readability at 1430+ lines)
- **Profile/Account pages:** May benefit from similar "approved vs. activated" state clarity if they show special role status

---

## Summary

The ecosystem is now more **transparent and consistent** in distinguishing:
- **Primary roles** (collector/vendor/auditor)
- **Special-role applications** (pending, not shown in account summary)
- **Approved special-role access** (shown in account summary + sidebar dashboards)
- **Gated privileges** (Founder's Circle = backer exclusive, not a role)
- **Tool activation** (opt-in for approved special roles)

No functionality changed—only how the ecosystem presents itself to users.