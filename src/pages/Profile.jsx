import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Award,
  Star,
  Package,
  MessageSquare,
  Users,
  User,
  Mail,
  Trophy,
  ArrowLeft,
  UserPlus,
  UserCheck,
  Crown,
  ShieldCheck,
  Send,
  Loader2,
  Sparkles,
  AlertCircle,
  LogIn,
  Share2,
  Camera,
  Edit,
  Store,
  Palette,
  Eye,
  ShoppingBag,
  BarChart3,
  MapPin,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import ImageCropper from "../components/ImageCropper";
import KingCredionAnnouncement from "../components/KingCredionAnnouncement";
import DailyNewsSection from "../components/DailyNewsSection";
import ProfileItemCard from "../components/ProfileItemCard";
import ShopDashboard from "../components/ShopDashboard";
import ProfileItemGrid from "../components/ProfileItemGrid";
import RequestCommissionDialog from "../components/RequestCommissionDialog";
import ReviewsSection from "../components/ReviewsSection";
import StorefrontFeaturedSection from "../components/StorefrontFeaturedSection";
import StorefrontAboutSection from "../components/StorefrontAboutSection";
import ProfileEditMode from "../components/ProfileEditMode";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const KING_CREDION_EMAIL = "davyartiz@gmail.com";

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const ITEMS_PER_PAGE = 20;

const CATEGORY_STRUCTURE = {
  sports: {
    label: "Sports Memorabilia",
    subCategories: ["baseball", "basketball", "football", "hockey", "boxing", "soccer", "golf", "tennis"]
  },
  entertainment: {
    label: "Entertainment",
    subCategories: ["movies", "tv_shows", "music", "theater"]
  },
  historical: {
    label: "Historical",
    subCategories: ["political", "military", "space", "aviation"]
  },
  comics: {
    label: "Comics & Pop Culture",
    subCategories: ["comic_books", "toys", "video_games", "anime"]
  }
};

