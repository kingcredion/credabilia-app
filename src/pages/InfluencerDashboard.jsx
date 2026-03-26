import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  TrendingUp,
  DollarSign,
  Users,
  Link as LinkIcon,
  Copy,
  CheckCircle,
  BarChart3,
  Award,
  Sparkles,
  Share2,
  Clock,
  Target,
  CreditCard,
  AlertCircle,
  ExternalLink,
  XCircle,
  ShoppingCart,
  Package,
  UserPlus,
  MessageSquare
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { motion } from "framer-motion";

export default function InfluencerDashboard() {
  const [user, setUser] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

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
    queryKey: ['my-influencer-data', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const influencers = await base44.entities.Influencer.filter({ user_email: user.email });
      return influencers[0] || null;
    },
    enabled: !!user?.email,
  });

  // Fetch users who signed up with the referral code (canonical source: ReferralAttribution)
  const { data: signedUpUsers } = useQuery({
    queryKey: ['signed-up-users', influencer?.referral_code],
    queryFn: async () => {
      if (!influencer?.referral_code) return [];
      
      try {
        // Primary: Use ReferralAttribution for canonical signup tracking
        const attributions = await base44.entities.ReferralAttribution?.filter({
          referrer_id: influencer.id,
          event_type: "signup"
        }).catch(() => []);

        if (attributions && attributions.length > 0) {
          return attributions
            .map(a => ({ email: a.referred_email, created_date: a.timestamp }))
            .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        }

        // Fallback: User.referred_by if ReferralAttribution unavailable
        const normalized = influencer.referral_code.toUpperCase();
        const allUsers = await base44.entities.User.filter({ referred_by: normalized });
        return allUsers.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
      } catch (error) {
        console.error("Error fetching signup users:", error);
        return [];
      }
    },
    enabled: !!influencer?.referral_code,
    initialData: [],
  });

  // Fetch transactions
  const { data: referredTransactions } = useQuery({
    queryKey: ['influencer-transactions', influencer?.id],
    queryFn: async () => {
      if (!influencer?.id) return [];
      const transactions = await base44.entities.Transaction.filter({ 
        influencer_id: influencer.id 
      }, "-created_date");
      return transactions;
    },
    enabled: !!influencer?.id,
    initialData: [],
  });

  // Fetch followers
  const { data: followers } = useQuery({
    queryKey: ['influencer-followers', influencer?.user_email],
    queryFn: async () => {
      if (!influencer?.user_email) return [];
      const follows = await base44.entities.Follow.filter({ 
        following_email: influencer.user_email 
      }, "-created_date");
      return follows;
    },
    enabled: !!influencer?.user_email,
    initialData: [],
  });

  // Combine sign-ups, purchases, and follows into a unified activity feed
  const activityFeed = useMemo(() => {
    const activities = [];
    
    // Add sign-ups
    signedUpUsers.forEach(user => {
      activities.push({
        type: 'signup',
        date: new Date(user.created_date),
        user: user,
        email: user.email,
        name: user.full_name || user.email.split('@')[0]
      });
    });
    
    // Add purchases
    referredTransactions.forEach(transaction => {
      activities.push({
        type: 'purchase',
        date: new Date(transaction.created_date),
        transaction: transaction,
        email: transaction.buyer_email,
        name: transaction.buyer_email.split('@')[0],
        amount: transaction.sale_amount,
        commission: transaction.influencer_commission,
        itemTitle: transaction.item_title
      });
    });
    
    // Add follows
    followers.forEach(follow => {
      activities.push({
        type: 'follow',
        date: new Date(follow.created_date),
        follow: follow,
        email: follow.follower_email,
        name: follow.follower_name || follow.follower_email.split('@')[0]
      });
    });
    
    // Sort by date (most recent first)
    return activities.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [signedUpUsers, referredTransactions, followers]);


  const copyToClipboard = async (text) => {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return; } catch {}
    }
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(el);
    el.focus(); el.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(el);
  };

  const handleCopyLink = async () => {
    if (!influencer?.referral_code) return;
    const referralLink = `${window.location.origin}?ref=${influencer.referral_code}`;
    await copyToClipboard(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = async () => {
    if (!influencer?.referral_code) return;
    await copyToClipboard(influencer.referral_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your influencer dashboard...</p>
        </div>
      </div>
    );
  }

  if (!influencer) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="max-w-lg bg-card border-border">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-green-600 dark:text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Not an Influencer</h2>
            <p className="text-muted-foreground mb-6">
              You haven't applied to become an influencer yet. Complete the onboarding process to get started!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (influencer.status === 'pending_approval') {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="mb-6">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/54024ff9a_optimizedkingandcreatorhandshake.png"
                alt="King Credion Influencer"
                className="h-64 w-auto object-contain mx-auto"
              />
            </div>
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-green-600 to-orange-600 bg-clip-text text-transparent">
              Application Under Review
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Your influencer application is being reviewed by our team. You'll receive a notification once approved!
            </p>

            <Card className="max-w-2xl mx-auto bg-card border-border">
              <CardContent className="p-8">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-orange-500/10 rounded-lg flex-shrink-0">
                      <Clock className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-foreground mb-1">What happens next?</p>
                      <p className="text-sm text-muted-foreground">
                        Our admin team typically reviews applications within 24-48 hours. You'll receive an email and in-app notification once your application is processed.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-500/10 rounded-lg flex-shrink-0">
                      <Sparkles className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-foreground mb-1">Once approved, you'll get:</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Your unique referral code and link</li>
                        <li>• Access to this full influencer dashboard</li>
                        <li>• Real-time tracking of clicks and conversions</li>
                        <li>• Automatic commission payouts via Stripe</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-green-500/10 dark:bg-green-900/20 rounded-lg p-4 border border-green-500/30 mt-6">
                    <p className="text-sm text-foreground">
                      <strong>Your Referral Code:</strong> <code className="font-mono font-bold text-green-600 dark:text-green-400">{influencer.referral_code}</code>
                      <br />
                      <span className="text-xs text-muted-foreground">(This will be activated once approved)</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    );
  }

  if (influencer.status === 'rejected') {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="max-w-lg bg-card border-border">
          <CardContent className="p-8 text-center">
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Application Not Approved</h2>
            <p className="text-muted-foreground mb-4">
              Unfortunately, we were unable to approve your influencer application at this time.
            </p>
            {influencer.admin_notes && (
              <div className="bg-red-500/10 dark:bg-red-900/20 rounded-lg p-4 border border-red-500/30 text-left">
                <p className="text-sm text-foreground">
                  <strong>Admin Notes:</strong> {influencer.admin_notes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (influencer.status === 'suspended') {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <Card className="max-w-lg bg-card border-border">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Account Suspended</h2>
            <p className="text-muted-foreground mb-4">
              Your influencer account has been temporarily suspended. Please contact support for more information.
            </p>
            <Link to={createPageUrl("CredionSupport")}>
              <Button variant="outline" className="mt-2">Contact Support</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const referralLink = `${window.location.origin}?ref=${influencer.referral_code.toUpperCase()}`;
  // Use ReferralAttribution for canonical metrics instead of total_conversions (which conflates follows with purchases)
  const conversionRate = signedUpUsers.length > 0 
    ? ((referredTransactions.length / signedUpUsers.length) * 100).toFixed(1)
    : 0;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          {/* Hero Banner */}
          <div 
            className="relative mb-8 rounded-2xl overflow-hidden text-white shadow-xl min-h-[240px] flex items-end"
            style={{
              backgroundImage: 'url(https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/ff3301e66_influencer.png)',
              backgroundPosition: 'right bottom',
              backgroundSize: 'auto 90%',
              backgroundRepeat: 'no-repeat',
            }}
          >
             <div className="absolute inset-0 bg-gradient-to-r from-green-600 via-green-600 to-orange-600 opacity-85 z-10"></div>
             <div className="relative z-20 p-8 md:p-12 max-w-2xl w-full">
               <div className="flex items-center gap-3 mb-4">
                 <div className="p-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/10">
                   <TrendingUp className="w-8 h-8 text-white" />
                 </div>
                 <Badge className="bg-white/20 hover:bg-white/30 text-white border-white/10">Official Influencer</Badge>
               </div>
               <h1 className="text-3xl md:text-4xl font-bold mb-4 text-white">Welcome back, {user.full_name || user.email.split('@')[0]}</h1>
               <p className="text-white/90 text-lg mb-6 max-w-lg">
                 Track your impact, manage your referrals, and grow your earnings with Credabilia's influencer tools.
               </p>
               <div className="flex flex-wrap gap-3">
                 <Link to={createPageUrl(`InfluencerProfile?id=${influencer.id}`)}>
                   <Button className="bg-white text-green-700 hover:bg-green-50 border-0 shadow-lg">
                     <Share2 className="w-4 h-4 mr-2" /> View Public Profile
                   </Button>
                 </Link>
                 <Link to={createPageUrl("Messages")}>
                   <Button variant="outline" className="text-white border-white/30 hover:bg-white/10">
                     <MessageSquare className="w-4 h-4 mr-2" /> Messages
                   </Button>
                 </Link>
               </div>
             </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="mb-6 border-2 border-green-600/30 bg-card dark:bg-green-900/10 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <LinkIcon className="w-6 h-6 text-green-600" />
                Your Unique Referral Link
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-card dark:bg-muted/30 rounded-lg p-4 border border-border">
                <div className="flex items-center gap-3 mb-3">
                   <Input
                     value={referralLink}
                     readOnly
                     className="font-mono text-sm dark:bg-muted dark:border-border dark:text-foreground"
                   />
                   <Button
                     onClick={handleCopyLink}
                     className="bg-green-600 hover:bg-green-700 text-white flex-shrink-0"
                   >
                     {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                   </Button>
                 </div>

                 <div className="flex items-center justify-between text-sm">
                   <span className="text-muted-foreground">Referral Code:</span>
                   <div className="flex items-center gap-2">
                     <code className="font-mono font-bold text-green-600 dark:text-green-400 text-lg">{influencer.referral_code}</code>
                    <Button
                      onClick={handleCopyCode}
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                    >
                      {copiedCode ? <CheckCircle className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="bg-blue-500/10 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-500/30">
                <p className="text-sm text-blue-700 dark:text-blue-400 mb-2">
                  <strong>💡 How to use:</strong>
                </p>
                <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                  <li>• Share this link on your social media platforms</li>
                  <li>• Add it to your bio, YouTube descriptions, or blog posts</li>
                  <li>• When someone clicks and makes a purchase, you earn 6% of the sale (50% of our 12% fee)</li>
                  <li>• Commissions are tracked automatically and paid monthly</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { icon: UserPlus, label: "Sign-Ups", value: signedUpUsers.length, sub: "Referral Signups", accent: "green" },
            { icon: ShoppingCart, label: "Purchases", value: referredTransactions.length, sub: "Purchase Conversions", accent: "green" },
            { icon: DollarSign, label: "Revenue", value: `$${referredTransactions.reduce((s,t) => s + (t.sale_amount||0), 0).toLocaleString()}`, sub: "Referred Sales", accent: "green" },
            { icon: Award, label: "Earned", value: `$${referredTransactions.reduce((s,t) => s + (t.influencer_commission||0), 0).toFixed(2)}`, sub: "Total Commission", accent: "orange" },
          ].map(({ icon: Icon, label, value, sub, accent }, i) => (
            <motion.div key={label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
              <Card className="border border-border bg-card dark:bg-muted/30">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-2 rounded-lg bg-${accent}-500/10 dark:bg-${accent}-900/20`}>
                      <Icon className={`w-5 h-5 text-${accent}-600 dark:text-${accent}-500`} />
                    </div>
                    <Badge className={`bg-${accent}-500/20 text-${accent}-700 dark:text-${accent}-400 text-xs`}>{label}</Badge>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{sub}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
          className="mb-6"
        >
          <Card className="border border-border bg-card dark:bg-muted/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-green-600 dark:text-green-500" />
                Activity Feed
                <Badge className="ml-2 bg-green-500/20 text-green-700 dark:text-green-400">{activityFeed.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activityFeed.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground mb-1">No activity yet</p>
                  <p className="text-sm text-muted-foreground">Share your link to start tracking sign-ups and sales!</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {activityFeed.map((activity, index) => (
                    <motion.div
                      key={`${activity.type}-${activity.email}-${index}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border ${
                        activity.type === 'signup' 
                          ? 'bg-purple-500/10 dark:bg-purple-900/20 border-purple-500/30' 
                          : activity.type === 'follow'
                          ? 'bg-pink-500/10 dark:bg-pink-900/20 border-pink-500/30'
                          : 'bg-green-500/10 dark:bg-green-900/20 border-green-500/30'
                      }`}
                    >
                      {activity.type === 'signup' ? (
                        <>
                          <Link to={createPageUrl(`Profile?email=${activity.email}`)} className="flex-shrink-0">
                            <Avatar className="w-12 h-12 ring-2 ring-purple-300">
                              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white font-bold">
                                {activity.name[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </Link>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Users className="w-4 h-4 text-purple-600 flex-shrink-0" />
                              <Link to={createPageUrl(`Profile?email=${activity.email}`)}>
                                  <p className="font-semibold text-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                    {activity.name}
                                  </p>
                                </Link>
                                <Badge className="bg-purple-500/20 text-purple-700 dark:text-purple-400 text-xs">New Sign-Up</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                              Joined {activity.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                        </>
                      ) : activity.type === 'follow' ? (
                        <>
                          <Link to={createPageUrl(`Profile?email=${activity.email}`)} className="flex-shrink-0">
                            <Avatar className="w-12 h-12 ring-2 ring-pink-300">
                              <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-500 text-white font-bold">
                                {activity.name[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </Link>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <UserPlus className="w-4 h-4 text-pink-600 flex-shrink-0" />
                              <Link to={createPageUrl(`Profile?email=${activity.email}`)}>
                                  <p className="font-semibold text-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                    {activity.name}
                                  </p>
                                </Link>
                                <Badge className="bg-pink-500/20 text-pink-700 dark:text-pink-400 text-xs">Followed You</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                              {activity.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <Package className="w-12 h-12 text-green-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <ShoppingCart className="w-4 h-4 text-green-600 flex-shrink-0" />
                              <p className="font-semibold text-foreground truncate">{activity.itemTitle}</p>
                              <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 text-xs">Purchase</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                              {activity.name} • {activity.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </p>
                              </div>
                              <div className="text-right flex-shrink-0">
                              <p className="text-lg font-bold text-foreground">${activity.amount?.toFixed(2)}</p>
                            <p className="text-sm font-semibold text-green-600">
                              +${(activity.commission || 0).toFixed(2)}
                            </p>
                          </div>
                        </>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border border-border bg-card dark:bg-muted/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-green-600 dark:text-green-500" />
                  Commission Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                   <div className="flex justify-between items-center p-3 bg-green-500/10 dark:bg-green-900/20 rounded-lg border border-green-500/20">
                     <span className="text-sm text-muted-foreground">Total Earned (All Time)</span>
                     <span className="font-bold text-lg text-green-600 dark:text-green-500">
                       ${referredTransactions.reduce((sum, t) => sum + (t.influencer_commission || 0), 0).toFixed(2)}
                     </span>
                   </div>
                   <div className="flex justify-between items-center p-3 bg-orange-500/10 dark:bg-orange-900/20 rounded-lg border border-orange-500/20">
                     <span className="text-sm text-muted-foreground">Pending Payout</span>
                     <span className="font-bold text-lg text-orange-600 dark:text-orange-500">
                       ${(influencer.pending_commission || 0).toFixed(2)}
                     </span>
                   </div>
                  <div className="flex justify-between items-center p-3 bg-muted/40 rounded-lg">
                    <span className="text-sm text-muted-foreground">Commission Rate</span>
                    <span className="font-bold text-foreground">{(influencer.commission_rate * 100)}% of platform fee</span>
                  </div>

                  <div className="bg-blue-500/10 dark:bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mt-4">
                     <p className="text-sm text-blue-700 dark:text-blue-400">
                       <strong>💡 How commissions work:</strong><br />
                       You earn 50% of our 12% platform fee = <strong>6% of total sale price</strong>
                     </p>
                     <div className="mt-3 text-xs text-blue-700 dark:text-blue-400">
                       <strong>Example:</strong> $100 sale → Platform gets $12 → You earn $6
                     </div>
                   </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.45 }}
          >
            <Card className="border border-border bg-card dark:bg-muted/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-green-600 dark:text-green-500" />
                  Your Platforms
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-4">
                   {influencer.platforms?.map(platform => (
                     <Badge 
                       key={platform}
                       className="bg-green-600 hover:bg-green-700 text-white px-3 py-1"
                     >
                       {platform}
                     </Badge>
                   ))}
                 </div>

                 <div className="bg-green-500/10 dark:bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                   <p className="text-sm text-green-700 dark:text-green-400 mb-2">
                     <strong>📱 Promote on your platforms:</strong>
                   </p>
                   <ul className="text-sm text-green-700 dark:text-green-400 space-y-1">
                    <li>• Add link to your bio</li>
                    <li>• Share in stories/posts</li>
                    <li>• Create content featuring items</li>
                    <li>• Add to video descriptions</li>
                  </ul>
                </div>

                {influencer.last_payout_date && (
                   <div className="mt-4 pt-4 border-t border-border">
                     <div className="flex items-center justify-between text-sm">
                       <span className="text-muted-foreground">Last Payout:</span>
                       <span className="font-medium text-foreground">
                        {new Date(influencer.last_payout_date).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="bg-gradient-to-r from-green-600 to-green-700 text-white border-0">
            <CardContent className="p-8 text-center">
              <Sparkles className="w-12 h-12 mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-2">Start Earning Today!</h3>
              <p className="text-white/90 mb-6 max-w-2xl mx-auto">
                Share your referral link with your audience and earn commission on every sale. The more you share, the more you earn!
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Button
                  onClick={handleCopyLink}
                  className="bg-white text-green-700 hover:bg-green-50"
                >
                  {copied ? <CheckCircle className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {copied ? 'Link Copied!' : 'Copy Referral Link'}
                </Button>
                <Button
                  variant="outline"
                  className="border-white/50 text-white hover:bg-white/10"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Share on Social Media
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}