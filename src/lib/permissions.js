/**
 * lib/permissions.js
 *
 * Single source of truth for:
 *  - Permission derivation (getUserPermissions)
 *  - Available UI contexts (getAvailableContexts)
 *  - Context access gating (canAccessContext)
 *  - Display context resolution (getDisplayContext)
 *  - Role/context color (getContextColor)
 *  - Role/context navigation items (getContextNavigation)
 *  - Role/context home page (getContextHomePage)
 *
 * Migration contract:
 *  - current_role is ONLY used as a legacy fallback; never as the source of UI state.
 *  - activeContext (local Layout state) drives all UI switching.
 *  - permissions (derived here) control what actions are allowed.
 */

// ─── Static lookup tables ────────────────────────────────────────────────────

export const CONTEXT_COLORS = {
  collector:         "#3b82f6",
  vendor:            "#f59e0b",
  auditor:           "#10b981",
  picture_frame_shop:"#8b5cf6",
  influencer:        "#3C9F4E",
  artist:            "#ec4899",
};

export const CONTEXT_GRADIENTS = {
  collector:          "from-blue-600 to-blue-700",
  vendor:             "from-orange-600 to-orange-700",
  auditor:            "from-green-600 to-green-700",
  picture_frame_shop: "from-purple-600 to-purple-700",
  influencer:         "from-green-600 to-orange-600",
  artist:             "from-pink-600 to-rose-600",
};

export const CONTEXT_BACKGROUNDS = {
  collector:          "from-blue-50 to-gray-50",
  vendor:             "from-orange-50 to-gray-50",
  auditor:            "from-green-50 to-gray-50",
  picture_frame_shop: "from-purple-50 to-gray-50",
  influencer:         "from-green-50 to-orange-50",
  artist:             "from-pink-50 to-gray-50",
};

/** Home page for each context — used for post-switch navigation. */
const CONTEXT_HOME_PAGES = {
  collector:          "Marketplace",
  vendor:             "VendorDashboard",
  auditor:            "VettingQueue",
  picture_frame_shop: "FrameShopDashboard",
  influencer:         "InfluencerDashboard",
  artist:             "ArtistDashboard",
};

/**
 * Navigation items per context.
 * Icons are intentionally kept as string keys here so this file has zero
 * component dependencies. Callers (Layout, MobileBottomNav, etc.) map the
 * string keys to actual Lucide icon components.
 */
const CONTEXT_NAVIGATION = {
  collector: [
    { title: "Marketplace",    url: "Marketplace",    icon: "LayoutDashboard" },
    { title: "My Collection",  url: "MyCollection",   icon: "Trophy" },
    { title: "Track Packages", url: "TrackPackages",  icon: "Truck" },
  ],
  vendor: [
    { title: "Marketplace",    url: "Marketplace",    icon: "LayoutDashboard" },
    { title: "Dashboard",      url: "VendorDashboard", icon: "Store" },
    { title: "Shipping",       url: "VendorShipping",  icon: "Truck" },
    { title: "My Listings",    url: "MyListings",      icon: "Store" },
    { title: "Create Listing", url: "CreateListing",   icon: "Store" },
  ],
  auditor: [
    { title: "Marketplace",    url: "Marketplace",     icon: "LayoutDashboard" },
    { title: "Audit Queue",    url: "VettingQueue",    icon: "ShieldCheck" },
    { title: "My Audits",      url: "MyAudits",        icon: "ShieldCheck" },
    { title: "Trivia",         url: "TriviaChallenge", icon: "Brain" },
  ],
  picture_frame_shop: [
    { title: "Marketplace",    url: "Marketplace",         icon: "LayoutDashboard" },
    { title: "Dashboard",      url: "FrameShopDashboard",  icon: "Building2" },
    { title: "Messages",       url: "Messages",            icon: "MessageSquare" },
  ],
  influencer: [
    { title: "Marketplace",    url: "Marketplace",         icon: "LayoutDashboard" },
    { title: "Dashboard",      url: "InfluencerDashboard", icon: "TrendingUp" },
    { title: "Messages",       url: "Messages",            icon: "MessageSquare" },
    { title: "Explore Users",  url: "ExploreUsers",        icon: "User" },
  ],
  artist: [
    { title: "Marketplace",    url: "Marketplace",     icon: "LayoutDashboard" },
    { title: "Dashboard",      url: "ArtistDashboard", icon: "Palette" },
    { title: "Messages",       url: "Messages",        icon: "MessageSquare" },
    { title: "Public Profile", url: "ArtistProfile",   icon: "User" },
  ],
};

