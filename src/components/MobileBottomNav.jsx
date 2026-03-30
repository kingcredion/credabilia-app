import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, MessageSquare, User, ShieldCheck, Store, Trophy } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { CONTEXT_COLORS as roleColors } from "@/lib/permissions";
import GlassIcon from "@/components/GlassIcon";
import { motion } from "framer-motion";

// PRIMARY roles only — these drive the shell mobile nav
const primaryRolePageMap = {
  collector: { label: "Collection", url: "MyCollection", icon: Trophy },
  vendor: { label: "Listings", url: "MyListings", icon: Store },
  auditor: { label: "Audits", url: "MyAudits", icon: ShieldCheck },
};

// Admin child pages — any of these make the Control tab highlight as active
const ADMIN_CHILD_PAGES = new Set([
  "/AdminDashboard", "/AdminApprovals", "/AdminTickets", "/AdminReviewQueuePage",
  "/AdminAnalytics", "/AdminFramingRequests", "/AdminOnboardingPreview",
  "/AdminArtists", "/AdminFrameShops", "/AdminInfluencers",
  "/MarketingHub", "/AuditorRewards", "/CouncilRewards",
]);

const adminTabs = [
  { label: "Market", url: "Marketplace", icon: LayoutDashboard },
  { label: "Control", url: "AdminDashboard", icon: ShieldCheck },
  { label: "Messages", url: "Messages", icon: MessageSquare },
  { label: "Profile", url: "Profile", icon: User },
];

const staticTabs = [
  { label: "Market", url: "Marketplace", icon: LayoutDashboard },
  { label: "Messages", url: "Messages", icon: MessageSquare },
  { label: "Profile", url: "Profile", icon: User },
];

export default function MobileBottomNav({ user, currentRole, unreadMessageCount }) {
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;

  const isAdmin = user.role === 'admin';

  // Admin gets its own fixed tab set
  const tabs = isAdmin
    ? adminTabs
    : [staticTabs[0], primaryRolePageMap[currentRole] || primaryRolePageMap.collector, staticTabs[1], staticTabs[2]];

  const handleTabPress = (url) => {
    const href = createPageUrl(url);
    const isActive = location.pathname === href ||
      (location.pathname.startsWith(href) && (location.pathname[href.length] === "?" || location.pathname[href.length] === undefined));

    // Do not re-navigate when tapping already-active tab
    if (isActive) return;
    
    // Use replace for bottom-tab switches to prevent stacking history
    navigate(href, { replace: true });
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border flex md:hidden"
      style={{
        userSelect: "none",
        paddingBottom: "env(safe-area-inset-bottom)",
        WebkitBackdropFilter: "blur(12px)",
      }}
      role="tablist"
      aria-label="Main navigation"
    >
      {tabs.map(({ label, url, icon: Icon }) => {
        const href = createPageUrl(url);
        const isControlTab = isAdmin && url === "AdminDashboard";
        const isActive = isControlTab
          ? (location.pathname === href || ADMIN_CHILD_PAGES.has(location.pathname))
          : (location.pathname === href ||
              (location.pathname.startsWith(href) && (location.pathname[href.length] === "?" || location.pathname[href.length] === undefined)));
        const isRoleTab = !isAdmin && url === primaryRolePageMap[currentRole]?.url;
        const roleColor = roleColors[currentRole];
        const activeColor = isControlTab ? "#7c3aed" : isRoleTab ? roleColor : "#2563eb";

        const isProfileTab = url === "Profile";

        return (
          <motion.button
            key={url}
            onClick={() => handleTabPress(url)}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            role="tab"
            aria-selected={isActive}
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 700, damping: 35, mass: 0.4 }}
            className="flex-1 flex flex-col items-center justify-center gap-1"
            style={{
              minHeight: 56,
              WebkitTapHighlightColor: "transparent",
              background: "none",
              border: "none",
              padding: "8px 0",
            }}
          >
            <div className="relative">
              {isProfileTab ? (
                <GlassIcon
                  color={isActive ? (isControlTab ? 'purple' : isRoleTab ? (currentRole === 'vendor' ? 'orange' : currentRole === 'auditor' ? 'green' : 'blue') : 'blue') : 'white'}
                  active={isActive}
                  size="sm"
                  className={!isActive ? "!bg-transparent !border-transparent !shadow-none" : ""}
                >
                  <Avatar className="w-6 h-6">
                    <AvatarImage src={user.avatar_url} className="object-cover" />
                    <AvatarFallback className="text-[10px] text-white" style={{ backgroundColor: activeColor }}>
                      {(user.full_name || user.email || "U")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </GlassIcon>
              ) : (
                <GlassIcon
                  color={isActive ? (isControlTab ? 'purple' : isRoleTab ? (currentRole === 'vendor' ? 'orange' : currentRole === 'auditor' ? 'green' : 'blue') : 'blue') : 'white'}
                  active={isActive}
                  size="sm"
                  className={!isActive ? "!bg-transparent !border-transparent !shadow-none" : ""}
                >
                  <Icon
                    className="w-5 h-5 transition-colors"
                    style={{ color: isActive ? activeColor : "hsl(var(--muted-foreground))" }}
                  />
                </GlassIcon>
              )}
              {url === "Messages" && unreadMessageCount > 0 && (
                <span className="absolute -top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center border border-white">
                  {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                </span>
              )}
            </div>
            <span
              className="text-[10px] font-semibold transition-colors"
              style={{ color: isActive ? activeColor : "hsl(var(--muted-foreground))" }}
            >
              {label}
            </span>
          </motion.button>
        );
      })}
    </nav>
  );
}