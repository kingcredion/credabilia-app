import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, ThumbsUp, MessageSquare, User, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function ReviewsSection({ 
  targetEmail, 
  frameShopId, 
  currentUser, 
  title = "Reviews" 
}) {
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const queryClient = useQueryClient();

  const queryKey = targetEmail 
    ? ['reviews', 'user', targetEmail] 
    : ['reviews', 'shop', frameShopId];

  const { data: reviews = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const filter = targetEmail 
        ? { vendor_email: targetEmail } 
        : { frame_shop_id: frameShopId };
        
      if (!filter.vendor_email && !filter.frame_shop_id) return [];
      
      return await base44.entities.Review.filter(filter, "-created_date");
    },
    enabled: !!(targetEmail || frameShopId)
  });

  const submitReviewMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser) throw new Error("Please sign in to leave a review");
      
      const reviewData = {
        reviewer_email: currentUser.email,
        reviewer_name: currentUser.full_name || currentUser.email.split('@')[0],
        rating: rating,
        comment: comment,
        purchase_verified: true, // In a real app, verify this against transactions
        helpful_votes: 0,
        ...(targetEmail && { vendor_email: targetEmail }),
        ...(frameShopId && { frame_shop_id: frameShopId })
      };

      await base44.entities.Review.create(reviewData);
      
      // Update aggregate ratings if possible (simplified here)
      // In a real app, backend triggers would handle this
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setShowReviewDialog(false);
      setComment("");
      setRating(5);
      toast.success("Review submitted successfully!");
    },
    onError: (error) => {
      console.error("Review error:", error);
      toast.error("Failed to submit review");
    }
  });

  const averageRating = reviews.length > 0
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : 0;

  const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach(r => {
    const rounded = Math.round(r.rating);
    if (ratingCounts[rounded] !== undefined) ratingCounts[rounded]++;
  });

  const canReview = !!currentUser && (
    (targetEmail && currentUser.email !== targetEmail) || 
    (frameShopId) // Add more logic here if needed (e.g. check if user owns the shop)
  );

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-gray-500" />
          {title} ({reviews.length})
        </CardTitle>
        {canReview && (
          <Button onClick={() => setShowReviewDialog(true)} size="sm">
            Write a Review
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {reviews.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Star className="w-12 h-12 mx-auto mb-2 text-gray-200" />
            <p>No reviews yet. Be the first to share your experience!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Summary Column */}
            <div className="md:col-span-1 space-y-4">
              <div className="text-center p-4 bg-gray-50 rounded-xl">
                <div className="text-4xl font-bold text-gray-900">{averageRating}</div>
                <div className="flex justify-center my-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-5 h-5 ${
                        star <= Math.round(averageRating)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-sm text-gray-500">{reviews.length} total reviews</p>
              </div>

              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((star) => (
                  <div key={star} className="flex items-center gap-2 text-sm">
                    <span className="w-3">{star}</span>
                    <Star className="w-3 h-3 text-gray-400" />
                    <Progress 
                      value={(ratingCounts[star] / reviews.length) * 100} 
                      className="h-2"
                    />
                    <span className="w-8 text-right text-gray-500">
                      {ratingCounts[star]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Reviews List */}
            <div className="md:col-span-2 space-y-4">
              {reviews.map((review) => (
                <div key={review.id} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarFallback>
                          {(review.reviewer_name || 'U')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm text-gray-900">
                          {review.reviewer_name}
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-3 h-3 ${
                                  star <= review.rating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-gray-300"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-gray-400">
                            {new Date(review.created_date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    {review.purchase_verified && (
                      <Badge variant="outline" className="text-[10px] text-green-600 bg-green-50 border-green-200">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Verified
                      </Badge>
                    )}
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {review.comment}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write a Review</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="focus:outline-none transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-8 h-8 ${
                        star <= rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Your Review</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your experience..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReviewDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => submitReviewMutation.mutate()}
              disabled={!comment.trim() || submitReviewMutation.isPending}
            >
              {submitReviewMutation.isPending ? "Submitting..." : "Submit Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}