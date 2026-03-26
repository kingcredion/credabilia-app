import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Package,
  Plus,
  Eye,
  ShieldCheck,
  Edit,
  Trash2,
  BarChart3,
  DollarSign,
  Star,
  TrendingUp, // Original TrendingUp
  Zap, // New import
  TrendingUp as TrendingUpIcon, // New import with alias
  Gavel
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { // New Dialog imports
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function MyListings() {
  const [user, setUser] = useState(null);
  const [deleteItemId, setDeleteItemId] = useState(null);
  const queryClient = useQueryClient();

  // New state variables for boosting
  const [showBoostDialog, setShowBoostDialog] = useState(false);
  const [boostingItem, setBoostingItem] = useState(null);
  const [boostDuration, setBoostDuration] = useState(7); // Default boost duration

  // Auction state
  const [showAuctionDialog, setShowAuctionDialog] = useState(false);
  const [auctionItem, setAuctionItem] = useState(null);
  const [auctionStartingBid, setAuctionStartingBid] = useState("");
  const [auctionDuration, setAuctionDuration] = useState(7);

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

  const { data: myItems, isLoading } = useQuery({
    queryKey: ['my-listings', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Item.filter({ vendor_email: user.email }, "-created_date");
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId) => {
      await base44.entities.Item.delete(itemId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      setDeleteItemId(null);
    },
  });

  // Fetch boosts for user's items
  const { data: userBoosts } = useQuery({
    queryKey: ['user-boosts', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Boost.filter({ vendor_email: user.email }, "-created_date");
    },
    enabled: !!user?.email,
    initialData: [],
  });

  // Create boost map for quick lookup
  const boostMap = React.useMemo(() => {
    const map = new Map();
    userBoosts.forEach(boost => {
      map.set(boost.item_id, boost);
    });
    return map;
  }, [userBoosts]);

  const createBoostMutation = useMutation({
    mutationFn: async ({ item_id, duration }) => {
      const costs = { 3: 5, 7: 10, 14: 18, 30: 35 }; // Moved here for clarity or use boostCosts
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + duration);

      await base44.entities.Boost.create({
        item_id,
        vendor_email: user.email,
        duration_days: duration,
        simulated_cost: costs[duration],
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        status: 'active'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-boosts'] }); // Invalidate boosts to reflect new boost
      queryClient.invalidateQueries({ queryKey: ['my-listings'] }); // Also invalidate listings if status might change or re-render is needed
      setShowBoostDialog(false);
      setBoostingItem(null);
    },
  });

  const startAuctionMutation = useMutation({
    mutationFn: async ({ item_id, starting_bid, duration }) => {
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + duration);

      const auction = await base44.entities.Auction.create({
        item_id,
        vendor_email: user.email,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        starting_bid: parseFloat(starting_bid),
        current_bid: parseFloat(starting_bid),
        status: 'active',
        bid_count: 0
      });

      await base44.entities.Item.update(item_id, {
        active_auction_id: auction.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      setShowAuctionDialog(false);
      setAuctionItem(null);
      setAuctionStartingBid("");
    }
  });

  const handleDeleteItem = (itemId) => {
    deleteItemMutation.mutate(itemId);
  };

  const handleBoostItem = (item) => {
    setBoostingItem(item);
    setBoostDuration(7); // Reset to default duration
    setShowBoostDialog(true);
  };

  const handleConfirmBoost = () => {
    if (!boostingItem) return;
    createBoostMutation.mutate({
      item_id: boostingItem.id,
      duration: boostDuration
    });
  };

  const handleStartAuctionClick = (item) => {
    setAuctionItem(item);
    setAuctionStartingBid(item.price?.toString() || "");
    setShowAuctionDialog(true);
  };

  const handleConfirmAuction = () => {
    if (!auctionItem || !auctionStartingBid) return;
    startAuctionMutation.mutate({
      item_id: auctionItem.id,
      starting_bid: auctionStartingBid,
      duration: auctionDuration
    });
  };

  const boostCosts = {
    3: 5,
    7: 10,
    14: 18,
    30: 35
  };

  const activeListings = myItems.filter(item => item.status === "active");
  const draftListings = myItems.filter(item => item.status === "draft");
  const soldListings = myItems.filter(item => item.status === "sold");
  const archivedListings = myItems.filter(item => item.status === "archived");

  const totalViews = myItems.reduce((sum, item) => sum + (item.views || 0), 0);
  const totalRevenue = soldListings.reduce((sum, item) => sum + (item.price || 0), 0);
  const avgAuthenticity = myItems.length > 0
    ? myItems.reduce((sum, item) => sum + (item.authenticity_meter || 0), 0) / myItems.length
    : 0;

  const getAuthenticityColor = (score) => {
    if (score >= 80) return "text-green-600 bg-green-50";
    if (score >= 60) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      active: { bg: "bg-green-500", label: "Active" },
      draft: { bg: "bg-gray-500", label: "Draft" },
      sold: { bg: "bg-blue-500", label: "Sold" },
      archived: { bg: "bg-gray-400", label: "Archived" }
    };
    const config = statusConfig[status] || statusConfig.draft;
    return <Badge className={`${config.bg} text-white`}>{config.label}</Badge>;
  };

  const renderItemCard = (item) => {
    const boost = boostMap.get(item.id);
    const isActiveBoost = boost && boost.status === 'active' && new Date(boost.end_date) > new Date();

    return (
      <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-all">
        {/* Boost indicator */}
        {isActiveBoost && (
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              BOOSTED
            </span>
            <span>
              Expires {new Date(boost.end_date).toLocaleDateString()}
            </span>
          </div>
        )}

        <div className="aspect-square bg-muted/30 relative overflow-hidden">
          {item.images?.[0] ? (
            <img
              src={item.images[0]}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-16 h-16 text-gray-300" />
            </div>
          )}

          {/* Status Badge */}
          <div className="absolute top-3 left-3">
            {getStatusBadge(item.status)}
          </div>

          {/* Authenticity Badge */}
          <div className="absolute top-3 right-3">
            <Badge className={`${getAuthenticityColor(item.authenticity_meter)} border-2 border-white shadow-lg flex items-center gap-1`}>
              <ShieldCheck className="w-3 h-3" />
              {item.authenticity_meter}%
            </Badge>
          </div>
        </div>

        <CardContent className="p-4">
          <h3 className="font-semibold text-foreground mb-2 line-clamp-2">
            {item.title}
          </h3>

          {/* Metadata */}
          <div className="flex flex-wrap gap-2 mb-3">
            {item.signer && (
              <Badge variant="outline" className="text-xs">
                {item.signer}
              </Badge>
            )}
            {item.team && (
              <Badge variant="outline" className="text-xs">
                {item.team}
              </Badge>
            )}
            {item.year && (
              <Badge variant="outline" className="text-xs">
                {item.year}
              </Badge>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/40">
            <div>
              {item.price ? (
                <p className="text-xl font-bold text-foreground">
                    ${item.price.toLocaleString()}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No price set</p>
              )}
            </div>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Eye className="w-4 h-4" />
                {item.views || 0}
              </span>
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" />
                {item.total_votes || 0}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2"> {/* Changed to flex from grid, and adjusted layout */}
            {/* Edit Button */}
            <Link to={createPageUrl(`EditListing?id=${item.id}`)} className="flex-1">
              <Button variant="outline" className="w-full" size="sm">
                <Edit className="w-4 h-4 mr-1" />
                Edit
              </Button>
            </Link>

            {/* Conditional Boost / View / Auction Button */}
            {item.status === 'active' && !isActiveBoost && !item.active_auction_id ? (
              <div className="flex flex-col gap-2 flex-1">
                <Button
                  onClick={() => handleBoostItem(item)}
                  size="sm"
                  className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white"
                >
                  <Zap className="w-4 h-4 mr-1" />
                  Boost
                </Button>
                <Button
                  onClick={() => handleStartAuctionClick(item)}
                  size="sm"
                  variant="outline"
                  className="w-full border-purple-200 text-purple-700 hover:bg-purple-50"
                >
                  <Gavel className="w-4 h-4 mr-1" />
                  Auction
                </Button>
              </div>
            ) : item.active_auction_id ? (
              <Link to={createPageUrl(`ItemDetails?id=${item.id}`)} className="flex-1">
                <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white" size="sm">
                  <Gavel className="w-4 h-4 mr-1" />
                  View Auction
                </Button>
              </Link>
            ) : (
              <Link to={createPageUrl(`ItemDetails?id=${item.id}`)} className="flex-1">
                <Button variant="outline" className="w-full" size="sm">
                  <Eye className="w-4 h-4 mr-1" />
                  View
                </Button>
              </Link>
            )}

            {/* Delete Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteItemId(item.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>

          {/* Boost stats */}
          {isActiveBoost && (
            <div className="mt-4 pt-4 border-t border-border/40">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-gray-600">Impressions</p>
                  <p className="text-lg font-bold text-orange-600">
                    {boost.impressions || 0}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600">Clicks</p>
                  <p className="text-lg font-bold text-orange-600">
                    {boost.clicks || 0}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background dark:bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your listings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark:bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">My Listings</h1>
          <p className="text-muted-foreground mb-4">
            Manage your memorabilia listings
          </p>
          <Link to={createPageUrl("CreateListing")} className="w-full md:w-auto block">
            <Button className="w-full md:w-auto bg-orange-600 hover:bg-orange-700">
              <Plus className="w-5 h-5 mr-2" />
              Create Listing
            </Button>
          </Link>
        </div>

        {/* Stats Cards */}
         <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
           <Card className="glass-card border-border/50">
             <CardContent className="p-6">
               <div className="flex items-center justify-between mb-2">
                 <p className="text-sm text-muted-foreground">Active Listings</p>
                 <Package className="w-5 h-5 text-green-600" />
               </div>
               <p className="text-3xl font-bold text-foreground">{activeListings.length}</p>
             </CardContent>
           </Card>

           <Card className="glass-card border-border/50">
             <CardContent className="p-6">
               <div className="flex items-center justify-between mb-2">
                 <p className="text-sm text-muted-foreground">Total Views</p>
                 <Eye className="w-5 h-5 text-blue-600" />
               </div>
               <p className="text-3xl font-bold text-foreground">{totalViews.toLocaleString()}</p>
             </CardContent>
           </Card>

           <Card className="glass-card border-border/50">
             <CardContent className="p-6">
               <div className="flex items-center justify-between mb-2">
                 <p className="text-sm text-muted-foreground">Total Sold</p>
                 <DollarSign className="w-5 h-5 text-orange-600" />
               </div>
               <p className="text-3xl font-bold text-foreground">{soldListings.length}</p>
             </CardContent>
           </Card>

           <Card className="glass-card border-border/50">
             <CardContent className="p-6">
               <div className="flex items-center justify-between mb-2">
                 <p className="text-sm text-muted-foreground">Avg. Authenticity</p>
                 <ShieldCheck className="w-5 h-5 text-purple-600" />
               </div>
               <p className="text-3xl font-bold text-foreground">{avgAuthenticity.toFixed(0)}%</p>
             </CardContent>
           </Card>
         </div>

        {/* Listings Tabs */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="glass-card grid w-full grid-cols-4 mb-8 border-border/50">
            <TabsTrigger value="active">
              Active ({activeListings.length})
            </TabsTrigger>
            <TabsTrigger value="draft">
              Drafts ({draftListings.length})
            </TabsTrigger>
            <TabsTrigger value="sold">
              Sold ({soldListings.length})
            </TabsTrigger>
            <TabsTrigger value="archived">
              Archived ({archivedListings.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {activeListings.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No active listings
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Create your first listing to start selling
                  </p>
                  <Link to={createPageUrl("CreateListing")}>
                    <Button className="bg-orange-600 hover:bg-orange-700">
                      <Plus className="w-5 h-5 mr-2" />
                      Create Listing
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {activeListings.map(renderItemCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="draft">
            {draftListings.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No draft listings
                  </h3>
                  <p className="text-gray-600">
                    All your listings are published
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {draftListings.map(renderItemCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sold">
            {soldListings.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No sold items yet
                  </h3>
                  <p className="text-gray-600">
                    Your sold items will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {soldListings.map(renderItemCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="archived">
            {archivedListings.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No archived listings
                  </h3>
                  <p className="text-gray-600">
                    Archived items will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {archivedListings.map(renderItemCard)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteItemId} onOpenChange={() => setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Listing</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this listing? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteItem(deleteItemId)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteItemMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Boost Dialog */}
      <Dialog open={showBoostDialog} onOpenChange={setShowBoostDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-500" />
              Boost Your Listing
            </DialogTitle>
            <DialogDescription>
              Get your item seen by more collectors who share your interests
            </DialogDescription>
          </DialogHeader>

          {boostingItem && (
            <div className="space-y-6">
              {/* Item Preview */}
                    <div className="flex gap-4 p-4 glass-panel rounded-lg border-border/50">
                <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                  {boostingItem.images?.[0] && (
                    <img src={boostingItem.images[0]} alt={boostingItem.title} className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{boostingItem.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Price: ${boostingItem.price?.toLocaleString() || 'Not set'}
                  </p>
                </div>
              </div>

              {/* Duration Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Choose Boost Duration
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(boostCosts).map(([days, cost]) => (
                    <button
                      key={days}
                      onClick={() => setBoostDuration(parseInt(days))}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        boostDuration === parseInt(days)
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="text-2xl font-bold text-gray-900">{days}</p>
                      <p className="text-xs text-gray-600 mb-2">days</p>
                      <Badge className="bg-orange-500 text-white text-xs">
                        ${cost}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>

              {/* How It Works */}
              <div className="glass-panel border-blue-200/30 dark:border-blue-500/20 rounded-lg p-4 bg-blue-50/30 dark:bg-blue-950/20">
                <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <TrendingUpIcon className="w-4 h-4" />
                  How Boosting Works
                </h4>
                <ul className="space-y-2 text-sm text-blue-900">
                  <li className="flex items-start gap-2">
                    <span className="text-orange-500 font-bold">•</span>
                    <span>Your item appears at the top of "For You" feeds for collectors interested in {boostingItem.sport || boostingItem.signer || 'similar items'}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-500 font-bold">•</span>
                    <span>Smart targeting based on item tags ({boostingItem.tags?.slice(0, 3).join(', ') || 'your tags'})</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-500 font-bold">•</span>
                    <span>3x relevance multiplier for matching collectors</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-500 font-bold">•</span>
                    <span>Track impressions and clicks in real-time</span>
                  </li>
                </ul>
              </div>

              {/* Simulated Payment Notice */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                <p className="text-sm text-yellow-900">
                  💡 <strong>Demo Mode:</strong> This is a simulated boost for demonstration. Real payment integration coming soon!
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBoostDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmBoost}
              disabled={createBoostMutation.isPending}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
            >
              {createBoostMutation.isPending ? "Processing..." : `Boost for $${boostCosts[boostDuration]}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auction Dialog */}
      <Dialog open={showAuctionDialog} onOpenChange={setShowAuctionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="w-5 h-5 text-purple-600" />
              Start Auction
            </DialogTitle>
            <DialogDescription>
              Convert "{auctionItem?.title}" into an auction listing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Starting Bid ($)
              </label>
              <input
                type="number"
                value={auctionStartingBid}
                onChange={(e) => setAuctionStartingBid(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duration (Days)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[3, 7, 14].map(days => (
                  <button
                    key={days}
                    onClick={() => setAuctionDuration(days)}
                    className={`p-2 rounded-md border text-sm ${
                      auctionDuration === days
                        ? 'border-purple-600 bg-purple-50 text-purple-700'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {days} Days
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAuctionDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAuction}
              disabled={!auctionStartingBid || startAuctionMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {startAuctionMutation.isPending ? "Starting..." : "Start Auction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}