import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ShieldCheck,
  Store,
  MapPin,
  Phone,
  Globe,
  Star,
  Package,
  CheckCircle,
  XCircle,
  Pause,
  ExternalLink,
  ArrowLeft
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function AdminFrameShops() {
  const [user, setUser] = useState(null);
  const [selectedShop, setSelectedShop] = useState(null);
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

  const { data: frameShops, isLoading } = useQuery({
    queryKey: ['admin-frame-shops'],
    queryFn: async () => {
      return await base44.entities.FrameShop.list("-created_date");
    },
    initialData: [],
  });

  const { data: users } = useQuery({
    queryKey: ['frame-shop-users'],
    queryFn: async () => {
      const allUsers = await base44.entities.User.list();
      return allUsers.reduce((acc, user) => {
        acc[user.email] = user;
        return acc;
      }, {});
    },
    initialData: {},
  });

  const updateShopStatusMutation = useMutation({
    mutationFn: async ({ shop, status }) => {
      await base44.entities.FrameShop.update(shop.id, { status });

      // On approval, sync the linked user record
      if (status === 'active') {
        let linkedUser = null;
        try {
          const usersById = await base44.entities.User.filter({ email: shop.user_email });
          linkedUser = usersById[0] || null;
        } catch (_) {}
        if (linkedUser) {
          await base44.entities.User.update(linkedUser.id, {
            user_type: 'picture_frame_shop',
            frame_shop_id: shop.id,
          });
        } else {
          console.warn("[AdminFrameShops] Could not find linked user:", shop.user_email);
        }
        // Notify user
        await base44.entities.Notification.create({
          user_email: shop.user_email,
          type: "audit_completed",
          title: "Frame Shop Approved! 🖼️",
          message: "Your frame shop has been approved. You can now receive framing requests from collectors.",
          link_url: "FrameShopDashboard"
        });
      }
    },
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-frame-shops'] });
      setSelectedShop(null);
      toast.success(status === 'active' ? "Frame shop approved!" : status === 'suspended' ? "Frame shop suspended." : "Frame shop updated.");
    },
    onError: (error) => {
      toast.error("Action failed: " + (error?.message || "Unknown error"));
    }
  });

  const handleApprove = (shop) => {
    updateShopStatusMutation.mutate({ shop, status: 'active' });
  };

  const handleSuspend = (shop) => {
    updateShopStatusMutation.mutate({ shop, status: 'suspended' });
  };

  const handleReject = (shop) => {
    updateShopStatusMutation.mutate({ shop, status: 'inactive' });
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending_approval: <Badge className="bg-yellow-500 text-white"><Pause className="w-3 h-3 mr-1" />Pending</Badge>,
      active: <Badge className="bg-green-500 text-white"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>,
      suspended: <Badge className="bg-red-500 text-white"><XCircle className="w-3 h-3 mr-1" />Suspended</Badge>,
      inactive: <Badge className="bg-gray-500 text-white"><XCircle className="w-3 h-3 mr-1" />Inactive</Badge>,
    };
    return badges[status] || badges.inactive;
  };

  const pendingShops = frameShops.filter(s => s.status === 'pending_approval');
  const activeShops = frameShops.filter(s => s.status === 'active');
  const suspendedShops = frameShops.filter(s => s.status === 'suspended');

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <ShieldCheck className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-6">
              You need admin privileges to access this page.
            </p>
            <Link to={createPageUrl("Marketplace")}>
              <Button>Back to Marketplace</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
          <Link to={createPageUrl("Marketplace")} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 mb-3 text-sm">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Link>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Store className="w-5 h-5 text-purple-600" />
            Frame Shops
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage registrations and monitor services</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Total</p>
                  <p className="text-xl font-bold text-gray-900">{frameShops.length}</p>
                </div>
                <Store className="w-6 h-6 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Pending</p>
                  <p className="text-xl font-bold text-yellow-600">{pendingShops.length}</p>
                </div>
                <Pause className="w-6 h-6 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Active</p>
                  <p className="text-xl font-bold text-green-600">{activeShops.length}</p>
                </div>
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Suspended</p>
                  <p className="text-xl font-bold text-red-600">{suspendedShops.length}</p>
                </div>
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="pending" className="w-full">
          <div className="overflow-x-auto -mx-4 px-4">
          <TabsList className="flex w-max min-w-full gap-1 h-9 mb-4">
            <TabsTrigger value="pending" className="text-xs px-3 h-7 whitespace-nowrap">
              Pending ({pendingShops.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="text-xs px-3 h-7 whitespace-nowrap">
              Active ({activeShops.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="text-xs px-3 h-7 whitespace-nowrap">
              All ({frameShops.length})
            </TabsTrigger>
          </TabsList>
          </div>

          <TabsContent value="pending">
            {pendingShops.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">
                <CheckCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                No pending approvals
              </div>
            ) : (
              <div className="space-y-3">
                {pendingShops.map(shop => (
                  <ShopCard key={shop.id} shop={shop} user={users[shop.user_email]} onViewDetails={() => setSelectedShop(shop)} onApprove={() => handleApprove(shop)} showActions={true} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="active">
            {activeShops.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">No active shops yet</div>
            ) : (
              <div className="space-y-3">
                {activeShops.map(shop => (
                  <ShopCard key={shop.id} shop={shop} user={users[shop.user_email]} onViewDetails={() => setSelectedShop(shop)} showActions={false} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all">
            {frameShops.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">No frame shops registered yet</div>
            ) : (
              <div className="space-y-3">
                {frameShops.map(shop => (
                  <ShopCard key={shop.id} shop={shop} user={users[shop.user_email]} onViewDetails={() => setSelectedShop(shop)} showActions={false} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Shop Details Dialog */}
      <Dialog open={!!selectedShop} onOpenChange={(open) => !open && setSelectedShop(null)}>
        <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Frame Shop Details</DialogTitle>
            <DialogDescription>
              Review and manage this frame shop
            </DialogDescription>
          </DialogHeader>

          {selectedShop && (
            <div className="space-y-3 text-sm">
              {/* Key info */}
              <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between gap-2"><span className="text-gray-500">Name</span><span className="font-medium text-right">{selectedShop.business_name}</span></div>
                <div className="flex justify-between gap-2"><span className="text-gray-500">Status</span><span>{getStatusBadge(selectedShop.status)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-gray-500">Owner</span><span className="text-right truncate max-w-[60%]">{selectedShop.user_email}</span></div>
                {selectedShop.contact_phone && <div className="flex justify-between gap-2"><span className="text-gray-500">Phone</span><span>{selectedShop.contact_phone}</span></div>}
                <div className="flex justify-between gap-2"><span className="text-gray-500">Address</span><span className="text-right">{selectedShop.address}</span></div>
              </div>

              {selectedShop.description && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-2.5">{selectedShop.description}</p>
              )}

              {/* Services */}
              {selectedShop.services_offered?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Services</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedShop.services_offered.map((s, i) => <Badge key={i} variant="outline" className="text-xs">{s}</Badge>)}
                  </div>
                </div>
              )}

              {/* Portfolio */}
              {selectedShop.portfolio_images?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Portfolio</p>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedShop.portfolio_images.map((img, i) => (
                      <img key={i} src={img} alt={`Portfolio ${i + 1}`} className="w-full h-20 object-cover rounded-lg" />
                    ))}
                  </div>
                </div>
              )}

              {/* Stats inline */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: <Package className="w-3.5 h-3.5 text-purple-500" />, val: selectedShop.total_jobs_completed || 0, label: 'Jobs' },
                  { icon: <Star className="w-3.5 h-3.5 text-yellow-500" />, val: selectedShop.rating?.toFixed(1) || '0.0', label: 'Rating' },
                  { icon: <CheckCircle className="w-3.5 h-3.5 text-green-500" />, val: selectedShop.review_count || 0, label: 'Reviews' },
                ].map(({ icon, val, label }) => (
                  <div key={label} className="bg-muted/40 rounded-lg p-2 text-center">
                    <div className="flex justify-center mb-0.5">{icon}</div>
                    <p className="text-base font-bold text-gray-900">{val}</p>
                    <p className="text-[11px] text-gray-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedShop(null)}>Close</Button>
            <Link to={createPageUrl(`FrameShopDashboard?preview=true&shopId=${selectedShop?.id}`)}>
              <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Preview
              </Button>
            </Link>
            {selectedShop?.status === 'pending_approval' && (
              <>
                <Button size="sm" onClick={() => handleApprove(selectedShop)} className="bg-green-600 hover:bg-green-700">
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" />Approve
                </Button>
                <Button size="sm" onClick={() => handleReject(selectedShop)} variant="destructive">
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />Reject
                </Button>
              </>
            )}
            {selectedShop?.status === 'active' && (
              <Button size="sm" onClick={() => handleSuspend(selectedShop)} variant="destructive">
                <Pause className="w-3.5 h-3.5 mr-1.5" />Suspend
              </Button>
            )}
            {selectedShop?.status === 'suspended' && (
              <Button size="sm" onClick={() => handleApprove(selectedShop)} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />Reactivate
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShopCard({ shop, user, onViewDetails, onApprove, showActions }) {
  const getStatusBadge = (status) => {
    const badges = {
      pending_approval: <Badge className="bg-yellow-500 text-white"><Pause className="w-3 h-3 mr-1" />Pending</Badge>,
      active: <Badge className="bg-green-500 text-white"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>,
      suspended: <Badge className="bg-red-500 text-white"><XCircle className="w-3 h-3 mr-1" />Suspended</Badge>,
      inactive: <Badge className="bg-gray-500 text-white"><XCircle className="w-3 h-3 mr-1" />Inactive</Badge>,
    };
    return badges[status] || badges.inactive;
  };

  return (
    <Card className="tap-scale hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="w-10 h-10 flex-shrink-0">
            <AvatarImage src={user?.avatar_url} />
            <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-600 text-white text-xl">
              {shop.business_name[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 mr-2">
                <h3 className="font-semibold text-sm text-gray-900 truncate">{shop.business_name}</h3>
                <p className="text-xs text-gray-500 truncate">{shop.user_email}</p>
              </div>
              {getStatusBadge(shop.status)}
            </div>

            <div className="space-y-1 mb-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{shop.address}</span>
              </div>
              {shop.contact_phone && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Phone className="w-3 h-3" />
                  <span>{shop.contact_phone}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
              <span className="flex items-center gap-1"><Package className="w-3 h-3" />{shop.total_jobs_completed || 0} jobs</span>
              <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-500" />{shop.rating?.toFixed(1) || '0.0'} ({shop.review_count || 0})</span>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button onClick={onViewDetails} variant="outline" size="sm">
                View Details
              </Button>
              
              {/* NEW: Quick Preview Button on Card */}
              {shop.status === 'active' && (
                <Link to={createPageUrl(`FrameShopDashboard?preview=true&shopId=${shop.id}`)}>
                  <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Preview Dashboard
                  </Button>
                </Link>
              )}
              
              {showActions && shop.status === 'pending_approval' && (
                <Button onClick={onApprove} size="sm" className="bg-green-600 hover:bg-green-700">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Approve
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}