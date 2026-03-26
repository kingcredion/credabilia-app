import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp,
  MessageSquare,
  ShieldCheck,
  ArrowLeft,
  Eye,
  Copy,
  Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import UnifiedProfileHeader from "../components/profiles/UnifiedProfileHeader";

export default function InfluencerProfile() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const influencerId = searchParams.get("id");
  const influencerEmail = searchParams.get("email");
  const isPreviewMode = searchParams.get("preview") === "true";

  const [user, setUser] = useState(null);
  const [copied, setCopied] = useState(false);

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

  const { data: influencer, isLoading } = useQuery({
    queryKey: ['influencer', influencerId || influencerEmail, user?.email],
    queryFn: async () => {
      let influencers = [];
      if (influencerId && influencerId !== "undefined") {
        influencers = await base44.entities.Influencer.filter({ id: influencerId });
      } else if (influencerEmail) {
        influencers = await base44.entities.Influencer.filter({ user_email: influencerEmail });
      } else if (user?.email) {
        influencers = await base44.entities.Influencer.filter({ user_email: user.email });
      }
      return influencers[0] || null;
    },
    enabled: !!(influencerId || influencerEmail || user?.email)
  });

  const { data: influencerOwner } = useQuery({
    queryKey: ['influencer-owner', influencer?.user_email],
    queryFn: async () => {
      if (!influencer?.user_email) return null;
      try {
        const users = await base44.entities.User.list();
        return users?.find(u => u.email === influencer.user_email) || null;
      } catch (error) {
        return null;
      }
    },
    enabled: !!influencer?.user_email
  });

  const { data: referralStats } = useQuery({
    queryKey: ['influencer-referrals', influencer?.id],
    queryFn: async () => {
      if (!influencer?.id) return { clicks: 0, conversions: 0, revenue: 0 };
      const transactions = await base44.entities.Transaction.filter({
        influencer_id: influencer.id
      });
      return {
        clicks: influencer.total_clicks || 0,
        conversions: transactions.length,
        revenue: transactions.reduce((sum, t) => sum + (t.influencer_commission || 0), 0)
      };
    },
    enabled: !!influencer?.id
  });

  const handleCopyReferralCode = () => {
    if (!influencer?.referral_code) return;
    navigator.clipboard.writeText(influencer.referral_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-green-50 dark:bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!influencer) {
    return (
      <div className="min-h-screen bg-green-50 dark:bg-background p-6 flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-4">Influencer Not Found</h1>
        <p className="text-gray-600 dark:text-muted-foreground mb-6">This influencer profile doesn't exist.</p>
        <Button onClick={() => navigate(createPageUrl("ExploreFrameShops"))}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  if (influencer.status !== 'active' && user?.email !== influencer.user_email) {
    return (
      <div className="min-h-screen bg-green-50 dark:bg-background p-6 flex flex-col items-center justify-center">
        <ShieldCheck className="w-16 h-16 text-green-300 dark:text-green-700 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-2">Profile Under Review</h1>
        <p className="text-gray-600 dark:text-muted-foreground mb-6 text-center max-w-md">
          This influencer profile is currently being vetted. Please check back later.
        </p>
        <Button onClick={() => navigate(createPageUrl("ExploreFrameShops"))}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-green-50 dark:bg-background pb-12">
      <UnifiedProfileHeader
        displayName={influencerOwner?.full_name || influencer.user_email?.split('@')[0] || "Influencer"}
        headline="Trusted Curator & Discovery Engine"
        avatarUrl={influencerOwner?.avatar_url}
        fallbackInitial={(influencerOwner?.full_name || influencer.user_email || 'I')[0]}
        gradientFrom="from-green-500"
        gradientVia="via-emerald-500"
        gradientTo="to-teal-600"
        credionImageUrl="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/ff3301e66_influencer.png"
        location={influencerOwner?.location}
        rating={0}
        reviewCount={0}
        totalSales={referralStats?.conversions || 0}
        isVerified={influencer.status === 'active'}
        isOwner={user?.email === influencer.user_email}
        profileType="Influencer Profile"
        isPreviewMode={isPreviewMode}
        onMessage={() => {
           if (!user) {
             toast.error("Please sign in to message");
             return;
           }
           navigate(createPageUrl(`Messages?startConversation=${influencer.user_email}`));
         }}
        dashboardLabel="Manage Influencer"
        dashboardIcon={TrendingUp}
        dashboardRoute={createPageUrl("InfluencerDashboard")}
        onPreviewPublic={() => {
           if (user?.email !== influencer.user_email) return;
           navigate(createPageUrl(`InfluencerProfile?id=${influencer.id}&preview=true`));
         }}
        onExitPreview={() => {
           navigate(createPageUrl(`InfluencerProfile?id=${influencer.id}`));
         }}
      />

      <div className="max-w-7xl mx-auto px-6 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Info & Stats */}
          <div className="lg:col-span-2 space-y-8">
            <Tabs defaultValue="about" className="w-full">
              <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-6">
                <TabsTrigger 
                  value="about" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:text-green-700 data-[state=active]:bg-transparent pb-3 px-1"
                >
                  About
                </TabsTrigger>
                <TabsTrigger 
                  value="platforms"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-600 data-[state=active]:text-green-700 data-[state=active]:bg-transparent pb-3 px-1"
                >
                  Platforms
                </TabsTrigger>
              </TabsList>

              <TabsContent value="about" className="mt-6 space-y-6">
                <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
                  <CardHeader>
                    <CardTitle className="text-green-900 dark:text-green-200">What Makes This Creator Special</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-green-800 dark:text-green-300 leading-relaxed">
                      {influencer.application_notes || "Trusted curator bringing you carefully selected items and brands worth your attention."}
                    </p>
                    <div className="flex items-start gap-3 pt-2">
                      <Star className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-green-700 dark:text-green-400">
                        Verified influencer with {referralStats?.conversions || 0} successful recommendations
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>About the Creator</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-foreground mb-2">Referral Code</h4>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted px-3 py-2 rounded font-mono text-sm text-foreground flex-1">
                          {influencer.referral_code}
                        </code>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={handleCopyReferralCode}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      {copied && <p className="text-xs text-green-600 mt-1">Copied!</p>}
                    </div>

                    {influencer.application_notes && (
                      <div>
                        <h4 className="font-semibold text-foreground mb-2">Bio</h4>
                        <p className="text-muted-foreground whitespace-pre-wrap">
                          {influencer.application_notes}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="platforms" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Active Platforms</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {influencer.platforms && influencer.platforms.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {influencer.platforms.map(platform => (
                          <Badge key={platform} variant="secondary" className="capitalize">
                            {platform}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No platforms listed.</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column: Stats & Trust (only show if not in preview mode) */}
          {!isPreviewMode && (
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-4">
              {/* Referral Stats */}
              <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                    Referral Impact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Clicks</p>
                    <p className="text-2xl font-bold text-green-600">{referralStats?.clicks || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Conversions</p>
                    <p className="text-2xl font-bold text-green-600">{referralStats?.conversions || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Earnings</p>
                    <p className="text-2xl font-bold text-green-600">
                      ${(referralStats?.revenue || 0).toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Trust Badge */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 flex gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300">Verified Creator</h4>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                    This influencer has been verified by our team.
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