export default function Profile() {
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const viewingEmail = urlParams.get("email");
  
  const [user, setUser] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editedUser, setEditedUser] = useState({});
  const [usernameError, setUsernameError] = useState("");
  const [geolocating, setGeolocating] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);


  const [activeTab, setActiveTab] = useState("items");
  
  const [newInterest, setNewInterest] = useState("");
  const [showCommissionDialog, setShowCommissionDialog] = useState(false);
  const tabsRef = useRef(null);
  
  const queryClient = useQueryClient();

  const COMMON_INTERESTS = [
    "Baseball", "Basketball", "Football", "Hockey", "Soccer",
    "Movies", "TV Shows", "Music", "Comics", "Fine Art",
    "History", "Space", "Military", "Politics", "Gaming",
    "Anime", "Toys", "Trading Cards"
  ];

  const handleAddInterest = (tag) => {
    const currentTags = editedUser.interests_tags || [];
    if (!currentTags.includes(tag) && tag.trim()) {
      setEditedUser({
        ...editedUser,
        interests_tags: [...currentTags, tag.trim()]
      });
    }
    setNewInterest("");
  };

  const handleRemoveInterest = (tag) => {
    const currentTags = editedUser.interests_tags || [];
    setEditedUser({
      ...editedUser,
      interests_tags: currentTags.filter(t => t !== tag)
    });
  };

  const displayUser = editedUser;

  const { data: artistProfileForMutation } = useQuery({
    queryKey: ['artist-profile-mutation', displayUser?.email],
    queryFn: async () => {
      if (!displayUser?.email) return null;
      const artists = await base44.entities.Artist.filter({ user_email: displayUser.email });
      return artists[0] || null;
    },
    enabled: !!displayUser?.email && displayUser?.user_type === 'artist',
  });

  const toggleCommissionsMutation = useMutation({
    mutationFn: async (isOpen) => {
      if (!artistProfileForMutation?.id) return;
      await base44.entities.Artist.update(artistProfileForMutation.id, { commission_open: isOpen });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist-profile'] });
      queryClient.invalidateQueries({ queryKey: ['artist-profile-mutation'] });
    }
  });

  const isOwnProfile = !!(user?.email && displayUser?.email && user.email.toLowerCase() === displayUser.email.toLowerCase());

  useEffect(() => {
    loadUser();
  }, [viewingEmail]);

  useEffect(() => {
    setActiveTab("items");
  }, []);

  useEffect(() => {
    setEditedUser({});
  }, [viewingEmail]);

  const loadUser = async () => {
    try {
      setAuthLoading(true);
      
      let currentUserData = null;
      
      try {
        currentUserData = await base44.auth.me();
        setUser(currentUserData);
        setAuthChecked(true);
      } catch {
        setUser(null); setAuthChecked(true);
      }
      
      if (viewingEmail) {
        if (currentUserData && viewingEmail.toLowerCase() === currentUserData.email?.toLowerCase()) { setEditedUser(currentUserData); } else {
          try { const all = await base44.entities.User.list(); setEditedUser(all.find(u => u.email?.toLowerCase() === viewingEmail.toLowerCase()) || null); } catch (e) { setEditedUser(null); }
        }
        setAuthChecked(true); setAuthLoading(false); return;
      }
      
      if (currentUserData) {
        setEditedUser(currentUserData);
      } else {
        setEditedUser(null);
      }
      
      setAuthLoading(false);
    } catch (error) {
      console.error("❌ Critical error loading profile:", error);
      setUser(null);
      setAuthChecked(true);
      setAuthLoading(false);
    }
  };



  const { data: followers, isLoading: followersLoading } = useQuery({
    queryKey: ['followers', displayUser?.email],
    queryFn: async () => {
      if (!displayUser?.email) return [];
      try {
        return await base44.entities.Follow.filter({ following_email: displayUser.email });
      } catch (error) {
        return [];
      }
    },
    enabled: !!displayUser?.email && authChecked,
    initialData: [],
    staleTime: 60000,
    retry: 1,
  });

  const { data: following, isLoading: followingLoading } = useQuery({
    queryKey: ['following', displayUser?.email],
    queryFn: async () => {
      if (!displayUser?.email) return [];
      try {
        return await base44.entities.Follow.filter({ follower_email: displayUser.email });
      } catch (error) {
        return [];
      }
    },
    enabled: !!displayUser?.email && authChecked,
    initialData: [],
    staleTime: 60000,
    retry: 1,
  });

  const { data: isFollowing } = useQuery({
    queryKey: ['is-following', user?.email, displayUser?.email],
    queryFn: async () => {
      if (!user?.email || !displayUser?.email || isOwnProfile) return false;
      const follows = await base44.entities.Follow.filter({
        follower_email: user.email,
        following_email: displayUser.email
      });
      return follows.length > 0;
    },
    enabled: !!user?.email && !!displayUser?.email && !isOwnProfile,
  });



  const { data: allUserItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['user-items', displayUser?.email],
    queryFn: async () => {
      if (!displayUser?.email) return [];
      return await base44.entities.Item.filter({ vendor_email: displayUser.email }, "-created_date");
    },
    enabled: !!displayUser?.email,
    initialData: [],
  });

  const { data: activeBoosts = [] } = useQuery({
    queryKey: ['active-boosts'],
    queryFn: async () => {
      const allBoosts = await base44.entities.Boost.list("-created_date");
      const now = new Date();
      return allBoosts.filter(boost => {
        if (boost.status !== 'active') return false;
        const endDate = new Date(boost.end_date);
        return endDate > now;
      });
    },
    staleTime: 120000,
  });

  const boostMap = React.useMemo(() => {
    const map = new Map();
    activeBoosts.forEach(boost => map.set(boost.item_id, boost));
    return map;
  }, [activeBoosts]);

  const { data: vendors = {} } = useQuery({
    queryKey: ['item-vendors', allUserItems.length],
    queryFn: async () => {
      if (allUserItems.length === 0) return {};
      const vendorEmails = [...new Set(allUserItems.map(i => i.vendor_email))].filter(Boolean);
      const vendorData = await Promise.all(
        vendorEmails.map(email => 
          base44.entities.User.filter({ email }).then(users => users[0])
        )
      );
      return vendorData.reduce((acc, vendor) => {
        if (vendor) acc[vendor.email] = vendor;
        return acc;
      }, {});
    },
    enabled: allUserItems.length > 0,
    staleTime: 300000,
  });

  const { data: collectionItems } = useQuery({
    queryKey: ['user-collection', displayUser?.email],
    queryFn: async () => {
      if (!displayUser?.email) return [];
      return await base44.entities.Item.filter({ 
        buyer_email: displayUser.email,
        status: "sold"
      }, "-updated_date");
    },
    enabled: !!displayUser?.email && isOwnProfile,
    initialData: [],
  });

  const { data: userCredits } = useQuery({
    queryKey: ['user-credits', displayUser?.email],
    queryFn: async () => {
      if (!displayUser?.email) return null;
      const credits = await base44.entities.CouncilCredit.filter({ user_email: displayUser.email });
      return credits[0] || null;
    },
    enabled: !!displayUser?.email,
  });

  const { data: myFrameShop, refetch: refetchMyShop } = useQuery({
    queryKey: ['my-frame-shop', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const shops = await base44.entities.FrameShop.filter({ user_email: user.email });
      return shops[0] || null;
    },
    enabled: !!user?.email && (user?.user_type === 'picture_frame_shop' || !!user?.frame_shop_id),
  });

  const { data: artistProfile } = useQuery({
    queryKey: ['artist-profile', displayUser?.email],
    queryFn: async () => {
      if (!displayUser?.email) return null;
      // Prefer fetching by ID if linked, otherwise fallback to email (handles duplicates better)
      if (displayUser.artist_id) {
        try {
          const artists = await base44.entities.Artist.filter({ id: displayUser.artist_id });
          if (artists[0]) {
             // Ensure array fields are safe
             return {
               ...artists[0],
               specialties: Array.isArray(artists[0].specialties) ? artists[0].specialties : []
             };
          }
        } catch { /* fallback to email lookup below */ }
      }
      
      const artists = await base44.entities.Artist.filter({ user_email: displayUser.email });
      const artist = artists[0] || null;
      if (artist) {
         // Ensure array fields are safe
         return {
           ...artist,
           specialties: Array.isArray(artist.specialties) ? artist.specialties : []
         };
      }
      return null;
    },
    enabled: !!displayUser?.email && (displayUser?.user_type === 'artist' || !!displayUser?.artist_id),
  });

  const updateShopPortfolioMutation = useMutation({
    mutationFn: async (newImages) => {
      if (!myFrameShop) throw new Error("Shop not found");
      await base44.entities.FrameShop.update(myFrameShop.id, {
        portfolio_images: newImages
      });
    },
    onSuccess: () => {
      refetchMyShop();
      alert("Portfolio updated successfully!");
    }
  });

  const handleShopImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !myFrameShop) return;

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const currentImages = myFrameShop.portfolio_images || [];
      updateShopPortfolioMutation.mutate([...currentImages, file_url]);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload image");
    }
  };

  const handleDeleteShopImage = (imgUrl) => {
    if (!myFrameShop) return;
    if (confirm("Are you sure you want to remove this image?")) {
      const currentImages = myFrameShop.portfolio_images || [];
      const newImages = currentImages.filter(img => img !== imgUrl);
      updateShopPortfolioMutation.mutate(newImages);
    }
  };

  const { data: userFavorites = [] } = useQuery({
    queryKey: ['user-favorites', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Favorite.filter({ user_email: user.email });
    },
    enabled: !!user?.email,
    staleTime: 60000,
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (item) => {
      if (!user) throw new Error("User not logged in");

      const existingFavorite = userFavorites.find(fav => fav.item_id === item.id);

      if (existingFavorite) {
        await base44.entities.Favorite.delete(existingFavorite.id);
      } else {
        await base44.entities.Favorite.create({
          user_email: user.email,
          item_id: item.id,
          item_title: item.title,
          item_image_url: item.images?.[0] || null,
          item_price: item.price || null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-favorites', user?.email] });
    },
    onError: (err) => {
      console.error("Error toggling favorite:", err);
    },
  });

  const { data: favoriteItems = [] } = useQuery({
    queryKey: ['display-user-favorites', displayUser?.email],
    queryFn: async () => {
      if (!displayUser?.email) return [];
      const favorites = await base44.entities.Favorite.filter({ user_email: displayUser.email }, "-created_date");
      return favorites;
    },
    enabled: !!displayUser?.email,
    initialData: [],
  });

  const { data: pastActivity } = useQuery({
    queryKey: ['user-activity', displayUser?.email],
    queryFn: async () => {
      if (!displayUser?.email) return [];
      return await base44.entities.ActivityEvent.filter({ user_email: displayUser.email }, "-created_date", 20);
    },
    enabled: !!displayUser?.email,
    initialData: [],
  });

  const { data: userReviews = [] } = useQuery({
    queryKey: ['user-reviews-summary', displayUser?.email],
    queryFn: async () => {
      if (!displayUser?.email) return [];
      return await base44.entities.Review.filter({ vendor_email: displayUser.email });
    },
    enabled: !!displayUser?.email,
    initialData: [],
  });

  const averageRating = userReviews.length > 0
    ? (userReviews.reduce((acc, r) => acc + r.rating, 0) / userReviews.length).toFixed(1)
    : 0;

  const followMutation = useMutation({
    mutationFn: async () => {
      if (!user || !displayUser) throw new Error("Missing user data");

      if (isFollowing) {
        const follows = await base44.entities.Follow.filter({
          follower_email: user.email,
          following_email: displayUser.email
        });
        if (follows[0]) {
          await base44.entities.Follow.delete(follows[0].id);
        }
        
        if (!isKingCredionProfile) {
          await base44.entities.User.update(displayUser.id, {
            followers_count: Math.max(0, (displayUser.followers_count || 0) - 1)
          });
        }
        await base44.auth.updateMe({
          following_count: Math.max(0, (user.following_count || 0) - 1)
        });
      } else {
        await base44.entities.Follow.create({
          follower_email: user.email,
          follower_name: user.full_name || user.email,
          following_email: displayUser.email,
          following_name: displayUser.full_name || displayUser.email
        });
        
        if (!isKingCredionProfile) {
          await base44.entities.User.update(displayUser.id, {
            followers_count: (displayUser.followers_count || 0) + 1
          });
        }
        await base44.auth.updateMe({
          following_count: (user.following_count || 0) + 1
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['is-following', user?.email, displayUser?.email] });
      queryClient.invalidateQueries({ queryKey: ['followers', displayUser?.email, isKingCredionProfile] });
      queryClient.invalidateQueries({ queryKey: ['following', displayUser?.email, isKingCredionProfile] });
      loadUser();
    },
  });



  const sendMessageMutation = useMutation({
    mutationFn: async (message) => {
      if (!user || !displayUser) throw new Error("Missing user data");
      await base44.entities.Message.create({
        sender_email: user.email,
        sender_name: user.full_name || user.email,
        receiver_email: displayUser.email,
        receiver_name: displayUser.full_name || displayUser.email,
        message: message,
        item_id: null,
        item_title: null,
        item_image_url: null,
        item_price: null
      });
    },
    onSuccess: () => {
      setShowMessageDialog(false);
      setMessageText("");
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data) => {
      if (!user) throw new Error("User not logged in.");
      try {
        await base44.auth.updateMe(data);
        return data;
      } catch (error) {
        console.error("Profile update failed:", error);
        throw new Error(error.message || "Failed to update profile. Please try again.");
      }
    },
    onSuccess: async () => {
      try {
        const freshUserData = await base44.auth.me();
        setUser(freshUserData);
        setEditedUser(freshUserData);
        setEditMode(false);
        setUsernameError("");
        queryClient.invalidateQueries({ queryKey: ['profile-user'] });
        queryClient.invalidateQueries({ queryKey: ['user-items'] });
        queryClient.invalidateQueries({ queryKey: ['user-collection'] });
        alert("✅ Profile updated successfully!");
      } catch (error) {
        alert("Profile saved but failed to refresh. Please reload the page.");
      }
    },
    onError: (error) => {
      alert(`❌ Failed to save profile: ${error.message || "Unknown error"}\n\nIf this persists, please refresh and try again.`);
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file) => {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.auth.updateMe({ avatar_url: file_url });
      return file_url;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-user'] });
      loadUser();
      setUploadingAvatar(false);
    },
    onError: () => {
      setUploadingAvatar(false);
    }
  });

  const handleEditProfileClick = () => {
    if (!user) return;
    setEditedUser(user);
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setUsernameError("");
    setEditedUser(user);
  };

  const handleSaveProfile = () => {
    const updateData = {
      full_name: editedUser.full_name,
      username: editedUser.username,
      bio: editedUser.bio,
      location: editedUser.location,
      latitude: editedUser.latitude,
      longitude: editedUser.longitude,
      avatar_url: editedUser.avatar_url,
      banner_url: editedUser.banner_url
    };
    
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined || updateData[key] === null) {
        delete updateData[key];
      }
    });

    updateUserMutation.mutate(updateData);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setEditedUser(prev => ({
            ...prev,
            latitude: parseFloat(position.coords.latitude.toFixed(6)),
            longitude: parseFloat(position.coords.longitude.toFixed(6)),
        }));
        setGeolocating(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Unable to get your location.");
        setGeolocating(false);
      }
    );
  };

  const handleAvatarUpload = async (croppedFile) => {
    setUploadingAvatar(true);
    uploadAvatarMutation.mutate(croppedFile);
  };

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    sendMessageMutation.mutate(messageText);
  };

  const handleUsernameChange = (value) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setEditedUser({ ...editedUser, username: sanitized });
    setUsernameError("");
  };



  const handleStatClick = (tab) => {
    setActiveTab(tab);
    setTimeout(() => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const paginatedItems = React.useMemo(() => {
    const sortedItems = [...allUserItems].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    
    return {
      items: sortedItems.slice(0, ITEMS_PER_PAGE),
      totalPages: Math.ceil(sortedItems.length / ITEMS_PER_PAGE),
      totalItems: sortedItems.length
    };
  }, [allUserItems]);


  
  const getItemTags = (item) => {
    const tags = [];
    if (item.signer) tags.push(item.signer);
    if (item.team) tags.push(item.team);
    if (item.sport) tags.push(item.sport);
    if (item.year) tags.push(item.year.toString());
    return tags.slice(0, 4);
  };

  const isTagInInterests = (tag) => {
    if (!user?.interests_tags) return false;
    return user.interests_tags.some(t => t.toLowerCase() === tag.toLowerCase());
  };

  const handleTagInterestToggle = async (tag) => {
    if (!user) return;

    const currentInterests = user.interests_tags || [];
    const isFavorited = currentInterests.some(t => t.toLowerCase() === tag.toLowerCase());
    const newInterests = isFavorited
      ? currentInterests.filter(t => t.toLowerCase() !== tag.toLowerCase())
      : [...currentInterests, tag];

    // Optimistically update user state immediately for instant UI feedback
    setUser(prevUser => ({
      ...prevUser,
      interests_tags: newInterests
    }));

    try {
      await base44.auth.updateMe({ interests_tags: newInterests });
      queryClient.invalidateQueries({ queryKey: ['marketplace-items'] });
    } catch (error) {
      console.error("Error updating interests:", error);
      // Revert on error
      setUser(prevUser => ({
        ...prevUser,
        interests_tags: currentInterests
      }));
    }
  };

  const [previewMode, setPreviewMode] = useState(false);

  const activeListings = allUserItems.filter(item => item.status === "active");

  // Auditor data
  const { data: userVotes = [] } = useQuery({
    queryKey: ['user-votes', displayUser?.email],
    queryFn: async () => {
      if (!displayUser?.email) return [];
      return await base44.entities.Vote.filter({ voter_email: displayUser.email }, "-created_date", 50);
    },
    enabled: !!displayUser?.email,
    initialData: [],
  });

  const handleShareProfile = async () => {
    const shareUrl = window.location.href;
    const storeName = displayUser?.store_title || displayUser?.full_name || "Credabilia Store";
    const storeBio = displayUser?.store_bio || displayUser?.bio || "Check out this Credabilia storefront";

    if (navigator.share) {
      try {
        await navigator.share({ title: storeName, text: storeBio, url: shareUrl });
        return;
      } catch (error) {
        if (error.name !== 'AbortError') console.error("Share cancelled");
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Store link copied!");
    } catch (error) {
      alert("Copy failed");
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user && !isKingCredionProfile && !viewingEmail && authChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Authentication Required</h2>
            <p className="text-muted-foreground mb-6">
              Please sign in to view your profile.
            </p>
            <div className="flex flex-col gap-3">
              <Button 
                onClick={() => base44.auth.redirectToLogin(window.location.pathname)}
                className="w-full"
              >
                Sign In
              </Button>
              <Link to={createPageUrl("Marketplace")}>
                <Button variant="ghost" className="w-full">
                  Go to Marketplace
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if ((editedUser === null || editedUser?.email === 'deleted@credabilia.com') && !authLoading && authChecked && (viewingEmail || !user)) {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-foreground mb-4">Profile Not Found</h2>
                <p className="text-muted-foreground mb-6">The user profile you are looking for does not exist.</p>
                <Link to={createPageUrl("Marketplace")}><Button>Go to Marketplace</Button></Link>
            </div>
        </div>
    );
  }

  const displayFollowerCount = followersLoading ? "..." : followers.length.toLocaleString();
  const displayFollowingCount = followingLoading ? "..." : following.length.toLocaleString();

  if (!displayUser) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div></div>;

  const isFrameShopOwner = displayUser?.user_type === 'picture_frame_shop' && displayUser?.opted_into_frame_shop_profile === true;
  const isApprovedArtist = displayUser?.user_type === 'artist' && artistProfile?.status === 'active';
  const hasOptedIn = displayUser?.opted_into_artist_profile === true;
  const isArtist = isApprovedArtist && hasOptedIn;
  const isInfluencer = displayUser?.user_type === 'influencer' && displayUser?.opted_into_influencer_profile === true;
  const isInvestor = displayUser?.user_type === 'indiegogo_investor' && displayUser?.is_indiegogo_founder === true;
  const isBaseUser = !isArtist && !isFrameShopOwner && !isInfluencer && !isInvestor;

  // Auditor stats derived from votes
  const totalAudits = userVotes.length || displayUser?.total_vets || 0;
  const accurateVotes = userVotes.filter(v => v.vote_type === 'authentic').length;
  const auditorRank = displayUser?.rank || 'Bronze';

  let themeGradient = "from-blue-600 via-green-600 to-orange-600";
  let themeImage = "https://media.base44.com/images/public/690badbd56a85b130b88aa42/86dd52d2b_Photoroom_20260323_134641.png";
  let useDarkText = false; // For Artist (pink/white)
  let useInvertedFilter = false;

  if (isArtist) {
    themeGradient = "from-pink-200 via-pink-100 to-white";
    themeImage = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/d25cfa59f_Photoroom_20251216_110752.png";
    useDarkText = true;
    useInvertedFilter = false;
  } else if (isFrameShopOwner) {
    themeGradient = "from-purple-900 via-purple-700 to-indigo-800";
    themeImage = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/6da0f949c_optimizedphotoshopowner.png";
    useInvertedFilter = false;
  } else if (isInfluencer) {
    themeGradient = "from-green-600 to-orange-600";
    themeImage = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/ff3301e66_influencer.png";
    useInvertedFilter = false;
  } else if (isInvestor) {
    themeGradient = "from-yellow-500 to-orange-500";
    themeImage = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/e1bb7b419_IMG_0622.png";
    useInvertedFilter = false;
  }

  // Dynamic text classes based on role
  const headerTextColor = useDarkText ? "text-pink-950" : "text-white";
  const headerSubTextColor = useDarkText ? "text-pink-800" : "text-white/80";
  const headerBadgeBg = useDarkText ? "bg-white/50 border-pink-200 text-pink-900" : "bg-white/20 text-white hover:bg-white/30 border-none";
  const headerButtonBg = useDarkText ? "bg-white border border-pink-200 text-pink-900 hover:bg-pink-50" : "bg-white/20 hover:bg-white/30 text-white border-none";

  return (
    <div className="min-h-screen bg-background">
      {/* Preview Mode Banner */}
      {previewMode && (
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-6 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Eye className="w-4 h-4" />
            Previewing as Customer
          </div>
          <button
            onClick={() => setPreviewMode(false)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            Exit Preview
          </button>
        </div>
      )}

      {/* Hero Section */}
      <div className={`bg-gradient-to-r ${themeGradient} text-white pt-12 pb-16 px-4 relative overflow-hidden`}>
        <div className="absolute inset-0 flex items-center justify-end pr-12 opacity-10 pointer-events-none z-0">
          <img 
            src={themeImage}
            alt=""
            className="w-[600px] h-[600px] object-contain"
            style={{ filter: useInvertedFilter ? 'brightness(0) invert(1)' : 'none' }}
          />
        </div>

        {/* Profile Type Label */}
        <div className="absolute top-4 right-6 z-20">
          <div className="bg-white/20 backdrop-blur-sm border border-white/30 text-white px-3 py-1.5 rounded-full text-xs font-medium">
            {isArtist ? 'Artist Profile' : isFrameShopOwner ? 'Frame Shop Profile' : isInfluencer ? 'Influencer Profile' : isInvestor ? "Founder's Profile" : 'Marketplace Profile'}
          </div>
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          {viewingEmail && (
            <div className="mb-6">
              <Link to={createPageUrl("Marketplace")} className={`inline-flex items-center ${headerSubTextColor} hover:opacity-80 transition-colors`}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Marketplace
              </Link>
            </div>
          )}

          {isOwnProfile && !previewMode && <KingCredionAnnouncement />}

          {/* User Profile Info - Under Search Bar */}
          <div className="flex flex-col items-center text-center">
            {editMode && !previewMode ? (
              <ProfileEditMode
                user={user}
                displayUser={displayUser}
                editedUser={editedUser}
                setEditedUser={setEditedUser}
                uploadingAvatar={uploadingAvatar}
                updateUserMutation={updateUserMutation}
                handleAvatarUpload={handleAvatarUpload}
                handleCancelEdit={handleCancelEdit}
                handleSaveProfile={handleSaveProfile}
                handleAddInterest={handleAddInterest}
                handleRemoveInterest={handleRemoveInterest}
                newInterest={newInterest}
                setNewInterest={setNewInterest}
                COMMON_INTERESTS={COMMON_INTERESTS}
              />
            ) : (
              <>
                {/* Avatar */}
                <div className="relative mb-4">
                  <Avatar className="w-32 h-32 ring-4 ring-white/30 shadow-2xl">
                    <AvatarImage src={displayUser.avatar_url} className="object-cover" />
                    <AvatarFallback className="bg-white/10 text-white text-4xl">
                      {(displayUser.full_name || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {isOwnProfile && (
                    <ImageCropper onImageCropped={handleAvatarUpload} cropShape="round">
                      <div className="absolute bottom-0 right-0 bg-white text-blue-600 p-2 rounded-full cursor-pointer hover:bg-gray-100 transition-colors shadow-lg">
                        <Camera className="w-4 h-4" />
                      </div>
                    </ImageCropper>
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    </div>
                  )}
                </div>

                {/* Name & Badge */}
                <div className="flex flex-col items-center gap-1 mb-4">
                  <h1 className={`text-3xl font-bold shadow-sm ${headerTextColor}`}>
                    {displayUser.full_name || displayUser.email?.split('@')[0]}
                  </h1>
                  {/* Headline — role-specific or base user */}
                  {isBaseUser && (
                    <p className={`text-sm font-medium opacity-80 ${headerTextColor}`}>
                      Collector · Vendor · Auditor
                    </p>
                  )}
                  {displayUser.location && (
                    <p className={`text-xs flex items-center gap-1 opacity-70 ${headerTextColor}`}>
                      <MapPin className="w-3 h-3" />{displayUser.location}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
                    {displayUser.username && (
                      <Badge variant="secondary" className={headerBadgeBg}>
                        @{displayUser.username}
                      </Badge>
                    )}
                    <Badge variant="secondary" className={`${headerBadgeBg} capitalize`}>
                      <Award className="w-3 h-3 mr-1" />
                      {displayUser.rank || 'Bronze'}
                    </Badge>
                    <Badge variant="secondary" className={`${headerBadgeBg} flex items-center gap-1 cursor-pointer`} onClick={() => handleStatClick("reviews")}>
                      <Star className={`w-3 h-3 ${userReviews.length > 0 ? "fill-yellow-400 text-yellow-400" : isArtist ? "text-pink-400" : "text-white/60"}`} />
                      {userReviews.length > 0 ? averageRating : "No Ratings"} ({userReviews.length})
                    </Badge>
                  </div>
                </div>

                {/* About Me & Interests */}
                <div className="max-w-2xl mx-auto mb-8 text-center space-y-4">
                  {displayUser.bio && (
                    <div className={`${isArtist ? 'bg-white/60 text-pink-900 border-pink-200' : 'bg-white/10 text-white/90 border-white/20'} backdrop-blur-md rounded-xl p-4 border`}>
                      <h3 className={`font-semibold mb-2 flex items-center justify-center gap-2 ${isArtist ? 'text-pink-900' : 'text-white'}`}>
                        <User className="w-4 h-4" /> About Me
                      </h3>
                      <p className="text-base leading-relaxed whitespace-pre-wrap">
                        {displayUser.bio}
                      </p>
                    </div>
                  )}
                  
                  {displayUser.interests_tags && displayUser.interests_tags.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2">
                      {displayUser.interests_tags.map(tag => (
                        <Badge 
                          key={tag} 
                          variant="outline" 
                          className={`${isArtist ? 'bg-white/60 text-pink-900 border-pink-200' : 'bg-white/10 text-white border-white/30'} text-sm py-1 px-3`}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stats & Actions */}
                <div className={`flex flex-wrap items-center justify-center gap-6 mb-6 ${headerTextColor}`}>
                  <div className="text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => handleStatClick("followers")}>
                    <p className="text-2xl font-bold">{displayFollowerCount}</p>
                    <p className={`text-xs uppercase tracking-wider ${headerSubTextColor}`}>Followers</p>
                  </div>
                  <div className="text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => handleStatClick("following")}>
                    <p className="text-2xl font-bold">{displayFollowingCount}</p>
                    <p className={`text-xs uppercase tracking-wider ${headerSubTextColor}`}>Following</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold">{activeListings.length}</p>
                    <p className={`text-xs uppercase tracking-wider ${headerSubTextColor}`}>Listings</p>
                  </div>
                  {displayUser.total_vets > 0 && (
                    <div className="text-center">
                      <p className="text-2xl font-bold">{displayUser.total_vets}</p>
                      <p className={`text-xs uppercase tracking-wider ${headerSubTextColor}`}>Vets</p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap justify-center gap-3">
                  {isOwnProfile && !previewMode ? (
                    <>
                      <Button onClick={handleEditProfileClick} className={headerButtonBg}>
                        <Edit className="w-4 h-4 mr-2" /> Edit Profile
                      </Button>
                      <Button onClick={() => setPreviewMode(true)} className={headerButtonBg}>
                        <Eye className="w-4 h-4 mr-2" /> Preview Public
                      </Button>
                      <Link to={createPageUrl("Messages")}>
                        <Button className={`bg-white hover:bg-gray-100 ${isArtist ? 'text-pink-600' : 'text-blue-600'}`}>
                          <Mail className="w-4 h-4 mr-2" /> Messages
                        </Button>
                      </Link>
                      {isArtist && artistProfile && (
                        <div className="flex items-center gap-2 bg-white/50 px-3 py-2 rounded-lg border border-pink-100">
                          <span className={`text-xs font-medium ${artistProfile.commission_open ? 'text-green-600' : 'text-gray-500'}`}>
                            {artistProfile.commission_open ? 'Commissions Open' : 'Commissions Closed'}
                          </span>
                          <Switch 
                            checked={!!artistProfile.commission_open}
                            onCheckedChange={(checked) => toggleCommissionsMutation.mutate(checked)}
                            className="scale-75"
                          />
                        </div>
                      )}
                      {myFrameShop && (
                        <Link to={createPageUrl("FrameShopDashboard")}>
                          <Button className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-lg">
                            <Store className="w-4 h-4 mr-2" />
                            Shop Dashboard
                          </Button>
                        </Link>
                      )}
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={() => followMutation.mutate()}
                        disabled={followMutation.isPending}
                        className={isFollowing ? headerButtonBg : `bg-white hover:bg-gray-100 ${isArtist ? 'text-pink-600' : 'text-blue-600'}`}
                      >
                        <Users className="w-4 h-4 mr-2" />
                        {isFollowing ? "Following" : "Follow"}
                      </Button>
                      <Button onClick={() => setShowMessageDialog(true)} className="bg-green-500 hover:bg-green-600 text-white">
                        <MessageSquare className="w-4 h-4 mr-2" /> Message
                      </Button>
                      {artistProfile?.commission_open && (
                        <Button 
                          onClick={() => setShowCommissionDialog(true)} 
                          className={`bg-white hover:bg-gray-100 ${isArtist ? 'text-pink-600' : 'text-pink-600'}`}
                        >
                          <Palette className="w-4 h-4 mr-2" /> Commission
                        </Button>
                      )}
                      <Button onClick={handleShareProfile} variant="ghost" className={`${headerTextColor} hover:bg-white/20`}>
                        <Share2 className="w-4 h-4 mr-2" /> Share
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {isOwnProfile && !previewMode && userCredits && userCredits.credits_balance > 0 && (
          <Card className="mb-6 sm:mb-8 bg-gradient-to-br from-yellow-50 via-orange-50 to-yellow-50 border-2 border-yellow-400 relative overflow-hidden">
            <div className="absolute -bottom-16 -right-16 opacity-10 pointer-events-none">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/507a748cd_CredionCredittansparent.png"
                alt=""
                className="w-80 h-80 object-contain"
              />
            </div>

            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/507a748cd_CredionCredittansparent.png"
                  alt="Credion Credit"
                  className="w-8 h-8 sm:w-10 sm:h-10 object-contain"
                />
                Credion Credits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 relative">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="bg-card rounded-lg p-4 text-center border border-border">
                 <p className="text-xs text-muted-foreground mb-1">Available Balance</p>
                  <p className="text-2xl sm:text-3xl font-bold text-orange-600">
                    {userCredits.credits_balance.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    ≈ ${(userCredits.credits_balance / 100).toFixed(2)} value
                  </p>
                </div>
                <div className="bg-card rounded-lg p-4 text-center border border-border">
                 <p className="text-xs text-muted-foreground mb-1">Earned This Month</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-600">
                    +{userCredits.credits_earned_monthly.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    ≈ ${(userCredits.credits_earned_monthly / 100).toFixed(2)}
                  </p>
                </div>
                <div className="bg-card rounded-lg p-4 text-center border border-border">
                 <p className="text-xs text-muted-foreground mb-1">Total Redeemed</p>
                  <p className="text-xl sm:text-2xl font-bold text-purple-600">
                    {userCredits.credits_redeemed.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    ≈ ${(userCredits.credits_redeemed / 100).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="bg-card rounded-lg p-4 border border-border">
                <h4 className="font-semibold text-foreground mb-2 text-sm sm:text-base flex items-center gap-2">
                  <img 
                    src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/507a748cd_CredionCredittansparent.png"
                    alt="Credion Credit"
                    className="w-5 h-5 object-contain"
                  />
                  💡 About Credion Credits
                </h4>
                <ul className="text-xs sm:text-sm text-muted-foreground space-y-1">
                  <li>✓ Earned monthly as a top 10% auditor</li>
                  <li>✓ Use Credion Credits to purchase items or feature listings</li>
                  <li>✓ 100 Credion Credits = $1 purchasing power</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        <div ref={tabsRef} className="scroll-mt-24">
         <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
         <div className="overflow-x-auto mb-6 sm:mb-8 -mx-4 px-4 sm:mx-0 sm:px-0">
           <TabsList className="inline-flex w-auto min-w-full sm:flex sm:flex-wrap sm:justify-center sm:w-full gap-1 p-1 bg-muted/20 rounded-lg">
             <TabsTrigger value="items" className="text-xs sm:text-sm flex-shrink-0">
               {isArtist ? <Palette className="w-4 h-4 sm:mr-1" /> : <Package className="w-4 h-4 sm:mr-1" />}
               <span className="hidden sm:inline">For Sale</span>
             </TabsTrigger>
             {isOwnProfile && !previewMode && (
               <TabsTrigger value="collection" className="text-xs sm:text-sm flex-shrink-0">
                 <ShoppingBag className="w-4 h-4 sm:mr-1" />
                 <span className="hidden sm:inline">Collection</span>
               </TabsTrigger>
             )}
             <TabsTrigger value="credibility" className="text-xs sm:text-sm flex-shrink-0">
               <ShieldCheck className="w-4 h-4 sm:mr-1" />
               <span className="hidden sm:inline">Credibility</span>
             </TabsTrigger>
             <TabsTrigger value="featured" className="text-xs sm:text-sm flex-shrink-0">
               <Star className="w-4 h-4 sm:mr-1" />
               <span className="hidden sm:inline">Featured</span>
             </TabsTrigger>
             <TabsTrigger value="reviews" className="text-xs sm:text-sm flex-shrink-0">
               <Award className="w-4 h-4 sm:mr-1" />
               <span className="hidden sm:inline">Reviews</span>
               <span className="sm:hidden">({userReviews.length})</span>
             </TabsTrigger>
             <TabsTrigger value="about" className="text-xs sm:text-sm flex-shrink-0">
               <User className="w-4 h-4 sm:mr-1" />
               <span className="hidden sm:inline">About</span>
             </TabsTrigger>
             {isArtist && (
               <TabsTrigger value="portfolio" className="text-xs sm:text-sm flex-shrink-0 bg-pink-50 data-[state=active]:bg-pink-100 text-pink-700">
                 <Palette className="w-4 h-4 sm:mr-1" />
                 <span className="hidden sm:inline">Portfolio</span>
               </TabsTrigger>
             )}
             {isFrameShopOwner && (
               <TabsTrigger value="services" className="text-xs sm:text-sm flex-shrink-0 bg-purple-50 data-[state=active]:bg-purple-100 text-purple-700">
                 <Store className="w-4 h-4 sm:mr-1" />
                 <span className="hidden sm:inline">Services</span>
               </TabsTrigger>
             )}
           </TabsList>
         </div>



          <TabsContent value="items" className="space-y-6">
            {itemsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array(8).fill(0).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <div className="aspect-square bg-gray-200 rounded-t-lg"></div>
                    <CardContent className="p-4 space-y-3">
                      <div className="h-4 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : paginatedItems.items.length === 0 ? (
              <div className="text-center py-16 bg-card rounded-xl border border-border">
                <Package className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">No items found</h3>
              </div>
            ) : (
              <ProfileItemGrid
                items={paginatedItems.items}
                user={user}
                vendors={vendors}
                userFavorites={userFavorites}
                toggleFavoriteMutation={toggleFavoriteMutation}
                boostMap={boostMap}
                isTagInInterests={isTagInInterests}
                handleTagInterestToggle={handleTagInterestToggle}
                getItemTags={getItemTags}
                currentRoleColor={displayUser?.current_role === 'vendor' ? '#f59e0b' : '#3b82f6'}
              />
            )}
          </TabsContent>

          {/* COLLECTION TAB — own profile only */}
          <TabsContent value="collection" className="space-y-6">
            {(collectionItems || []).length === 0 ? (
              <div className="text-center py-16 bg-card rounded-xl border border-border">
                <ShoppingBag className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">No items in your collection yet</h3>
                <p className="text-muted-foreground">Items you purchase will appear here.</p>
                <Link to={createPageUrl("Marketplace")} className="mt-4 inline-block">
                  <Button className="mt-4">Browse Marketplace</Button>
                </Link>
              </div>
            ) : (
              <ProfileItemGrid
                items={collectionItems}
                user={user}
                vendors={vendors}
                userFavorites={userFavorites}
                toggleFavoriteMutation={toggleFavoriteMutation}
                boostMap={boostMap}
                isTagInInterests={isTagInInterests}
                handleTagInterestToggle={handleTagInterestToggle}
                getItemTags={getItemTags}
                currentRoleColor="#3b82f6"
              />
            )}
          </TabsContent>

          {/* CREDIBILITY TAB */}
          <TabsContent value="credibility" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card className="bg-card border-border text-center">
                <CardContent className="p-6">
                  <div className="p-3 bg-blue-500/10 rounded-full w-fit mx-auto mb-3">
                    <ShieldCheck className="w-6 h-6 text-blue-600" />
                  </div>
                  <p className="text-3xl font-bold text-foreground">{totalAudits}</p>
                  <p className="text-sm text-muted-foreground mt-1">Total Audits</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border text-center">
                <CardContent className="p-6">
                  <div className="p-3 bg-amber-500/10 rounded-full w-fit mx-auto mb-3">
                    <Trophy className="w-6 h-6 text-amber-600" />
                  </div>
                  <p className="text-3xl font-bold text-foreground capitalize">{auditorRank}</p>
                  <p className="text-sm text-muted-foreground mt-1">Auditor Rank</p>
                </CardContent>
              </Card>
              <Card className="bg-card border-border text-center">
                <CardContent className="p-6">
                  <div className="p-3 bg-green-500/10 rounded-full w-fit mx-auto mb-3">
                    <BarChart3 className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-3xl font-bold text-foreground">
                    {totalAudits > 0 ? `${Math.round((accurateVotes / totalAudits) * 100)}%` : '—'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Authentic Votes</p>
                </CardContent>
              </Card>
            </div>

            {totalAudits === 0 ? (
              <div className="text-center py-12 bg-card rounded-xl border border-border border-dashed">
                <ShieldCheck className="w-14 h-14 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No audits completed yet</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {isOwnProfile ? 'Start vetting items in the Vetting Queue to build your auditor credibility.' : 'This user hasn\'t completed any audits yet.'}
                </p>
                {isOwnProfile && (
                  <Link to={createPageUrl("VettingQueue")}>
                    <Button className="mt-2">Go to Vetting Queue</Button>
                  </Link>
                )}
              </div>
            ) : (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-blue-600" />
                    Recent Audit Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {userVotes.slice(0, 10).map((vote, i) => (
                      <div key={vote.id || i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-3">
                          <div className={`w-2.5 h-2.5 rounded-full ${vote.vote_type === 'authentic' ? 'bg-green-500' : vote.vote_type === 'suspicious' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                          <span className="text-sm text-foreground capitalize">{vote.vote_type}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(vote.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Credibility badges from existing system */}
            {(displayUser?.badges_earned?.length > 0) && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-600" />
                    Earned Badges
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {displayUser.badges_earned.map((badge, i) => (
                      <Badge key={i} className="bg-amber-500/20 text-amber-700 dark:text-amber-400 px-3 py-1">{badge}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="featured">
            <StorefrontFeaturedSection
              activeListings={activeListings}
              user={user}
              vendors={vendors}
              userFavorites={userFavorites}
              toggleFavoriteMutation={toggleFavoriteMutation}
              boostMap={boostMap}
              isTagInInterests={isTagInInterests}
              handleTagInterestToggle={handleTagInterestToggle}
              getItemTags={getItemTags}
              currentRoleColor={displayUser?.current_role === 'vendor' ? '#f59e0b' : '#3b82f6'}
              itemsLoading={itemsLoading}
            />
          </TabsContent>

          <TabsContent value="about">
            <StorefrontAboutSection
              displayUser={displayUser}
              followers={followers}
              following={following}
              userReviews={userReviews}
              activeListings={activeListings}
              isArtist={isArtist}
            />
          </TabsContent>

          {isArtist && artistProfile && (
            <TabsContent value="portfolio">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Palette className="w-5 h-5 text-pink-600" />
                      <span>Portfolio</span>
                    </div>
                    {isOwnProfile && (
                      <Link to={createPageUrl("ArtistDashboard")}>
                        <Button size="sm" className="bg-pink-600 hover:bg-pink-700">
                          Manage
                        </Button>
                      </Link>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Portfolio artworks display coming soon</p>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {isFrameShopOwner && (
            <TabsContent value="services">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Store className="w-5 h-5 text-purple-600" />
                      <span>Services</span>
                    </div>
                    {isOwnProfile && (
                      <Link to={createPageUrl("FrameShopDashboard")}>
                        <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                          Manage
                        </Button>
                      </Link>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Services list coming soon</p>
                </CardContent>
              </Card>
            </TabsContent>
          )}



          <TabsContent value="reviews">
            <ReviewsSection 
              targetEmail={displayUser?.email} 
              currentUser={user}
              title={`${displayUser?.full_name || 'User'}'s Reviews`}
            />
          </TabsContent>
          </Tabs>
          </div>
          </div>

      <Dialog open={showMessageDialog} onOpenChange={setShowMessageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Message to {displayUser?.full_name || displayUser?.email || 'User'}</DialogTitle>
            <DialogDescription>
              Send a direct message
            </DialogDescription>
          </DialogHeader>

          <div>
            <Textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type your message..."
              rows={5}
            />
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowMessageDialog(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={!messageText.trim() || sendMessageMutation.isPending}
              className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
            >
              {sendMessageMutation.isPending ? "Sending..." : "Send Message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {artistProfile && showCommissionDialog && (
        <RequestCommissionDialog 
          open={showCommissionDialog} 
          onOpenChange={setShowCommissionDialog}
          artist={artistProfile}
          user={user}
        />
      )}
    </div>
  );
}