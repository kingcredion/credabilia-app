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
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-orange-50 to-yellow-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-gradient-to-br from-green-500 to-orange-500 rounded-xl">
              <TrendingUp className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Influencer Management</h1>
              <p className="text-gray-600">Review and manage influencer applications</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card className="border-2 border-orange-200 bg-gradient-to-br from-white to-orange-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-5 h-5 text-orange-600" />
                <Badge className="bg-orange-100 text-orange-700">Pending</Badge>
              </div>
              <p className="text-2xl font-bold text-gray-900">{totalPendingInfluencers}</p>
              <p className="text-xs text-gray-600">Awaiting Review</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-green-200 bg-gradient-to-br from-white to-green-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Users className="w-5 h-5 text-green-600" />
                <Badge className="bg-green-100 text-green-700">Active</Badge>
              </div>
              <p className="text-2xl font-bold text-gray-900">{totalActiveInfluencers}</p>
              <p className="text-xs text-gray-600">Active Influencers</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-purple-200 bg-gradient-to-br from-white to-purple-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="w-5 h-5 text-purple-600" />
                <Badge className="bg-purple-100 text-purple-700">Revenue</Badge>
              </div>
              <p className="text-2xl font-bold text-gray-900">${totalReferredSales.toLocaleString()}</p>
              <p className="text-xs text-gray-600">Total Referred Sales</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-blue-200 bg-gradient-to-br from-white to-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Award className="w-5 h-5 text-blue-600" />
                <Badge className="bg-blue-100 text-blue-700">Payouts</Badge>
              </div>
              <p className="text-2xl font-bold text-gray-900">${totalCommissionEarned.toLocaleString()}</p>
              <p className="text-xs text-gray-600">Commission Earned</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-pink-200 bg-gradient-to-br from-white to-pink-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Share2 className="w-5 h-5 text-pink-600" />
                <Badge className="bg-pink-100 text-pink-700">Sales</Badge>
              </div>
              <p className="text-2xl font-bold text-gray-900">{totalConversions}</p>
              <p className="text-xs text-gray-600">Total Conversions</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
         <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
           <TabsList className="w-full flex gap-3 mb-8 bg-gray-900 p-2 overflow-x-auto md:grid md:grid-cols-4">
             <TabsTrigger value="pending" className="relative px-5 py-3 text-sm font-medium whitespace-nowrap">
               Pending
               {totalPendingInfluencers > 0 && (
                 <Badge className="ml-2 bg-orange-500 text-white">{totalPendingInfluencers}</Badge>
               )}
             </TabsTrigger>
             <TabsTrigger value="active" className="px-5 py-3 text-sm font-medium whitespace-nowrap">
               Active ({totalActiveInfluencers})
             </TabsTrigger>
             <TabsTrigger value="rejected" className="px-5 py-3 text-sm font-medium whitespace-nowrap">
               Rejected ({rejectedInfluencers.length})
             </TabsTrigger>
             <TabsTrigger value="suspended" className="px-5 py-3 text-sm font-medium whitespace-nowrap">
               Suspended ({suspendedInfluencers.length})
             </TabsTrigger>
           </TabsList>

          {/* Pending Tab */}
          <TabsContent value="pending">
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading influencer applications...</p>
              </div>
            ) : pendingInfluencers.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Pending Applications</h3>
                  <p className="text-gray-600">All influencer applications have been reviewed</p>
                </CardContent>
              </Card>
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
              <Card>
                <CardContent className="p-12 text-center">
                  <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Influencers</h3>
                  <p className="text-gray-600">No influencers have been approved yet</p>
                </CardContent>
              </Card>
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
              <Card>
                <CardContent className="p-12 text-center">
                  <XCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Rejected Applications</h3>
                  <p className="text-gray-600">No applications have been rejected</p>
                </CardContent>
              </Card>
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
              <Card>
                <CardContent className="p-12 text-center">
                  <Ban className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Suspended Accounts</h3>
                  <p className="text-gray-600">No influencer accounts have been suspended</p>
                </CardContent>
              </Card>
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
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center gap-2">
                <Crown className="w-6 h-6 text-orange-600" />
                Influencer Application Details
              </DialogTitle>
              <DialogDescription>
                Review and manage this influencer application
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* User Info */}
              <div className="bg-gradient-to-br from-green-50 to-orange-50 rounded-xl p-4 border-2 border-green-200">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-green-600" />
                  Applicant Information
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Email:</span>
                    <span className="font-medium text-gray-900">{selectedInfluencer.user_email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">User ID:</span>
                    <span className="font-mono text-xs text-gray-700">{selectedInfluencer.user_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Applied:</span>
                    <span className="text-gray-900">
                      {new Date(selectedInfluencer.created_date).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                  {selectedInfluencer.approval_date && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Approved:</span>
                      <span className="text-green-700 font-medium">
                        {new Date(selectedInfluencer.approval_date).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Referral Code */}
              <div className="bg-blue-50 rounded-xl p-4 border-2 border-blue-200">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <LinkIcon className="w-5 h-5 text-blue-600" />
                  Referral Code
                </h3>
                <div className="bg-white rounded-lg p-3 border border-blue-200">
                  <p className="font-mono text-lg text-blue-700 font-bold">
                    {selectedInfluencer.referral_code}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    credabilia.com?ref={selectedInfluencer.referral_code}
                  </p>
                </div>
              </div>

              {/* Platforms */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-purple-600" />
                  Platforms
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedInfluencer.platforms?.map(platform => (
                    <Badge
                      key={platform}
                      className="bg-gradient-to-r from-green-500 to-orange-500 text-white"
                    >
                      {platform}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Application Notes */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                  Application Notes
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {selectedInfluencer.application_notes || "No notes provided"}
                  </p>
                </div>
              </div>

              {/* Performance Stats (for active influencers) */}
              {selectedInfluencer.status === 'active' && (
                <div className="bg-purple-50 rounded-xl p-4 border-2 border-purple-200">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Award className="w-5 h-5 text-purple-600" />
                    Performance Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Total Clicks</p>
                      <p className="text-xl font-bold text-gray-900">{selectedInfluencer.total_clicks || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Conversions</p>
                      <p className="text-xl font-bold text-gray-900">{selectedInfluencer.total_conversions || 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Referred Sales</p>
                      <p className="text-xl font-bold text-gray-900">${(selectedInfluencer.total_referred_sales || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Commission Earned</p>
                      <p className="text-xl font-bold text-green-600">${(selectedInfluencer.total_commission_earned || 0).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Notes */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Admin Notes (Internal)</h3>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add internal notes about this application..."
                  rows={4}
                />
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
      <Card className={`hover:shadow-xl transition-all duration-300 border-2 ${
        isPending ? 'border-orange-200 bg-gradient-to-br from-white to-orange-50' : ''
      }`}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-bold text-gray-900">{user?.full_name || influencer.user_email}</h3>
                <Badge className={`${getStatusColor(influencer.status)} flex items-center gap-1`}>
                  {getStatusIcon(influencer.status)}
                  {influencer.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <p className="text-sm text-gray-600">{influencer.user_email}</p>
            </div>

            <Button
              onClick={() => onViewDetails(influencer)}
              variant="outline"
              size="sm"
            >
              <Eye className="w-4 h-4 mr-2" />
              View Details
            </Button>
          </div>

          {/* Referral Code Section */}
          <div className="bg-blue-50 rounded-lg p-4 mb-8 border border-blue-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Referral Code</p>
                <p className="font-mono text-base font-bold text-blue-700">{influencer.referral_code}</p>
              </div>
              <LinkIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
            </div>
          </div>

           {/* Platforms Section */}
           <div className="mb-8 pb-8 border-b border-gray-200">
             <p className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Platforms</p>
             <div className="flex flex-wrap gap-2">
               {influencer.platforms && influencer.platforms.length > 0 ? (
                 influencer.platforms.map(platform => (
                   <Badge key={platform} variant="outline" className="text-xs">
                     {platform}
                   </Badge>
                 ))
               ) : (
                 <p className="text-xs text-gray-500 italic">No platforms specified</p>
               )}
             </div>
           </div>

          {/* Stats (for active influencers) */}
          {influencer.status === 'active' && (
            <div className="grid grid-cols-4 gap-4 pt-6 border-t border-gray-200">
              <div className="text-center">
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Clicks</p>
                <p className="text-lg font-bold text-gray-900">{influencer.total_clicks || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Sales</p>
                <p className="text-lg font-bold text-gray-900">{influencer.total_conversions || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Revenue</p>
                <p className="text-lg font-bold text-gray-900">${(influencer.total_referred_sales || 0).toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Earned</p>
                <p className="text-lg font-bold text-green-600">${(influencer.total_commission_earned || 0).toLocaleString()}</p>
              </div>
            </div>
          )}

          {/* Application Date */}
          <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500">
            Applied {new Date(influencer.created_date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
            {influencer.approval_date && (
              <> • Approved {new Date(influencer.approval_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}</>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}