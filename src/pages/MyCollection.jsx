import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Package,
  Trophy,
  ShieldCheck,
  Calendar,
  DollarSign,
  TrendingUp,
  Store,
  Eye,
  RefreshCw,
  Tag,
  Gift,
  GraduationCap,
  Hammer
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

export default function MyCollection() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [relistItem, setRelistItem] = useState(null);
  const [relistPrice, setRelistPrice] = useState("");
  const [relistMargin, setRelistMargin] = useState("");
  
  // Auction states
  const [saleType, setSaleType] = useState("fixed"); // 'fixed' or 'auction'
  const [auctionDuration, setAuctionDuration] = useState("7");
  const [startingBid, setStartingBid] = useState("");
  
  const navigate = useNavigate();
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

  // NEW: Fetch claimed educational items
  const { data: educationalItems } = useQuery({
    queryKey: ['claimed-educational-items', user?.email],
    queryFn: async () => {
      if (!user?.email || !user?.claimed_educational_items || user.claimed_educational_items.length === 0) {
        return [];
      }
      const items = await Promise.all(
        user.claimed_educational_items.map(itemId =>
          base44.entities.Item.filter({ id: itemId }).then(results => results[0])
        )
      );
      return items.filter(Boolean); // Filter out any null/undefined results
    },
    enabled: !!user?.email && !!user?.claimed_educational_items?.length,
    initialData: [],
  });

  const { data: collectionItems, isLoading } = useQuery({
    queryKey: ['user-collection', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Item.filter({ 
        buyer_email: user.email,
        status: "sold"
      }, "-updated_date");
    },
    enabled: !!user?.email,
    initialData: [],
  });

  // Fetch active resale listings for this user to check which items are relisted
  const { data: activeListings } = useQuery({
    queryKey: ['active-resale-listings', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Item.filter({ 
        vendor_email: user.email,
        status: "active"
      });
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const createRelistingMutation = useMutation({
    mutationFn: async ({ itemData, newPrice }) => {
      // Create new listing with pre-filled data
      const newListing = await base44.entities.Item.create({
        ...itemData,
        vendor_id: user.id,
        vendor_email: user.email,
        price: newPrice,
        original_purchase_price: itemData.price,
        original_item_id: relistItem.id,
        status: "active",
        buyer_email: null, // Clear buyer info since it's a new listing
        views: 0,
        total_votes: 0,
        authentic_votes: 0
      });

      // Update original item to mark as relisted
      await base44.entities.Item.update(relistItem.id, {
        is_relisted: true,
        active_listing_id: newListing.id
      });

      return newListing;
    },
    onSuccess: (newListing) => {
      queryClient.invalidateQueries({ queryKey: ['user-collection'] });
      queryClient.invalidateQueries({ queryKey: ['active-resale-listings'] });
      setRelistItem(null);
      setRelistPrice("");
      setRelistMargin("");
      // Navigate to the new listing
      navigate(createPageUrl(`ItemDetails?id=${newListing.id}`));
    },
  });

  const createAuctionMutation = useMutation({
    mutationFn: async ({ itemData, startBid, durationDays }) => {
      // 1. Create the new item (copy)
      const newListing = await base44.entities.Item.create({
        ...itemData,
        vendor_id: user.id,
        vendor_email: user.email,
        price: null, // Auctions might not have a fixed price initially, or use starting bid
        original_purchase_price: itemData.price,
        original_item_id: relistItem.id,
        status: "active",
        buyer_email: null,
        views: 0,
        total_votes: 0,
        authentic_votes: 0
      });

      // 2. Create the Auction
      const startTime = new Date();
      const endTime = new Date();
      endTime.setDate(endTime.getDate() + parseInt(durationDays));

      const newAuction = await base44.entities.Auction.create({
        item_id: newListing.id,
        vendor_email: user.email,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        starting_bid: parseFloat(startBid),
        current_bid: parseFloat(startBid),
        status: "active",
        bid_count: 0
      });

      // 3. Link Auction to the new Item
      await base44.entities.Item.update(newListing.id, {
        active_auction_id: newAuction.id,
        price: parseFloat(startBid) // Set display price to starting bid
      });

      // 4. Update original item
      await base44.entities.Item.update(relistItem.id, {
        is_relisted: true,
        active_listing_id: newListing.id
      });

      return newListing;
    },
    onSuccess: (newListing) => {
      queryClient.invalidateQueries({ queryKey: ['user-collection'] });
      queryClient.invalidateQueries({ queryKey: ['active-resale-listings'] });
      setRelistItem(null);
      setStartingBid("");
      setAuctionDuration("7");
      navigate(createPageUrl(`ItemDetails?id=${newListing.id}`));
      alert("🎉 Auction started successfully!");
    },
  });

  const handleRelistClick = (item) => {
    setRelistItem(item);
    // Pre-fill with original price
    setRelistPrice(item.price?.toString() || "");
    setRelistMargin("0");
    
    // Reset auction defaults
    setSaleType("fixed");
    setStartingBid(item.price?.toString() || "");
    setAuctionDuration("7");
  };

  const handleMarginChange = (margin) => {
    setRelistMargin(margin);
    if (relistItem?.price && margin) {
      const marginPercent = parseFloat(margin) / 100;
      const newPrice = relistItem.price * (1 + marginPercent);
      setRelistPrice(newPrice.toFixed(2));
    }
  };

  const handlePriceChange = (price) => {
    setRelistPrice(price);
    if (relistItem?.price && price) {
      const newPrice = parseFloat(price);
      const margin = ((newPrice - relistItem.price) / relistItem.price) * 100;
      setRelistMargin(margin.toFixed(1));
    }
  };

  const handleConfirmRelist = () => {
    const { id, created_date, updated_date, buyer_email, is_relisted, active_listing_id, original_purchase_price, views, total_votes, authentic_votes, ...itemDataToCopy } = relistItem;

    if (saleType === "fixed") {
      if (!relistPrice || parseFloat(relistPrice) <= 0) {
        alert("Please enter a valid price");
        return;
      }
      createRelistingMutation.mutate({
        itemData: itemDataToCopy,
        newPrice: parseFloat(relistPrice)
      });
    } else {
      if (!startingBid || parseFloat(startingBid) <= 0) {
        alert("Please enter a valid starting bid");
        return;
      }
      createAuctionMutation.mutate({
        itemData: itemDataToCopy,
        startBid: parseFloat(startingBid),
        durationDays: parseInt(auctionDuration)
      });
    }
  };

  // NEW: Combine regular collection + educational items
  const allCollectionItems = [...collectionItems, ...educationalItems];

  const filteredItems = allCollectionItems.filter(item => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.title?.toLowerCase().includes(query) ||
      item.signer?.toLowerCase().includes(query) ||
      item.team?.toLowerCase().includes(query) ||
      item.sport?.toLowerCase().includes(query)
    );
  });

  // Check if item is relisted
  const isItemRelisted = (itemId) => {
    return activeListings.some(listing => listing.original_item_id === itemId);
  };

  const getRelistedListingId = (itemId) => {
    const listing = activeListings.find(l => l.original_item_id === itemId);
    return listing?.id;
  };

  const totalValue = collectionItems.reduce((sum, item) => sum + (item.price || 0), 0); // Educational items have no price, so exclude them here
  const avgAuthenticity = allCollectionItems.length > 0 
    ? allCollectionItems.reduce((sum, item) => sum + (item.authenticity_meter || 0), 0) / allCollectionItems.length 
    : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center">
        <div className="glass-card rounded-xl p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your collection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">My Collection</h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            Your authenticated memorabilia collection
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
          <Card className="glass-card border-border/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground">Total Items</p>
                <Package className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">{allCollectionItems.length}</p>
              {educationalItems.length > 0 && (
                <p className="text-xs text-green-600 mt-1">
                  +{educationalItems.length} educational
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card border-border/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground">Total Value</p>
                <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">${totalValue.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card className="glass-card border-border/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground">Avg. Auth.</p>
                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">{avgAuthenticity.toFixed(0)}%</p>
            </CardContent>
          </Card>

          <Card className="glass-card border-border/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs sm:text-sm text-muted-foreground">For Sale</p>
                <Store className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold text-foreground">
                {activeListings.filter(l => l.original_item_id).length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <Input
            type="text"
            placeholder="Search your collection..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Collection Grid */}
        {filteredItems.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchQuery ? "No items found" : "Your collection is empty"}
              </h3>
              <p className="text-gray-600 mb-6">
                {searchQuery 
                  ? "Try a different search term"
                  : "Start building your collection by purchasing authenticated memorabilia"
                }
              </p>
              {!searchQuery && (
                <Link to={createPageUrl("Marketplace")}>
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    Browse Marketplace
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredItems.map((item) => {
              const isRelisted = isItemRelisted(item.id);
              const relistingId = getRelistedListingId(item.id);
              const isEducational = item.is_educational_display_item; // Assume this property exists on educational items

              return (
                <Card 
                  key={item.id} 
                  className={`overflow-hidden hover:shadow-xl transition-all duration-300 border-2 ${
                    isEducational ? 'border-green-400 bg-gradient-to-br from-green-50 to-blue-50' :
                    isRelisted ? 'border-orange-400' : 'border-transparent'
                  } hover:border-blue-200`}
                >
                  <div className="aspect-square bg-muted/30 relative overflow-hidden">
                    {item.images?.[0] ? (
                      <img 
                        src={item.images[0]} 
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Trophy className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300" />
                      </div>
                    )}
                    
                    {/* Authenticity Badge */}
                    <div className="absolute top-2 right-2">
                      <Badge className="bg-green-600 text-white shadow-lg flex items-center gap-1 text-xs">
                        <ShieldCheck className="w-3 h-3" />
                        {item.authenticity_meter}%
                      </Badge>
                    </div>

                    {/* NEW: Educational badge or Purchase Date */}
                    {isEducational ? (
                      <div className="absolute top-2 left-2">
                        <Badge className="bg-gradient-to-r from-green-500 to-blue-500 text-white shadow-lg flex items-center gap-1 text-xs">
                          <GraduationCap className="w-3 h-3" />
                          Educational
                        </Badge>
                      </div>
                    ) : (
                      <div className="absolute top-2 left-2">
                        <Badge className="bg-blue-600 text-white shadow-lg flex items-center gap-1 text-xs">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.updated_date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            year: 'numeric' 
                          })}
                        </Badge>
                      </div>
                    )}

                    {/* Relisted Badge */}
                    {isRelisted && !isEducational && ( // Only show if not educational
                      <div className="absolute bottom-2 left-2 right-2">
                        <Badge className="bg-orange-600 text-white shadow-lg w-full justify-center flex items-center gap-1 text-xs py-1.5">
                          <Store className="w-3 h-3" />
                          Currently Listed for Sale
                        </Badge>
                      </div>
                    )}
                  </div>

                  <CardContent className="p-3 sm:p-4">
                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 text-xs sm:text-sm group-hover:text-blue-600 transition-colors">
                      {item.title}
                    </h3>
                    
                    {/* Metadata */}
                    <div className="flex flex-wrap gap-1 sm:gap-2 mb-2">
                      {item.signer && (
                        <Badge variant="outline" className="text-[10px] sm:text-xs">
                          {item.signer}
                        </Badge>
                      )}
                      {item.team && (
                        <Badge variant="outline" className="text-[10px] sm:text-xs">
                          {item.team}
                        </Badge>
                      )}
                    </div>

                    {/* NEW: Show FREE for educational, otherwise price */}
                    <div className="pt-2 border-t border-border/50 mb-3">
                      {isEducational ? (
                        <>
                          <p className="text-xs text-gray-500 mb-1">Value</p>
                          <p className="text-base sm:text-xl font-bold text-green-600 flex items-center gap-1">
                            <Gift className="w-4 h-4" />
                            FREE
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-gray-500 mb-1">Purchased for</p>
                          <p className="text-base sm:text-xl font-bold text-gray-900">
                            ${item.price?.toLocaleString() || 0}
                          </p>
                        </>
                      )}
                    </div>

                    {/* NEW: Different actions for educational vs regular items */}
                    <div className="grid grid-cols-2 gap-2">
                      <Link to={createPageUrl(`ItemDetails?id=${item.id}`)}>
                        <Button variant="outline" size="sm" className="w-full text-xs">
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                      </Link>
                      
                      {isEducational ? (
                        <Button size="sm" variant="outline" className="w-full text-xs" disabled>
                          <GraduationCap className="w-3 h-3 mr-1" />
                          Sample
                        </Button>
                      ) : isRelisted ? (
                        <Link to={createPageUrl(`ItemDetails?id=${relistingId}`)}>
                          <Button size="sm" className="w-full bg-orange-600 hover:bg-orange-700 text-xs">
                            <Tag className="w-3 h-3 mr-1" />
                            See Listing
                          </Button>
                        </Link>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleRelistClick(item)}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-xs"
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Relist
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Relist Dialog - Updated with Vendor Colors */}
      <Dialog open={!!relistItem} onOpenChange={() => setRelistItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-orange-600">List Item for Sale</DialogTitle>
            <DialogDescription>
              Choose how you want to sell your item.
            </DialogDescription>
          </DialogHeader>

          {relistItem && (
            <div className="space-y-4">
              {/* Item Preview */}
              <div className="flex gap-4 p-4 glass-panel rounded-lg border-orange-200/40 dark:border-orange-500/20">
                {relistItem.images?.[0] && (
                  <img 
                    src={relistItem.images[0]} 
                    alt={relistItem.title}
                    className="w-20 h-20 object-cover rounded-lg"
                  />
                )}
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 mb-1">{relistItem.title}</h4>
                  <p className="text-sm text-gray-600">
                    Original purchase: ${relistItem.price?.toLocaleString() || 0}
                  </p>
                </div>
              </div>

              {/* Sale Type Selector */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSaleType("fixed")}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                    saleType === "fixed"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-blue-200 text-gray-600"
                  }`}
                >
                  <Tag className="w-5 h-5" />
                  <span className="text-sm font-semibold">Fixed Price</span>
                </button>
                <button
                  onClick={() => setSaleType("auction")}
                  className={`p-3 rounded-lg border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                    saleType === "auction"
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-gray-200 hover:border-purple-200 text-gray-600"
                  }`}
                >
                  <Hammer className="w-5 h-5" />
                  <span className="text-sm font-semibold">Auction</span>
                </button>
              </div>

              {saleType === "fixed" ? (
                <>
                  {/* Pricing for Fixed Sale */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Margin (%)
                      </label>
                      <Input
                        type="number"
                        value={relistMargin}
                        onChange={(e) => handleMarginChange(e.target.value)}
                        placeholder="0"
                        step="1"
                        className="border-orange-200 focus:border-orange-400 focus:ring-orange-400"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Markup percentage
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Selling Price (USD) *
                      </label>
                      <Input
                        type="number"
                        value={relistPrice}
                        onChange={(e) => handlePriceChange(e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="border-orange-200 focus:border-orange-400 focus:ring-orange-400"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Your asking price
                      </p>
                    </div>
                  </div>

                  {/* Profit Calculation */}
                  {relistPrice && relistItem.price && (
                    <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Original Cost:</span>
                        <span className="text-sm text-gray-900">${relistItem.price.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Selling Price:</span>
                        <span className="text-sm text-gray-900">${parseFloat(relistPrice).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-orange-300">
                        <span className="text-sm font-semibold text-gray-900">Potential Profit:</span>
                        <span className={`text-sm font-bold ${
                          parseFloat(relistPrice) >= relistItem.price ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {parseFloat(relistPrice) >= relistItem.price ? '+' : ''}
                          ${(parseFloat(relistPrice) - relistItem.price).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Auction Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Starting Bid (USD) *
                      </label>
                      <Input
                        type="number"
                        value={startingBid}
                        onChange={(e) => setStartingBid(e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className="border-purple-200 focus:border-purple-400 focus:ring-purple-400"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Duration *
                      </label>
                      <Select value={auctionDuration} onValueChange={setAuctionDuration}>
                        <SelectTrigger className="w-full border-purple-200 focus:ring-purple-400">
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 Day</SelectItem>
                          <SelectItem value="3">3 Days</SelectItem>
                          <SelectItem value="7">7 Days</SelectItem>
                          <SelectItem value="14">14 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <p className="text-xs text-purple-800">
                      <strong>Auction Note:</strong> Bidding will start at your specified amount. The highest bidder at the end of the duration wins the item.
                    </p>
                  </div>
                </>
              )}

              {/* Info */}
              <div className="glass-panel rounded-lg border-yellow-200/30 dark:border-yellow-500/20 p-3 bg-yellow-50/20 dark:bg-yellow-950/10">
                <p className="text-xs text-yellow-800 dark:text-yellow-400">
                  <strong>Note:</strong> A new {saleType === 'fixed' ? 'listing' : 'auction'} will be created. 
                  Your original item will remain in your collection marked as listed.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setRelistItem(null)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmRelist}
              disabled={
                saleType === "fixed"
                  ? createRelistingMutation.isPending || !relistPrice || parseFloat(relistPrice) <= 0
                  : createAuctionMutation.isPending || !startingBid || parseFloat(startingBid) <= 0
              }
              className={`${
                saleType === "fixed" ? "bg-orange-600 hover:bg-orange-700" : "bg-purple-600 hover:bg-purple-700"
              } w-full sm:w-auto`}
            >
              {saleType === "fixed" 
                ? (createRelistingMutation.isPending ? "Creating Listing..." : "List for Sale")
                : (createAuctionMutation.isPending ? "Starting Auction..." : "Start Auction")
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}