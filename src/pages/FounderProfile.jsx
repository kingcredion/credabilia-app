import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { 
  Crown,
  MessageSquare,
  ShieldCheck,
  ArrowLeft,
  Eye,
  DollarSign,
  Gift
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import UnifiedProfileHeader from "../components/profiles/UnifiedProfileHeader";

export default function FounderProfile() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const investorId = searchParams.get("id");
  const investorEmail = searchParams.get("email");
  const isPreviewMode = searchParams.get("preview") === "true";

  const [user, setUser] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const { data: investor, isLoading } = useQuery({
    queryKey: ['founder-investor', investorId, investorEmail, user?.email],
    queryFn: async () => {
      if (investorId) {
        try {
          return await base44.entities.IndiegogoInvestor.get(investorId);
        } catch (e) {
          return null;
        }
      }
      if (!investorEmail) return null;
      const investors = await base44.entities.IndiegogoInvestor.filter({
        user_email: investorEmail,
        status: "verified"
      });
      return investors[0] || null;
    },
    enabled: !!investorId || !!investorEmail
  });

  const { data: investorOwner } = useQuery({
    queryKey: ['investor-owner', investor?.user_email],
    queryFn: async () => {
      if (!investor?.user_email) return null;
      try {
        const users = await base44.entities.User.list();
        return users?.find(u => u.email === investor.user_email) || null;
      } catch (error) {
        return null;
      }
    },
    enabled: !!investor?.user_email
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-amber-50 dark:bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600"></div>
      </div>
    );
  }

  if (!investor) {
    return (
      <div className="min-h-screen bg-amber-50 dark:bg-background p-6 flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-4">Founder Not Found</h1>
        <p className="text-gray-600 dark:text-muted-foreground mb-6">This founder profile doesn't exist or is not public.</p>
        <Button onClick={() => navigate(createPageUrl("Marketplace"))}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Marketplace
        </Button>
      </div>
    );
  }

  const displayName = investorOwner?.full_name || investor.user_email?.split('@')[0] || "Founder";
  const isOwner = user?.email === investor.user_email;

  return (
    <div className="min-h-screen bg-amber-50 dark:bg-background pb-12">
      <UnifiedProfileHeader
        displayName={displayName}
        headline="Founder's Circle Member"
        avatarUrl={investorOwner?.avatar_url}
        fallbackInitial={(displayName || 'F')[0]}
        gradientFrom="from-amber-600"
        gradientVia="via-amber-600"
        gradientTo="to-amber-700"
        credionImageUrl="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/e1bb7b419_IMG_0622.png"
        location={investorOwner?.location}
        rating={0}
        reviewCount={0}
        totalSales={0}
        isVerified={investor.status === 'verified'}
        isOwner={isOwner}
        profileType="Founder Profile"
        isPreviewMode={isPreviewMode}
        onMessage={() => {
           if (!user) {
             toast.error("Please sign in to message");
             return;
           }
           navigate(createPageUrl(`Messages?startConversation=${investor.user_email}`));
         }}
        dashboardLabel="View Circle"
        dashboardIcon={Crown}
        dashboardRoute={createPageUrl("FounderCircleDashboard")}
        onPreviewPublic={() => {
           if (!isOwner) return;
           navigate(createPageUrl(`FounderProfile?id=${investor.id}&preview=true`));
         }}
        onExitPreview={() => {
           navigate(createPageUrl(`FounderProfile?id=${investor.id}`));
         }}
      />

      <div className="max-w-7xl mx-auto px-6 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Info */}
          <div className="lg:col-span-2 space-y-8">
            <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-200 dark:border-amber-800">
              <CardHeader>
                <CardTitle className="text-amber-900 dark:text-amber-200">Founder's Circle Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <p className="text-xs uppercase tracking-wide font-bold text-amber-700 dark:text-amber-400 mb-2">
                    Recognition Status
                  </p>
                  <Badge className="bg-gradient-to-r from-amber-600 to-yellow-600 text-white text-sm px-4 py-2 capitalize">
                    {investor.founder_circle_tier?.replace('_', ' ') || 'Standard'} Member
                  </Badge>
                </div>

                <div>
                  <h4 className="font-semibold text-foreground mb-3">Exclusive Perks</h4>
                  <ul className="space-y-2">
                    {investor.founder_circle_tier === 'elite_tier' ? (
                      <>
                        <li className="flex items-start gap-2">
                          <Crown className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <span className="text-foreground">Lifetime 0% seller fees on all marketplace listings</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Gift className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <span className="text-foreground">Priority access to exclusive giveaways</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <DollarSign className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <span className="text-foreground">Surprise store credit rewards</span>
                        </li>
                      </>
                    ) : (
                      <>
                        <li className="flex items-start gap-2">
                          <Gift className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <span className="text-foreground">Access to exclusive Founder's Circle community</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <DollarSign className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <span className="text-foreground">Periodic store credit bonuses</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Crown className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                          <span className="text-foreground">Opportunity to upgrade to Elite status</span>
                        </li>
                      </>
                    )}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Stats & Trust (only show if not in preview mode or owner) */}
          {!isPreviewMode && (
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-4">
              {/* Status Badge */}
              <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-200 dark:border-amber-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-amber-600" />
                    Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge className="bg-amber-600 text-white">
                    Verified Backer
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-3">
                    Early supporter of Credabilia. Enjoy exclusive benefits and community access.
                  </p>
                </CardContent>
              </Card>

              {/* Store Credits */}
              {investor.store_credits_balance > 0 && (
                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-green-600" />
                      Store Credits
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-green-600">
                      ${(investor.store_credits_balance / 100).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Available to spend in our marketplace
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Trust Badge */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 flex gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300">Exclusive Access</h4>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                    Founder's Circle is reserved for early backers only.
                  </p>
                </div>
              </div>
            </div>
            </div>
            )}
            </div>
            </div>
            </div>
            );
            }