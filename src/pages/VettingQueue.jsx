import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Star,
  Award,
  TrendingUp,
  Trophy,
  Target,
  Zap,
  Crown,
  ZoomIn,
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DailyChallenge from "../components/DailyChallenge";
import AuditorBadges, { checkNewBadges } from "../components/AuditorBadges";
import ImageZoomDialog from "../components/ImageZoomDialog";
// PullToRefresh removed — VettingQueue uses the main layout scroll owner
import PageTransition from "../components/PageTransition";
import MobileSelector from "../components/MobileSelector";
import { recalculateItemTrust } from "@/utils/trustScore";
import { updateAuditorStats } from "@/utils/auditorStats";

export default function AuditQueue() {
  const [user, setUser] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [voteType, setVoteType] = useState("");
  const [comment, setComment] = useState("");
  const [confidence, setConfidence] = useState(0.8);
  const [newBadges, setNewBadges] = useState([]);
  const [showImageZoom, setShowImageZoom] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
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

  const { data: items, isLoading } = useQuery({
    queryKey: ['vetting-queue', user?.interests_tags],
    queryFn: async () => {
      const allItems = await base44.entities.Item.list("-created_date");
      // Show only items pending audit or educational samples
      return allItems.filter(item => 
        (item.status === "active" && 
         item.moderation_status !== "rejected" && 
         (item.audit_status === "pending_audit" || !item.visible_to_public)) ||
        item.is_educational_display_item
      );
    },
    initialData: [],
  });

  const { data: myVotes } = useQuery({
    queryKey: ['my-votes', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Vote.filter({ voter_email: user.email });
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const submitVoteMutation = useMutation({
    mutationFn: async (voteData) => {
      const previousUserData = { ...user };
      
      await base44.entities.Vote.create(voteData);
      
      await base44.entities.XPEvent.create({
        user_id: user.id,
        user_email: user.email,
        action_type: "vet_item",
        xp_amount: 5,
        related_item_id: selectedItem.id,
        description: `Audited item: ${selectedItem.title}`
      });
      
      const newTotalVets = (user.total_vets || 0) + 1;
      const newXP = (user.xp || 0) + 5;
      const newAuditsToday = (user.audits_today || 0) + 1;
      const today = new Date().toISOString().split('T')[0];
      
      const lastAuditDate = user.last_audit_date;
      let newAuditStreak = user.audit_streak || 0;
      if (lastAuditDate !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        if (lastAuditDate === yesterdayStr) {
          newAuditStreak += 1;
        } else {
          newAuditStreak = 1;
        }
      }
      
      const DAILY_TARGET = 5;
      const dailyChallengeJustCompleted = newAuditsToday === DAILY_TARGET && !user.daily_challenge_completed_today;
      
      let bonusXP = 0;
      let updateData = {
        xp: newXP,
        total_vets: newTotalVets,
        audits_today: newAuditsToday,
        last_audit_date: today,
        audit_streak: newAuditStreak,
        max_audits_per_day: Math.max(user.max_audits_per_day || 0, newAuditsToday)
      };
      
      if (dailyChallengeJustCompleted) {
        bonusXP = 25;
        const newChallengeStreak = (user.daily_challenge_streak || 0) + 1;
        
        updateData = {
          ...updateData,
          xp: newXP + bonusXP,
          daily_challenge_completed_today: true,
          daily_challenge_streak: newChallengeStreak,
          daily_challenges_completed: (user.daily_challenges_completed || 0) + 1
        };
        
        const credits = await base44.entities.CouncilCredit.filter({ user_email: user.email });
        if (credits[0]) {
          await base44.entities.CouncilCredit.update(credits[0].id, {
            credits_balance: (credits[0].credits_balance || 0) + 50,
            credits_earned_lifetime: (credits[0].credits_earned_lifetime || 0) + 50,
            credits_earned_monthly: (credits[0].credits_earned_monthly || 0) + 50
          });
        }
      }
      
      await base44.auth.updateMe(updateData);
      
      const currentItem = items.find(i => i.id === selectedItem.id);
      
      // Fetch all votes for this item to recalculate trust scores
      const allVotesForItem = await base44.entities.Vote.filter({ item_id: selectedItem.id });
      
      // Add the current vote to the list for recalculation
      const votesWithNewVote = [
        ...allVotesForItem,
        {
          vote_type: voteType,
          weight: (user.accuracy_rate || 0.5) * 2
        }
      ];
      
      // Calculate new vote counts
      const newTotalVotes = votesWithNewVote.length;
      const newAuthenticVotes = votesWithNewVote.filter(v => v.vote_type === 'authentic').length;
      const newSuspiciousVotes = votesWithNewVote.filter(v => v.vote_type === 'suspicious').length;
      const newCounterfeitVotes = votesWithNewVote.filter(v => v.vote_type === 'counterfeit').length;
      
      // Recalculate trust scores using canonical engine
      const trustScores = recalculateItemTrust(currentItem, votesWithNewVote, null);
      
      // All active items are live (no pre-approval gate). Audits determine positioning via ranking_score.
      const itemUpdateData = {
        total_votes: newTotalVotes,
        authentic_votes: newAuthenticVotes,
        suspicious_votes: newSuspiciousVotes,
        counterfeit_votes: newCounterfeitVotes,
        authenticator_score: trustScores.authenticator_score,
        community_score: trustScores.community_score,
        final_trust_score: trustScores.final_trust_score,
        authenticator_weight: trustScores.authenticator_weight,
        community_weight: trustScores.community_weight,
        authenticity_meter: trustScores.final_trust_score
      };
      
      // Update marketplace ranking and state based on audit results
      const { updateMarketplaceRanking } = await import("@/utils/marketplaceRanking");
      const vendors = await base44.entities.User.filter({ email: currentItem.vendor_email });
      const vendor = vendors[0] || null;
      const rankingUpdate = await updateMarketplaceRanking({ ...currentItem, ...itemUpdateData }, vendor);
      Object.assign(itemUpdateData, rankingUpdate);
      
      await base44.entities.Item.update(selectedItem.id, itemUpdateData);

      // Update auditor-level leaderboard stats (trust_score, accuracy_rate, rank)
      // Pass the updated user object with already-incremented xp and total_vets
      const updatedUserForStats = {
        ...user,
        xp: updateData.xp,
        total_vets: newTotalVets,
        accuracy_rate: user.accuracy_rate,
        trust_score: user.trust_score,
      };
      await updateAuditorStats(updatedUserForStats, voteType, { ...currentItem, ...itemUpdateData });

      return { previousUserData, bonusXP, dailyChallengeJustCompleted };
    },
    onSuccess: ({ previousUserData, bonusXP, dailyChallengeJustCompleted }) => {
      queryClient.invalidateQueries({ queryKey: ['vetting-queue'] });
      queryClient.invalidateQueries({ queryKey: ['my-votes'] });
      setSubmitError(null);
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        setSelectedItem(null);
        setVoteType("");
        setComment("");
        setConfidence(0.8);
      }, 1200);

      // loadUser updates state but doesn't return a value; fetch fresh data for badge check
      base44.auth.me().then((updatedUser) => {
        if (!updatedUser) return;
        setUser(updatedUser);
        const earnedNewBadges = checkNewBadges(updatedUser, previousUserData);
        if (earnedNewBadges.length > 0) {
          setNewBadges(earnedNewBadges);
        }
      }).catch(() => {});
      
      if (dailyChallengeJustCompleted) {
        console.log("Daily challenge completed! Bonus earned.");
      }
    },
    onError: (error) => {
      console.error("[VettingQueue] Submit failed:", error);
      setSubmitError(error?.message || "Submission failed. Please try again.");
    },
  });

  const handleVote = () => {
    if (!selectedItem || !voteType || !user) return;
    
    submitVoteMutation.mutate({
      item_id: selectedItem.id,
      voter_id: user.id,
      voter_email: user.email,
      vote_type: voteType,
      confidence: confidence,
      comment: comment,
      voter_rank: user.rank || "bronze",
      weight: (user.accuracy_rate || 0.5) * 2
    });
  };

  const handleImageClick = (imageUrl) => {
    setZoomImage(imageUrl);
    setShowImageZoom(true);
  };

  const currentCertificateId = selectedItem?.certificate_id || null;

  const alreadyVotedItems = new Set(myVotes.map(v => v.item_id));
  
  // Separate educational items from regular items
  const educationalItems = items.filter(item => item.is_educational_display_item);
  const regularItems = items.filter(item => !item.is_educational_display_item);
  
  const baseUnvettedItems = regularItems.filter(item => !alreadyVotedItems.has(item.id));

  const unvettedItems = React.useMemo(() => {
    if (!user?.interests_tags || user.interests_tags.length === 0) {
      // Educational items always first, then regular unvetted items
      return [...educationalItems, ...baseUnvettedItems];
    }

    const scoredItems = baseUnvettedItems.map(item => {
      let relevanceScore = 0;
      const auditorExpertise = user.interests_tags.map(t => t.toLowerCase());

      auditorExpertise.forEach(expertise => {
        if (item.signer?.toLowerCase().includes(expertise)) relevanceScore += 4;
        if (item.team?.toLowerCase().includes(expertise)) relevanceScore += 3;
        if (item.sport?.toLowerCase().includes(expertise)) relevanceScore += 3;
        if (item.tags?.some(tag => tag.toLowerCase().includes(expertise))) relevanceScore += 2;
      });

      return { ...item, relevanceScore };
    });

    const sortedRegularItems = scoredItems.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return new Date(b.created_date) - new Date(a.created_date);
    });
    
    // Educational items always first
    return [...educationalItems, ...sortedRegularItems];
  }, [educationalItems, baseUnvettedItems, user?.interests_tags]);

  const getVoteIcon = (type) => {
    switch(type) {
      case 'authentic': return <ShieldCheck className="w-5 h-5" />;
      case 'suspicious': return <ShieldAlert className="w-5 h-5" />;
      case 'counterfeit': return <ShieldX className="w-5 h-5" />;
      default: return null;
    }
  };

  const getVoteColor = (type) => {
    switch(type) {
      case 'authentic': return 'bg-green-600 hover:bg-green-700';
      case 'suspicious': return 'bg-yellow-600 hover:bg-yellow-700';
      case 'counterfeit': return 'bg-red-600 hover:bg-red-700';
      default: return 'bg-gray-600 hover:bg-gray-700';
    }
  };

  return (
    <PageTransition>
      {/* PullToRefresh removed — page uses main layout scroll, no dedicated scroll container */}
        <div className="min-h-screen app-bg p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 flex items-center gap-3">
            <ShieldCheck className="w-10 h-10 text-green-600" />
            Audit Queue
          </h1>
          <p className="text-muted-foreground mb-6">
            Review items, earn rewards, and climb the leaderboard
            {user?.interests_tags?.length > 0 && (
              <span className="text-green-600 dark:text-green-400 ml-2">
                • Prioritized by your expertise
              </span>
            )}
          </p>

          {user && (
            <div className="mb-6">
              <DailyChallenge user={user} auditsToday={user.audits_today || 0} />
            </div>
          )}

          {user && user.total_vets > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-6 h-6 text-yellow-600" />
                  Your Achievements
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AuditorBadges user={user} size="md" maxDisplay={8} />
              </CardContent>
            </Card>
          )}

          <div className="mb-6 bg-card border border-border rounded-xl p-4 shadow-sm dark:shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h3 className="font-semibold text-foreground text-sm">How the Audit Game Works</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <Star className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">+5 XP Per Audit</p>
                  <p className="text-xs text-muted-foreground">Each verdict earns XP toward your rank</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <Target className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Accuracy Matters</p>
                  <p className="text-xs text-muted-foreground">Higher accuracy = more vote weight</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                  <Crown className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Top 10% Earn Credits</p>
                  <p className="text-xs text-muted-foreground">Monthly pool · 100 credits = $1 · <Link to={createPageUrl("Leaderboard")} className="underline hover:text-foreground">Track ranking</Link></p>
                </div>
              </div>
            </div>
          </div>

          {user?.interests_tags && user.interests_tags.length > 0 && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-lg">
              <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-2">Your Expertise Areas:</p>
              <div className="flex flex-wrap gap-2">
                {user.interests_tags.map(tag => (
                  <Badge key={tag} className="bg-green-600 dark:bg-green-700 text-white">
                    {tag}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                Items matching your expertise appear first in your queue
              </p>
            </div>
          )}

          {user && (
            <Card className="mb-2">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border dark:divide-border">
                  <div className="px-4 first:pl-0 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Rank</p>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400 capitalize">{user.rank || 'Bronze'}</p>
                  </div>
                  <div className="px-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Total Audits</p>
                    <p className="text-lg font-bold text-foreground">{user.total_vets || 0}</p>
                  </div>
                  <div className="px-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Accuracy</p>
                    <p className="text-lg font-bold text-foreground">{((user.accuracy_rate || 0.5) * 100).toFixed(0)}%</p>
                  </div>
                  <div className="px-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">XP Points</p>
                    <p className="text-lg font-bold text-foreground">{user.xp || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Items Awaiting Your Review</span>
              <Badge variant="secondary" className="text-lg px-4">
                {unvettedItems.length} items
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array(6).fill(0).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <div className="aspect-square bg-gray-200"></div>
                    <CardContent className="p-4 space-y-2">
                      <div className="h-4 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : unvettedItems.length === 0 ? (
              <div className="text-center py-12">
                <ShieldCheck className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  All caught up!
                </h3>
                <p className="text-muted-foreground">
                  You've reviewed all available items. Check back later for more.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {unvettedItems.map((item) => {
                  const isEducational = item.is_educational_display_item;
                  
                  return (
                    <Card 
                      key={item.id}
                      className={`overflow-hidden hover:shadow-lg transition-all cursor-pointer relative ${
                        isEducational ? 'border-4 border-green-400' : ''
                      }`}
                      style={isEducational ? { boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)' } : {}}
                      onClick={() => setSelectedItem(item)}
                    >
                      {isEducational && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
                          <Badge 
                            className="text-xs shadow-lg font-bold px-3 py-1 animate-pulse"
                            style={{ 
                              background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                              color: 'white',
                              border: '2px solid white'
                            }}
                          >
                            🎓 EDUCATIONAL SAMPLE
                          </Badge>
                        </div>
                      )}
                      
                      {item.relevanceScore > 0 && !isEducational && (
                        <div className="absolute top-2 left-2 z-10">
                          <Badge className="bg-green-600 text-white text-xs shadow-lg">
                            ✨ Your Expertise
                          </Badge>
                        </div>
                      )}
                      
                      <div className="aspect-square bg-muted dark:bg-muted/50 relative">
                         {item.images?.[0] ? (
                           <img 
                             src={item.images[0]} 
                             alt={item.title}
                             className="w-full h-full object-cover"
                           />
                         ) : (
                           <div className="w-full h-full flex items-center justify-center">
                             <Star className="w-16 h-16 text-muted-foreground/30" />
                           </div>
                         )}
                        <div className="absolute top-3 right-3">
                          <Badge className="bg-white text-gray-900 border-2">
                            {item.total_votes || 0} votes
                          </Badge>
                        </div>
                      </div>
                      
                      <CardContent className="p-4">
                         <h3 className="font-semibold text-foreground mb-2 line-clamp-2">
                           {item.title}
                         </h3>

                         {item.certificate_id && (
                           <div className="mb-3 p-2 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 rounded-lg">
                             <p className="text-xs text-orange-800 dark:text-orange-300 font-medium mb-1">Certificate ID:</p>
                             <p className="font-mono text-sm text-orange-900 dark:text-orange-100 font-bold">
                               {item.certificate_id}
                             </p>
                           </div>
                         )}
                        
                        <div className="flex items-center justify-between">
                          <Badge variant="outline">
                            Current: {item.authenticity_meter}%
                          </Badge>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700">
                            Review
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card dark:bg-card">
           <DialogHeader>
             <DialogTitle className="text-foreground">Authenticate Item</DialogTitle>
             <DialogDescription className="text-muted-foreground">
               Provide your expert opinion on this item's authenticity (+5 XP)
             </DialogDescription>
           </DialogHeader>

          {selectedItem && (
            <div className="space-y-6">
              {selectedItem.certificate_id && (
                <div className="bg-gradient-to-br from-orange-50 dark:from-orange-950/30 to-yellow-50 dark:to-yellow-950/30 border-2 border-orange-300 dark:border-orange-900/50 rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-orange-600 dark:bg-orange-700 rounded-full flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-orange-900 dark:text-orange-100 mb-2">🎯 Auditor's Primary Task:</h4>
                      <p className="text-sm text-orange-800 dark:text-orange-200 mb-3">
                        <strong>Match the seal on the item image(s) to the certificate number below.</strong> Click images to zoom and inspect the seal closely.
                      </p>
                      <div className="bg-card dark:bg-muted/30 rounded-lg p-3 border-2 border-orange-200 dark:border-orange-900/50">
                        <p className="text-xs text-orange-700 dark:text-orange-300 font-medium mb-1">Certificate ID:</p>
                        <p className="font-mono text-lg text-orange-900 dark:text-orange-100 font-bold">
                          {selectedItem.certificate_id}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedItem.images && selectedItem.images.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">
                    Item Images - Click to Zoom & Inspect Seal
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {selectedItem.images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleImageClick(img)}
                        className="aspect-square rounded-lg overflow-hidden border-2 border-border dark:border-border hover:border-orange-500 dark:hover:border-orange-600 transition-all group relative"
                      >
                        <img src={img} alt={`Item view ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <div className="bg-white/90 dark:bg-gray-900/90 rounded-full p-2">
                            <ZoomIn className="w-5 h-5 text-gray-900 dark:text-white" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Click any image to open full-screen zoom. On desktop: hover to magnify. On mobile: pinch to zoom.
                  </p>
                </div>
              )}

              {selectedItem.coa_certificates && selectedItem.coa_certificates.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">
                    Certificate of Authenticity Documents
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {selectedItem.coa_certificates.map((cert, idx) => (
                      <a
                        key={idx}
                        href={cert}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-video rounded-lg overflow-hidden border-2 border-orange-200 hover:border-orange-400 transition-all group relative"
                      >
                        <img src={cert} alt={`COA ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center">
                          <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-3">
                  Your Verdict
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <Button
                    variant={voteType === 'authentic' ? 'default' : 'outline'}
                    className={voteType === 'authentic' ? getVoteColor('authentic') : ''}
                    onClick={() => setVoteType('authentic')}
                  >
                    <ShieldCheck className="w-5 h-5 mr-2" />
                    Authentic
                  </Button>
                  <Button
                    variant={voteType === 'suspicious' ? 'default' : 'outline'}
                    className={voteType === 'suspicious' ? getVoteColor('suspicious') : ''}
                    onClick={() => setVoteType('suspicious')}
                  >
                    <ShieldAlert className="w-5 h-5 mr-2" />
                    Suspicious
                  </Button>
                  <Button
                    variant={voteType === 'counterfeit' ? 'default' : 'outline'}
                    className={voteType === 'counterfeit' ? getVoteColor('counterfeit') : ''}
                    onClick={() => setVoteType('counterfeit')}
                  >
                    <ShieldX className="w-5 h-5 mr-2" />
                    Counterfeit
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-3">
                  Confidence Level: {(confidence * 100).toFixed(0)}%
                </label>
                <MobileSelector
                  value={confidence.toString()}
                  onValueChange={(val) => setConfidence(parseFloat(val))}
                  trigger={<span>{(confidence * 100).toFixed(0)}% - Select confidence</span>}
                  title="Your Confidence Level"
                  items={[
                    { value: "1", label: "100% - Absolutely certain" },
                    { value: "0.9", label: "90% - Very confident" },
                    { value: "0.8", label: "80% - Confident" },
                    { value: "0.7", label: "70% - Fairly sure" },
                    { value: "0.6", label: "60% - Somewhat sure" }
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Reasoning (Optional)
                </label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Explain your assessment..."
                  rows={4}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2">
            {submitError && (
              <p className="text-sm text-red-600 dark:text-red-400 text-center w-full">{submitError}</p>
            )}
            {submitSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400 text-center w-full font-medium">✓ Audit submitted! +5 XP earned</p>
            )}
            <div className="flex gap-2 w-full justify-end">
              <Button
                variant="outline"
                onClick={() => { setSelectedItem(null); setSubmitError(null); setSubmitSuccess(false); }}
                disabled={submitVoteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleVote}
                disabled={!voteType || submitVoteMutation.isPending || submitSuccess}
                className="bg-green-600 hover:bg-green-700"
              >
                {submitVoteMutation.isPending ? "Submitting..." : submitSuccess ? "✓ Submitted!" : "Submit Audit (+5 XP)"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newBadges.length > 0} onOpenChange={() => setNewBadges([])}>
        <DialogContent className="max-w-md bg-card dark:bg-card">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl text-foreground">🎉 Achievement Unlocked!</DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              You've earned {newBadges.length} new {newBadges.length === 1 ? 'badge' : 'badges'}!
            </DialogDescription>
          </DialogHeader>

          <div className="py-6">
            {newBadges.map((badge, index) => {
              const Icon = badge.icon;
              return (
                <div key={badge.id} className="flex items-center gap-4 mb-4 bg-gradient-to-r from-yellow-50 dark:from-yellow-950/30 to-orange-50 dark:to-orange-950/30 p-4 rounded-lg border-2 border-yellow-300 dark:border-yellow-900/50">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg border-4 border-white"
                    style={{ backgroundColor: badge.color }}
                  >
                    {Icon && <Icon className="w-8 h-8 text-white" />}
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-lg">{badge.name}</p>
                    <p className="text-sm text-muted-foreground">{badge.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button onClick={() => setNewBadges([])} className="w-full bg-green-600 hover:bg-green-700">
              Awesome! Keep Going
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageZoomDialog 
        imageUrl={zoomImage}
        isOpen={showImageZoom}
        onClose={() => setShowImageZoom(false)}
        certificateId={currentCertificateId}
      />
        </div>
    </PageTransition>
  );
}