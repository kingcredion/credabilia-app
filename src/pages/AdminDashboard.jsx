import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import {
  ShieldCheck,
  ShieldAlert,
  Store,
  TrendingUp,
  Settings,
  Crown,
  LayoutDashboard,
  Building2,
  Users,
  Search,
  CheckCircle,
  Video,
  BarChart3
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import VideoScheduler from "../components/VideoScheduler";
import { Badge } from "@/components/ui/badge";

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [pendingCounts, setPendingCounts] = useState({ tickets: 0, feedback: 0, approvals: 0 });
  const [showVideoScheduler, setShowVideoScheduler] = useState(false);

  useEffect(() => {
    loadUser();
    loadPendingCounts();
    
    // Initial heartbeat
    runHeartbeat();
    
    // Run heartbeat every 5 minutes to handle automation while admin is active
    const interval = setInterval(runHeartbeat, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const runHeartbeat = async () => {
    try {
        // Silently run the scheduler heartbeat
        await base44.functions.invoke('schedulerHeartbeat');
    } catch (e) {
        console.error("Scheduler heartbeat failed", e);
    }
  };

  const loadUser = async () => {
    try {
        const userData = await base44.auth.me();
        setUser(userData);
    } catch (e) {
        console.error(e);
    }
  };

  const loadPendingCounts = async () => {
    try {
      const [tickets, feedback, investors, influencers, frameShops, artists] = await Promise.all([
        base44.entities.SupportTicket.filter({ status: 'awaiting_admin' }),
        base44.entities.TechnicalFeedback.filter({ status: 'new' }),
        base44.entities.IndiegogoInvestor.filter({ status: 'pending_verification' }),
        base44.entities.Influencer.filter({ status: 'pending_approval' }),
        base44.entities.FrameShop.filter({ status: 'pending_approval' }),
        base44.entities.Artist.filter({ status: 'pending_approval' })
      ]);
      
      const totalApprovals = investors.length + influencers.length + frameShops.length + artists.length;
      
      setPendingCounts({
        tickets: tickets.length,
        feedback: feedback.length,
        approvals: totalApprovals
      });
    } catch (error) {
      console.error("Error loading pending counts:", error);
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
            <ShieldCheck className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h1>
            <p className="text-gray-600">You do not have permission to view this page.</p>
            <Link to={createPageUrl("Marketplace")} className="mt-4 inline-block text-blue-600 hover:underline">
                Return to Marketplace
            </Link>
        </div>
      </div>
    );
  }

  const totalPending = pendingCounts.tickets + pendingCounts.feedback;

  const adminModules = [
    {
      title: "Approvals Center",
      description: "Manage specialized account applications",
      url: "AdminApprovals",
      icon: CheckCircle,
      color: "bg-blue-100 text-blue-700",
      badge: pendingCounts.approvals > 0 ? pendingCounts.approvals : null
    },
    {
      title: "Admin Tickets",
      description: "Support requests and bug reports",
      url: "AdminTickets",
      icon: ShieldCheck,
      color: "bg-red-100 text-red-700",
      badge: totalPending > 0 ? totalPending : null
    },
    {
      title: "Marketing Hub",
      description: "Manage campaigns and budgets",
      url: "MarketingHub",
      icon: TrendingUp,
      color: "bg-green-100 text-green-700"
    },
    {
      title: "Auditor Rewards",
      description: "Manage auditor pool distributions and credit payouts",
      url: "AuditorRewards",
      icon: Settings,
      color: "bg-slate-100 text-slate-700"
    },
    {
      title: "Framing Requests",
      description: "Oversee custom framing orders",
      url: "AdminFramingRequests",
      icon: Building2,
      color: "bg-indigo-100 text-indigo-700"
    },
    {
      title: "Onboarding Preview",
      description: "Test the user onboarding flow",
      url: "AdminOnboardingPreview",
      icon: LayoutDashboard,
      color: "bg-gray-100 text-gray-700"
    },
    {
      title: "Video Scheduler",
      description: "Create and schedule video posts",
      action: () => setShowVideoScheduler(true),
      icon: Video,
      color: "bg-pink-100 text-pink-700"
    },
    {
      title: "Review Queue",
      description: "AI-assisted item moderation",
      url: "AdminReviewQueuePage",
      icon: ShieldAlert,
      color: "bg-orange-100 text-orange-700",
      badge: null
    },
    {
      title: "Platform Analytics",
      description: "Track sales, revenue, and user growth",
      url: "AdminAnalytics",
      icon: BarChart3,
      color: "bg-teal-100 text-teal-700"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
            <div className="bg-slate-900 text-white p-2 rounded-lg">
                <Settings className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
        </div>
        <p className="text-gray-600 mb-8 ml-14">Central control panel for platform administration</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminModules.map((module) => (
            module.action ? (
              <div key={module.title} onClick={module.action}>
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
                    <p className="text-sm text-gray-500 mb-3 h-10">{module.description}</p>
                    {module.badge ? (
                      <Badge className="bg-red-500 text-white hover:bg-red-600 shadow-sm">
                        {module.badge} Pending Actions
                      </Badge>
                    ) : (
                      <div className="h-6 flex items-center text-xs text-gray-400">
                          <CheckCircle className="w-3 h-3 mr-1" /> All clear
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
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
                    <p className="text-sm text-gray-500 mb-3 h-10">{module.description}</p>
                    {module.badge ? (
                      <Badge className="bg-red-500 text-white hover:bg-red-600 shadow-sm">
                        {module.badge} Pending Actions
                      </Badge>
                    ) : (
                      <div className="h-6 flex items-center text-xs text-gray-400">
                          <CheckCircle className="w-3 h-3 mr-1" /> All clear
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          ))}
        </div>

        {user && (
          <VideoScheduler 
            user={user}
            open={showVideoScheduler}
            onClose={() => setShowVideoScheduler(false)}
          />
        )}
      </div>
    </div>
  );
}