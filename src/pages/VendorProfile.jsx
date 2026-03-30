import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ShieldCheck,
  Star,
  Package,
  TrendingUp,
  MapPin,
  Calendar,
  Award,
  ArrowLeft,
  Eye,
  MessageSquare,
  ThumbsUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const DEFAULT_BANNER_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/f0d1bb2d2_Photoroom_20251212_201111.png";

export default function VendorProfile() {
  const location = useLocation();
  const vendorEmail = new URLSearchParams(location.search).get("email");
  const [user, setUser] = useState(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [hoveredRating, setHoveredRating] = useState(0);
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

  const { data: vendor, isLoading: vendorLoading } = useQuery({
    queryKey: ['vendor-profile', vendorEmail],
    queryFn: async () => {
      if (!vendorEmail) throw new Error("Vendor email required");
      const users = await base44.entities.User.filter({ email: vendorEmail });
      if (users.length === 0) throw new Error("Vendor not found");
      return users[0];
    },
    enabled: !!vendorEmail,
  });

  const { data: vendorItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['vendor-items', vendorEmail],
    queryFn: async () => {
      if (!vendorEmail) return [];
      return await base44.entities.Item.filter({ 
        vendor_email: vendorEmail,
        status: "active"
      }, "-created_date");
    },
    enabled: !!vendorEmail,
    initialData: [],
  });

  // Check if user has purchased from this vendor
  const { data: userPurchases } = useQuery({
    queryKey: ['user-purchases', vendorEmail, user?.email],
    queryFn: async () => {
      if (!vendorEmail || !user?.email) return [];
      // For now, we'll check if there are any sold items from this vendor
      // In a real app, you'd have a Purchase entity
      // This is a simplified check assuming a 'sold' item implies a purchase from the current user
      // A more robust implementation would involve a dedicated 'Purchase' entity linking buyer, item, and vendor.
      const purchases = await base44.entities.Item.filter({ 
        vendor_email: vendorEmail,
        buyer_email: user.email, // Assuming buyer_email exists on Item entity for sold items
        status: "sold"
      });
      return purchases;
    },
    enabled: !!vendorEmail && !!user?.email,
    initialData: [],
  });

  // Fetch reviews for this vendor
  const { data: reviews, isLoading: reviewsLoading } = useQuery({
    queryKey: ['vendor-reviews', vendorEmail],
    queryFn: async () => {
      if (!vendorEmail) return [];
      return await base44.entities.Review.filter({ vendor_email: vendorEmail }, "-created_date");
    },
    enabled: !!vendorEmail,
    initialData: [],
  });

  // Check if user has already reviewed this vendor
  const { data: userReview } = useQuery({
    queryKey: ['user-vendor-review', vendorEmail, user?.email],
    queryFn: async () => {
      if (!vendorEmail || !user?.email) return null;
      const userReviews = await base44.entities.Review.filter({ 
        vendor_email: vendorEmail,
        reviewer_email: user.email
      });
      return userReviews[0] || null;
    },
    enabled: !!vendorEmail && !!user?.email,
  });

  const submitReviewMutation = useMutation({
    mutationFn: async (reviewData) => {
      await base44.entities.Review.create(reviewData);
      
      // Update vendor stats
      const allReviews = await base44.entities.Review.filter({ vendor_email: vendorEmail });
      const currentReviews = allReviews.length; // Reviews *before* the new one is added to the count
      const totalReviews = currentReviews + 1; // Total reviews including the one just submitted
      const positiveReviews = allReviews.filter(r => r.rating >= 4).length + (reviewData.rating >= 4 ? 1 : 0);
      const avgRating = (allReviews.reduce((sum, r) => sum + r.rating, 0) + reviewData.rating) / totalReviews;
      const credibility = Math.min(100, (avgRating / 5) * 100);
      
      await base44.entities.User.update(vendor.id, {
        vendor_total_reviews: totalReviews,
        vendor_positive_reviews: positiveReviews,
        vendor_credibility: Math.round(credibility)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-reviews', vendorEmail] });
      queryClient.invalidateQueries({ queryKey: ['vendor-profile', vendorEmail] });
      queryClient.invalidateQueries({ queryKey: ['user-vendor-review'] });
      setShowReviewDialog(false);
      setRating(5);
      setComment("");
    },
  });

  const handleSubmitReview = () => {
    if (!user || !vendorEmail) return;
    
    submitReviewMutation.mutate({
      vendor_email: vendorEmail,
      reviewer_email: user.email,
      reviewer_name: user.full_name || user.email.split('@')[0],
      // Assuming item_id can be derived from the first purchase for now, or null if no specific item.
      // A more robust system would link a review to a specific purchase/item.
      item_id: userPurchases.length > 0 ? userPurchases[0].id : null, 
      rating: rating,
      comment: comment,
      purchase_verified: userPurchases.length > 0
    });
  };

  const getCredibilityColor = (score) => {
    if (score >= 90) return { bg: "#10b981", light: "#d1fae5", text: "#065f46", label: "Elite Seller" };
    if (score >= 75) return { bg: "#3b82f6", light: "#dbeafe", text: "#1e40af", label: "Trusted Seller" };
    if (score >= 60) return { bg: "#f59e0b", light: "#fef3c7", text: "#92400e", label: "Established Seller" };
    return { bg: "#ef4444", light: "#fee2e2", text: "#991b1b", label: "New Seller" };
  };

  const getAuthenticityColor = (score) => {
    if (score >= 80) return "text-green-600 bg-green-50";
    if (score >= 60) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  if (vendorLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading vendor profile...</p>
        </div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Vendor not found</h2>
          <p className="text-gray-600 mb-4">This vendor doesn't exist.</p>
          <Link to={createPageUrl("Marketplace")}>
            <Button>Back to Marketplace</Button>
          </Link>
        </div>
      </div>
    );
  }

  const credibility = vendor.vendor_credibility || 50;
  const colors = getCredibilityColor(credibility);
  const totalViews = vendorItems.reduce((sum, item) => sum + (item.views || 0), 0);
  const totalVotes = vendorItems.reduce((sum, item) => sum + (item.total_votes || 0), 0);
  const avgAuthenticity = vendorItems.length > 0 
    ? vendorItems.reduce((sum, item) => sum + (item.authenticity_meter || 0), 0) / vendorItems.length 
    : 0;

  const canLeaveReview = user && userPurchases.length > 0 && !userReview && user.email !== vendorEmail;
  const avgReviewRating = reviews.length > 0 
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length 
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Back Button */}
        <Link to={createPageUrl("Marketplace")} className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to Marketplace
        </Link>

        {/* Vendor Header Card */}
        <Card className="mb-8 border-2" style={{ borderColor: colors.bg }}>
          <CardContent className="p-8">
            <div className="absolute top-0 left-0 right-0 h-32 rounded-t-lg overflow-hidden">
              <img 
                src={vendor.banner_url || DEFAULT_BANNER_URL}
                alt="Profile Banner"
                className="w-full h-full object-cover"
              />
              <div 
                className="absolute inset-0"
                style={{ 
                  background: `linear-gradient(to bottom, transparent 0%, ${colors.bg} 100%)`,
                  opacity: 0.1
                }}
              />
            </div>
            
            <div className="relative">
              <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                {/* Avatar */}
                <div className="relative">
                  <Avatar className="w-32 h-32 ring-4 ring-offset-4" style={{ ringColor: colors.bg }}>
                    <AvatarImage src={vendor.avatar_url} />
                    <AvatarFallback style={{ backgroundColor: colors.bg, color: 'white' }} className="text-4xl">
                      {(vendor.full_name || vendor.email || 'V')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {credibility >= 90 && (
                    <div className="absolute -bottom-2 -right-2 bg-white rounded-full p-2 shadow-lg">
                      <ShieldCheck className="w-6 h-6 text-green-600" />
                    </div>
                  )}
                </div>

                {/* Vendor Info */}
                <div className="flex-1">
                  <div className="flex items-start justify-between flex-wrap gap-4 mb-3">
                    <div>
                      <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        {vendor.full_name || vendor.email?.split('@')[0] || 'Vendor'}
                      </h1>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge 
                          className="text-base px-4 py-1 font-bold flex items-center gap-2"
                          style={{ 
                            backgroundColor: colors.bg, 
                            color: 'white' 
                          }}
                        >
                          <Star className="w-4 h-4 fill-current" />
                          {credibility}% Credibility
                        </Badge>
                        <Badge variant="outline" className="text-sm">
                          {colors.label}
                        </Badge>
                        {reviews.length > 0 && (
                          <Badge variant="outline" className="text-sm flex items-center gap-1">
                            <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                            {avgReviewRating.toFixed(1)} ({reviews.length} {reviews.length === 1 ? 'review' : 'reviews'})
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Leave Review Button */}
                    {canLeaveReview && (
                      <Button 
                        onClick={() => setShowReviewDialog(true)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Leave Review
                      </Button>
                    )}

                    {/* Trust Score */}
                    <div className="text-right">
                      <p className="text-sm text-gray-600 mb-1">Trust Score</p>
                      <p className="text-3xl font-bold" style={{ color: colors.bg }}>
                        {((vendor.trust_score || 0.5) * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>

                  {/* Bio */}
                  {vendor.bio && (
                    <p className="text-gray-700 mb-4 leading-relaxed">
                      {vendor.bio}
                    </p>
                  )}

                  {/* Meta Info */}
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    {vendor.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        <span>{vendor.location}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      <span>Member since {new Date(vendor.created_date).getFullYear()}</span>
                    </div>
                    {vendor.rank && (
                      <div className="flex items-center gap-1">
                        <Award className="w-4 h-4" />
                        <span className="capitalize">{vendor.rank} Rank</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8 pt-8 border-t border-gray-200">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Package className="w-4 h-4 text-gray-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{vendorItems.length}</p>
                  <p className="text-xs text-gray-600">Active Listings</p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <ShieldCheck className="w-4 h-4 text-gray-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{vendor.vendor_total_sales || 0}</p>
                  <p className="text-xs text-gray-600">Total Sales</p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Star className="w-4 h-4 text-gray-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {vendor.vendor_total_reviews > 0 
                      ? `${((vendor.vendor_positive_reviews / vendor.vendor_total_reviews) * 100).toFixed(0)}%`
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-gray-600">Positive Reviews</p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Eye className="w-4 h-4 text-gray-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{totalViews.toLocaleString()}</p>
                  <p className="text-xs text-gray-600">Total Views</p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <TrendingUp className="w-4 h-4 text-gray-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{avgAuthenticity.toFixed(0)}%</p>
                  <p className="text-xs text-gray-600">Avg. Authenticity</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reviews Section */}
        {reviews.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Customer Reviews</span>
                <Badge variant="secondary">{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {reviews.map((review, index) => (
                  <div key={review.id || index}>
                    <div className="flex gap-4">
                      <Avatar className="w-12 h-12 flex-shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white font-semibold">
                          {(review.reviewer_name || 'U')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-gray-900">
                                {review.reviewer_name}
                              </span>
                              {review.purchase_verified && (
                                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                  <ShieldCheck className="w-3 h-3 mr-1" />
                                  Verified Purchase
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-0.5">
                                {Array(5).fill(0).map((_, i) => (
                                  <Star 
                                    key={i} 
                                    className={`w-4 h-4 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-gray-500">
                                {new Date(review.created_date).toLocaleDateString('en-US', { 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                })}
                              </span>
                            </div>
                          </div>
                        </div>

                        {review.comment && (
                          <p className="text-gray-700 text-sm leading-relaxed bg-gray-50 p-3 rounded-lg">
                            {review.comment}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {index < reviews.length - 1 && <Separator className="mt-6" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Message if user can't review */}
        {user && !canLeaveReview && user.email !== vendorEmail && !userReview && (
          <Card className="mb-8 bg-blue-50 border-blue-200">
            <CardContent className="p-4 text-center text-sm text-blue-900">
              <MessageSquare className="w-5 h-5 mx-auto mb-2 text-blue-600" />
              Purchase from this vendor to leave a review
            </CardContent>
          </Card>
        )}

        {userReview && (
          <Card className="mb-8 bg-green-50 border-green-200">
            <CardContent className="p-4 text-center text-sm text-green-900">
              <ShieldCheck className="w-5 h-5 mx-auto mb-2 text-green-600" />
              You've already reviewed this vendor
            </CardContent>
          </Card>
        )}

        {/* Vendor's Listings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>All Listings from {vendor.full_name || 'this vendor'}</span>
              <Badge variant="secondary">{vendorItems.length} items</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {itemsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array(4).fill(0).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <div className="aspect-square bg-gray-200 rounded-t-lg"></div>
                    <CardContent className="p-4 space-y-3">
                      <div className="h-4 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : vendorItems.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No active listings
                </h3>
                <p className="text-gray-600">
                  This vendor doesn't have any active items for sale right now
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {vendorItems.map((item) => (
                  <Link
                    key={item.id}
                    to={createPageUrl(`ItemDetails?id=${item.id}`)}
                    className="group"
                  >
                    <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 border-2 border-transparent hover:border-blue-200">
                      <div className="aspect-square bg-gray-100 relative overflow-hidden">
                        {item.images?.[0] ? (
                          <img 
                            src={item.images[0]} 
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Star className="w-16 h-16 text-gray-300" />
                          </div>
                        )}
                        
                        {/* Authenticity Badge */}
                        <div className="absolute top-3 right-3">
                          <Badge 
                            className={`${getAuthenticityColor(item.authenticity_meter)} border-2 border-white shadow-lg flex items-center gap-1`}
                          >
                            <ShieldCheck className="w-3 h-3" />
                            {item.authenticity_meter}%
                          </Badge>
                        </div>

                        {/* Grade Badge */}
                        {item.grade_status && (
                          <div className="absolute top-3 left-3">
                            <Badge className="bg-white text-gray-900 border-2 border-gray-200 shadow-lg capitalize">
                              {item.grade_status.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                        )}
                      </div>

                      <CardContent className="p-4">
                        <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
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

                        {/* Price and Stats */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                          <div>
                            {item.price ? (
                              <p className="text-xl font-bold text-gray-900">
                                ${item.price.toLocaleString()}
                              </p>
                            ) : (
                              <p className="text-sm text-gray-500">Price not set</p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3 text-sm text-gray-500">
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
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Leave a Review</DialogTitle>
            <DialogDescription>
              Share your experience with {vendor.full_name || 'this vendor'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Star Rating */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Your Rating
              </label>
              <div className="flex items-center gap-2">
                {Array(5).fill(0).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setRating(i + 1)}
                    onMouseEnter={() => setHoveredRating(i + 1)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star 
                      className={`w-10 h-10 ${
                        i < (hoveredRating || rating) 
                          ? 'fill-yellow-400 text-yellow-400' 
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
                <span className="ml-3 text-lg font-semibold text-gray-900">
                  {rating} {rating === 1 ? 'star' : 'stars'}
                </span>
              </div>
            </div>

            {/* Comment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Review (Optional)
              </label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share details about your experience with this vendor..."
                rows={5}
              />
            </div>

            {userPurchases.length > 0 && (
              <div className="bg-green-50 border border-green-200 p-3 rounded-lg flex items-center gap-2 text-sm text-green-900">
                <ShieldCheck className="w-4 h-4 text-green-600" />
                This will be marked as a verified purchase review
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReviewDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitReview}
              disabled={submitReviewMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {submitReviewMutation.isPending ? "Submitting..." : "Submit Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}