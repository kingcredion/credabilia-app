import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Building2, Crown, TrendingUp, Palette, ArrowRight, CheckCircle2, Shield, Clock, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";

const roles = [
  {
    id: "picture_frame_shop",
    name: "Frame Shop",
    description: "Offer custom framing services and receive requests from collectors. Two-step process: application → approval → activation.",
    icon: Building2,
    iconColor: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    applyUrl: "Onboarding?type=picture_frame_shop",
  },
  {
    id: "influencer",
    name: "Influencer",
    description: "Promote items to your audience and earn commissions on sales.",
    icon: TrendingUp,
    iconColor: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    applyUrl: "Onboarding?type=influencer",
  },
  {
    id: "artist",
    name: "Artist",
    description: "Create an artist profile and accept commission requests.",
    icon: Palette,
    iconColor: "bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400",
    applyUrl: "Onboarding?type=artist",
  },
  {
    id: "founder",
    name: "Founder Circle",
    description: "Exclusive access for early Indiegogo backers.",
    icon: Crown,
    iconColor: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
    applyUrl: "Onboarding?type=indiegogo_investor",
  },
];

export default function RolesTab({ user, onAdminSwitchRole }) {
  const isAdmin = user?.role === "admin";
  const [entities, setEntities] = useState({});
  const [isLoadingEntities, setIsLoadingEntities] = useState(true);

  // Load entity status for each special role
  useEffect(() => {
    const loadEntities = async () => {
      try {
        const data = {};

        // Check for frame shop
        if (user?.frame_shop_id) {
          const shops = await base44.entities.FrameShop.filter({ id: user.frame_shop_id });
          if (shops?.[0]) data.picture_frame_shop = shops[0];
        }

        // Check for influencer
        if (user?.influencer_id) {
          const influencers = await base44.entities.Influencer.filter({ id: user.influencer_id });
          if (influencers?.[0]) data.influencer = influencers[0];
        }

        // Check for artist
        if (user?.artist_id) {
          const artists = await base44.entities.Artist.filter({ id: user.artist_id });
          if (artists?.[0]) data.artist = artists[0];
        }

        setEntities(data);
      } catch (error) {
        console.error("Error loading entities:", error);
      } finally {
        setIsLoadingEntities(false);
      }
    };

    if (user?.frame_shop_id || user?.influencer_id || user?.artist_id) {
      loadEntities();
    } else {
      setIsLoadingEntities(false);
    }
  }, [user]);

  // Determine the status of a role for a normal user
  const getRoleStatus = (roleId) => {
    // Admin: has instant access
    if (isAdmin) return "instant_access";

    const entity = entities[roleId];
    if (!entity) return "not_applied";

    if (entity.status === "pending_approval") return "pending";
    if (entity.status === "active") return "active";
    if (entity.status === "rejected") return "rejected";
    if (entity.status === "suspended") return "suspended";

    return "not_applied";
  };

  return (
    <div className="space-y-6">
      {/* Description */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-foreground mb-2">
          Available Roles
        </h3>
        <p className="text-sm text-gray-600 dark:text-muted-foreground mb-4">
          {isAdmin
            ? "Admins can instantly access special role tools for testing and moderation without waiting for approval. Your primary role remains collector/vendor/auditor."
            : "Apply for specialized roles to unlock new features and earning opportunities. Approvals are reviewed within 24-48 hours."}
        </p>
        {!isAdmin && (
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-500/30 rounded-lg p-3 mb-4">
            <p className="text-xs text-blue-800 dark:text-blue-300">
              <strong>Frame Shop Note:</strong> Applications go through approval, then you activate your dashboard. Other roles activate automatically after approval.
            </p>
          </div>
        )}
      </div>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((role) => {
          const status = getRoleStatus(role.id);
          const Icon = role.icon;
          
          // Determine styling based on status
          let cardClass = "hover:border-gray-300 dark:hover:border-gray-600";
          let badgeContent = null;
          let actionButton = null;

          if (status === "instant_access") {
            cardClass = "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-500/30";
            badgeContent = (
              <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-0 text-xs flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Instant Access
              </Badge>
            );
            actionButton = (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-between mt-3"
                onClick={() => onAdminSwitchRole?.(role.id)}
              >
                Access Tools
                <ArrowRight className="w-3 h-3" />
              </Button>
            );
          } else if (status === "active") {
            cardClass = "bg-gradient-to-br from-green-50 to-white dark:from-green-950/20 dark:to-transparent border-green-200 dark:border-green-500/30";
            badgeContent = (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 border-0 text-xs flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Approved
              </Badge>
            );
            if (role.id === "picture_frame_shop") {
              actionButton = (
                <Link to={createPageUrl("FrameShopDashboard")} className="block">
                  <Button variant="outline" size="sm" className="w-full justify-between mt-3">
                    Go to Dashboard
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              );
            }
          } else if (status === "pending") {
            cardClass = "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-500/30";
            badgeContent = (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0 text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Pending Approval
              </Badge>
            );
          } else if (status === "rejected") {
            cardClass = "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-500/30";
            badgeContent = (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-0 text-xs flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Application Rejected
              </Badge>
            );
            actionButton = (
              <Link to={createPageUrl(role.applyUrl)} className="block">
                <Button variant="outline" size="sm" className="w-full justify-between mt-3">
                  Reapply
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            );
          } else if (status === "not_applied") {
            actionButton = (
              <Link to={createPageUrl(role.applyUrl)} className="block">
                <Button variant="outline" size="sm" className="w-full justify-between mt-3">
                  Apply Now
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            );
          }

          return (
            <Card key={role.id} className={`relative overflow-hidden transition-all hover:shadow-lg ${cardClass}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${role.iconColor}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-gray-900 dark:text-foreground">
                        {role.name}
                      </h4>
                      {badgeContent}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-muted-foreground">
                      {role.description}
                    </p>
                  </div>
                </div>

                {!isLoadingEntities && actionButton && actionButton}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}