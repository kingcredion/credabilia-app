import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Heart,
  Trash2,
  ExternalLink,
  TrendingDown,
  TrendingUp,
  Package,
  Star,
  Bell,
  BellOff
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
import { motion } from "framer-motion";

export default function Watchlist() {
  const [user, setUser] = useState(null);
  const [selectedFavorite, setSelectedFavorite] = useState(null);
  const [showNotesDialog, setShowNotesDialog] = useState(false);
  const [notes, setNotes] = useState("");
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

  const { data: favorites } = useQuery({
    queryKey: ['user-favorites', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Favorite.filter({ user_email: user.email }, "-created_date");
    },
    enabled: !!user?.email,
    initialData: [],
  });

  // Fetch current prices for all favorited items
  const { data: currentItems } = useQuery({
    queryKey: ['favorited-items', favorites],
    queryFn: async () => {
      if (favorites.length === 0) return [];
      const itemIds = favorites.map(f => f.item_id);
      const items = await base44.entities.Item.list();
      return items.filter(item => itemIds.includes(item.id));
    },
    enabled: favorites.length > 0,
    initialData: [],
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: async (favoriteId) => {
      await base44.entities.Favorite.delete(favoriteId);
    },
    onSuccess: () => {
      // Scoped key to match Marketplace and Profile queries
      queryClient.invalidateQueries({ queryKey: ['user-favorites', user?.email] });
    },
  });

  const toggleNotificationsMutation = useMutation({
    mutationFn: async (favorite) => {
      await base44.entities.Favorite.update(favorite.id, {
        notify_price_drop: !favorite.notify_price_drop
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-favorites', user?.email] });
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async ({ favoriteId, notes }) => {
      await base44.entities.Favorite.update(favoriteId, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-favorites', user?.email] });
      setShowNotesDialog(false);
      setSelectedFavorite(null);
      setNotes("");
    },
  });

  const handleEditNotes = (favorite) => {
    setSelectedFavorite(favorite);
    setNotes(favorite.notes || "");
    setShowNotesDialog(true);
  };

  const getPriceChange = (favorite) => {
    const currentItem = currentItems.find(item => item.id === favorite.item_id);
    if (!currentItem || !favorite.item_price) return null;
    
    const change = currentItem.price - favorite.item_price;
    const percentChange = (change / favorite.item_price) * 100;
    
    return {
      amount: change,
      percent: percentChange,
      current: currentItem.price,
      isDropped: change < 0,
      isIncreased: change > 0
    };
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-pink-50 to-purple-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Heart className="w-10 h-10 text-red-500 fill-current" />
            My Watchlist
          </h1>
          <p className="text-gray-600">
            Track your favorite items and get notified of price drops
          </p>
        </div>

        {favorites.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Heart className="w-24 h-24 text-gray-300 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Your watchlist is empty
              </h3>
              <p className="text-gray-600 mb-6">
                Start adding items you're interested in to track prices and updates
              </p>
              <Link to={createPageUrl("Marketplace")}>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Browse Marketplace
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {favorites.map((favorite, index) => {
              const priceChange = getPriceChange(favorite);
              const currentItem = currentItems.find(item => item.id === favorite.item_id);

              return (
                <motion.div
                  key={favorite.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="overflow-hidden hover:shadow-xl transition-all">
                    {/* Image */}
                    <div className="aspect-square bg-gray-100 relative">
                      {favorite.item_image_url ? (
                        <img 
                          src={favorite.item_image_url} 
                          alt={favorite.item_title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-16 h-16 text-gray-300" />
                        </div>
                      )}

                      {/* Price Change Badge */}
                      {priceChange && priceChange.isDropped && (
                        <div className="absolute top-3 left-3">
                          <Badge className="bg-green-600 text-white flex items-center gap-1">
                            <TrendingDown className="w-3 h-3" />
                            {priceChange.percent.toFixed(0)}% OFF
                          </Badge>
                        </div>
                      )}
                      {priceChange && priceChange.isIncreased && (
                        <div className="absolute top-3 left-3">
                          <Badge className="bg-orange-600 text-white flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {priceChange.percent.toFixed(0)}% UP
                          </Badge>
                        </div>
                      )}

                      {/* Remove Button */}
                      <button
                        onClick={() => removeFavoriteMutation.mutate(favorite.id)}
                        className="absolute top-3 right-3 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg transition-all hover:scale-110"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>

                    <CardContent className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-3 line-clamp-2">
                        {favorite.item_title}
                      </h3>

                      {/* Price Info */}
                      <div className="mb-4">
                        {priceChange ? (
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-gray-500 line-through">
                                ${favorite.item_price?.toLocaleString()}
                              </span>
                              {priceChange.isDropped && (
                                <Badge className="bg-green-100 text-green-700 text-xs">
                                  SAVE ${Math.abs(priceChange.amount).toFixed(2)}
                                </Badge>
                              )}
                            </div>
                            <p className={`text-2xl font-bold ${priceChange.isDropped ? 'text-green-600' : 'text-orange-600'}`}>
                              ${priceChange.current.toLocaleString()}
                            </p>
                          </div>
                        ) : (
                          <p className="text-2xl font-bold text-gray-900">
                            ${favorite.item_price?.toLocaleString() || 'N/A'}
                          </p>
                        )}
                      </div>

                      {/* Notes Preview */}
                      {favorite.notes && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                          <p className="text-xs text-gray-700 line-clamp-2">{favorite.notes}</p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <Link to={createPageUrl(`ItemDetails?id=${favorite.item_id}`)} className="w-full">
                          <Button variant="outline" size="sm" className="w-full">
                            <ExternalLink className="w-4 h-4 mr-1" />
                            View
                          </Button>
                        </Link>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEditNotes(favorite)}
                        >
                          <Star className="w-4 h-4 mr-1" />
                          {favorite.notes ? 'Edit' : 'Add'} Note
                        </Button>
                      </div>

                      {/* Notification Toggle */}
                      <button
                        onClick={() => toggleNotificationsMutation.mutate(favorite)}
                        className="w-full mt-2 flex items-center justify-center gap-2 text-xs text-gray-600 hover:text-gray-900 py-2 hover:bg-gray-50 rounded transition-colors"
                      >
                        {favorite.notify_price_drop ? (
                          <>
                            <Bell className="w-3 h-3 text-blue-600" />
                            <span>Price alerts ON</span>
                          </>
                        ) : (
                          <>
                            <BellOff className="w-3 h-3 text-gray-400" />
                            <span>Price alerts OFF</span>
                          </>
                        )}
                      </button>

                      {/* Item Status */}
                      {currentItem && currentItem.status !== 'active' && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <Badge variant="outline" className="text-xs text-red-600">
                            No longer available
                          </Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Notes Dialog */}
      <Dialog open={showNotesDialog} onOpenChange={setShowNotesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Personal Notes</DialogTitle>
            <DialogDescription>
              Keep track of important details about this item
            </DialogDescription>
          </DialogHeader>

          <div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="E.g., 'Birthday gift for dad', 'Compare with similar item', 'Wait for price drop'..."
              rows={5}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNotesDialog(false);
                setSelectedFavorite(null);
                setNotes("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => updateNotesMutation.mutate({ 
                favoriteId: selectedFavorite.id, 
                notes 
              })}
              disabled={updateNotesMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateNotesMutation.isPending ? "Saving..." : "Save Notes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}