import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, MessageSquare, User, ShieldCheck, Store, Trophy, Building2, Palette } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { CONTEXT_COLORS as roleColors } from "@/lib/permissions";

// PRIMARY roles only — these drive the shell mobile nav
const primaryRolePageMap = {
  collector: { label: "Collection", url: "MyCollection", icon: Trophy },
  vendor: { label: "Listings", url: "MyListings", icon: Store },
  auditor: { label: "Audits", url: "MyAudits", icon: ShieldCheck },
};

// Special roles are not top-level contexts; they're accessed via sidebar/settings
// Mobile users can still reach them through their dashboards, but not via primary nav

const staticTabs = [
  { label: "Market", url: "Marketplace", icon: LayoutDashboard },
  { label: "Messages", url: "Messages", icon: MessageSquare },
  { label: "Profile", url: "Profile", icon: User },
];

export default function MobileBottomNav({ user, currentRole, unreadMessageCount }) {
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;

  // Only primary roles drive mobile nav. Special roles are accessed via sidebar.
  const rolePage = primaryRolePageMap[currentRole] || primaryRolePageMap.collector;
  
  // Build tabs: Market, role-specific, Messages, Profile
  const tabs = [
    staticTabs[0],
    rolePage,
    staticTabs[1],
    staticTabs[2],
  ];

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
        const isActive = location.pathname === href ||
          (location.pathname.startsWith(href) && (location.pathname[href.length] === "?" || location.pathname[href.length] === undefined));
        const isRoleTab = url === primaryRolePageMap[currentRole]?.url;
        const roleColor = roleColors[currentRole];
        const activeColor = isRoleTab ? roleColor : "#2563eb";

        const isProfileTab = url === "Profile";

        return (
          <button
            key={url}
            onClick={() => handleTabPress(url)}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            role="tab"
            aria-selected={isActive}
            className="flex-1 flex flex-col items-center justify-center gap-1 active:opacity-70 transition-opacity"
            style={{
              minHeight: 56,
              WebkitTapHighlightColor: "transparent",
              background: "none",
              border: "none",
              padding: "8px 0",
            }}
          >
            <div className="relative">
              <div
                className="rounded-xl transition-all duration-200"
                style={{
                  padding: isProfileTab ? "2px 10px" : "4px 12px",
                  backgroundColor: isActive ? `${activeColor}15` : "transparent",
                }}
              >
                {isProfileTab ? (
                  <Avatar className="w-6 h-6" style={{ ring: isActive ? `2px solid ${activeColor}` : "none" }}>
                    <AvatarImage src={user.avatar_url} className="object-cover" />
                    <AvatarFallback className="text-[10px] text-white" style={{ backgroundColor: activeColor }}>
                      {(user.full_name || user.email || "U")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Icon
                    className="w-5 h-5 transition-colors"
                    style={{ color: isActive ? activeColor : "hsl(var(--muted-foreground))" }}
                  />
                )}
              </div>
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
          </button>
        );
      })}
    </nav>
  );
}