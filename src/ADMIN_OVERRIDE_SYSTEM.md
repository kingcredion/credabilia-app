# Admin Override System Implementation

**Date:** March 23, 2026  
**Feature:** Admins can instantly switch into any special role without approval

---

## Overview

Admins now have instant access to ALL role contexts (collector, vendor, auditor, picture_frame_shop, influencer, artist) directly from Settings > Roles tab, enabling testing and moderation without going through onboarding.

---

## Files Changed

### 1. **src/lib/permissions.js** (Updated)
**Change:** Admin override in `getAvailableContexts()`

**What it does:**
- If `getUserPermissions(user).is_admin` is true, returns all 6 contexts instantly
- Non-admin users still get contexts based on earned permissions (can_collect, can_sell, can_audit, can_frame, can_influence, can_create_art)
- `canAccessContext()` remains unchanged — it just checks if role is in `getAvailableContexts()`

**Code pattern:**
```javascript
export function getAvailableContexts(user) {
  const p = getUserPermissions(user);

  // Admin override: grant access to all contexts instantly
  if (p.is_admin) {
    return [
      "collector",
      "vendor",
      "auditor",
      "picture_frame_shop",
      "influencer",
      "artist",
    ];
  }

  // Normal permission-based logic continues for non-admins...
  const contexts = [];
  if (p.can_collect)    contexts.push("collector");
  // ... etc
  return contexts;
}
```

---

### 2. **src/components/settings/RolesTab.jsx** (Updated)
**Changes:**
- Added `onAdminSwitchRole` prop
- Added "Admin Only" badge for non-enabled roles when user is admin
- Changed button text from "Apply Now" to "Switch Now" for admins
- Admins don't see onboarding link — instead get direct switch button

**Key UI Logic:**
```jsx
const isAdmin = user?.role === "admin";

// For each role card:
{!isEnabled && (
  isAdmin ? (
    <Button onClick={() => onAdminSwitchRole?.(role.id)}>
      Switch Now
      <ArrowRight className="w-3 h-3" />
    </Button>
  ) : (
    <Link to={createPageUrl(role.applyUrl)}>
      <Button>
        Apply Now
        <ArrowRight className="w-3 h-3" />
      </Button>
    </Link>
  )
)}
```

**Badges:**
- Active roles: Green "Active" badge (same for all users)
- Disabled roles (admin only): Blue "Admin Only" badge
- Disabled roles (non-admin): No badge, only "Apply Now" link

---

### 3. **src/pages/Settings.jsx** (Updated)
**Changes:**
- Added `useNavigate` hook
- Added imports: `createPageUrl`, `toast` from sonner
- Created `handleAdminSwitchRole(roleId)` function
- Passed `onAdminSwitchRole={handleAdminSwitchRole}` to RolesTab

**What `handleAdminSwitchRole` does:**
1. Validates user is admin
2. Dispatches custom event `"admin-role-switch"` with roleId
3. Shows success toast: "Switched to {role} mode"
4. Navigates to role's home page after 500ms delay

**Code pattern:**
```javascript
const handleAdminSwitchRole = (roleId) => {
  if (user?.role !== "admin") {
    toast.error("Only admins can use this feature.");
    return;
  }

  // Trigger global role switch event (caught by Layout)
  window.dispatchEvent(new CustomEvent("admin-role-switch", { detail: { role: roleId } }));
  
  toast.success(`Switched to ${roleId} mode.`);
  
  // Navigate after delay
  setTimeout(() => {
    const homepages = {
      collector: "Marketplace",
      vendor: "VendorDashboard",
      auditor: "VettingQueue",
      picture_frame_shop: "FrameShopDashboard",
      influencer: "InfluencerDashboard",
      artist: "ArtistDashboard",
    };
    navigate(createPageUrl(homepages[roleId] || "Marketplace"));
  }, 500);
};
```

---

### 4. **src/layout.jsx** (Updated)
**Change:** Added event listener in useEffect

**What it does:**
- Listens for `"admin-role-switch"` events from Settings
- When triggered, calls existing `handleRoleSwitch(role)` function
- Uses the same role switching logic as other parts of the app
- No duplication of switch logic — reuses Layout's existing mechanism