// ─── Permission derivation ────────────────────────────────────────────────────

/**
 * Derive a permissions object from a user record.
 * Checks both future `permissions` object (if present) and legacy fields.
 * @param {object|null} user
 * @returns {object} permissions map
 */
export function getUserPermissions(user) {
  if (!user) {
    return {
      can_collect:     false,
      can_sell:        false,
      can_audit:       false,
      can_frame:       false,
      can_influence:   false,
      can_create_art:  false,
      is_admin:        false,
    };
  }

  // Future-proof: if a rich permissions object is stored on the user, use it.
  if (user.permissions && typeof user.permissions === "object") {
    return {
      can_collect:    user.permissions.can_collect    ?? true,
      can_sell:       user.permissions.can_sell       ?? true,
      can_audit:      user.permissions.can_audit      ?? true,
      can_frame:      user.permissions.can_frame      ?? false,
      can_influence:  user.permissions.can_influence  ?? false,
      can_create_art: user.permissions.can_create_art ?? false,
      is_admin:       user.permissions.is_admin       ?? (user.role === "admin"),
    };
  }

  // Legacy derivation from user_type + opted_into_* flags
  const userType = user.user_type || "individual";

  return {
    // Every registered user can collect
    can_collect: true,

    // Everyone can list/sell items
    can_sell: true,

    // Everyone can audit
    can_audit: true,

    // Only approved frame shops (no need to opt in; approved = access)
    can_frame:
      !!user.frame_shop_id,

    // Only approved influencers (no need to opt in; approved = access)
    can_influence:
      !!user.influencer_id,

    // Only approved artists (no need to opt in; approved = access)
    can_create_art:
      !!user.artist_id,

    // Platform admin
    is_admin: user.role === "admin",
  };
}

// ─── Context list ─────────────────────────────────────────────────────────────

/**
 * Returns the ordered list of PRIMARY context keys available to this user.
 * PRIMARY ROLES ONLY: collector, vendor, auditor.
 * Sub-roles (frame shop, influencer, artist) are NOT primary contexts.
 *
 * All registered users have access to all primary roles.
 * Admin override does NOT affect this — primary roles are always available.
 *
 * @param {object|null} user
 * @returns {string[]}
 */
export function getAvailableContexts(user) {
  // Every user gets access to the three primary roles
  return ["collector", "vendor", "auditor"];
}

// ─── Context access ───────────────────────────────────────────────────────────

/**
 * Returns true if the user is allowed to switch to the given context.
 * This is the gate function for handleRoleSwitch in Layout.
 * @param {object|null} user
 * @param {string} context
 * @returns {boolean}
 */
export function canAccessContext(user, context) {
  if (!user) return false;
  return getAvailableContexts(user).includes(context);
}

// ─── Display context resolution ───────────────────────────────────────────────

/**
 * Resolve which context to actually display/render for a user.
 *
 * Priority order:
 *  1. activeContext (local UI state) — if the user can access it
 *  2. user.current_role             — legacy fallback (migration only)
 *  3. First available context       — safe default
 *
 * @param {object|null} user
 * @param {string|null} activeContext - local UI state from Layout
 * @returns {string} resolved context key
 */
export function getDisplayContext(user, activeContext) {
  if (!user) return activeContext || "collector";

  const available = getAvailableContexts(user);

  // 1. Honour local UI state if the user has permission
  if (activeContext && available.includes(activeContext)) {
    return activeContext;
  }

  // 2. Legacy fallback
  const saved = user.current_role;
  if (saved && available.includes(saved)) {
    return saved;
  }

  // 3. Safe default
  return available[0] || "collector";
}

