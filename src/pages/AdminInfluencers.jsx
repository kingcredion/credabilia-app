import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  XCircle,
  TrendingUp,
  Users,
  DollarSign,
  Eye,
  Clock,
  AlertCircle,
  MessageSquare,
  Crown,
  Award,
  Ban,
  Sparkles,
  Link as LinkIcon,
  Share2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export default function AdminInfluencers() {
  const [user, setUser] = useState(null);
  const [selectedInfluencer, setSelectedInfluencer] = useState(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [selectedTab, setSelectedTab] = useState("pending");
  // The copyStatus state and handleCopyInfluencerLink function are removed as they are tied to the removed "Shareable Influencer Link Card" section.

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

  // Copy influencer signup link to clipboard - Removed as the associated UI element is removed.

  // Fetch all influencers
  const { data: influencers, isLoading } = useQuery({
    queryKey: ['admin-influencers'],
    queryFn: async () => {
      return await base44.entities.Influencer.list("-created_date");
    },
    initialData: [],
  });

  // Fetch all users to map influencer data
  const { data: users } = useQuery({
    queryKey: ['influencer-users'],
    queryFn: async () => {
      const userEmails = [...new Set(influencers.map(inf => inf.user_email))];
      const usersData = await Promise.all(
        userEmails.map(email =>
          base44.entities.User.filter({ email }).then(users => users[0])
        )
      );
      return usersData.reduce((acc, user) => {
        if (user) acc[user.email] = user;
        return acc;
      }, {});
    },
    enabled: influencers.length > 0,
    initialData: {},
  });

  // Approve influencer mutation
  const approveInfluencerMutation = useMutation({
    mutationFn: async ({ influencerId, notes }) => {
      await base44.entities.Influencer.update(influencerId, {
        status: 'active',
        approval_date: new Date().toISOString(),
        admin_notes: notes
      });

      const influencer = influencers.find(inf => inf.id === influencerId);
      if (!influencer) throw new Error("Influencer record not found in local list");

      // Sync linked user record
      let linkedUser = null;
      if (influencer.user_id) {
        try {
          const byId = await base44.entities.User.filter({ id: influencer.user_id });
          linkedUser = byId[0] || null;
        } catch (_) {}
      }
      if (!linkedUser) {
        const byEmail = await base44.entities.User.filter({ email: influencer.user_email });
        linkedUser = byEmail[0] || null;
      }
      if (linkedUser) {
        await base44.entities.User.update(linkedUser.id, {
          user_type: 'influencer',
          influencer_id: influencer.id,
        });
      } else {
        console.warn("[AdminInfluencers] Could not find linked user for influencer:", influencer.user_email);
      }

      // Send notification
      await base44.entities.Notification.create({
        user_email: influencer.user_email,
        type: 'review_received',
        title: '🎉 Influencer Application Approved!',
        message: `Congratulations! Your influencer application has been approved. Your referral code is: ${influencer.referral_code}`,
        link_url: `Profile?email=${influencer.user_email}`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-influencers'] });
      setShowDetailsDialog(false);
      setSelectedInfluencer(null);
      setAdminNotes("");
      toast.success("Influencer approved!");
    },
    onError: (error) => {
      console.error("[AdminInfluencers] Approve failed:", error);
      toast.error("Approval failed: " + (error?.message || "Unknown error"));
    }
  });

  // Reject influencer mutation
  const rejectInfluencerMutation = useMutation({
    mutationFn: async ({ influencerId, notes }) => {
      await base44.entities.Influencer.update(influencerId, {
        status: 'rejected',
        admin_notes: notes
      });

      // Send notification to user
      const influencer = influencers.find(inf => inf.id === influencerId);
      if (influencer) {
        await base44.entities.Notification.create({
          user_email: influencer.user_email,
          type: 'review_received',
          title: 'Influencer Application Update',
          message: 'Thank you for your interest in our influencer program. Unfortunately, we are unable to approve your application at this time.',
          link_url: `Profile?email=${influencer.user_email}`
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-influencers'] });
      setShowDetailsDialog(false);
      setSelectedInfluencer(null);
      setAdminNotes("");
    },
  });

  // Suspend influencer mutation
  const suspendInfluencerMutation = useMutation({
    mutationFn: async ({ influencerId, notes }) => {
      await base44.entities.Influencer.update(influencerId, {
        status: 'suspended',
        admin_notes: notes
      });

      const influencer = influencers.find(inf => inf.id === influencerId);
      if (influencer) {
        await base44.entities.Notification.create({
          user_email: influencer.user_email,
          type: 'review_received',
          title: 'Influencer Account Suspended',
          message: 'Your influencer account has been suspended. Please contact support for more information.',
          link_url: `Profile?email=${influencer.user_email}`
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-influencers'] });
      setShowDetailsDialog(false);
      setSelectedInfluencer(null);
      setAdminNotes("");
    },
  });

  // Filter influencers by status
  const pendingInfluencers = influencers.filter(inf => inf.status === 'pending_approval');
  const activeInfluencers = influencers.filter(inf => inf.status === 'active');
  const rejectedInfluencers = influencers.filter(inf => inf.status === 'rejected');
  const suspendedInfluencers = influencers.filter(inf => inf.status === 'suspended');

  // Calculate stats
  const totalActiveInfluencers = activeInfluencers.length;
  const totalPendingInfluencers = pendingInfluencers.length;
  const totalCommissionEarned = activeInfluencers.reduce((sum, inf) => sum + (inf.total_commission_earned || 0), 0);
  const totalReferredSales = activeInfluencers.reduce((sum, inf) => sum + (inf.total_referred_sales || 0), 0);
  const totalConversions = activeInfluencers.reduce((sum, inf) => sum + (inf.total_conversions || 0), 0);

  const handleViewDetails = (influencer) => {
    setSelectedInfluencer(influencer);
    setAdminNotes(influencer.admin_notes || "");
    setShowDetailsDialog(true);
  };

  const handleApprove = () => {
    if (!selectedInfluencer) return;
    approveInfluencerMutation.mutate({
      influencerId: selectedInfluencer.id,
      notes: adminNotes
    });
  };

  const handleReject = () => {
    if (!selectedInfluencer) return;
    if (!confirm('Are you sure you want to reject this influencer application?')) return;
    rejectInfluencerMutation.mutate({
      influencerId: selectedInfluencer.id,
      notes: adminNotes
    });
  };

  const handleSuspend = () => {
    if (!selectedInfluencer) return;
    if (!confirm('Are you sure you want to suspend this influencer account?')) return;
    suspendInfluencerMutation.mutate({
      influencerId: selectedInfluencer.id,
      notes: adminNotes
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Admin Access Required</h2>
            <p className="text-gray-600">
              You need administrator privileges to access this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-orange-50 to-yellow-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-gradient-to-br from-green-500 to-orange-500 rounded-lg">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Influencer Management</h1>
          </div>
          <p className="text-xs text-gray-500">Review and manage influencer applications</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <Card className="border border-orange-200">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <Clock className="w-4 h-4 text-orange-600" />
                <Badge className="bg-orange-100 text-orange-700 text-[10px]">Pending</Badge>
              </div>
              <p className="text-xl font-bold text-gray-900">{totalPendingInfluencers}</p>
              <p className="text-xs text-gray-500">Awaiting Review</p>
            </CardContent>
          </Card>

          <Card className="border border-green-200">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <Users className="w-4 h-4 text-green-600" />
                <Badge className="bg-green-100 text-green-700 text-[10px]">Active</Badge>
              </div>
              <p className="text-xl font-bold text-gray-900">{totalActiveInfluencers}</p>
              <p className="text-xs text-gray-500">Active</p>
            </CardContent>
          </Card>

          <Card className="border border-purple-200">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <DollarSign className="w-4 h-4 text-purple-600" />
                <Badge className="bg-purple-100 text-purple-700 text-[10px]">Sales</Badge>
              </div>
              <p className="text-xl font-bold text-gray-900">${totalReferredSales.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Referred Sales</p>
            </CardContent>
          </Card>

          <Card className="border border-blue-200">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <Award className="w-4 h-4 text-blue-600" />
                <Badge className="bg-blue-100 text-blue-700 text-[10px]">Payouts</Badge>
              </div>
              <p className="text-xl font-bold text-gray-900">${totalCommissionEarned.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Commission</p>
            </CardContent>
          </Card>

          <Card className="border border-pink-200">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <Share2 className="w-4 h-4 text-pink-600" />
                <Badge className="bg-pink-100 text-pink-700 text-[10px]">Convs</Badge>
              </div>
              <p className="text-xl font-bold text-gray-900">{totalConversions}</p>
              <p className="text-xs text-gray-500">Conversions</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <div className="overflow-x-auto -mx-4 px-4">
           <TabsList className="flex w-max min-w-full gap-1 mb-4 h-9">
             <TabsTrigger value="pending" className="relative text-xs px-3 h-7 whitespace-nowrap">
               Pending
               {totalPendingInfluencers > 0 && (
                 <Badge className="ml-1.5 bg-orange-500 text-white text-[10px] h-4 px-1">{totalPendingInfluencers}</Badge>
               )}
             </TabsTrigger>
             <TabsTrigger value="active" className="text-xs px-3 h-7 whitespace-nowrap">
               Active ({totalActiveInfluencers})
             </TabsTrigger>
             <TabsTrigger value="rejected" className="text-xs px-3 h-7 whitespace-nowrap">
               Rejected ({rejectedInfluencers.length})
             </TabsTrigger>
             <TabsTrigger value="suspended" className="text-xs px-3 h-7 whitespace-nowrap">
               Suspended ({suspendedInfluencers.length})
             </TabsTrigger>
           </TabsList>
           </div>

          {/* Pending Tab */}
          <TabsContent value="pending">
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading influencer applications...</p>
              </div>
            ) : pendingInfluencers.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                <CheckCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                All caught up — no pending applications
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                <AnimatePresence>
                  {pendingInfluencers.map((influencer, index) => (
                    <InfluencerCard
                      key={influencer.id}
                      influencer={influencer}
                      user={users[influencer.user_email]}
                      onViewDetails={handleViewDetails}
                      index={index}
                      isPending={true}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </TabsContent>

          {/* Active Tab */}
          <TabsContent value="active">
            {activeInfluencers.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                No active influencers yet
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {activeInfluencers.map((influencer, index) => (
                  <InfluencerCard
                    key={influencer.id}
                    influencer={influencer}
                    user={users[influencer.user_email]}
                    onViewDetails={handleViewDetails}
                    index={index}
                    isPending={false}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Rejected Tab */}
          <TabsContent value="rejected">
            {rejectedInfluencers.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">No rejected applications</div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {rejectedInfluencers.map((influencer, index) => (
                  <InfluencerCard
                    key={influencer.id}
                    influencer={influencer}
                    user={users[influencer.user_email]}
                    onViewDetails={handleViewDetails}
                    index={index}
                    isPending={false}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Suspended Tab */}
          <TabsContent value="suspended">
            {suspendedInfluencers.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">No suspended accounts</div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {suspendedInfluencers.map((influencer, index) => (
                  <InfluencerCard
                    key={influencer.id}
                    influencer={influencer}
                    user={users[influencer.user_email]}
                    onViewDetails={handleViewDetails}
                    index={index}
                    isPending={false}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Details Dialog */}
      {selectedInfluencer && (
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Crown className="w-4 h-4 text-orange-600" />
                Influencer Application Details
              </DialogTitle>
              <DialogDescription>
                Review and manage this influencer application
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              {/* Key info rows */}
              <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 flex-shrink-0">Email</span>
                  <span className="font-medium text-right truncate">{selectedInfluencer.user_email}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500 flex-shrink-0">Applied</span>
                  <span className="text-right">{new Date(selectedInfluencer.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                {selectedInfluencer.approval_date && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500 flex-shrink-0">Approved</span>
                    <span className="text-green-700 font-medium text-right">{new Date(selectedInfluencer.approval_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                )}
              </div>

              {/* Referral Code */}
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <p className="text-[11px] text-gray-500 mb-1">Referral Code</p>
                <p className="font-mono font-bold text-blue-700">{selectedInfluencer.referral_code}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">credabilia.com?ref={selectedInfluencer.referral_code}</p>
              </div>

              {/* Platforms */}
              {selectedInfluencer.platforms?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Platforms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedInfluencer.platforms.map(platform => (
                      <Badge key={platform} variant="outline" className="text-xs">{platform}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Application Notes */}
              {selectedInfluencer.application_notes && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Application Notes</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2.5 border border-gray-200">{selectedInfluencer.application_notes}</p>
                </div>
              )}

              {/* Performance Stats */}
              {selectedInfluencer.status === 'active' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {[
                    { label: 'Clicks', val: selectedInfluencer.total_clicks || 0 },
                    { label: 'Conversions', val: selectedInfluencer.total_conversions || 0 },
                    { label: 'Sales', val: `$${(selectedInfluencer.total_referred_sales || 0).toLocaleString()}` },
                    { label: 'Commission', val: `$${(selectedInfluencer.total_commission_earned || 0).toLocaleString()}` },
                  ].map(({ label, val }) => (
                    <div key={label} className="bg-muted/40 rounded-lg p-2 text-center">
                      <p className="text-[11px] text-gray-500">{label}</p>
                      <p className="text-sm font-bold text-gray-900">{val}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Admin Notes */}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Admin Notes (Internal)</p>
                <Textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} placeholder="Add internal notes..." rows={3} className="text-sm" />
              </div>
            </div>

            <DialogFooter className="flex gap-2">
              {selectedInfluencer.status === 'pending_approval' && (
                <>
                  <Button
                    onClick={handleReject}
                    disabled={rejectInfluencerMutation.isPending}
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    onClick={handleApprove}
                    disabled={approveInfluencerMutation.isPending}
                    className="bg-gradient-to-r from-green-600 to-orange-600 hover:from-green-700 hover:to-orange-700 text-white"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {approveInfluencerMutation.isPending ? "Approving..." : "Approve Influencer"}
                  </Button>
                </>
              )}

              {selectedInfluencer.status === 'active' && (
                <Button
                  onClick={handleSuspend}
                  disabled={suspendInfluencerMutation.isPending}
                  variant="outline"
                  className="border-orange-300 text-orange-600 hover:bg-orange-50"
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Suspend Account
                </Button>
              )}

              <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function InfluencerCard({ influencer, user, onViewDetails, index, isPending }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'pending_approval': return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'active': return 'bg-green-100 text-green-700 border-green-300';
      case 'rejected': return 'bg-red-100 text-red-700 border-red-300';
      case 'suspended': return 'bg-gray-100 text-gray-700 border-gray-300';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending_approval': return <Clock className="w-4 h-4" />;
      case 'active': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': return <XCircle className="w-4 h-4" />;
      case 'suspended': return <Ban className="w-4 h-4" />;
      default: return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className={`tap-scale hover:shadow-md transition-shadow border ${isPending ? 'border-orange-200' : 'border-border'}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0 mr-3">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <h3 className="text-sm font-bold text-gray-900 truncate">{user?.full_name || influencer.user_email}</h3>
                <Badge className={`${getStatusColor(influencer.status)} flex items-center gap-1 text-[11px] h-5`}>
                  {getStatusIcon(influencer.status)}
                  {influencer.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 truncate">{influencer.user_email}</p>
            </div>
            <Button onClick={() => onViewDetails(influencer)} variant="outline" size="sm" className="h-8 text-xs px-2.5 flex-shrink-0">
              <Eye className="w-3.5 h-3.5 mr-1" />
              Review
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="bg-blue-50 rounded-lg px-3 py-2 border border-blue-200 flex-1 min-w-0">
              <p className="text-[10px] text-gray-500 mb-0.5">Referral Code</p>
              <p className="font-mono text-sm font-bold text-blue-700 truncate">{influencer.referral_code}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {influencer.platforms?.slice(0, 3).map(platform => (
                <Badge key={platform} variant="outline" className="text-[11px] h-5">{platform}</Badge>
              ))}
              {(influencer.platforms?.length || 0) > 3 && (
                <Badge variant="outline" className="text-[11px] h-5">+{influencer.platforms.length - 3}</Badge>
              )}
            </div>
          </div>

          {influencer.status === 'active' && (
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-100">
              <div className="text-center">
                <p className="text-[10px] text-gray-500">Clicks</p>
                <p className="text-sm font-bold text-gray-900">{influencer.total_clicks || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-500">Sales</p>
                <p className="text-sm font-bold text-gray-900">{influencer.total_conversions || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-500">Revenue</p>
                <p className="text-sm font-bold text-gray-900">${(influencer.total_referred_sales || 0).toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-500">Earned</p>
                <p className="text-sm font-bold text-green-600">${(influencer.total_commission_earned || 0).toLocaleString()}</p>
              </div>
            </div>
          )}

          <div className="mt-2 text-[11px] text-gray-400">
            Applied {new Date(influencer.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {influencer.approval_date && <> • Approved {new Date(influencer.approval_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}