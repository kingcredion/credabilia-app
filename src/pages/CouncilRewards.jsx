import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Coins,
  Shield,
  TrendingUp,
  Users,
  DollarSign,
  Award,
  Calendar,
  Activity,
  Crown,
  ChevronRight,
  Play,
  AlertCircle,
  CheckCircle2,
  Clock,
  History
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AuditorRewards() {
  const [user, setUser] = useState(null);
  const [showManualAdjustDialog, setShowManualAdjustDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const queryClient = useQueryClient();

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

  // Fetch all transactions (live only)
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['all-transactions'],
    queryFn: async () => {
      const all = await base44.entities.Transaction.list("-created_date");
      return all.filter(t =>
        !t.is_simulated &&
        t.payment_method !== 'simulated_stripe' &&
        t.payment_method !== 'simulated_purchase' &&
        !t.stripe_payment_intent_id?.startsWith('sim_')
      );
    },
    initialData: [],
  });

  // Fetch all auditor credits
  const { data: allCredits, isLoading: creditsLoading } = useQuery({
    queryKey: ['all-auditor-credits'],
    queryFn: async () => {
      return await base44.entities.CouncilCredit.list("-credits_balance");
    },
    initialData: [],
  });

  // Fetch all users with vetting activity (auditors)
  const { data: auditors } = useQuery({
    queryKey: ['all-auditors'],
    queryFn: async () => {
      const allUsers = await base44.entities.User.list();
      return allUsers.filter(u => (u.total_vets || 0) > 0);
    },
    initialData: [],
  });

  // Calculate composite score for ranking (same as Leaderboard)
  const calculateCompositeScore = (auditor) => {
    const trustWeight = 0.3;
    const accuracyWeight = 0.3;
    const xpWeight = 0.2;
    const vetsWeight = 0.2;
    
    const normalizedTrust = (auditor.trust_score || 0.5) * 100;
    const normalizedAccuracy = (auditor.accuracy_rate || 0.5) * 100;
    const normalizedXP = Math.min(100, ((auditor.xp || 0) / 500) * 100);
    const normalizedVets = Math.min(100, ((auditor.total_vets || 0) / 100) * 100);
    
    return (
      normalizedTrust * trustWeight +
      normalizedAccuracy * accuracyWeight +
      normalizedXP * xpWeight +
      normalizedVets * vetsWeight
    );
  };

  // Rank auditors
  const rankedAuditors = useMemo(() => {
    return auditors
      .map(auditor => {
        const credits = allCredits.find(c => c.user_email === auditor.email);
        return {
          ...auditor,
          compositeScore: calculateCompositeScore(auditor),
          creditRecord: credits
        };
      })
      .sort((a, b) => b.compositeScore - a.compositeScore);
  }, [auditors, allCredits]);

  const top10PercentCount = Math.max(1, Math.ceil(rankedAuditors.length * 0.1));
  const eligibleAuditors = rankedAuditors.slice(0, top10PercentCount);

  // Calculate monthly pool
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  // Include all paid/active transactions in pool calculation (not just "completed")
  const PAID_STATUSES = ["paid", "escrow", "shipped", "delivered", "completed"];
  const monthlyTransactions = transactions.filter(t =>
    t.created_date?.startsWith(currentMonth) && PAID_STATUSES.includes(t.status)
  );
  // Use auditor_pool_contribution primarily; fall back to council_pool_contribution for historical data only
  const monthlyPool = monthlyTransactions.reduce((sum, t) => {
    const contribution = t.auditor_pool_contribution ?? t.council_pool_contribution ?? 0;
    return sum + contribution;
  }, 0);
  const totalPoolAllTime = transactions
    .filter(t => PAID_STATUSES.includes(t.status))
    .reduce((sum, t) => {
      const contribution = t.auditor_pool_contribution ?? t.council_pool_contribution ?? 0;
      return sum + contribution;
    }, 0);

  // Top earners
  const topEarners = useMemo(() => [...allCredits]
    .sort((a, b) => (b.auditor_rewards_total || 0) - (a.auditor_rewards_total || 0))
    .slice(0, 10), [allCredits]);

  // Stats
  const totalCreditsDistributed = allCredits.reduce((sum, c) => sum + (c.auditor_rewards_total || 0), 0);
  const totalCreditsRedeemed = allCredits.reduce((sum, c) => sum + (c.credits_redeemed || 0), 0);
  const eligibleMembers = eligibleAuditors.length;

  // Calculate next distribution date (1st of next month)
  const getNextDistributionDate = () => {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
  };

  // Get last distribution date (from most recent credit update)
  const getLastDistributionDate = () => {
    if (allCredits.length === 0) return null;
    const sorted = [...allCredits].sort((a, b) => 
      new Date(b.last_distribution_date || 0) - new Date(a.last_distribution_date || 0)
    );
    return sorted[0]?.last_distribution_date ? new Date(sorted[0].last_distribution_date) : null;
  };

  const nextDistribution = getNextDistributionDate();
  const lastDistribution = getLastDistributionDate();
  const daysUntilDistribution = Math.ceil((nextDistribution - new Date()) / (1000 * 60 * 60 * 24));

  const manualAdjustMutation = useMutation({
    mutationFn: async ({ userId, amount, reason }) => {
      const userCredit = allCredits.find(c => c.user_id === userId);
      const currentBalance = userCredit?.credits_balance || 0;
      const newBalance = Math.max(0, currentBalance + amount);

      if (!userCredit) {
        const targetUser = await base44.entities.User.filter({ id: userId });
        if (targetUser[0]) {
          await base44.entities.CouncilCredit.create({
            user_id: userId,
            user_email: targetUser[0].email,
            credits_balance: newBalance,
            credits_earned_lifetime: amount > 0 ? amount : 0,
            auditor_rewards_total: amount > 0 ? amount : 0,
            eligibility_status: false,
          });
          // Ledger entry
          await base44.entities.CreditLedger.create({
            user_email: targetUser[0].email,
            amount,
            balance_after: newBalance,
            source: 'admin_adjustment',
            is_reversal: amount < 0,
            note: reason || 'Admin manual adjustment',
          }).catch(() => {});
        }
      } else {
        await base44.entities.CouncilCredit.update(userCredit.id, {
          credits_balance: newBalance,
          auditor_rewards_total: amount > 0
            ? (userCredit.auditor_rewards_total || 0) + amount
            : userCredit.auditor_rewards_total,
        });
        // Ledger entry
        await base44.entities.CreditLedger.create({
          user_email: userCredit.user_email,
          amount,
          balance_after: newBalance,
          source: 'admin_adjustment',
          is_reversal: amount < 0,
          note: reason || 'Admin manual adjustment',
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-auditor-credits'] });
      setShowManualAdjustDialog(false);
      setSelectedUser(null);
      setAdjustAmount(0);
      setAdjustReason("");
    },
  });

  const runDistributionMutation = useMutation({
    mutationFn: async () => {
      const poolAmount = Math.floor(monthlyPool * 100); // Convert $ → credits
      if (poolAmount <= 0 || eligibleAuditors.length === 0) {
        throw new Error("No pool amount or no eligible auditors");
      }
      const amountPerAuditor = Math.floor(poolAmount / eligibleAuditors.length);
      const now = new Date().toISOString();

      for (const auditor of eligibleAuditors) {
        const existingCredit = allCredits.find(c => c.user_email === auditor.email);
        const currentBalance = existingCredit?.credits_balance || 0;
        const newBalance = currentBalance + amountPerAuditor;

        if (existingCredit) {
          await base44.entities.CouncilCredit.update(existingCredit.id, {
            credits_balance: newBalance,
            credits_earned_monthly: (existingCredit.credits_earned_monthly || 0) + amountPerAuditor,
            credits_earned_lifetime: (existingCredit.credits_earned_lifetime || 0) + amountPerAuditor,
            auditor_rewards_total: (existingCredit.auditor_rewards_total || 0) + amountPerAuditor,
            eligibility_status: true,
            last_distribution_date: now,
          });
        } else {
          await base44.entities.CouncilCredit.create({
            user_id: auditor.id,
            user_email: auditor.email,
            credits_balance: amountPerAuditor,
            credits_earned_monthly: amountPerAuditor,
            credits_earned_lifetime: amountPerAuditor,
            auditor_rewards_total: amountPerAuditor,
            eligibility_status: true,
            last_distribution_date: now,
          });
        }

        // Write ledger entry for audit trail
        await base44.entities.CreditLedger.create({
          user_email: auditor.email,
          amount: amountPerAuditor,
          balance_after: newBalance,
          source: 'audit_reward',
          is_reversal: false,
          note: `Monthly auditor pool distribution — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        }).catch(() => {});
      }

      return {
        distributed: amountPerAuditor * eligibleAuditors.length,
        recipients: eligibleAuditors.length,
        amountEach: amountPerAuditor,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['all-auditor-credits'] });
      alert(`✅ Distribution Complete!\n\n${result.distributed.toLocaleString()} credits distributed to ${result.recipients} auditors\n(${result.amountEach.toLocaleString()} credits each)`);
    },
    onError: (error) => {
      alert(`❌ Distribution Failed: ${error.message}`);
    }
  });

  const handleManualAdjust = () => {
    if (!selectedUser || adjustAmount === 0) return;
    manualAdjustMutation.mutate({
      userId: selectedUser.user_id,
      amount: adjustAmount,
      reason: adjustReason
    });
  };

  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Admin Access Required</h2>
          <p className="text-muted-foreground">Only administrators can view the Auditor Rewards dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-foreground">Auditor Rewards Management</h1>
                <p className="text-muted-foreground">Distribution control center for top 10% auditors</p>
              </div>
            </div>
            
            <Button
              onClick={() => runDistributionMutation.mutate()}
              disabled={runDistributionMutation.isPending || monthlyPool <= 0}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white whitespace-nowrap"
            >
              {runDistributionMutation.isPending ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Distributing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Distribution
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Distribution Status Banner */}
        <Card className="mb-8 border-2 border-blue-300 bg-gradient-to-r from-blue-50 to-purple-50">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <p className="text-sm font-medium text-gray-700">Last Distribution</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {lastDistribution ? lastDistribution.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {lastDistribution ? `${Math.floor((new Date() - lastDistribution) / (1000 * 60 * 60 * 24))} days ago` : 'No distributions yet'}
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <p className="text-sm font-medium text-gray-700">Next Scheduled</p>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {nextDistribution.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {daysUntilDistribution} days remaining
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                  <p className="text-sm font-medium text-gray-700">Distribution Mode</p>
                </div>
                <Badge className="bg-orange-500 text-white text-sm">
                  Manual Trigger Only
                </Badge>
                <p className="text-xs text-gray-600 mt-2">
                  Click "Run Distribution Now" to distribute credits
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-2 border-yellow-200 bg-gradient-to-br from-yellow-50 to-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Monthly Pool</p>
                <DollarSign className="w-5 h-5 text-yellow-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">
                ${monthlyPool.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {(monthlyPool * 100).toFixed(0)} credits available
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Total Distributed</p>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {totalCreditsDistributed.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                ≈ ${(totalCreditsDistributed / 100).toFixed(2)} value
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Eligible Auditors</p>
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {eligibleMembers}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Top 10% of {auditors.length} auditors
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Total Redeemed</p>
                <Activity className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {totalCreditsRedeemed.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                ≈ ${(totalCreditsRedeemed / 100).toFixed(2)} used
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="eligible" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 overflow-x-auto">
            <TabsTrigger value="eligible" className="whitespace-nowrap">
              Eligible ({eligibleMembers})
            </TabsTrigger>
            <TabsTrigger value="top-earners" className="whitespace-nowrap">
              Top Earners ({topEarners.length})
            </TabsTrigger>
            <TabsTrigger value="transactions" className="whitespace-nowrap">
              Transactions
            </TabsTrigger>
          </TabsList>

          {/* Eligible Auditors Tab */}
          <TabsContent value="eligible">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-yellow-600" />
                    Top 10% Eligible Auditors
                  </CardTitle>
                  <Badge className="bg-green-500 text-white">
                    Will receive credits on distribution
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {eligibleAuditors.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600">No eligible auditors yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {eligibleAuditors.map((auditor, index) => (
                      <div
                        key={auditor.id}
                        className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg border-2 border-green-200 dark:border-green-700/50"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            {index < 3 && (
                              <Crown 
                                className={`w-5 h-5 ${
                                  index === 0 ? 'text-yellow-500' : 
                                  index === 1 ? 'text-gray-400' : 
                                  'text-orange-600'
                                }`}
                              />
                            )}
                            <span className="text-lg font-bold text-foreground">#{index + 1}</span>
                          </div>
                          
                          <Link 
                            to={createPageUrl(`Profile?email=${auditor.email}`)}
                            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                          >
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={auditor.avatar_url} />
                              <AvatarFallback className="bg-gradient-to-br from-green-500 to-blue-600 text-white">
                                {(auditor.full_name || auditor.email)[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-gray-900">
                                {auditor.full_name || auditor.email.split('@')[0]}
                              </p>
                              <p className="text-xs text-gray-500">{auditor.email}</p>
                            </div>
                          </Link>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-center">
                            <p className="text-xs text-gray-600">XP</p>
                            <p className="text-lg font-bold text-gray-900">{auditor.xp || 0}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-600">Audits</p>
                            <p className="text-lg font-bold text-gray-900">{auditor.total_vets || 0}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-600">Accuracy</p>
                            <p className="text-lg font-bold text-green-600">
                              {((auditor.accuracy_rate || 0.5) * 100).toFixed(0)}%
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-gray-600">Score</p>
                            <p className="text-lg font-bold text-blue-600">
                              {auditor.compositeScore.toFixed(1)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Top Earners Tab */}
          <TabsContent value="top-earners">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-600" />
                  Top Credit Earners (All-Time)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topEarners.length === 0 ? (
                  <div className="text-center py-12">
                    <Coins className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600">No credits distributed yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {topEarners.map((credit, index) => (
                      <div
                        key={credit.id}
                        className="flex items-center justify-between p-4 bg-muted/40 rounded-lg hover:bg-muted/70 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            {index < 3 && (
                              <Crown 
                                className={`w-5 h-5 ${
                                  index === 0 ? 'text-yellow-500' : 
                                  index === 1 ? 'text-gray-400' : 
                                  'text-orange-600'
                                }`}
                              />
                            )}
                            <span className="text-lg font-bold text-gray-400">#{index + 1}</span>
                          </div>
                          
                          <Link 
                            to={createPageUrl(`Profile?email=${credit.user_email}`)}
                            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                          >
                            <Avatar className="w-10 h-10">
                              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                {credit.user_email[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-gray-900">{credit.user_email.split('@')[0]}</p>
                              <p className="text-xs text-gray-500">{credit.user_email}</p>
                            </div>
                          </Link>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-sm text-gray-600">Total Earned</p>
                            <p className="text-lg font-bold text-green-600">
                              {(credit.auditor_rewards_total || 0).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600">Balance</p>
                            <p className="text-lg font-bold text-orange-600">
                              {credit.credits_balance.toLocaleString()}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedUser(credit);
                              setShowManualAdjustDialog(true);
                            }}
                          >
                            Adjust
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  Recent Transactions (This Month)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {monthlyTransactions.length === 0 ? (
                  <div className="text-center py-12">
                    <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600">No transactions this month</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Buyer</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Auditor Pool (1%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyTransactions.slice(0, 15).map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="text-sm text-gray-600">
                            {new Date(transaction.created_date).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="font-medium">
                            <Link 
                              to={createPageUrl(`ItemDetails?id=${transaction.item_id}`)}
                              className="hover:text-blue-600 transition-colors"
                            >
                              {transaction.item_title}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">
                            {transaction.buyer_email.split('@')[0]}
                          </TableCell>
                          <TableCell className="font-semibold">
                            ${transaction.sale_amount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-green-600 font-semibold">
                            ${(transaction.auditor_pool_contribution ?? transaction.council_pool_contribution ?? 0).toFixed(2)}
                            <span className="text-xs text-gray-500 ml-1">
                              ({((transaction.auditor_pool_contribution ?? transaction.council_pool_contribution ?? 0) * 100).toFixed(0)} credits)
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Manual Adjust Dialog */}
      <Dialog open={showManualAdjustDialog} onOpenChange={setShowManualAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Credit Adjustment</DialogTitle>
            <DialogDescription>
              Add or remove credits for {selectedUser?.user_email}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="bg-muted/40 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Current Balance</p>
                <p className="text-2xl font-bold text-foreground">
                  {selectedUser.credits_balance.toLocaleString()} credits
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adjustment Amount
                </label>
                <Input
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(parseInt(e.target.value) || 0)}
                  placeholder="Enter positive or negative amount"
                  className="text-lg"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use negative numbers to remove credits
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason (Optional)
                </label>
                <Input
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Admin bonus, correction, etc."
                />
              </div>

              {adjustAmount !== 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-900">
                    <strong>New Balance:</strong>{' '}
                    {Math.max(0, selectedUser.credits_balance + adjustAmount).toLocaleString()} credits
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowManualAdjustDialog(false);
                setSelectedUser(null);
                setAdjustAmount(0);
                setAdjustReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleManualAdjust}
              disabled={adjustAmount === 0 || manualAdjustMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {manualAdjustMutation.isPending ? "Processing..." : "Apply Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}