/**
 * Derive a sensible default context for a user on first load.
 * Used by Layout to seed the activeContext state.
 * @param {object|null} user
 * @returns {string}
 */
export function getDefaultContext(user) {
  return getDisplayContext(user, null);
}

// ─── Context metadata helpers ─────────────────────────────────────────────────

/**
 * Returns the primary hex colour for a context.
 * @param {string} context
 * @returns {string} hex colour
 */
export function getContextColor(context) {
  return CONTEXT_COLORS[context] || CONTEXT_COLORS.collector;
}

/**
 * Returns the gradient class string for a context (Tailwind).
 * @param {string} context
 * @returns {string}
 */
export function getContextGradient(context) {
  return CONTEXT_GRADIENTS[context] || CONTEXT_GRADIENTS.collector;
}

/**
 * Returns the background gradient class string for a context (Tailwind).
 * @param {string} context
 * @returns {string}
 */
export function getContextBackground(context) {
  return CONTEXT_BACKGROUNDS[context] || CONTEXT_BACKGROUNDS.collector;
}

/**
 * Returns the navigation item definitions for a context.
 * Icon values are string keys; callers map them to actual icon components.
 * @param {string} context
 * @returns {Array<{title: string, url: string, icon: string}>}
 */
export function getContextNavigation(context) {
  return CONTEXT_NAVIGATION[context] || CONTEXT_NAVIGATION.collector;
}

/**
 * Returns the home page name for a context (used after context switch navigation).
 * @param {string} context
 * @returns {string}
 */
export function getContextHomePage(context) {
  return CONTEXT_HOME_PAGES[context] || "Marketplace";
}

// ─── Sub-role access ──────────────────────────────────────────────────────────

/**
 * Returns effective sub-role access for the current user.
 * 
 * NORMAL USERS: get access only if approved + linked + opted in
 * ADMINS: get access for preview/testing without approval
 * 
 * Returns both:
 * - canAccess* booleans: whether user can use special-role features/pages
 * - hasEntity* booleans: whether real entity record exists (for fallback states)
 * 
 * @param {object|null} user
 * @returns {object}
 */
export function getSubRoleAccess(user) {
  if (!user) {
    return {
      // Access for normal users
      canAccessFrameShopTools: false,
      canAccessInfluencerTools: false,
      canAccessArtistTools: false,
      hasFounderCircleAccess: false,
      // Entity presence for fallback states
      hasFrameShopEntity: false,
      hasInfluencerEntity: false,
      hasArtistEntity: false,
    };
  }

  const p = getUserPermissions(user);
  const isAdmin = p.is_admin;

  // Frame shop access resolution
  const hasFrameShopEntity = (user.user_type === "picture_frame_shop" || !!user.frame_shop_id);
  const canAccessFrameShopTools = isAdmin ? hasFrameShopEntity || true : p.can_frame;

  // Influencer access resolution
  const hasInfluencerEntity = (user.user_type === "influencer" || !!user.influencer_id);
  const canAccessInfluencerTools = isAdmin ? hasInfluencerEntity || true : p.can_influence;

  // Artist access resolution
  const hasArtistEntity = (user.user_type === "artist" || !!user.artist_id);
  const canAccessArtistTools = isAdmin ? hasArtistEntity || true : p.can_create_art;

  // Founder circle (no admin override — based on actual Indiegogo status)
  const hasFounderCircleAccess = user.user_type === "indiegogo_investor" && user.is_indiegogo_founder === true;

  return {
    // Access booleans (use these for page/feature gating)
    canAccessFrameShopTools,
    canAccessInfluencerTools,
    canAccessArtistTools,
    hasFounderCircleAccess,
    // Entity presence (use these for fallback states)
    hasFrameShopEntity,
    hasInfluencerEntity,
    hasArtistEntity,
  };
}