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
  Clock
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdminApprovals() {
  const [counts, setCounts] = useState({
    investors: 0,
    influencers: 0,
    frameShops: 0,
    artists: 0
  });
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
        artists: artists.length
      });
    } catch (error) {
      console.error("Error loading approval counts:", error);
    } finally {
      setLoading(false);
    }
  };

  const approvalModules = [
    {
      title: "Indiegogo Investors",
      description: "Verify backer IDs and assign founder tiers",
      url: "AdminIndiegogoInvestors",
      icon: Crown,
      color: "bg-yellow-100 text-yellow-700",
      count: counts.investors
    },
    {
      title: "Influencers",
      description: "Review partnership applications",
      url: "AdminInfluencers",
      icon: Users,
      color: "bg-pink-100 text-pink-700",
      count: counts.influencers
    },
    {
      title: "Frame Shops",
      description: "Vet new frame shop businesses",
      url: "AdminFrameShops",
      icon: Store,
      color: "bg-purple-100 text-purple-700",
      count: counts.frameShops
    },
    {
      title: "Artists",
      description: "Approve artist portfolios and profiles",
      url: "AdminArtists",
      icon: Palette,
      color: "bg-rose-100 text-rose-700",
      count: counts.artists
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <Link to={createPageUrl("AdminDashboard")} className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="bg-blue-600 text-white p-2 rounded-lg">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Account Approvals</h1>
        </div>
        <p className="text-gray-600 mb-8 ml-14">Manage pending applications for specialized accounts</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {approvalModules.map((module) => (
            <Link key={module.title} to={createPageUrl(module.url)}>
              <Card className="hover:shadow-lg transition-all cursor-pointer h-full border-2 border-transparent hover:border-gray-200 group">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                    {module.title}
                  </CardTitle>
                  <div className={`p-2 rounded-full ${module.color} group-hover:scale-110 transition-transform`}>
                    <module.icon className="w-5 h-5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4 h-5">{module.description}</p>
                  <div className="flex items-center justify-between">
                    {module.count > 0 ? (
                      <Badge className="bg-orange-500 text-white hover:bg-orange-600 shadow-sm flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {module.count} Pending
                      </Badge>
                    ) : (
                      <div className="flex items-center text-xs text-green-600 font-medium">
                        <CheckCircle className="w-3 h-3 mr-1" /> All Caught Up
                      </div>
                    )}
                    <span className="text-xs text-gray-400 group-hover:text-blue-500 transition-colors">
                      Manage &rarr;
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}