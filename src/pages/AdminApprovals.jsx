import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import {
  Users,
  Store,
  Crown,
  Palette,
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { motion } from "framer-motion";

export default function AdminApprovals() {
  const [counts, setCounts] = useState({ investors: 0, influencers: 0, frameShops: 0, artists: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCounts();
  }, []);

  const loadCounts = async () => {
    try {
      const [investors, influencers, frameShops, artists] = await Promise.all([
        base44.entities.IndiegogoInvestor.filter({ status: 'pending_verification' }),
        base44.entities.Influencer.filter({ status: 'pending_approval' }),
        base44.entities.FrameShop.filter({ status: 'pending_approval' }),
        base44.entities.Artist.filter({ status: 'pending_approval' })
      ]);
      setCounts({
        investors: investors.length,
        influencers: influencers.length,
        frameShops: frameShops.length,
        artists: artists.length,
      });
    } catch (error) {
      console.error("Error loading approval counts:", error);
    } finally {
      setLoading(false);
    }
  };

  const baseRows = [
    { title: "Indiegogo Investors", description: "Verify backer IDs and assign founder tiers", url: "AdminIndiegogoInvestors", icon: Crown, count: counts.investors, order: 0 },
    { title: "Influencers", description: "Review partnership applications", url: "AdminInfluencers", icon: Users, count: counts.influencers, order: 1 },
    { title: "Frame Shops", description: "Vet new frame shop businesses", url: "AdminFrameShops", icon: Store, count: counts.frameShops, order: 2 },
    { title: "Artists", description: "Approve artist portfolios and profiles", url: "AdminArtists", icon: Palette, count: counts.artists, order: 3 },
  ];

  // Sort highest count first, stable by original order on tie
  const rows = [...baseRows].sort((a, b) => b.count - a.count || a.order - b.order);

  const total = counts.investors + counts.influencers + counts.frameShops + counts.artists;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <Link to={createPageUrl("AdminDashboard")} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Admin Dashboard
          </Link>
          <h1 className="text-base font-bold leading-tight">Approvals Queue</h1>
          <p className="text-xs text-muted-foreground">Review pending account applications</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">

        {/* Summary strip */}
        <div className={`rounded-lg border px-4 py-3 flex items-center justify-between ${total > 0 ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-700' : 'border-border bg-muted/40'}`}>
          <div className="flex items-center gap-2">
            {total > 0
              ? <AlertTriangle className="w-4 h-4 text-orange-500" />
              : <CheckCircle className="w-4 h-4 text-green-500" />
            }
            <span className={`text-sm font-semibold ${total > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-muted-foreground'}`}>
              {total > 0 ? `${total} application${total !== 1 ? 's' : ''} awaiting review` : 'All caught up'}
            </span>
          </div>
          {total > 0 && (
            <span className="text-xs bg-orange-500 text-white font-bold px-2 py-0.5 rounded-full">{total}</span>
          )}
        </div>

        {/* Queue list */}
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border bg-card">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            rows.map((row) => (
              <Link key={row.title} to={createPageUrl(row.url)} className="block">
                <motion.div
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 700, damping: 40, mass: 0.4 }}
                  className={`flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors ${row.count > 0 ? '' : 'opacity-60'}`}
                >
                  <div className={`p-2 rounded-md flex-shrink-0 ${row.count > 0 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' : 'bg-muted text-muted-foreground'}`}>
                    <row.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-tight ${row.count > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {row.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{row.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {row.count > 0 ? (
                      <span className="text-xs bg-orange-500 text-white font-bold px-2 py-0.5 rounded-full">{row.count}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No pending</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </motion.div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}