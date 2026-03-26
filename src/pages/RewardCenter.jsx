import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Trophy,
  Award,
  ShieldCheck,
  TrendingUp,
  Star,
  Target,
  Crown,
  Coins,
  DollarSign,
  Sparkles,
  Clock,
  Users,
  Activity,
  Gift,
  UserPlus,
  Copy,
  CheckCircle } from
"lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";

/**
 * Reward Center - Auditor Leaderboard & Commission Tracking
 * 
 * Ranks auditors based on:
 * - trust_score: Final blended trust judgment (authenticator + community)
 * - accuracy_rate: Historical voting accuracy
 * - xp: Experience points from audits
 * - total_vets: Lifetime audit count
 * 
 * These metrics are updated atomically whenever an audit is submitted,
 * using the canonical trust-score engine from src/utils/trustScore.js.
 * 
 * The Credible Buy Meter shows final_trust_score on all items,
 * consistent across VettingQueue, ItemDetails, and Marketplace.
 */
export default function RewardCenter() {
  const [user, setUser] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();

      // Generate referral code if user doesn't have one
      if (!userData.referral_code) {
        const newReferralCode = `REF-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        await base44.auth.updateMe({ referral_code: newReferralCode });
        userData.referral_code = newReferralCode;
      }

      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  // Fetch active sweepstakes
  const { data: activeSweepstakes } = useQuery({
    queryKey: ['active-sweepstakes'],
    queryFn: async () => {
      const sweepstakes = await base44.entities.Sweepstakes.filter({ status: 'active' });
      return sweepstakes[0] || null;
    }
  });

  // Fetch total user count
  const { data: userCount } = useQuery({
    queryKey: ['total-user-count'],
    queryFn: async () => {
      try {
        const users = await base44.entities.User.list();
        return users.length;
      } catch (error) {
        return 0;
      }
    },
    refetchInterval: 60000
  });

  // Fetch user's referrals (canonical source of truth)
  const { data: referredUsers } = useQuery({
    queryKey: ['user-referrals', user?.referral_code],
    queryFn: async () => {
      if (!user?.referral_code) return [];
      const normalized = user.referral_code.toUpperCase();

      try {
        // Use ReferralAttribution if available for authoritative tracking
        const attributions = await base44.entities.ReferralAttribution?.filter({
          referrer_email: user.email,
          event_type: "signup"
        }).catch(() => []);

        if (attributions && attributions.length > 0) {
          return attributions.map((a) => ({ email: a.referred_email, created_date: a.timestamp }));
        }

        // Fallback to User.referred_by if ReferralAttribution not available
        return await base44.entities.User.filter({ referred_by: normalized });
      } catch (error) {
        console.error("Error fetching referrals:", error);
        return [];
      }
    },
    enabled: !!user?.referral_code,
    initialData: []
  });

  // Fetch all auditors (users with vetting activity)
  const { data: auditors } = useQuery({
    queryKey: ['auditors-leaderboard'],
    queryFn: async () => {
      const allUsers = await base44.entities.User.list();
      return allUsers.filter((u) => (u.total_vets || 0) > 0);
    },
    initialData: []
  });

  // Fetch all transactions to calculate reward pool (live only)
  const { data: transactions } = useQuery({
    queryKey: ['all-transactions'],
    queryFn: async () => {
      const all = await base44.entities.Transaction.list("-created_date");
      return all.filter((t) =>
      !t.is_simulated &&
      t.payment_method !== 'simulated_stripe' &&
      t.payment_method !== 'simulated_purchase' &&
      !t.stripe_payment_intent_id?.startsWith('sim_')
      );
    },
    initialData: []
  });

  // Calculate total reward pool (1% of all sales)
  const totalRewardPool = React.useMemo(() => {
    const totalSales = transactions.reduce((sum, t) => sum + (t.sale_amount || 0), 0);
    return Math.round(totalSales * 0.01 * 100); // Convert to credits (1% in credits)
  }, [transactions]);

  // Calculate monthly pool (transactions from current month)
  const monthlyRewardPool = React.useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyTransactions = transactions.filter((t) => {
      const tDate = new Date(t.created_date);
      return tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
    });

    const monthlySales = monthlyTransactions.reduce((sum, t) => sum + (t.sale_amount || 0), 0);
    return Math.round(monthlySales * 0.01 * 100); // Convert to credits
  }, [transactions]);

  // Fetch recent votes for activity feed
  const { data: recentVotes } = useQuery({
    queryKey: ['recent-votes'],
    queryFn: async () => {
      return await base44.entities.Vote.list("-created_date", 20);
    },
    initialData: []
  });

  // Fetch items to link with votes
  const { data: items } = useQuery({
    queryKey: ['items-for-votes'],
    queryFn: async () => {
      return await base44.entities.Item.list();
    },
    initialData: []
  });

  // Fetch Credion Credits wallet data for all auditors
  const { data: allCredits } = useQuery({
    queryKey: ['all-auditor-credits'],
    queryFn: async () => {
      // CouncilCredit is the Credion Credits wallet — entity table name is unchanged
      return await base44.entities.CouncilCredit.list();
    },
    initialData: []
  });

  // Calculate composite score for ranking
  const calculateCompositeScore = (auditor) => {
    const trustWeight = 0.3;
    const accuracyWeight = 0.3;
    const xpWeight = 0.2;
    const vetsWeight = 0.2;

    const normalizedTrust = (auditor.trust_score || 0.5) * 100;
    const normalizedAccuracy = (auditor.accuracy_rate || 0.5) * 100;
    const normalizedXP = Math.min(100, (auditor.xp || 0) / 500 * 100);
    const normalizedVets = Math.min(100, (auditor.total_vets || 0) / 100 * 100);

    return (
      normalizedTrust * trustWeight +
      normalizedAccuracy * accuracyWeight +
      normalizedXP * xpWeight +
      normalizedVets * vetsWeight);

  };

  // Rank auditors and determine top 10%
  const rankedAuditors = React.useMemo(() => {
    return auditors.
    map((auditor) => {
      const credits = allCredits.find((c) => c.user_email === auditor.email);
      return {
        ...auditor,
        compositeScore: calculateCompositeScore(auditor),
        auditorRewards: credits?.auditor_rewards_total || 0
      };
    }).
    sort((a, b) => b.compositeScore - a.compositeScore);
  }, [auditors, allCredits]);

  const top10PercentCount = Math.max(1, Math.ceil(rankedAuditors.length * 0.1));
  const top10Percent = rankedAuditors.slice(0, top10PercentCount);
  const top5 = rankedAuditors.slice(0, 5);

  // Create activity feed
  const activityFeed = React.useMemo(() => {
    return recentVotes.map((vote) => {
      const vettor = auditors.find((a) => a.email === vote.voter_email);
      const item = items.find((i) => i.id === vote.item_id);
      return {
        ...vote,
        vettor,
        item
      };
    }).filter((activity) => activity.vettor && activity.item);
  }, [recentVotes, auditors, items]);

  const getVoteColor = (voteType) => {
    if (voteType === 'authentic') return 'text-green-600 bg-green-50';
    if (voteType === 'suspicious') return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getVoteIcon = (voteType) => {
    if (voteType === 'authentic') return '✓';
    if (voteType === 'suspicious') return '⚠';
    return '✗';
  };

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const copyToClipboard = async (text) => {
    if (navigator.clipboard?.writeText) {
      try {await navigator.clipboard.writeText(text);return;} catch {}
    }
    // execCommand fallback for iOS WKWebView / older Safari
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(el);
    el.focus();el.select();
    try {document.execCommand('copy');} catch {}
    document.body.removeChild(el);
  };

  const handleCopyReferralLink = async () => {
    if (!user?.referral_code) return;
    const referralLink = `${window.location.origin}?ref=${user.referral_code}`;
    await copyToClipboard(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sweepstakesProgress = activeSweepstakes && userCount ?
  userCount / activeSweepstakes.target_user_count * 100 :
  0;

  const referralLink = user?.referral_code ?
  `${window.location.origin}?ref=${user.referral_code}` :
  '';

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>);

  }

  const userRank = rankedAuditors.findIndex((a) => a.email === user.email) + 1;
  const isInTop10 = userRank > 0 && userRank <= top10PercentCount;

  return (
    <div className="min-h-screen bg-background dark:bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Hero Section - IMAGE + TEXT BELOW */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 max-w-2xl mx-auto">
          
          <img
            src="https://media.base44.com/images/public/690badbd56a85b130b88aa42/1d9c74ce4_Photoroom_20260320_211312.png"
            alt="Auditor Reward Center"
            className="w-full rounded-2xl shadow-2xl object-contain" />
          
          <p className="text-slate-400 mt-6 text-lg font-semibold text-center">Top 10% of auditors earn Credion Credits from every sale

          </p>
        </motion.div>

        {/* Sweepstakes Section - PROMINENT */}
        {activeSweepstakes &&
        <Card className="mb-12 border-4 border-orange-400 bg-gradient-to-br from-orange-50 via-yellow-50 to-red-50 shadow-2xl">
            <CardContent className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left: New Sweepstakes Image */}
                <div className="flex items-center justify-center">
                  <img
                  src="https://media.base44.com/images/public/690badbd56a85b130b88aa42/7df28b95c_Photoroom_20260320_213549.png"
                  alt="Signed Michael Jordan Bulls Jersey Sweepstakes"
                  className="w-full h-auto object-contain rounded-xl shadow-2xl" />
                
                </div>

                {/* Right: Entries & Referrals - Single Card */}
                <div className="bg-white rounded-xl p-6 shadow-lg border-2 border-orange-300">
                  <div className="space-y-5">
                    {/* Entries */}
                    <div className="text-center border-b border-gray-200 pb-5">
                      <p className="text-4xl font-bold text-orange-600 mb-1">{user?.sweepstakes_entries || 1}</p>
                      <p className="text-sm text-gray-600 font-medium">Your Entries</p>
                      <p className="text-xs text-gray-500 mt-2">+1 entry per referral</p>
                    </div>

                    {/* Referral Link */}
                    <div className="border-b border-gray-200 pb-5">
                      <p className="text-sm font-semibold text-gray-900 mb-3">Refer Friends</p>
                      {referralLink &&
                    <div className="flex gap-2">
                          <Input value={referralLink} readOnly className="font-mono text-xs h-8" />
                          <Button onClick={handleCopyReferralLink} className="bg-green-600 hover:bg-green-700 flex-shrink-0 h-8">
                            {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                    }
                      <div className="text-xs text-gray-600 mt-2">
                        Referrals: <span className="font-bold text-green-600">{referredUsers?.length || 0}</span>
                      </div>
                    </div>

                    {/* Progress */}
                    <div>
                      <p className="text-sm font-semibold text-gray-900 mb-3">Progress to Drawing</p>
                      <div className="flex justify-between text-xs mb-2">
                        <span className="text-gray-600">{userCount?.toLocaleString() || '...'} / {activeSweepstakes?.target_user_count?.toLocaleString()}</span>
                        <span className="text-gray-500">{sweepstakesProgress.toFixed(0)}%</span>
                      </div>
                      <Progress value={Math.min(sweepstakesProgress, 100)} className="h-2" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        }

        {/* Reward Pool Cards - WITH CREDION CREDIT COIN */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <Card className="bg-gradient-to-br from-yellow-400 to-orange-500 text-white border-0 shadow-2xl relative overflow-hidden">
            {/* Credion Credit Coin Background */}
            <div className="absolute -bottom-8 -right-8 opacity-20 pointer-events-none">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/f3f623008_Photoroom_20251218_211001.png"
                alt=""
                className="w-40 h-40 object-contain" />
              
            </div>
            <CardContent className="p-6 relative">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-yellow-100 text-sm mb-1 flex items-center gap-2">
                    <img
                      src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/f3f623008_Photoroom_20251218_211001.png"
                      alt=""
                      className="w-20 h-20 object-contain inline-block align-middle" />
                    
                    Total Reward Pool
                  </p>
                  <p className="text-4xl font-bold">
                    {totalRewardPool.toLocaleString()}
                  </p>
                  <p className="text-yellow-100 text-xs mt-1">
                    Credion Credits · 100 credits = $1
                  </p>
                </div>
                <Coins className="w-16 h-16 text-yellow-200 opacity-50" />
              </div>
              <p className="text-sm text-yellow-100">
                1% of all platform sales
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-2xl relative overflow-hidden">
            {/* Credion Credit Coin Background */}
            <div className="absolute -bottom-8 -right-8 opacity-20 pointer-events-none">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/f3f623008_Photoroom_20251218_211001.png"
                alt=""
                className="w-40 h-40 object-contain" />
              
            </div>
            <CardContent className="p-6 relative">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-green-100 text-sm mb-1 flex items-center gap-2">
                    <img
                      src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/f3f623008_Photoroom_20251218_211001.png"
                      alt=""
                      className="w-20 h-20 object-contain inline-block align-middle" />
                    
                    This Month's Pool
                  </p>
                  <p className="text-4xl font-bold">
                    {monthlyRewardPool.toLocaleString()}
                  </p>
                  <p className="text-green-100 text-xs mt-1">
                    Credion Credits · 100 credits = $1
                  </p>
                </div>
                <DollarSign className="w-16 h-16 text-green-200 opacity-50" />
              </div>
              <p className="text-sm text-green-100">
                Distributed monthly to top 10%
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white border-0 shadow-2xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-purple-100 text-sm mb-1">Eligible Auditors</p>
                  <p className="text-4xl font-bold">
                    {top10PercentCount}
                  </p>
                  <p className="text-purple-100 text-xs mt-1">
                    top 10% of {auditors.length}
                  </p>
                </div>
                <Users className="w-16 h-16 text-purple-200 opacity-50" />
              </div>
              <p className="text-sm text-purple-100">
                Active auditors this period
              </p>
            </CardContent>
          </Card>
        </div>

        {/* User's Status Card */}
        {user.total_vets > 0 &&
        <Card className={`mb-12 ${isInTop10 ? 'border-yellow-400 border-2 bg-yellow-50/40' : 'border-gray-200'}`}>
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <Avatar className={`w-12 h-12 flex-shrink-0 ring-2 ${isInTop10 ? 'ring-yellow-400' : 'ring-gray-200'}`}>
                  <AvatarImage src={user.avatar_url} />
                  <AvatarFallback className="bg-gradient-to-br from-green-500 to-blue-600 text-white">
                    {(user.full_name || user.email)[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-gray-900">Your Ranking</span>
                    <Badge className={`${isInTop10 ? 'bg-yellow-500' : 'bg-gray-500'} text-white text-xs`}>
                      #{userRank} of {auditors.length}
                    </Badge>
                    {isInTop10 &&
                  <Badge className="bg-green-500 text-white text-xs">✓ Top 10% — Earning Rewards</Badge>
                  }
                  </div>
                  {!isInTop10 && userRank > 0 &&
                <Progress value={Math.min(100, top10PercentCount / userRank * 100)} className="h-1.5 mt-2" />
                }
                </div>
                <div className="flex gap-3 text-center flex-shrink-0">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{user.xp || 0}</p>
                    <p className="text-[10px] text-gray-500">XP</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{user.total_vets || 0}</p>
                    <p className="text-[10px] text-gray-500">Audits</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{((user.accuracy_rate || 0.5) * 100).toFixed(0)}%</p>
                    <p className="text-[10px] text-gray-500">Accuracy</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        }

        {/* How It Works - REVAMPED WITH CREDION CREDIT COIN */}
        <Card className="mb-12 border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white relative overflow-hidden">
          {/* Large Background Credion Credit Coin */}
          <div className="absolute -bottom-16 -right-16 opacity-5 pointer-events-none">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/f3f623008_Photoroom_20251218_211001.png"
              alt=""
              className="w-96 h-96 object-contain" />
            
          </div>

          <CardHeader className="relative">
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/f3f623008_Photoroom_20251218_211001.png"
                alt=""
                className="w-32 h-32 object-contain" />
              
              How Auditor Rewards Work
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 relative">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white font-bold">1</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">12% Marketplace Fee</h4>
                    <p className="text-sm text-gray-600">
                      On every sale, Credabilia collects a 12% marketplace fee to support operations
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white font-bold">2</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                      1% Auditor Rewards Pool
                      <img
                        src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/f3f623008_Photoroom_20251218_211001.png"
                        alt=""
                        className="w-20 h-20 object-contain inline-block align-middle" />
                      
                    </h4>
                    <p className="text-sm text-gray-600">
                      1% of all platform sales goes directly to reward our top auditors in <strong>Credion Credits</strong>
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white font-bold">3</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">Top 10% Get Monthly Rewards</h4>
                    <p className="text-sm text-gray-600">
                      Each month, Credion Credits are distributed to the top 10% of auditors ranked by performance score
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white font-bold">4</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                      Spend Credion Credits on Items
                      <img
                        src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/f3f623008_Photoroom_20251218_211001.png"
                        alt=""
                        className="w-20 h-20 object-contain inline-block align-middle" />
                      
                    </h4>
                    <p className="text-sm text-gray-600">
                      Use your earned <strong>Credion Credits</strong> during checkout to purchase any item (100 credits = $1)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-blue-200 bg-blue-100 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>📊 Ranking Criteria:</strong> Your rank is based on a composite score of Trust (30%), Accuracy (30%), XP (20%), and Total Audits (20%). 
                Consistently audit items with high accuracy to climb the leaderboard and earn more <strong>Credion Credits</strong>!
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Top 5 Auditors */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="w-6 h-6 text-yellow-500" />
                  Top 5 Auditors
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {top5.length === 0 ?
                <div className="text-center py-12">
                    <ShieldCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600">No auditors yet. Be the first!</p>
                  </div> :

                top5.map((auditor, index) => {
                  const isCurrentUser = auditor.email === user.email;
                  const rankColors = ['bg-yellow-400', 'bg-gray-400', 'bg-orange-400', 'bg-blue-400', 'bg-purple-400'];

                  return (
                    <div
                      key={auditor.id}
                      className={`flex items-center gap-3 p-3 rounded-lg ${isCurrentUser ? 'bg-green-50 border border-green-300' : 'hover:bg-gray-50'}`}>
                      
                        <div className={`w-8 h-8 ${rankColors[index]} rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                          {index === 0 ? <Crown className="w-4 h-4" /> : `#${index + 1}`}
                        </div>
                        <Link to={createPageUrl(`Profile?email=${auditor.email}`)}>
                          <Avatar className="w-10 h-10 flex-shrink-0">
                            <AvatarImage src={auditor.avatar_url} />
                            <AvatarFallback className="bg-gradient-to-br from-green-500 to-blue-600 text-white text-sm">
                              {(auditor.full_name || auditor.email)[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="font-semibold text-gray-900 text-sm truncate">{auditor.full_name || auditor.email?.split('@')[0]}</span>
                            {isCurrentUser && <Badge className="bg-green-500 text-white text-xs px-1.5 py-0">You</Badge>}
                            <Badge variant="outline" className="capitalize text-xs px-1.5 py-0">{auditor.rank || 'bronze'}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                            <span>{auditor.xp || 0} XP</span>
                            <span>{auditor.total_vets || 0} audits</span>
                            <span>{((auditor.accuracy_rate || 0.5) * 100).toFixed(0)}% accuracy</span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 sm:hidden">
                            <Coins className="w-3 h-3 text-orange-500" />
                            <span className="text-xs font-bold text-orange-600">{auditor.auditorRewards.toLocaleString()}</span>
                            <span className="text-xs text-gray-400">(${(auditor.auditorRewards / 100).toFixed(2)})</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 hidden sm:block">
                          <div className="flex items-center gap-1 justify-end">
                            <Coins className="w-3 h-3 text-orange-500" />
                            <span className="text-sm font-bold text-orange-600">{auditor.auditorRewards.toLocaleString()}</span>
                          </div>
                          <p className="text-xs text-gray-400">(${(auditor.auditorRewards / 100).toFixed(2)})</p>
                        </div>
                      </div>);

                })
                }

                {top5.length > 0 &&
                <div className="pt-6 border-t border-gray-200">
                    <Link to={createPageUrl("VettingQueue")}>
                      <Button className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700">
                        <ShieldCheck className="w-5 h-5 mr-2" />
                        Start Auditing to Climb the Ranks
                      </Button>
                    </Link>
                  </div>
                }
              </CardContent>
            </Card>
          </div>

          {/* Recent Audits Activity Feed */}
          <div className="lg:col-span-1">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-green-600" />
                  Recent Audits Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {activityFeed.length === 0 ?
                  <div className="text-center py-8">
                      <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">No recent activity</p>
                    </div> :

                  activityFeed.map((activity, index) =>
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="pb-4 border-b border-gray-100 last:border-0">
                    
                        <div className="flex items-start gap-3">
                          <Avatar className="w-10 h-10 ring-2 ring-green-200 flex-shrink-0">
                            <AvatarImage src={activity.vettor?.avatar_url} />
                            <AvatarFallback className="bg-gradient-to-br from-green-500 to-blue-600 text-white">
                              {(activity.vettor?.full_name || 'V')[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-gray-900 text-sm truncate">
                                {activity.vettor?.full_name || activity.vettor?.email?.split('@')[0]}
                              </span>
                              <Badge className={`${getVoteColor(activity.vote_type)} text-xs font-semibold`}>
                                {getVoteIcon(activity.vote_type)} {activity.vote_type}
                              </Badge>
                            </div>
                            
                            <Link
                          to={createPageUrl(`ItemDetails?id=${activity.item_id}`)}
                          className="text-xs text-gray-600 hover:text-blue-600 line-clamp-2 mb-1">
                          
                              {activity.item?.title}
                            </Link>
                            
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Clock className="w-3 h-3" />
                              {timeAgo(activity.created_date)}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                  )
                  }
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* All Auditors Leaderboard */}
        <Card className="mt-12">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Trophy className="w-6 h-6 text-gray-700" />
                All Auditors Leaderboard
              </span>
              <Badge variant="secondary">{auditors.length} total</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rankedAuditors.map((auditor, index) => {
                const isCurrentUser = auditor.email === user.email;
                const isTopTen = index < top10PercentCount;

                return (
                  <div
                    key={auditor.id}
                    className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                    isCurrentUser ? 'bg-green-50 border-green-300' :
                    isTopTen ? 'bg-yellow-50/50 border-yellow-200' :
                    'bg-white border-gray-100 hover:bg-gray-50'}`
                    }>
                    
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                    isTopTen ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`
                    }>
                      {index < 3 && isTopTen ? <Crown className="w-3.5 h-3.5" /> : `#${index + 1}`}
                    </div>

                    <Link to={createPageUrl(`Profile?email=${auditor.email}`)} className="flex-shrink-0">
                      <Avatar className="w-9 h-9">
                        <AvatarImage src={auditor.avatar_url} />
                        <AvatarFallback className="bg-gradient-to-br from-green-500 to-blue-600 text-white text-xs">
                          {(auditor.full_name || auditor.email)[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm truncate max-w-[80px] sm:max-w-none">
                          {auditor.full_name || auditor.email?.split('@')[0]}
                        </span>
                        {isCurrentUser && <Badge className="bg-green-500 text-white text-[10px] px-1 py-0">You</Badge>}
                        {isTopTen && <Badge className="bg-yellow-500 text-white text-[10px] px-1 py-0">Top 10%</Badge>}
                      </div>
                      <div className="flex gap-1.5 text-[11px] text-gray-500 mt-0.5 flex-wrap">
                        <span>{auditor.xp || 0} XP</span>
                        <span>·</span>
                        <span>{auditor.total_vets || 0} audits</span>
                        <span>·</span>
                        <span>{((auditor.accuracy_rate || 0.5) * 100).toFixed(0)}% acc</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <Coins className="w-3 h-3 text-orange-500" />
                      <span className="font-bold text-orange-600 text-sm">{auditor.auditorRewards.toLocaleString()}</span>
                    </div>
                  </div>);

              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>);

}