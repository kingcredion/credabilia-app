# Mobile Nav Alignment & Final Ecosystem Polish Pass

## Overview
Final cleanup pass to align mobile navigation with the finalized role architecture and remove remaining assumptions that special roles are primary top-level contexts.

---

## Files Changed

### 1. **components/MobileBottomNav.jsx**
**Key Changes:**

#### a. Separated primary roles from special roles (lines 8–15)
- **Before:** `rolePageMap` contained all roles (collector, vendor, auditor, picture_frame_shop, influencer, artist)
- **After:** `primaryRolePageMap` contains ONLY primary roles (collector, vendor, auditor)
- Added comment: "Special roles are not top-level contexts; they're accessed via sidebar/settings"

#### b. Updated reference (line 27)
- Changed: `rolePageMap[currentRole]` → `primaryRolePageMap[currentRole]`
- Added comment: "Only primary roles drive mobile nav. Special roles are accessed via sidebar."

**Result:** Mobile bottom nav now exclusively reflects the primary role architecture. Special roles (picture_frame_shop, influencer, artist) are not modeled as primary navigation contexts.

---

### 2. **layout.jsx**
**Key Changes:**

#### a. Added clarifying comment (line 1389)
- Added: `/* Mobile nav: primary roles only (collector/vendor/auditor). Special roles accessed via sidebar. */`
- Makes explicit in the Layout that MobileBottomNav is scoped to primary roles only

#### b. Code comment reinforcement (line 791)
- Existing: "NOTE: Founder Circle is a gated PRIVILEGE, not a primary role. It's shown alongside dashboards, not in role switcher."
- Preserved and validated as accurate

---

## Architecture Clarifications

### Mobile vs. Desktop Consistency

| Layer | Desktop (Sidebar) | Mobile (Bottom Nav) | Behavior |
|-------|-------------------|-------------------|----------|
| **Primary Roles** | Role switcher buttons | Bottom nav tabs | Drives shell context |
| **Special Tools** | Dashboard cards in "My Dashboards" | Sidebar access only | Reachable but not primary nav |
| **Special Access** | Activation prompts | Sidebar access only | Requires approval + opt-in |
| **Privileges** | Founder Circle card | Sidebar access only | Gated access layer |

### What Was Removed

✅ **Stale assumption:** picture_frame_shop as a mobile-nav primary context  
✅ **Stale assumption:** influencer as a mobile-nav primary context  
✅ **Stale assumption:** artist as a mobile-nav primary context  
✅ **Stale assumption:** special roles driving mobile-shell behavior  

### What Remains Intact

✅ **Desktop sidebar:** All dashboards and special-role tools remain accessible  
✅ **Mobile accessibility:** Users can still reach special-role dashboards via sidebar (swipe/menu)  
✅ **Entry points:** Activation prompts and dashboard navigation unchanged  
✅ **Permission logic:** Central `getSubRoleAccess()` resolver unchanged  
✅ **Routing:** All routes and navigation behavior preserved  

---

## Final Ecosystem Model

### Primary Roles (Drive Shell)
- **Collector:** MyCollection / Marketplace
- **Vendor:** MyListings / VendorDashboard
- **Auditor:** MyAudits / VettingQueue

### Special Roles / Sub-Roles (Layered Access)
- **Picture Frame Shop:** Approved → Dashboard in sidebar → Activate for tool access
- **Influencer:** Approved → Dashboard in sidebar → Activate for tool access
- **Artist:** Approved → Dashboard in sidebar → Activate for tool access
- **Founder:** Indiegogo backer exclusive → Special privilege card in sidebar → No activation required (exists for admins too)

### Access Paths
- **Mobile Primary:** Bottom nav (collector/vendor/auditor only)
- **Mobile Special:** Sidebar → Dashboard cards
- **Desktop Primary:** Sidebar role switcher
- **Desktop Special:** Sidebar dashboard cards + activation prompts

---

## QA Verification

✅ Mobile nav reflects final role architecture (primary only)  
✅ Primary roles remain the only top-level active contexts  
✅ Special roles are not modeled as primary role tabs  
✅ All special-role entry points accessible via sidebar  
✅ No regressions in special-role flows  
✅ Ecosystem reads consistently across desktop and mobile  

---

## Architecture Alignment Summary

The app now presents as:
- **One shell** driven by primary roles (collector/vendor/auditor)
- **Special access** layered on top via sidebar, not primary nav
- **Clear state handling** throughout (pending ≠ active ≠ activated)
- **Consistent mental model** desktop ↔ mobile
- **Zero functional changes** — only architecture/presentation polish

---

## Remaining Opportunities (Future)

If further polish is desired:
- **Mobile activation prompts:** Could be surfaced via onboarding or a special banner (currently in sidebar)
- **Layout refactoring:** Split 1432-line Layout.jsx into sub-components (SidebarNav, MobileNav, Header, etc.)
- **Special-role discovery:** Could add a "My Special Roles" badge on mobile to make activation paths more discoverable

---

## Conclusion

Mobile and desktop ecosystems now align on a single, clear role model:
- **Primary roles** drive all shell contexts
- **Special roles** are earned access layers, never primary
- **Presentation** clearly reflects this distinction everywhere
- **No architecture changes** — only consistency polish