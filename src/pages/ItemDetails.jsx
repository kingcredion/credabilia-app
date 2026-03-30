import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert, // Added ShieldAlert
  Star,
  Eye,
  MessageSquare,
  ArrowLeft as ArrowLeftIcon,
  ExternalLink,
  Award,
  FileCheck,
  TrendingUp,
  Calendar,
  DollarSign,
  ZoomIn,
  Coins,
  UserPlus,
  UserCheck,
  Mail,
  Heart,
  Sparkles,
  Gift,
  GraduationCap,
  ThumbsUp, // New
  ThumbsDown, // New
  Flag, // New
  Package, // New
  User, // New
  MapPin, // New
  Trophy, // New
  AlertCircle, // New
  CheckCircle, // New
  XCircle, // New
  Users, // New
  ShieldX, // New for counterfeit
  Gavel,
  Timer,
  TrendingUp as TrendingUpIcon,
  Palette,
  Edit2, // New
  ClipboardList // New
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator"; // Existing
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
import { Input } from "@/components/ui/input"; // Existing
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // New
import { motion, AnimatePresence } from "framer-motion"; // New
import ImageZoomDialog from "../components/ImageZoomDialog";
import SocialShareButtons from "../components/SocialShareButtons";
import ItemComments from "../components/ItemComments";
import StripeCheckoutDialog from "../components/StripeCheckoutDialog";
import ItemDescription from "../components/ItemDescription";
import CredibilityMeter from "../components/CredibilityMeter";
import { recalculateItemTrust } from "../utils/trustScore";
import { updateAuditorStats } from "../utils/auditorStats";
import { updateMarketplaceRanking } from "../utils/marketplaceRanking";

