import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import {
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  Settings,
  LayoutDashboard,
  Building2,
  CheckCircle,
  Video,
  BarChart3,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import VideoScheduler from "../components/VideoScheduler";
import { Badge } from "@/components/ui/badge";

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [pendingCounts, setPendingCounts] = useState({ tickets: 0, feedback: 0, approvals: 0 });
  const [showVideoScheduler, setShowVideoScheduler] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);

  useEffect(() => {
    loadUser();
    loadPendingCounts();
    runHeartbeat();
    const interval = setInterval(runHeartbeat, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const runHeartbeat = async () => {
    try {
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
      setPendingCounts({
        tickets: tickets.length,
        feedback: feedback.length,
        approvals: investors.length + influencers.length + frameShops.length + artists.length
      });
    } catch (error) {
      console.error("Error loading pending counts:", error);
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <ShieldCheck className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-red-600 mb-2">Access Denied</h1>
          <p className="text-muted-foreground">You do not have permission to view this page.</p>
          <Link to={createPageUrl("Marketplace")} className="mt-4 inline-block text-blue-600 hover:underline">
            Return to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  // Priority summary cards
  const priorityCards = [
    {
      title: "Approvals",
      count: pendingCounts.approvals,
      url: "AdminApprovals",
      icon: CheckCircle,
      alertColor: "border-blue-400 bg-blue-50 dark:bg-blue-900/20",
      badgeColor: "bg-blue-500",
    },
    {
      title: "Support Tickets",
      count: pendingCounts.tickets,
      url: "AdminTickets",
      icon: ShieldCheck,
      alertColor: "border-red-400 bg-red-50 dark:bg-red-900/20",
      badgeColor: "bg-red-500",
    },
    {
      title: "Tech Feedback",
      count: pendingCounts.feedback,
      url: "AdminTickets",
      icon: AlertCircle,
      alertColor: "border-orange-400 bg-orange-50 dark:bg-orange-900/20",
      badgeColor: "bg-orange-500",
    },
    {
      title: "Review Queue",
      count: null,
      url: "AdminReviewQueuePage",
      icon: ShieldAlert,
      alertColor: "border-purple-400 bg-purple-50 dark:bg-purple-900/20",
      badgeColor: "bg-purple-500",
    },
  ];

  // Quick action cards
  const quickActions = [
    { title: "Approvals Center", url: "AdminApprovals", icon: CheckCircle, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20" },
    { title: "Admin Tickets", url: "AdminTickets", icon: ShieldCheck, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20" },
    { title: "Review Queue", url: "AdminReviewQueuePage", icon: ShieldAlert, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20" },
    { title: "Analytics", url: "AdminAnalytics", icon: BarChart3, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-900/20" },
    { title: "Video Scheduler", action: () => setShowVideoScheduler(true), icon: Video, color: "text-pink-600", bg: "bg-pink-50 dark:bg-pink-900/20" },
    { title: "Framing Requests", url: "AdminFramingRequests", icon: Building2, color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-900/20" },
  ];

  // Secondary tools
  const secondaryTools = [
    { title: "Marketing Hub", url: "MarketingHub", icon: TrendingUp, color: "text-green-600" },
    { title: "Auditor Rewards", url: "AuditorRewards", icon: Settings, color: "text-slate-600" },
    { title: "Onboarding Preview", url: "AdminOnboardingPreview", icon: LayoutDashboard, color: "text-gray-600" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <div className="bg-slate-900 dark:bg-slate-700 text-white p-1.5 rounded-md">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">Admin Control Center</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">Priority tasks and platform operations</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">

        {/* SECTION B — Priority summary cards */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Needs Attention</p>
          <div className="grid grid-cols-2 gap-2.5">
            {priorityCards.map((card) => (
              <Link key={card.title} to={createPageUrl(card.url)}>
                <div className={`tap-scale rounded-lg border-2 p-3 transition-shadow hover:shadow-md cursor-pointer ${card.count > 0 ? card.alertColor : 'border-border bg-card'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <card.icon className={`w-4 h-4 ${card.count > 0 ? card.color : 'text-muted-foreground'}`} style={card.count > 0 ? {} : {}} />
                    {card.count > 0 && (
                      <span className={`text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ${card.badgeColor}`}>
                        {card.count}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold leading-tight">{card.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {card.count === null ? 'View queue' : card.count > 0 ? `${card.count} pending` : 'All clear'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Live snapshot */}
        {(pendingCounts.approvals > 0 || pendingCounts.tickets > 0 || pendingCounts.feedback > 0) && (
          <section className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1.5">Live Snapshot</p>
            <ul className="space-y-1 text-sm text-amber-800 dark:text-amber-300">
              {pendingCounts.approvals > 0 && <li>• <strong>{pendingCounts.approvals}</strong> approvals pending</li>}
              {pendingCounts.tickets > 0 && <li>• <strong>{pendingCounts.tickets}</strong> tickets awaiting admin</li>}
              {pendingCounts.feedback > 0 && <li>• <strong>{pendingCounts.feedback}</strong> new technical feedback</li>}
            </ul>
          </section>
        )}

        {/* SECTION C — Quick Actions */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Quick Actions</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {quickActions.map((action) => {
              const inner = (
                <div className={`tap-scale rounded-lg border border-border p-3 flex items-center gap-3 transition-shadow hover:shadow-md cursor-pointer ${action.bg || 'bg-card'}`}>
                  <div className={`p-2 rounded-md bg-white/60 dark:bg-white/10 ${action.color}`}>
                    <action.icon className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium leading-tight">{action.title}</span>
                </div>
              );
              return action.action ? (
                <div key={action.title} onClick={action.action}>{inner}</div>
              ) : (
                <Link key={action.title} to={createPageUrl(action.url)}>{inner}</Link>
              );
            })}
          </div>
        </section>

        {/* SECTION D — Secondary Tools (collapsible) */}
        <section>
          <button
            onClick={() => setShowSecondary(!showSecondary)}
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            {showSecondary ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Secondary Tools
          </button>
          {showSecondary && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
              {secondaryTools.map((tool) => (
                <Link key={tool.title} to={createPageUrl(tool.url)}>
                  <div className="tap-scale rounded-lg border border-border bg-muted/40 p-3 flex items-center gap-3 hover:bg-muted/70 transition-shadow cursor-pointer">
                    <tool.icon className={`w-4 h-4 ${tool.color}`} />
                    <span className="text-sm font-medium text-muted-foreground">{tool.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {user && (
        <VideoScheduler
          user={user}
          open={showVideoScheduler}
          onClose={() => setShowVideoScheduler(false)}
        />
      )}
    </div>
  );
}