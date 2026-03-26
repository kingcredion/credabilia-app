import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, MapPin, Crown, Building2, Palette, TrendingUp } from "lucide-react";
import { getSubRoleAccess } from "@/lib/permissions";

const roleConfig = {
  collector: { label: "Collector", icon: null, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  vendor: { label: "Vendor", icon: null, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  auditor: { label: "Auditor", icon: null, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  picture_frame_shop: { label: "Frame Shop", icon: Building2, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  influencer: { label: "Influencer", icon: TrendingUp, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  artist: { label: "Artist", icon: Palette, color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300" },
  indiegogo_investor: { label: "Founder", icon: Crown, color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
};

export default function AccountSummary({ user }) {
  const subRoleAccess = getSubRoleAccess(user);
  const primaryRoles = ["collector", "vendor", "auditor"];
  
  // Only show APPROVED/ACTIVE special roles, not pending applications
  const approvedSpecialRoles = [];
  if (subRoleAccess.canAccessFrameShopTools) {
    approvedSpecialRoles.push("picture_frame_shop");
  }
  if (subRoleAccess.canAccessInfluencerTools) {
    approvedSpecialRoles.push("influencer");
  }
  if (subRoleAccess.canAccessArtistTools) {
    approvedSpecialRoles.push("artist");
  }
  if (subRoleAccess.hasFounderCircleAccess) {
    approvedSpecialRoles.push("indiegogo_investor");
  }
  
  // Combine primary + approved special roles only
  const activeRoles = [...primaryRoles, ...approvedSpecialRoles];

  return (
    <Card className="border-0 bg-gradient-to-br from-blue-50 dark:from-blue-950/20 to-transparent dark:to-transparent">
      <CardContent className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-8">
          {/* Avatar */}
          <Avatar className="w-24 h-24 md:w-32 md:h-32 ring-4 ring-blue-200 dark:ring-blue-400/30 flex-shrink-0">
            <AvatarImage src={user?.avatar_url} className="object-cover" />
            <AvatarFallback className="text-xl font-bold">
              {(user?.full_name || user?.email || "U")[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-foreground mb-1">
              {user?.full_name || "Account"}
            </h1>

            <div className="space-y-2 mb-4 text-sm">
              <div className="flex items-center gap-2 text-gray-600 dark:text-muted-foreground">
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{user?.email}</span>
              </div>
              {user?.location && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-muted-foreground">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  <span>{user.location}</span>
                </div>
              )}
            </div>

            {/* Active Roles */}
            <div className="flex flex-wrap gap-2">
              {activeRoles.map((role) => {
                const config = roleConfig[role];
                return (
                  <Badge
                    key={role}
                    className={`${config.color} border-0 flex items-center gap-1`}
                  >
                    {config.icon && <config.icon className="w-3 h-3" />}
                    {config.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}