export default function ItemDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const itemId = new URLSearchParams(location.search).get("id");
  
  const [user, setUser] = useState(null);
  const [selectedImage, setSelectedImage] = useState(0); // Keeping this for the thumbnail logic, but using zoomedImage for the dialog
  const [showVoteDialog, setShowVoteDialog] = useState(false);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [zoomedImage, setZoomedImage] = useState(null); // Renamed from showImageZoom, zoomImage
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [voteType, setVoteType] = useState("");
  const [voteConfidence, setVoteConfidence] = useState(0.8); // Renamed from confidence
  const [voteComment, setVoteComment] = useState(""); // Renamed from comment

  
  // Auction state
  const [bidAmount, setBidAmount] = useState("");
  const [showBidDialog, setShowBidDialog] = useState(false);
  const [showGuestPurchaseDialog, setShowGuestPurchaseDialog] = useState(false); // New state for guest purchase
  const [showRequestDialog, setShowRequestDialog] = useState(false); // New state for imported items request
  const [pendingRequest, setPendingRequest] = useState(null);

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

  const handleTagClick = async (tag) => {
    if (!user) return;

    const currentInterests = user.interests_tags || [];
    const isFavorited = currentInterests.some(t => t.toLowerCase() === tag.toLowerCase());
    let newInterests;

    if (isFavorited) {
      newInterests = currentInterests.filter(t => t.toLowerCase() !== tag.toLowerCase());
    } else {
      newInterests = [...currentInterests, tag];
    }

    try {
      await base44.auth.updateMe({ interests_tags: newInterests });
      queryClient.invalidateQueries({ queryKey: ['marketplace-items'] });
      loadUser();
    } catch (error) {
      console.error("Error updating interests:", error);
    }
  };

  const isTagFavorited = (tag) => {
    if (!user?.interests_tags) return false;
    return user.interests_tags.some(t => t.toLowerCase() === tag.toLowerCase());
  };

  const { data: item, isLoading: itemLoading } = useQuery({
    queryKey: ['item', itemId],
    queryFn: async () => {
      const items = await base44.entities.Item.filter({ id: itemId });
      if (items.length === 0) return null; // Outline specified returning null
      
      const currentItem = items[0];
      // Always increment views on initial fetch for the session.
      // This logic was slightly different from original, following the outline's implicit change
      await base44.entities.Item.update(currentItem.id, {
        views: (currentItem.views || 0) + 1
      });
      
      return { ...currentItem, views: (currentItem.views || 0) + 1 };
    },
    enabled: !!itemId,
  });

  const { data: vendor } = useQuery({
    queryKey: ['vendor', item?.vendor_email], // Changed query key from 'item-vendor' to 'vendor'
    queryFn: async () => {
      if (!item?.vendor_email) return null;
      const users = await base44.entities.User.filter({ email: item.vendor_email });
      return users[0] || null;
    },
    enabled: !!item?.vendor_email,
  });

  const { data: isFollowingVendor } = useQuery({
    queryKey: ['is-following-vendor', user?.email, vendor?.email],
    queryFn: async () => {
      if (!user?.email || !vendor?.email) return false;
      const follows = await base44.entities.Follow.filter({
        follower_email: user.email,
        following_email: vendor.email
      });
      return follows.length > 0;
    },
    enabled: !!user?.email && !!vendor?.email,
  });

  const { data: vendorItems } = useQuery({
    queryKey: ['vendor-other-items', item?.vendor_email, itemId], 
    queryFn: async () => {
      if (!item?.vendor_email) return [];
      const items = await base44.entities.Item.filter({ 
        vendor_email: item.vendor_email,
        status: "active"
      }, "-created_date", 5);
      return items.filter(i => i.id !== itemId);
    },
    enabled: !!item?.vendor_email,
    initialData: [],
  });

  const reportItemMutation = useMutation({
    mutationFn: async () => {
        if (!user) throw new Error("Must be logged in to report");
        
        await base44.entities.Flag.create({
            item_id: item.id,
            flagger_id: user.id,
            flagger_email: user.email,
            reason: reportReason,
            details: reportDetails,
            status: 'pending'
        });

        await base44.entities.Item.update(item.id, {
            moderation_status: 'flagged'
        });
    },
    onSuccess: () => {
        toast.success("Item reported to administration");
        setShowReportDialog(false);
        setReportReason("");
        setReportDetails("");
        queryClient.invalidateQueries(['item', itemId]);
    },
    onError: (err) => {
        toast.error("Failed to submit report");
    }
  });

  const { data: votes } = useQuery({ // Removed isLoading: votesLoading from destructuring
    queryKey: ['item-votes', itemId],
    queryFn: async () => {
      return await base44.entities.Vote.filter({ item_id: itemId }, "-created_date");
    },
    enabled: !!itemId,
    initialData: [], // Re-added initialData to prevent undefined issues
  });

  const { data: userVote } = useQuery({ // Renamed myVote to userVote
    queryKey: ['user-vote', itemId, user?.email], // Changed query key
    queryFn: async () => {
      if (!user?.email) return null;
      const userVotes = await base44.entities.Vote.filter({ 
        item_id: itemId, 
        voter_email: user.email 
      });
      return userVotes[0] || null;
    },
    enabled: !!itemId && !!user?.email,
  });

  const { data: existingRequest } = useQuery({
    queryKey: ['pending-request', itemId, user?.email],
    queryFn: async () => {
        if (!user?.email) return null;
        const requests = await base44.entities.PendingSale.filter({
            item_id: itemId,
            buyer_email: user.email
        });
        // Return active request or approved one
        return requests.find(r => r.status === 'pending' || r.status === 'approved') || null;
    },
    enabled: !!itemId && !!user?.email
  });

  const { data: auction, isLoading: auctionLoading } = useQuery({
    queryKey: ['auction', item?.active_auction_id],
    queryFn: async () => {
      if (!item?.active_auction_id) return null;
      const auctions = await base44.entities.Auction.filter({ id: item.active_auction_id });
      return auctions[0] || null;
    },
    enabled: !!item?.active_auction_id,
    refetchInterval: 5000 // Poll every 5s for live updates
  });

  const { data: bids } = useQuery({
    queryKey: ['bids', auction?.id],
    queryFn: async () => {
      if (!auction?.id) return [];
      return await base44.entities.Bid.filter({ auction_id: auction.id }); // Assuming Bid entity
    },
    enabled: !!auction?.id,
    refetchInterval: 5000
  });

  const { data: userCredits } = useQuery({
    queryKey: ['user-credits', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const credits = await base44.entities.CouncilCredit.filter({ user_email: user.email });
      return credits[0] || null;
    },
    enabled: !!user?.email,
  });

  const followVendorMutation = useMutation({
    mutationFn: async () => {
      if (!user || !vendor) throw new Error("Missing user data"); // Added check
      if (isFollowingVendor) {
        const follows = await base44.entities.Follow.filter({
          follower_email: user.email,
          following_email: vendor.email
        });
        if (follows[0]) {
          await base44.entities.Follow.delete(follows[0].id);
        }
        
        await base44.entities.User.update(vendor.id, {
          followers_count: Math.max(0, (vendor.followers_count || 0) - 1)
        });
        await base44.auth.updateMe({
          following_count: Math.max(0, (user.following_count || 0) - 1)
        });
      } else {
        await base44.entities.Follow.create({
          follower_email: user.email,
          follower_name: user.full_name || user.email,
          following_email: vendor.email,
          following_name: vendor.full_name || vendor.email
        });
        
        await base44.entities.User.update(vendor.id, {
          followers_count: (vendor.followers_count || 0) + 1
        });
        await base44.auth.updateMe({
          following_count: (user.following_count || 0) + 1
        });

        // Added ActivityEvent as per outline
        await base44.entities.ActivityEvent.create({
          user_email: user.email,
          user_name: user.full_name || user.email.split('@')[0],
          user_avatar: user.avatar_url,
          event_type: "new_follow",
          description: `started following ${vendor.full_name || vendor.email.split('@')[0]}`,
          related_user_email: vendor.email
        });
      }
    },
    onSuccess: () => {
      // Scoped key to match Profile's is-following query
      queryClient.invalidateQueries({ queryKey: ['is-following-vendor', user?.email, vendor?.email] });
      queryClient.invalidateQueries({ queryKey: ['is-following', user?.email, vendor?.email] });
      queryClient.invalidateQueries({ queryKey: ['vendor'] });
      loadUser();
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (message) => {
      if (!user || !vendor) throw new Error("Missing user data"); // Added check
      await base44.entities.Message.create({
        sender_email: user.email,
        sender_name: user.full_name || user.email,
        receiver_email: vendor.email,
        receiver_name: vendor.full_name || vendor.email,
        message: message,
        item_id: item.id, // Added as per outline
        item_title: item.title, // Added as per outline
        item_image_url: item.images?.[0] || null, // Added as per outline
        item_price: item.price || null // Added as per outline
      });
    },
    onSuccess: () => {
      setShowMessageDialog(false);
      setMessageText("");
    },
  });

  // switchRoleAndBuyMutation was removed from the outline
  // const switchRoleAndBuyMutation = useMutation({
  //   mutationFn: async () => {
  //     setShowPurchaseDialog(true);
  //     await new Promise(resolve => setTimeout(resolve, 100));
  //     await base44.auth.updateMe({ current_role: 'collector' });
  //     await loadUser();
  //   },
  //   onSuccess: () => {
  //     setShowPurchaseDialog(true);
  //   },
  // });

  const submitVoteMutation = useMutation({
    mutationFn: async ({ vote_type, confidence, comment }) => { // Changed to take object as per outline
      if (!user || !item) throw new Error("User not logged in or item not loaded"); // Added check
      
      // Calculate vote weight based on user rank as per outline
      const voteWeight = user.rank === 'gold' ? 3 : user.rank === 'silver' ? 2 : 1;
      
      await base44.entities.Vote.create({
        item_id: item.id,
        voter_id: user.id,
        voter_email: user.email,
        vote_type: vote_type,
        confidence: confidence,
        comment: comment,
        voter_rank: user.rank || "bronze",
        weight: voteWeight // Used new voteWeight
      });

      // Recalculate trust scores using new dual-score system
      const allVotes = await base44.entities.Vote.filter({ item_id: item.id });
      const authenticVotesCount = allVotes.filter(v => v.vote_type === 'authentic').length;
      const suspiciousVotesCount = allVotes.filter(v => v.vote_type === 'suspicious').length;
      const counterfeitVotesCount = allVotes.filter(v => v.vote_type === 'counterfeit').length;
      const totalVotesCount = allVotes.length;

      // Use trust score utilities for calculation
      const trustScores = recalculateItemTrust(item, allVotes, vendor);

      await base44.entities.Item.update(item.id, {
        total_votes: totalVotesCount,
        authentic_votes: authenticVotesCount,
        suspicious_votes: suspiciousVotesCount,
        counterfeit_votes: counterfeitVotesCount,
        authenticator_score: trustScores.authenticator_score,
        community_score: trustScores.community_score,
        final_trust_score: trustScores.final_trust_score,
        authenticator_weight: trustScores.authenticator_weight,
        community_weight: trustScores.community_weight,
        authenticity_meter: trustScores.final_trust_score // Mirror final_trust_score for backward compat
      });
      
      // XP event as per outline
      await base44.entities.XPEvent.create({
        user_id: user.id,
        user_email: user.email,
        action_type: "vet_item",
        xp_amount: 5,
        related_item_id: item.id,
        description: `Vetted item: ${item.title}`
      });
      
      // Update user XP + total_vets
      const newXP = (user.xp || 0) + 5;
      const newTotalVets = (user.total_vets || 0) + 1;
      await base44.auth.updateMe({
        xp: newXP,
        total_vets: newTotalVets,
      });

      // Recalculate marketplace ranking after audit
      const updatedItemData = {
        ...item,
        total_votes: totalVotesCount,
        authentic_votes: authenticVotesCount,
        suspicious_votes: suspiciousVotesCount,
        counterfeit_votes: counterfeitVotesCount,
        ...trustScores,
        authenticity_meter: trustScores.final_trust_score,
      };
      const rankUpdate = await updateMarketplaceRanking(updatedItemData);
      await base44.entities.Item.update(item.id, rankUpdate);

      // Update auditor-level leaderboard stats (trust_score, accuracy_rate, rank)
      const updatedItemForStats = updatedItemData;
      await updateAuditorStats(
        { ...user, xp: newXP, total_vets: newTotalVets },
        vote_type,
        updatedItemForStats
      );

      // Activity Event as per outline
      await base44.entities.ActivityEvent.create({
        user_email: user.email,
        user_name: user.full_name || user.email.split('@')[0],
        user_avatar: user.avatar_url,
        event_type: "new_audit",
        description: `audited an item`,
        related_item_id: item.id,
        related_item_title: item.title,
        related_item_image: item.images?.[0],
        metadata: { vote_type, confidence }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item', itemId] });
      queryClient.invalidateQueries({ queryKey: ['item-votes', itemId] });
      queryClient.invalidateQueries({ queryKey: ['user-vote', itemId] }); // Updated key
      setShowVoteDialog(false);
      setVoteType("");
      setVoteComment("");
      setVoteConfidence(0.8); // Reset confidence
      loadUser();
    },
  });

  const claimEducationalItemMutation = useMutation({
    mutationFn: async () => {
      if (!user || !item) throw new Error("User not logged in or item not loaded"); // Added check
      
      // Update item status and reduce quantity as per outline
      await base44.entities.Item.update(item.id, {
        buyer_email: user.email,
        status: "sold", // Mark as sold even if educational, for user's collection
        quantity: Math.max(0, (item.quantity || 1000000) - 1) // Reduce quantity for simulation
      });

      // Create a transaction for the educational item as per outline
      await base44.entities.Transaction.create({
        item_id: item.id,
        item_title: item.title,
        vendor_email: item.vendor_email,
        buyer_email: user.email,
        sale_amount: 0, // Free
        council_pool_contribution: 0,
        payment_method: "simulated_purchase",
        status: "completed"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item', itemId] });
      queryClient.invalidateQueries({ queryKey: ['user-collection'] }); // Invalidate user collection to show the item
      loadUser();
      alert("✅ Item claimed! Check 'My Collection' to see it."); // Added alert as per outline
    },
  });

  const placeBidMutation = useMutation({
    mutationFn: async (amount) => {
      if (!user || !auction) throw new Error("Missing data");
      if (amount <= auction.current_bid) throw new Error("Bid must be higher than current bid");

      await base44.entities.Bid.create({
        auction_id: auction.id,
        bidder_email: user.email,
        amount: parseFloat(amount)
      });

      await base44.entities.Auction.update(auction.id, {
        current_bid: parseFloat(amount),
        highest_bidder_email: user.email,
        bid_count: (auction.bid_count || 0) + 1
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auction'] });
      queryClient.invalidateQueries({ queryKey: ['bids'] });
      setShowBidDialog(false);
      setBidAmount("");
      alert("Bid placed successfully!");
    },
    onError: (err) => alert(err.message)
  });

  const handleStripeSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['item', itemId] });
    queryClient.invalidateQueries({ queryKey: ['user-credits'] });
    loadUser();
  };

  const requestAvailabilityMutation = useMutation({
    mutationFn: async () => {
        await base44.functions.invoke('pendingSales', {
            action: 'create_request',
            itemId: item.id
        });
    },
    onSuccess: () => {
        toast.success("Availability request sent to vendor!");
        setShowRequestDialog(false);
        queryClient.invalidateQueries(['pending-request']);
    },
    onError: (err) => {
        toast.error("Failed to send request: " + err.message);
    }
  });

  const handlePurchaseClick = () => {
    if (!user) {
      setShowGuestPurchaseDialog(true);
      return;
    }
    
    // Check if item is imported and requires approval
    if (item.import_source && !existingRequest) {
        setShowRequestDialog(true);
    } else if (item.import_source && existingRequest?.status === 'pending') {
        toast.info("You already have a pending request for this item. Please wait for vendor approval.");
    } else {
        setShowPurchaseDialog(true);
    }
  };

  const handleVoteSubmit = () => { // Renamed from handleVote
    if (!voteType || !user) return;
    
    submitVoteMutation.mutate({
      vote_type: voteType,
      confidence: voteConfidence,
      comment: voteComment
    });
  };

  const handleImageClick = (imageUrl) => {
    setZoomedImage(imageUrl);
  };

  const getVoteIcon = (type) => {
    switch(type) {
      case 'authentic': return <ShieldCheck className="w-5 h-5 text-green-600" />;
      case 'suspicious': return <AlertCircle className="w-5 h-5 text-yellow-600" />; // Changed icon
      case 'counterfeit': return <ShieldX className="w-5 h-5 text-red-600" />;
      default: return null;
    }
  };

  const getVoteBadgeColor = (type) => {
    switch(type) {
      case 'authentic': return 'bg-green-100 text-green-800 border-green-300';
      case 'suspicious': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'counterfeit': return 'bg-red-100 text-red-800 border-red-300';
      default: return '';
    }
  };

  const getAuthenticityColor = (score) => {
    if (score >= 80) return "text-green-600 bg-green-50 border-green-200";
    if (score >= 60) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const currentRoleColor = (() => {
    switch (user?.current_role) {
      case 'auditor':
        return '#8B5CF6';
      case 'collector':
        return '#EF4444';
      case 'vendor':
        return '#10B981';
      default:
        return '#3B82F6';
    }
  })();

  const authenticVotes = votes.filter(v => v.vote_type === "authentic").length;
  const suspiciousVotes = votes.filter(v => v.vote_type === "suspicious").length;
  const counterfeitVotes = votes.filter(v => v.vote_type === "counterfeit").length;
  const totalVotes = votes.length;

  const { data: userLike } = useQuery({
    queryKey: ['user-like', itemId, user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const likes = await base44.entities.ItemLike.filter({ item_id: itemId, user_email: user.email });
      return likes[0] || null;
    },
    enabled: !!itemId && !!user?.email,
  });

  const toggleLikeMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Must be logged in");
      const currentLikeCount = item.like_count || 0;
      if (userLike) {
        await base44.entities.ItemLike.delete(userLike.id);
        const newCount = Math.max(0, currentLikeCount - 1);
        const rankUpdate = await updateMarketplaceRanking({ ...item, like_count: newCount });
        await base44.entities.Item.update(item.id, { like_count: newCount, ...rankUpdate });
      } else {
        await base44.entities.ItemLike.create({ item_id: item.id, user_email: user.email });
        const newCount = currentLikeCount + 1;
        const rankUpdate = await updateMarketplaceRanking({ ...item, like_count: newCount });
        await base44.entities.Item.update(item.id, { like_count: newCount, ...rankUpdate });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item', itemId] });
      queryClient.invalidateQueries({ queryKey: ['user-like', itemId, user?.email] });
    },
  });

  // New flags for item status
  const isOwnItem = user?.email === item?.vendor_email;
  const isSold = item?.status === 'sold';
  const isDraft = item?.status === 'draft';
  const isArtistLocked = item?.artist_account_required_for_publish;
  
  const isEducationalItem = item?.is_educational_display_item;
  const hasUserClaimedEducational = isEducationalItem && isSold && item.buyer_email === user?.email;
  const canClaimEducational = isEducationalItem && !hasUserClaimedEducational && (item.quantity === null || item.quantity > 0);

  if (itemLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-muted-foreground">Loading item details...</p>
        </div>
      </div>
    );
  }

  if (!item) { // No need for extra check for item after `if (!item)`
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-2">Item not found</h2>
          <p className="text-gray-600 dark:text-muted-foreground mb-4">This item doesn't exist or has been removed.</p>
          <Link to={createPageUrl("Marketplace")}>
            <Button>Back to Marketplace</Button>
          </Link>
        </div>
      </div>
    );
  }

  const avgReviewRating = vendor && vendor.vendor_total_reviews > 0 
    ? (vendor.vendor_positive_reviews / vendor.vendor_total_reviews) * 5 
    : 0;

  const verdictColor = 
    item.authenticity_meter >= 80 ? "text-green-600 bg-green-50 border-green-200" :
    item.authenticity_meter >= 60 ? "text-yellow-600 bg-yellow-50 border-yellow-200" :
    "text-red-600 bg-red-50 border-red-200";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-600 dark:text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back
          </button>
        </div>

        {/* Artist Lock Banner */}
        {isArtistLocked && isOwnItem && (
          <div className="mb-6 bg-gradient-to-r from-pink-50 dark:from-pink-950/30 to-rose-50 dark:to-rose-950/30 border border-pink-200 dark:border-pink-900/50 rounded-xl p-4 flex items-start gap-4">
            <div className="p-2 bg-white rounded-full shadow-sm border border-pink-100">
              <Palette className="w-6 h-6 text-pink-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-pink-900 mb-1">Artist Account Required</h3>
              <p className="text-pink-800 text-sm mb-3">
                This item is currently a <strong>Draft</strong> and is not visible to the public. 
                To publish your original artwork, you must upgrade to an Artist Account.
              </p>
              <Button 
                onClick={() => window.location.href = "/Settings"} 
                className="bg-pink-600 hover:bg-pink-700 text-white border-0"
              >
                Apply for Artist Account
              </Button>
            </div>
          </div>
        )}

        {/* Mobile-only: Title + Tags shown ABOVE image */}
        <div className="lg:hidden mb-4">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-foreground leading-snug mb-2">
            {item.title}
          </h1>
          {item.is_educational_display_item ? (
            <div className="flex items-center gap-1 mb-2">
              <Gift className="w-4 h-4 text-green-600" />
              <span className="text-xl font-bold text-green-600">FREE</span>
            </div>
          ) : item.price ? (
            <div className="flex items-center gap-1 mb-2">
              <DollarSign className="w-4 h-4 text-gray-600" />
              <span className="text-xl font-bold text-gray-900">${item.price.toLocaleString()}</span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
            {isSold && <Badge className="bg-red-600 text-white text-xs flex items-center gap-1"><Package className="w-3 h-3" />SOLD</Badge>}
            {isEducationalItem && <Badge className="bg-purple-600 text-white text-xs flex items-center gap-1"><GraduationCap className="w-3 h-3" />Educational</Badge>}
            {item.grade_status && <span className="text-xs text-gray-600 capitalize">{item.grade_status.replace(/_/g, ' ')}</span>}
            {item.signer && (
              <span className="text-xs font-medium text-gray-700">{item.signer}</span>
            )}
            {item.team && (
              <span className="text-xs font-medium text-gray-700">{item.team}</span>
            )}
            {item.year && (
              <span className="text-xs font-medium text-gray-700">{item.year}</span>
            )}
            {item.sport && <span className="text-xs text-gray-600 capitalize">{item.sport}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 mb-6 sm:mb-8">
          {/* Left Column: Images */}
          <div>
            <Card className="overflow-hidden group mb-4 dark:bg-card">
              <div 
                className="aspect-square bg-gray-100 dark:bg-muted relative cursor-pointer overflow-hidden"
                onClick={() => handleImageClick(item.images?.[selectedImage])}
              >
                {item.images && item.images[selectedImage] ? (
                  <img 
                    src={item.images[selectedImage]} 
                    alt={item.title}
                    className="w-full h-full object-contain select-none"
                    draggable="false"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Star className="w-24 h-24 text-gray-300" />
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                  <div className="bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                    <ZoomIn className="w-5 h-5 text-gray-700" />
                    <span className="text-sm font-medium text-gray-700">Click to zoom & inspect</span>
                  </div>
                </div>
                
                <div className="absolute top-4 right-4">
                  <Badge 
                    className={`${getAuthenticityColor(item.authenticity_meter)} border-2 text-lg px-4 py-2 flex items-center gap-2 shadow-lg`}
                  >
                    <ShieldCheck className="w-5 h-5" />
                    {item.authenticity_meter}%
                  </Badge>
                </div>
              </div>
            </Card>

            {item.images && item.images.length > 1 && (
              <div className="grid grid-cols-4 gap-3">
                {item.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(idx)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      selectedImage === idx ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <img src={img} alt={`View ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            
          </div>

          {/* Right Column: Item Details */}
          <div className="space-y-6">
            <div>
              <div className="hidden lg:flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h1 className="text-xl lg:text-2xl font-semibold text-gray-900 dark:text-foreground mb-2 leading-snug">
                    {item.title}
                  </h1>
                  {item.is_educational_display_item ? (
                    <div className="flex items-center gap-2">
                      <Gift className="w-6 h-6 text-green-600" />
                      <span className="text-3xl sm:text-4xl font-bold text-green-600">FREE</span>
                    </div>
                  ) : item.price ? (
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-6 h-6 text-gray-600 dark:text-muted-foreground" />
                      <span className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-foreground">
                        ${item.price.toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                </div>
                <SocialShareButtons item={item} />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full text-gray-500 hover:text-red-600 ml-2"
                  onClick={() => setShowReportDialog(true)}
                  title="Report Item"
                >
                  <Flag className="w-5 h-5" />
                </Button>
              </div>

              <div className="hidden lg:flex flex-wrap gap-2 mb-6">
                {isSold && <Badge className="bg-red-600 text-white flex items-center gap-1"><Package className="w-3 h-3" />SOLD</Badge>}
                {isEducationalItem && <Badge className="bg-purple-600 text-white flex items-center gap-1"><GraduationCap className="w-3 h-3" />Educational Sample</Badge>}
                {item.grade_status && <Badge variant="outline" className="capitalize text-sm">{item.grade_status.replace(/_/g, ' ')}</Badge>}
                {item.signer && <Badge variant="outline" className="text-sm capitalize">{item.signer}</Badge>}
                {item.team && <Badge variant="outline" className="text-sm capitalize">{item.team}</Badge>}
                {item.year && <Badge variant="outline" className="text-sm capitalize">{item.year}</Badge>}
                {item.sport && <Badge variant="outline" className="text-sm capitalize">{item.sport}</Badge>}
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {item.views || 0}
                </span>
                {user && !isOwnItem && (
                  <button
                    onClick={() => toggleLikeMutation.mutate()}
                    disabled={toggleLikeMutation.isPending}
                    className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                    title={userLike ? "Unlike" : "Like"}
                  >
                    <ThumbsUp className={`w-4 h-4 ${userLike ? 'fill-blue-600 text-blue-600' : ''}`} />
                    <span>{item.like_count || 0}</span>
                  </button>
                )}
                <div className="flex items-center gap-1 ml-auto lg:hidden">
                  <SocialShareButtons item={item} />
                  <Button variant="ghost" size="icon" className="rounded-full text-gray-400 hover:text-red-600 h-8 w-8" onClick={() => setShowReportDialog(true)}>
                    <Flag className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <CredibilityMeter
              item={item}
              totalVotes={totalVotes}
              authenticVotes={authenticVotes}
            />

            {/* Auction Interface */}
            {auction && !isSold && (
              <Card className="border-2 border-purple-200 bg-purple-50/30 mb-6">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="flex items-center gap-2 text-purple-900">
                      <Gavel className="w-5 h-5" />
                      Live Auction
                    </CardTitle>
                    <Badge className="bg-purple-600 hover:bg-purple-700 flex items-center gap-1">
                      <Timer className="w-3 h-3" />
                      Ends {new Date(auction.end_time).toLocaleDateString()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2 mb-6">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Current Bid</p>
                      <p className="text-3xl font-bold text-gray-900">
                        ${auction.current_bid.toLocaleString()}
                      </p>
                    </div>
                    <div className="mb-1">
                      <span className="text-sm text-gray-500">
                        ({auction.bid_count || 0} bids)
                      </span>
                    </div>
                  </div>

                  {!isOwnItem && (
                    <Button 
                      onClick={() => setShowBidDialog(true)}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white text-lg py-6 mb-3"
                    >
                      Place Bid
                    </Button>
                  )}
                  
                  {isOwnItem && (
                    <div className="bg-white p-3 rounded border border-gray-200 text-center text-sm text-gray-600">
                      You cannot bid on your own item
                    </div>
                  )}

                  {auction.highest_bidder_email === user?.email && (
                    <p className="text-center text-sm text-green-600 font-medium mt-2">
                      🎉 You are the highest bidder!
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {isOwnItem && !isSold && !isDraft && !auction && (
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 bg-blue-50 border-2 border-blue-200 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-6 h-6 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-900">You listed this item</span>
                  </div>
                </div>
                <Button
                  onClick={() => navigate(createPageUrl(`EditListing?id=${item.id}`))}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-lg py-6"
                >
                  <Edit2 className="w-5 h-5 mr-2" />
                  Edit Listing
                </Button>
              </div>
            )}

            {!isOwnItem && !isSold && !isDraft && !auction && ( // Condition for action buttons (non-auction)
              <div className="flex flex-col sm:flex-row gap-3">
                {canClaimEducational ? (
                  <Button
                    onClick={() => claimEducationalItemMutation.mutate()}
                    disabled={claimEducationalItemMutation.isPending}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-lg py-6"
                  >
                    <Trophy className="w-5 h-5 mr-2" />
                    {claimEducationalItemMutation.isPending ? "Claiming..." : "Claim Free Educational Sample"}
                  </Button>
                ) : (
                  <Button
                    onClick={handlePurchaseClick}
                    className={`flex-1 text-lg py-6 ${
                        item.import_source && !existingRequest 
                        ? "bg-orange-600 hover:bg-orange-700" 
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {item.import_source && !existingRequest ? (
                        <>
                          <ClipboardList className="w-5 h-5 mr-2" />
                          Request Availability
                        </>
                    ) : item.import_source && existingRequest?.status === 'pending' ? (
                        <>
                          <Timer className="w-5 h-5 mr-2" />
                          Request Pending
                        </>
                    ) : (
                        <>
                          <DollarSign className="w-5 h-5 mr-2" />
                          Purchase Item
                        </>
                    )}
                  </Button>
                )}
                <Button
                  onClick={() => navigate(`${createPageUrl('Messages')}?startConversation=${encodeURIComponent(vendor.email)}&name=${encodeURIComponent(vendor.full_name || vendor.email)}&type=item_inquiry&itemId=${item.id}`)}
                  variant="outline"
                  className="flex-1 text-lg py-6"
                  >
                  <Mail className="w-5 h-5 mr-2" />
                  Message Vendor About This Item
                  </Button>
              </div>
            )}

            {isSold && (
              <div className="bg-red-500 text-white rounded-lg p-4 text-center">
                <p className="font-bold text-lg mb-1">🔴 SOLD</p>
                <p className="text-sm text-red-100">
                  This item has been purchased{item.buyer_email === user?.email ? " by you" : ""}.
                </p>
              </div>
            )}

            {(!userVote && !isOwnItem && item?.status !== 'sold') && (
              <Button
                onClick={() => setShowVoteDialog(true)}
                className="w-full bg-green-600 hover:bg-green-700 text-white text-lg py-6"
              >
                <ShieldCheck className="w-5 h-5 mr-2" />
                Submit Your Expert Review
              </Button>
            )}
            {userVote && (
              <Button variant="outline" className="w-full text-lg py-6" disabled>
                <ShieldCheck className="w-5 h-5 mr-2" />
                You've Reviewed This Item
              </Button>
            )}

            <ItemDescription description={item.description} />

            {vendor && (
              <Card className="bg-gradient-to-br from-blue-50 dark:from-blue-950/20 via-purple-50 dark:via-purple-950/20 to-pink-50 dark:to-pink-950/20 border-2 border-blue-200 dark:border-blue-900/50 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-blue-900 dark:text-blue-300">
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5" />
                      Seller Information
                    </div>
                    {!isOwnItem && user && (
                      <Button
                        onClick={() => followVendorMutation.mutate()}
                        disabled={followVendorMutation.isPending}
                        variant={isFollowingVendor ? "outline" : "default"}
                        size="sm"
                        className={`flex-none ${!isFollowingVendor ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                      >
                        {isFollowingVendor ? (
                          <>
                            <UserCheck className="w-4 h-4 mr-1" />
                            Following
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-4 h-4 mr-1" />
                            Follow
                          </>
                        )}
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                    <Link to={createPageUrl(`VendorProfile?email=${vendor.email}`)} className="flex items-center gap-4 flex-1">
                      <Avatar className="w-16 h-16 sm:w-20 sm:h-20 ring-4 ring-blue-300 ring-offset-2 flex-shrink-0">
                        <AvatarImage src={vendor.avatar_url} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl">
                          {(vendor.full_name || vendor.email || 'V')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-muted-foreground mb-1">
                           {item?.is_educational_display_item ? "Presented by" : "Sold by"}
                         </p>
                         <h3 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-foreground mb-2 truncate">
                           {vendor.full_name || vendor.email?.split('@')[0]}
                         </h3>
                        
                        <div className="flex flex-wrap gap-2 mb-2">
                          <Badge className="bg-blue-600 text-white flex items-center gap-1 text-xs">
                            <ShieldCheck className="w-3 h-3" />
                            {vendor.vendor_credibility || 50}% Credibility
                          </Badge>
                          
                          {vendor.vendor_total_reviews > 0 && (
                            <Badge variant="outline" className="flex items-center gap-1 text-xs">
                              <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                              {avgReviewRating.toFixed(1)} ({vendor.vendor_total_reviews})
                            </Badge>
                          )}
                          
                          {vendor.vendor_total_sales > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {vendor.vendor_total_sales} sales
                            </Badge>
                          )}
                        </div>
                        
                        {vendor.location && (
                          <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {vendor.location}
                          </p>
                        )}
                      </div>
                    </Link>
                  </div>
                  {vendorItems && vendorItems.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-blue-100 dark:border-blue-900/50">
                      <p className="text-sm font-semibold text-gray-900 dark:text-foreground mb-3">Other items from {vendor?.full_name || 'this seller'}</p>
                      <div className="grid grid-cols-2 gap-3">
                        {vendorItems.map((vendorItem) => (
                          <Link
                            key={vendorItem.id}
                            to={createPageUrl(`ItemDetails?id=${vendorItem.id}`)}
                            className="group"
                          >
                            <Card className="overflow-hidden hover:shadow-lg transition-all dark:bg-card">
                               <div className="aspect-square bg-gray-100 dark:bg-muted relative overflow-hidden">
                                {vendorItem.images?.[0] ? (
                                  <img 
                                    src={vendorItem.images[0]} 
                                    alt={vendorItem.title}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Star className="w-8 h-8 text-gray-300" />
                                  </div>
                                )}
                                <div className="absolute top-2 right-2">
                                  <Badge className="bg-white/90 text-gray-900 text-xs">
                                    {vendorItem.authenticity_meter}%
                                  </Badge>
                                </div>
                              </div>
                              <CardContent className="p-3">
                                <h4 className="font-medium text-xs sm:text-sm text-gray-900 dark:text-foreground line-clamp-2 mb-2">
                                  {vendorItem.title}
                                </h4>
                                {vendorItem.price && (
                                  <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-foreground">
                                    ${vendorItem.price.toLocaleString()}
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Comments Section - NEW */}
        <div className="max-w-4xl mx-auto mb-8">
          <ItemComments itemId={itemId} user={user} />
        </div>

      </div>



      {/* Vote Dialog - Refactored based on outline */}
      <Dialog open={showVoteDialog} onOpenChange={setShowVoteDialog}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-orange-600" />
              Submit Your Expert Review
            </DialogTitle>
            <DialogDescription>
              Your expert opinion helps build trust in the community.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {item?.certificate_id && !item?.is_educational_display_item && (
             <div className="bg-gradient-to-br from-orange-50 dark:from-orange-950/30 to-yellow-50 dark:to-yellow-950/30 border-2 border-orange-300 dark:border-orange-900/50 rounded-xl p-5">
               <div className="flex items-start gap-3">
                 <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center flex-shrink-0">
                   <ShieldCheck className="w-5 h-5 text-white" />
                 </div>
                 <div className="flex-1">
                   <h4 className="font-bold text-orange-900 dark:text-orange-300 mb-2">🎯 Auditor's Primary Task:</h4>
                   <p className="text-sm text-orange-800 dark:text-orange-200 mb-3">
                      <strong>Match the seal on the item image(s) to the certificate number below.</strong> Click images to zoom and inspect the seal closely.
                    </p>
                    <div className="bg-white dark:bg-card rounded-lg p-3 border-2 border-orange-200 dark:border-orange-900/50">
                      <p className="text-xs text-orange-700 dark:text-orange-300 font-medium mb-1">Certificate ID:</p>
                      <p className="font-mono text-lg text-orange-900 dark:text-orange-200 font-bold">
                        {item.certificate_id}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {item?.images && item.images.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-3">
                    Item Images - Click to Zoom & Inspect{item?.is_educational_display_item ? "" : " Seal"}
                  </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {item.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleImageClick(img)}
                      className="aspect-square rounded-lg overflow-hidden border-2 border-gray-300 dark:border-gray-600 hover:border-orange-500 dark:hover:border-orange-500 transition-all group relative"
                    >
                      <img src={img} alt={`Item view ${idx + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="bg-white/90 rounded-full p-2">
                          <ZoomIn className="w-5 h-5 text-gray-900" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  💡 Click any image to open full-screen zoom and inspect the details
                </p>
              </div>
            )}

            {item?.coa_certificates && item.coa_certificates.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-3">
                  Certificate of Authenticity Documents
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {item.coa_certificates.map((cert, idx) => (
                    <a
                      key={idx}
                      href={cert}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-video rounded-lg overflow-hidden border-2 border-orange-200 hover:border-orange-400 transition-all group relative"
                    >
                      <img src={cert} alt={`COA ${idx + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center">
                        <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-3">
                Your Verdict
              </label>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant={voteType === 'authentic' ? 'default' : 'outline'}
                  className={voteType === 'authentic' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
                  onClick={() => setVoteType('authentic')}
                >
                  <ThumbsUp className="w-5 h-5 mr-2" />
                  Authentic
                </Button>
                <Button
                  variant={voteType === 'suspicious' ? 'default' : 'outline'}
                  className={voteType === 'suspicious' ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : ''}
                  onClick={() => setVoteType('suspicious')}
                >
                  <AlertCircle className="w-5 h-5 mr-2" />
                  Suspicious
                </Button>
                <Button
                  variant={voteType === 'counterfeit' ? 'default' : 'outline'}
                  className={voteType === 'counterfeit' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
                  onClick={() => setVoteType('counterfeit')}
                >
                  <ThumbsDown className="w-5 h-5 mr-2" />
                  Counterfeit
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-2">
                Confidence Level: {(voteConfidence * 100).toFixed(0)}%
              </label>
              <Select value={voteConfidence.toString()} onValueChange={(val) => setVoteConfidence(parseFloat(val))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">100% - Absolutely certain</SelectItem>
                  <SelectItem value="0.9">90% - Very confident</SelectItem>
                  <SelectItem value="0.8">80% - Confident</SelectItem>
                  <SelectItem value="0.7">70% - Fairly sure</SelectItem>
                  <SelectItem value="0.6">60% - Somewhat sure</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-2">
                Your Expert Opinion
              </label>
              <Textarea
                value={voteComment}
                onChange={(e) => setVoteComment(e.target.value)}
                placeholder="Share your reasoning and expertise... What details support your verdict?"
                rows={5}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowVoteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVoteSubmit}
              disabled={!voteType || submitVoteMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {submitVoteMutation.isPending ? "Submitting..." : "Submit Review (+5 XP)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bid Dialog */}
      <Dialog open={showBidDialog} onOpenChange={setShowBidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place a Bid</DialogTitle>
            <DialogDescription>
              Current highest bid is ${auction?.current_bid?.toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
             <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-2">
               Your Bid Amount
             </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                className="w-full pl-8 p-2 border border-gray-300 rounded-md"
                placeholder={`${(auction?.current_bid || 0) + 1}`}
                min={(auction?.current_bid || 0) + 1}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Enter ${((auction?.current_bid || 0) + 1).toLocaleString()} or more
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBidDialog(false)}>Cancel</Button>
            <Button 
              onClick={() => placeBidMutation.mutate(bidAmount)}
              disabled={!bidAmount || parseFloat(bidAmount) <= (auction?.current_bid || 0) || placeBidMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {placeBidMutation.isPending ? "Placing Bid..." : "Confirm Bid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guest Purchase Dialog */}
      <Dialog open={showGuestPurchaseDialog} onOpenChange={setShowGuestPurchaseDialog}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <div className="mx-auto bg-blue-100 rounded-full p-3 w-16 h-16 flex items-center justify-center mb-4">
              <UserPlus className="w-8 h-8 text-blue-600" />
            </div>
            <DialogTitle className="text-xl text-center">Join Credabilia Today!</DialogTitle>
            <DialogDescription className="text-center pt-2">
              Sign up today to keep track of important information like tracking, order history, and earn rewards!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
             <div className="grid gap-4">
               <div className="flex items-center gap-3 bg-gray-50 dark:bg-muted p-3 rounded-lg">
                <Package className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium">Track your orders in real-time</span>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                <Trophy className="w-5 h-5 text-orange-600" />
                <span className="text-sm font-medium">Earn XP and rewards with every purchase</span>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg">
                <ShieldCheck className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium">Secure transactions & buyer protection</span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-lg py-6"
              onClick={() => navigate(`/SignIn?returnUrl=${encodeURIComponent(location.pathname + location.search)}`)}
            >
              Sign Up / Log In
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => setShowGuestPurchaseDialog(false)}
              className="w-full text-gray-500"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase Dialog - powered by StripeCheckoutDialog */}
      {!item?.is_educational_display_item && (
        <StripeCheckoutDialog
          open={showPurchaseDialog}
          onOpenChange={setShowPurchaseDialog}
          item={item}
          onSuccess={handleStripeSuccess}
        />
      )}

      {/* Image Zoom Dialog */}
      <AnimatePresence>
        {zoomedImage && (
          <ImageZoomDialog 
            imageUrl={zoomedImage}
            isOpen={!!zoomedImage}
            onClose={() => setZoomedImage(null)}
          />
        )}
      </AnimatePresence>

      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                    <ShieldAlert className="w-5 h-5" />
                    Report Item
                </DialogTitle>
                <DialogDescription>
                    Help us keep the marketplace safe. Why are you reporting this item?
                </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>Reason</Label>
                    <Select value={reportReason} onValueChange={setReportReason}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select a reason" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="counterfeit">Counterfeit / Fake Item</SelectItem>
                            <SelectItem value="inappropriate">Inappropriate Content</SelectItem>
                            <SelectItem value="misleading">Misleading Description</SelectItem>
                            <SelectItem value="spam">Spam / Scam</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                
                <div className="space-y-2">
                    <Label>Additional Details</Label>
                    <Textarea 
                        placeholder="Please provide more context..."
                        value={reportDetails}
                        onChange={(e) => setReportDetails(e.target.value)}
                        rows={4}
                    />
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" onClick={() => setShowReportDialog(false)}>Cancel</Button>
                <Button 
                    variant="destructive" 
                    onClick={() => reportItemMutation.mutate()}
                    disabled={!reportReason || reportItemMutation.isPending}
                >
                    {reportItemMutation.isPending ? "Submitting..." : "Submit Report"}
                </Button>
            </DialogFooter>
            </DialogContent>
            </Dialog>

            {/* Request Dialog */}
            <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
            <DialogContent>
              <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-orange-600">
                      <ShieldAlert className="w-5 h-5" />
                      High Demand Item Check
                  </DialogTitle>
                  <DialogDescription>
                      This item is imported from an external collection and may be in high demand.
                      We need to verify its availability with the vendor before processing your purchase.
                  </DialogDescription>
              </DialogHeader>

              <div className="py-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg p-4 border border-orange-200 dark:border-orange-900/50">
                   <h4 className="font-semibold text-orange-900 dark:text-orange-300 mb-2">How it works:</h4>
                   <ol className="list-decimal list-inside text-sm text-orange-800 dark:text-orange-200 space-y-1">
                      <li>You submit an availability request.</li>
                      <li>The vendor receives an immediate notification.</li>
                      <li>Once approved (usually within 24h), you'll receive a link to complete the purchase.</li>
                  </ol>
              </div>

              <DialogFooter>
                  <Button variant="outline" onClick={() => setShowRequestDialog(false)}>Cancel</Button>
                  <Button 
                      onClick={() => requestAvailabilityMutation.mutate()}
                      disabled={requestAvailabilityMutation.isPending}
                      className="bg-orange-600 hover:bg-orange-700 text-white"
                  >
                      {requestAvailabilityMutation.isPending ? "Sending Request..." : "Send Request to Vendor"}
                  </Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
            </div>
            );
            }