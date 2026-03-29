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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Link to={createPageUrl("Marketplace")} className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Marketplace
          </Link>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Store className="w-8 h-8 text-purple-600" />
            Frame Shops Management
          </h1>
          <p className="text-gray-600">Manage frame shop registrations and monitor their services</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm mb-1">Total Shops</p>
                  <p className="text-2xl font-bold text-gray-900">{frameShops.length}</p>
                </div>
                <Store className="w-10 h-10 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm mb-1">Pending Approval</p>
                  <p className="text-2xl font-bold text-yellow-600">{pendingShops.length}</p>
                </div>
                <Pause className="w-10 h-10 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm mb-1">Active</p>
                  <p className="text-2xl font-bold text-green-600">{activeShops.length}</p>
                </div>
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm mb-1">Suspended</p>
                  <p className="text-2xl font-bold text-red-600">{suspendedShops.length}</p>
                </div>
                <XCircle className="w-10 h-10 text-red-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="pending">
              Pending Approval ({pendingShops.length})
            </TabsTrigger>
            <TabsTrigger value="active">
              Active ({activeShops.length})
            </TabsTrigger>
            <TabsTrigger value="all">
              All Shops ({frameShops.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle>Frame Shops Awaiting Approval</CardTitle>
              </CardHeader>
              <CardContent>
                {pendingShops.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600">No pending approvals</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pendingShops.map(shop => (
                      <ShopCard 
                        key={shop.id} 
                        shop={shop} 
                        user={users[shop.user_email]}
                        onViewDetails={() => setSelectedShop(shop)}
                        onApprove={() => handleApprove(shop)}
                        showActions={true}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="active">
            <Card>
              <CardHeader>
                <CardTitle>Active Frame Shops</CardTitle>
              </CardHeader>
              <CardContent>
                {activeShops.length === 0 ? (
                  <div className="text-center py-12">
                    <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600">No active shops yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeShops.map(shop => (
                      <ShopCard 
                        key={shop.id} 
                        shop={shop}
                        user={users[shop.user_email]}
                        onViewDetails={() => setSelectedShop(shop)}
                        showActions={false}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all">
            <Card>
              <CardHeader>
                <CardTitle>All Frame Shops</CardTitle>
              </CardHeader>
              <CardContent>
                {frameShops.length === 0 ? (
                  <div className="text-center py-12">
                    <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600">No frame shops registered yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {frameShops.map(shop => (
                      <ShopCard 
                        key={shop.id} 
                        shop={shop}
                        user={users[shop.user_email]}
                        onViewDetails={() => setSelectedShop(shop)}
                        showActions={false}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Shop Details Dialog */}
      <Dialog open={!!selectedShop} onOpenChange={(open) => !open && setSelectedShop(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Frame Shop Details</DialogTitle>
            <DialogDescription>
              Review and manage this frame shop
            </DialogDescription>
          </DialogHeader>

          {selectedShop && (
            <div className="space-y-6">
              {/* Business Info */}
              <div>
                <h3 className="font-semibold text-lg mb-4">Business Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Business Name</p>
                    <p className="font-medium">{selectedShop.business_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    {getStatusBadge(selectedShop.status)}
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Owner Email</p>
                    <p className="font-medium">{selectedShop.user_email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Phone</p>
                    <p className="font-medium">{selectedShop.contact_phone || 'Not provided'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600">Address</p>
                    <p className="font-medium">{selectedShop.address}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600">Description</p>
                    <p className="text-gray-700">{selectedShop.description || 'No description provided'}</p>
                  </div>
                </div>
              </div>

              {/* Services */}
              {selectedShop.services_offered && selectedShop.services_offered.length > 0 && (
                <div>
                  <h3 className="font-semibold text-lg mb-4">Services Offered</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedShop.services_offered.map((service, index) => (
                      <Badge key={index} variant="outline">{service}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Portfolio */}
              {selectedShop.portfolio_images && selectedShop.portfolio_images.length > 0 && (
                <div>
                  <h3 className="font-semibold text-lg mb-4">Portfolio</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {selectedShop.portfolio_images.map((img, index) => (
                      <img 
                        key={index} 
                        src={img} 
                        alt={`Portfolio ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div>
                <h3 className="font-semibold text-lg mb-4">Performance Stats</h3>
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Package className="w-6 h-6 mx-auto mb-2 text-purple-600" />
                      <p className="text-2xl font-bold">{selectedShop.total_jobs_completed || 0}</p>
                      <p className="text-xs text-gray-600">Jobs Completed</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <Star className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
                      <p className="text-2xl font-bold">{selectedShop.rating?.toFixed(1) || '0.0'}</p>
                      <p className="text-xs text-gray-600">Rating</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-600" />
                      <p className="text-2xl font-bold">{selectedShop.review_count || 0}</p>
                      <p className="text-xs text-gray-600">Reviews</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setSelectedShop(null)}>
              Close
            </Button>
            
            {/* NEW: Preview Dashboard Button */}
            <Link to={createPageUrl(`FrameShopDashboard?preview=true&shopId=${selectedShop?.id}`)}>
              <Button className="bg-orange-600 hover:bg-orange-700">
                <ExternalLink className="w-4 h-4 mr-2" />
                View Shop Dashboard (Preview)
              </Button>
            </Link>
            
            {selectedShop?.status === 'pending_approval' && (
              <>
                <Button 
                  onClick={() => handleApprove(selectedShop)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve
                </Button>
                <Button 
                  onClick={() => handleReject(selectedShop)}
                  variant="destructive"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
              </>
            )}
            {selectedShop?.status === 'active' && (
              <Button 
                onClick={() => handleSuspend(selectedShop)}
                variant="destructive"
              >
                <Pause className="w-4 h-4 mr-2" />
                Suspend
              </Button>
            )}
            {selectedShop?.status === 'suspended' && (
              <Button 
                onClick={() => handleApprove(selectedShop)}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Reactivate
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
    <Card className="hover:shadow-lg transition-all">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Avatar className="w-16 h-16 flex-shrink-0">
            <AvatarImage src={user?.avatar_url} />
            <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-600 text-white text-xl">
              {shop.business_name[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-bold text-lg text-gray-900">{shop.business_name}</h3>
                <p className="text-sm text-gray-600">{shop.user_email}</p>
              </div>
              {getStatusBadge(shop.status)}
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <MapPin className="w-4 h-4" />
                <span>{shop.address}</span>
              </div>
              {shop.contact_phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4" />
                  <span>{shop.contact_phone}</span>
                </div>
              )}
              {shop.website_url && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Globe className="w-4 h-4" />
                  <a href={shop.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {shop.website_url}
                  </a>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
              <div className="flex items-center gap-1">
                <Package className="w-4 h-4" />
                <span>{shop.total_jobs_completed || 0} jobs</span>
              </div>
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-500" />
                <span>{shop.rating?.toFixed(1) || '0.0'} ({shop.review_count || 0})</span>
              </div>
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