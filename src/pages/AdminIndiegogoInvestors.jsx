import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft,
  Crown,
  Shield,
  CheckCircle,
  XCircle,
  DollarSign,
  Calendar,
  Mail,
  ExternalLink,
  Edit,
  Save,
  X,
  AlertCircle,
  TrendingUp,
  MessageCircle,
  Send,
  Heart,
  Pin,
  Trash2,
  HeartHandshake
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { motion } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";

export default function AdminIndiegogoInvestors() {
  const [user, setUser] = useState(null);
  const [selectedInvestor, setSelectedInvestor] = useState(null);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [investmentAmount, setInvestmentAmount] = useState("");
  const [founderTier, setFounderTier] = useState("elite_tier");
  const [adminNotes, setAdminNotes] = useState("");
  const [initialStoreCredits, setInitialStoreCredits] = useState("");
  const [newFounderPost, setNewFounderPost] = useState("");

  const queryClient = useQueryClient();

  React.useEffect(() => {
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

  const { data: investors, isLoading } = useQuery({
    queryKey: ['indiegogo-investors'],
    queryFn: async () => {
      return await base44.entities.IndiegogoInvestor.list("-created_date");
    },
    initialData: [],
  });

  const { data: founderPosts = [] } = useQuery({
    queryKey: ['founder-posts-admin'],
    queryFn: () => base44.entities.FounderPost.list("-created_date"),
    enabled: user?.role === 'admin'
  });

  const verifyInvestorMutation = useMutation({
    mutationFn: async ({ investorId, data }) => {
      await base44.entities.IndiegogoInvestor.update(investorId, {
        investment_amount_usd: parseFloat(data.investmentAmount),
        founder_circle_tier: data.founderTier,
        status: "verified",
        admin_notes: data.adminNotes,
        verification_date: new Date().toISOString(),
        store_credits_balance: parseInt(data.initialStoreCredits) || 0
      });

      // Update user entity to mark as indiegogo founder
      await base44.entities.User.update(selectedInvestor.user_id, {
        is_indiegogo_founder: true
      });

      // Create initial CouncilCredit record if store credits provided
      if (data.initialStoreCredits && parseInt(data.initialStoreCredits) > 0) {
        const existingCredits = await base44.entities.CouncilCredit.filter({ 
          user_email: selectedInvestor.user_email 
        });
        
        if (existingCredits.length > 0) {
          await base44.entities.CouncilCredit.update(existingCredits[0].id, {
            credits_balance: (existingCredits[0].credits_balance || 0) + parseInt(data.initialStoreCredits),
            credits_earned_lifetime: (existingCredits[0].credits_earned_lifetime || 0) + parseInt(data.initialStoreCredits)
          });
        } else {
          await base44.entities.CouncilCredit.create({
            user_id: selectedInvestor.user_id,
            user_email: selectedInvestor.user_email,
            credits_balance: parseInt(data.initialStoreCredits),
            credits_earned_lifetime: parseInt(data.initialStoreCredits)
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indiegogo-investors'] });
      setShowVerifyDialog(false);
      setSelectedInvestor(null);
      setInvestmentAmount("");
      setFounderTier("elite_tier");
      setAdminNotes("");
      setInitialStoreCredits("");
      alert("✅ Investor verified successfully!");
    },
  });

  const rejectInvestorMutation = useMutation({
    mutationFn: async ({ investorId, notes }) => {
      await base44.entities.IndiegogoInvestor.update(investorId, {
        status: "rejected",
        admin_notes: notes
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['indiegogo-investors'] });
      setShowVerifyDialog(false);
      setSelectedInvestor(null);
      alert("Investor application rejected.");
    },
  });

  const createFounderPostMutation = useMutation({
    mutationFn: (postData) => base44.entities.FounderPost.create(postData),
    onSuccess: () => {
      queryClient.invalidateQueries(['founder-posts-admin']);
      setNewFounderPost("");
    }
  });

  const pinPostMutation = useMutation({
    mutationFn: ({ postId, pinned }) => 
      base44.entities.FounderPost.update(postId, { pinned }),
    onSuccess: () => {
      queryClient.invalidateQueries(['founder-posts-admin']);
    }
  });

  const deletePostMutation = useMutation({
    mutationFn: (postId) => base44.entities.FounderPost.delete(postId),
    onSuccess: () => {
      queryClient.invalidateQueries(['founder-posts-admin']);
    }
  });

  const handleOpenVerifyDialog = (investor) => {
    setSelectedInvestor(investor);
    setInvestmentAmount(investor.investment_amount_usd?.toString() || "");
    setFounderTier(investor.founder_circle_tier || "elite_tier");
    setAdminNotes(investor.admin_notes || "");
    setInitialStoreCredits(investor.store_credits_balance?.toString() || "");
    setShowVerifyDialog(true);
  };

  const handleVerify = () => {
    if (!investmentAmount || parseFloat(investmentAmount) <= 0) {
      alert("Please enter a valid investment amount");
      return;
    }

    verifyInvestorMutation.mutate({
      investorId: selectedInvestor.id,
      data: {
        investmentAmount,
        founderTier,
        adminNotes,
        initialStoreCredits
      }
    });
  };

  const handleReject = () => {
    if (!window.confirm("Are you sure you want to reject this investor application?")) {
      return;
    }

    rejectInvestorMutation.mutate({
      investorId: selectedInvestor.id,
      notes: adminNotes
    });
  };

  const handleFounderPostSubmit = () => {
    if (!newFounderPost.trim()) return;
    
    createFounderPostMutation.mutate({
      author_email: user.email,
      author_name: user.full_name || "The Founder",
      content: newFounderPost,
      is_founder_post: true,
      pinned: false
    });
  };

  const handleTogglePin = (post) => {
    pinPostMutation.mutate({ postId: post.id, pinned: !post.pinned });
  };

  const handleDeletePost = (postId) => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    deletePostMutation.mutate(postId);
  };

  if (user && user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground mb-6">
              This page is only accessible to administrators.
            </p>
            <Link to={createPageUrl("Marketplace")}>
              <Button>Go to Marketplace</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingInvestors = investors.filter(inv => inv.status === "pending_verification");
  const verifiedInvestors = investors.filter(inv => inv.status === "verified");
  const rejectedInvestors = investors.filter(inv => inv.status === "rejected");

  const totalInvestmentAmount = verifiedInvestors.reduce((sum, inv) => sum + (inv.investment_amount_usd || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-4 md:py-6">
        <div className="mb-4">
          <Link to={createPageUrl("Marketplace")} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground mb-3 text-sm">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Link>
          <div className="flex items-center gap-2 mb-1">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/e1bb7b419_IMG_0622.png" alt="Indiegogo" className="w-7 h-7 object-contain" />
            <h1 className="text-xl font-bold text-foreground">Indiegogo Investors</h1>
          </div>
          <p className="text-xs text-muted-foreground">Manage Founder Circle members and rewards</p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="border border-pink-300">
            <CardContent className="p-3">
              <HeartHandshake className="w-4 h-4 text-pink-600 mb-1" />
              <p className="text-xl font-bold text-gray-900">{investors.length}</p>
              <p className="text-xs text-gray-500">Total</p>
            </CardContent>
          </Card>
          <Card className="border border-orange-300">
            <CardContent className="p-3">
              <AlertCircle className="w-4 h-4 text-orange-600 mb-1" />
              <p className="text-xl font-bold text-gray-900">{pendingInvestors.length}</p>
              <p className="text-xs text-gray-500">Pending</p>
            </CardContent>
          </Card>
          <Card className="border border-green-300">
            <CardContent className="p-3">
              <CheckCircle className="w-4 h-4 text-green-600 mb-1" />
              <p className="text-xl font-bold text-gray-900">{verifiedInvestors.length}</p>
              <p className="text-xs text-gray-500">Verified</p>
            </CardContent>
          </Card>
          <Card className="border border-blue-300">
            <CardContent className="p-3">
              <DollarSign className="w-4 h-4 text-blue-600 mb-1" />
              <p className="text-xl font-bold text-gray-900">${totalInvestmentAmount.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Raised</p>
            </CardContent>
          </Card>
        </div>

        {/* Pending Investors */}
        {pendingInvestors.length > 0 && (
          <Card className="mb-4 border border-orange-300">
            <CardHeader className="bg-orange-50 pb-2 pt-3 px-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                Pending Verification ({pendingInvestors.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-2">
                {pendingInvestors.map((investor) => (
                  <motion.div key={investor.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between gap-3 p-3 bg-background rounded-lg border border-orange-200 dark:border-orange-500/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900 truncate">{investor.user_email}</p>
                        <Badge className="bg-orange-100 text-orange-700 text-[10px] h-4 px-1.5">Pending</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                        <span>ID: {investor.indiegogo_backer_id}</span>
                        <span>{new Date(investor.created_date).toLocaleDateString()}</span>
                        {investor.indiegogo_profile_url && (
                          <a href={investor.indiegogo_profile_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-0.5">
                            Profile <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                    <Button onClick={() => handleOpenVerifyDialog(investor)} size="sm" className="bg-orange-600 hover:bg-orange-700 h-8 text-xs flex-shrink-0">
                      <Edit className="w-3.5 h-3.5 mr-1" />Review
                    </Button>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Verified Investors */}
        <Card className="mb-4 border border-green-300">
          <CardHeader className="bg-green-50 pb-2 pt-3 px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Verified Founders ({verifiedInvestors.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {verifiedInvestors.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                <Crown className="w-8 h-8 text-gray-300 mx-auto mb-2" />No verified investors yet
              </div>
            ) : (
              <div className="space-y-2">
                {verifiedInvestors.map((investor) => (
                  <div key={investor.id} className="flex items-center justify-between gap-3 p-3 bg-background rounded-lg border border-green-200 dark:border-green-700/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <Crown className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0" />
                        <p className="text-sm font-semibold text-gray-900 truncate">{investor.user_email}</p>
                        <Badge className="bg-green-100 text-green-700 text-[10px] h-4 px-1.5">Verified</Badge>
                        {investor.founder_circle_tier && (
                          <Badge className="bg-yellow-100 text-yellow-700 text-[10px] h-4 px-1.5 capitalize">{investor.founder_circle_tier.replace('_', ' ')}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                        <span>${investor.investment_amount_usd?.toLocaleString() || 0} invested</span>
                        <span>{investor.store_credits_balance?.toLocaleString() || 0} credits</span>
                        {investor.verification_date && <span>{new Date(investor.verification_date).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <Button onClick={() => handleOpenVerifyDialog(investor)} variant="outline" size="sm" className="h-8 text-xs flex-shrink-0">
                      <Edit className="w-3.5 h-3.5 mr-1" />Edit
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Founder's Circle Communication */}
        <Card className="border border-orange-300">
          <CardHeader className="bg-gradient-to-r from-orange-500 to-amber-500 text-white pb-3 pt-3 px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageCircle className="w-4 h-4" />
              Founder's Circle Community
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Founder Post Form */}
            <div className="p-3 border-b bg-yellow-50/50">
              <div className="flex items-start gap-2">
                <Avatar className="w-8 h-8 ring-1 ring-yellow-500 flex-shrink-0">
                  <AvatarFallback className="bg-yellow-600 text-white text-xs">👑</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <Textarea value={newFounderPost} onChange={(e) => setNewFounderPost(e.target.value)} placeholder="Post an update to Founder's Circle..." className="mb-2 text-sm" rows={2} />
                  <Button onClick={handleFounderPostSubmit} disabled={!newFounderPost.trim() || createFounderPostMutation.isPending} size="sm" className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 h-8 text-xs">
                    <Send className="w-3.5 h-3.5 mr-1.5" />Post to Community
                  </Button>
                </div>
              </div>
            </div>

            {/* Posts Feed */}
            <div className="max-h-80 overflow-y-auto">
              {founderPosts.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">
                  <MessageCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />No posts yet
                </div>
              ) : (
                founderPosts.map(post => (
                  <div
                    key={post.id}
                    className={`p-4 border-b border-border hover:bg-muted/40 ${
                      post.is_founder_post ? 'bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/10 dark:to-orange-900/10' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className={`w-10 h-10 ${post.is_founder_post ? 'ring-2 ring-yellow-500' : ''}`}>
                        <AvatarFallback className={post.is_founder_post ? 'bg-yellow-600 text-white font-bold' : 'bg-orange-600 text-white'}>
                          {post.is_founder_post ? '👑' : post.author_name?.[0]?.toUpperCase() || 'F'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-gray-900">{post.author_name}</p>
                          {post.is_founder_post && (
                            <Badge className="bg-yellow-600 text-white text-xs">
                              Founder
                            </Badge>
                          )}
                          {!post.is_founder_post && (
                            <Badge variant="outline" className="text-xs">
                              Founder Member
                            </Badge>
                          )}
                          {post.pinned && (
                            <Badge className="bg-blue-600 text-white text-xs flex items-center gap-1">
                              <Pin className="w-3 h-3" />
                              Pinned
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{post.content}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>{format(new Date(post.created_date), 'MMM d, h:mm a')}</span>
                          <span className="flex items-center gap-1">
                            <Heart className="w-3 h-3" />
                            {post.likes || 0}
                          </span>
                          <button
                            onClick={() => handleTogglePin(post)}
                            className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                          >
                            <Pin className="w-3 h-3" />
                            {post.pinned ? 'Unpin' : 'Pin'}
                          </button>
                          <button
                            onClick={() => handleDeletePost(post.id)}
                            className="flex items-center gap-1 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Verify/Edit Dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/e1bb7b419_IMG_0622.png"
                alt="Indiegogo"
                className="w-8 h-8 object-contain"
              />
              {selectedInvestor?.status === "verified" ? "Edit Investor" : "Verify Investor"}
            </DialogTitle>
            <DialogDescription>
              {selectedInvestor?.status === "verified" 
                ? "Update investor details and rewards" 
                : "Verify the Indiegogo backer and set their investment details"}
            </DialogDescription>
          </DialogHeader>

          {selectedInvestor && (
            <div className="space-y-3 text-sm">
              <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Email</span><span className="font-medium truncate max-w-[60%]">{selectedInvestor.user_email}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Backer ID</span><span>{selectedInvestor.indiegogo_backer_id}</span></div>
                {selectedInvestor.indiegogo_profile_url && (
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Profile</span>
                    <a href={selectedInvestor.indiegogo_profile_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-0.5 text-xs">View <ExternalLink className="w-2.5 h-2.5" /></a>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Investment Amount (USD) *</label>
                <Input type="number" value={investmentAmount} onChange={(e) => setInvestmentAmount(e.target.value)} placeholder="100" min="0" step="0.01" className="h-8 text-sm" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Initial Store Credits <span className="font-normal text-gray-400">(100 = $1)</span></label>
                <Input type="number" value={initialStoreCredits} onChange={(e) => setInitialStoreCredits(e.target.value)} placeholder="1000" min="0" className="h-8 text-sm" />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Founder Circle Tier</label>
                <Select value={founderTier} onValueChange={setFounderTier}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="elite_tier">Elite Tier</SelectItem>
                    <SelectItem value="standard_tier">Standard Tier</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Admin Notes</label>
                <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Internal notes..." rows={2} className="text-sm" />
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 pb-8">
            {selectedInvestor?.status === "pending_verification" && (
              <Button
                onClick={handleReject}
                variant="destructive"
                className="w-full sm:w-auto"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={() => setShowVerifyDialog(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleVerify}
              disabled={verifyInvestorMutation.isPending}
              className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
            >
              <Save className="w-4 h-4 mr-2" />
              {verifyInvestorMutation.isPending ? "Saving..." : selectedInvestor?.status === "verified" ? "Update" : "Verify & Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}