**Code:**
```javascript
// Listen for admin role switch events from Settings
const handleAdminRoleSwitch = (event) => {
  if (event.detail?.role) {
    handleRoleSwitch(event.detail.role);
  }
};

window.addEventListener('admin-role-switch', handleAdminRoleSwitch);
return () => {
  window.removeEventListener('admin-role-switch', handleAdminRoleSwitch);
};
```

---

## User Flow: Admin Switching Roles

1. Admin navigates to **Settings → Roles**
2. Sees all 6 role cards (collector, vendor, auditor, picture_frame_shop, influencer, artist)
3. For inactive roles: "Admin Only" badge + "Switch Now" button
4. Clicks "Switch Now" → Settings calls `handleAdminSwitchRole(role)`
5. Event dispatched to Layout → `handleRoleSwitch()` updates `activeContext`
6. Toast notification: "Switched to {role} mode"
7. Navigates to role's home page (Marketplace, VendorDashboard, VettingQueue, etc.)
8. Layout updates all UI: sidebar role button, navigation menu, feature visibility

---

## User Flow: Non-Admin User Applying for Special Role

1. Non-admin navigates to **Settings → Roles**
2. Sees only their earned roles as enabled
3. For disabled roles: "Apply Now" link
4. Clicks → Links to onboarding flow for that role
5. Normal approval process continues (unchanged)

---

## Special Role Dashboards: Safety Notes

### No Automatic Entity Creation
- Admins switching into a special role do NOT automatically create:
  - artist_id
  - influencer_id
  - frame_shop_id
- These remain null unless the admin has actually gone through the approval process

### What This Means for Special Pages
**Pages that may be accessed:**
- `ArtistDashboard` - can load without artist_id (admin preview mode)
- `InfluencerDashboard` - can load without influencer_id (admin preview mode)
- `FrameShopDashboard` - can load without frame_shop_id (admin preview mode)

**Recommendation for these pages:**
- Add fallback empty states like "Admin Preview Mode" or "No linked profile yet"
- Do NOT hard-fail if the entity IDs are missing
- Allow admins to see the UI structure for testing purposes

**Pages that should NOT be accessed by admins without proper setup:**
- Any page that requires specific data from the linked entity
- Add permission checks if critical operations require real entities

---

## Technical Details

### No Backend Account Mutation
- Active context is local-only UI state
- User.current_role on backend is NOT changed
- User.user_type remains unchanged
- No _id fields are created

### Permission Derivation Order
1. Check `user.role === "admin"` → grant all contexts
2. If not admin, check individual permission flags (can_collect, can_sell, etc.)
3. Return available contexts array

### Event Flow
Settings page → `admin-role-switch` event → Layout → `handleRoleSwitch()` → updates activeContext → all UI reflects change

---

## Testing Checklist

- [ ] Admin in Settings > Roles sees all 6 role cards enabled with "Switch Now" buttons
- [ ] Non-admin sees only earned roles + "Apply Now" links for others
- [ ] Clicking "Switch Now" dispatches event and calls handleRoleSwitch
- [ ] Toast notification shows "Switched to {role} mode"
- [ ] Navigation goes to correct home page (Marketplace, VendorDashboard, etc.)
- [ ] Sidebar role buttons reflect new active context
- [ ] All navigation menu items for new context show up
- [ ] Switching back to collector works correctly
- [ ] Non-admin cannot access "Switch Now" functionality (only Apply Now)
- [ ] Admin switching to artist/influencer/frame_shop doesn't create real entities
- [ ] Special role dashboards load without crashing when accessed by admin without entities
- [ ] Back button after switch navigates correctly

---

## Summary

✅ **Admin Permission Gate:** Admins automatically have all 6 contexts via permission system  
✅ **Settings Integration:** RolesTab shows "Switch Now" for admins, "Apply Now" for non-admins  
✅ **Role Switching:** Events wired to Layout's existing handleRoleSwitch logic  
✅ **No Duplication:** Reuses existing role switch mechanism (no new code paths)  
✅ **No Account Mutation:** activeContext is UI state only, no backend changes  
✅ **Safe Testing:** Admins can preview special role UIs without requiring real entities  

---

**Status:** ✅ Ready for testing