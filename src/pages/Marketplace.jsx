import React, { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { 
  Search, 
  Filter, 
  SlidersHorizontal,
  ShieldCheck,
  TrendingUp,
  Star,
  MapPin,
  Heart,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  GraduationCap,
  Gift,
  Gavel,
  Palette,
  Trophy,
  Film,
  Landmark,
  Zap,
  Music,
  Edit2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import VendorBadge from "../components/VendorBadge";
import LaunchCountdown from "../components/LaunchCountdown";
import SweepstakesRules from "../components/SweepstakesRules";
import { motion } from "framer-motion";
import PageTransition from "../components/PageTransition";
import MobileSelector from "../components/MobileSelector";
import { optimisticToggleFavorite } from "@/lib/optimisticUpdates";
import { useActiveRole } from "@/lib/ActiveRoleContext";
import { getContextColor } from "@/lib/permissions";
import { calculateRankingScore } from "@/utils/marketplaceRanking";

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = 3959;
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
const PERSONALIZED_COUNT = 10;
const DISCOVERY_COUNT = 10;

// Category structure with top-level categories and their sub-categories
const CATEGORY_STRUCTURE = {
  sports: {
    label: "Sports Memorabilia",
    icon: "⚾",
    gradient: "from-blue-500 to-green-500",
    subCategories: ["baseball", "basketball", "football", "hockey", "boxing", "soccer", "golf", "tennis"]
  },
  entertainment: {
    label: "Entertainment",
    icon: "🎬",
    gradient: "from-purple-500 to-pink-500",
    subCategories: ["movies", "tv_shows", "music", "theater"]
  },
  historical: {
    label: "Historical",
    icon: "🏛️",
    gradient: "from-amber-500 to-orange-500",
    subCategories: ["political", "military", "space", "aviation"]
  },
  comics: {
    label: "Comics & Pop Culture",
    icon: "🦸",
    gradient: "from-red-500 to-yellow-500",
    subCategories: ["comic_books", "toys", "video_games", "anime"]
  },
  fine_art: {
    label: "Fine Art",
    icon: "🎨",
    gradient: "from-purple-500 to-indigo-500",
    subCategories: ["paintings", "sculptures", "drawings", "textile_art", "other_fine_art"]
  }
};

export default function Marketplace() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  
  // Parse URL parameters
  const urlParams = new URLSearchParams(location.search);
  
  // Initialize state from URL parameters or defaults
  useEffect(() => {
    // Force refresh on mount to show newly created items
    queryClient.invalidateQueries({ queryKey: ['marketplace-items'] });
  }, [queryClient]);

  const [searchQuery, setSearchQuery] = useState(urlParams.get("search") || "");
  const [topLevelCategory, setTopLevelCategory] = useState(urlParams.get("topCategory") || "all");
  const [categoryFilter, setCategoryFilter] = useState(urlParams.get("category") || "all");
  const [sortBy, setSortBy] = useState(urlParams.get("sort") || "ranking");
  const [radiusFilter, setRadiusFilter] = useState(urlParams.get("radius") || "nationwide");
  const [showSoldItems, setShowSoldItems] = useState(urlParams.get("sold") !== "false");
  const [currentPage, setCurrentPage] = useState(parseInt(urlParams.get("page")) || 1);
  


  const [user, setUser] = useState(null);

  // Load user once on mount — role switching is now a local context change in Layout,
  // so there is no need to reload on roleSwitch events or window focus.
  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  // Update URL when filters change
  const updateURL = useCallback((updates) => {
    const params = new URLSearchParams(location.search);
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "" || 
          (key === "category" && value === "all") ||
          (key === "sort" && value === "newest") ||
          (key === "radius" && value === "nationwide") ||
          (key === "sold" && value === true) ||
          (key === "page" && value === 1)) {
        params.delete(key);
      } else {
        params.set(key, value.toString());
      }
    });
    
    const newSearch = params.toString();
    const newPath = newSearch ? `${location.pathname}?${newSearch}` : location.pathname;
    
    if (newPath !== location.pathname + location.search) {
      navigate(newPath, { replace: true });
    }
  }, [location, navigate]);

  // Update URL whenever filter state changes
  useEffect(() => {
    updateURL({
      search: searchQuery,
      topCategory: topLevelCategory,
      category: categoryFilter,
      sort: sortBy,
      radius: radiusFilter,
      sold: showSoldItems,
      page: currentPage
    });
  }, [searchQuery, topLevelCategory, categoryFilter, sortBy, radiusFilter, showSoldItems, currentPage, updateURL]);

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
      queryClient.invalidateQueries(['marketplace-items']);
    } catch (error) {
      console.error("Error updating interests:", error);
      // Revert on error
      setUser(prevUser => ({
        ...prevUser,
        interests_tags: currentInterests
      }));
    }
  };

  const isTagInInterests = (tag) => {
    if (!user?.interests_tags) return false;
    return user.interests_tags.some(t => t.toLowerCase() === tag.toLowerCase());
  };

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['marketplace-items'],
    queryFn: async () => {
      // Limit to last 1000 items to reduce payload; serve oldest/newest efficiently
      const allItems = await base44.entities.Item.list("-created_date", 1000);
      return allItems.filter(item =>
        // Show active and sold items, but never suppressed ones
        (item.status === "active" || item.status === "sold") &&
        item.marketplace_state !== "suppressed"
      );
    },
    staleTime: 60000, // Cache for 1 minute
    retry: 2,
    retryDelay: 1000,
  });



  const { data: userFavorites = [] } = useQuery({
    queryKey: ['user-favorites', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Favorite.filter({ user_email: user.email });
    },
    enabled: !!user?.email,
    staleTime: 60000,
  });

  const { data: userLikes = [] } = useQuery({
    queryKey: ['user-likes', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.ItemLike.filter({ user_email: user.email });
    },
    enabled: !!user?.email,
    staleTime: 60000,
  });

  const toggleLikeMutation = useMutation({
    mutationFn: async (item) => {
      if (!user) throw new Error("User not logged in");

      const existingLike = userLikes.find(like => like.item_id === item.id);
      const newLikeCount = existingLike 
        ? Math.max(0, (item.like_count || 0) - 1)
        : (item.like_count || 0) + 1;

      if (existingLike) {
        await base44.entities.ItemLike.delete(existingLike.id);
      } else {
        await base44.entities.ItemLike.create({
          item_id: item.id,
          user_email: user.email,
        });
      }

      // Recalculate ranking with updated like count
      const updatedItem = { ...item, like_count: newLikeCount };
      const vendorList = await base44.entities.User.filter({ email: item.vendor_email });
      const vendor = vendorList[0] || null;
      const ranking_score = calculateRankingScore(updatedItem, vendor);

      await base44.entities.Item.update(item.id, { like_count: newLikeCount, ranking_score });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-likes', user?.email] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-items'] });
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: async (item) => {
      if (!user) throw new Error("User not logged in");

      const existingFavorite = userFavorites.find(fav => fav.item_id === item.id);
      const isFavorited = !!existingFavorite;

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
    ...optimisticToggleFavorite(queryClient, {
      itemId: null, // itemId resolved per-call in onMutate via the mutation arg
      isFavorited: false,
      userEmail: user?.email,
    }),
    onMutate: async (item) => {
      const isFavorited = userFavorites.some(fav => fav.item_id === item.id);
      const key = ['user-favorites', user?.email];
      await queryClient.cancelQueries({ queryKey: key });
      const previousFavorites = queryClient.getQueryData(key) || [];

      const updated = isFavorited
        ? previousFavorites.filter(fav => fav.item_id !== item.id)
        : [...previousFavorites, { item_id: item.id, user_email: user?.email }];

      queryClient.setQueryData(key, updated);
      return { previousFavorites, key };
    },
    onError: (err, item, context) => {
      if (context?.previousFavorites !== undefined && context?.key) {
        queryClient.setQueryData(context.key, context.previousFavorites);
      }
      console.error("Error toggling favorite:", err);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-favorites', user?.email] });
    },
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
    queryKey: ['item-vendors', items.length],
    queryFn: async () => {
      if (items.length === 0) return {};
      const vendorEmails = [...new Set(items.map(i => i.vendor_email))].filter(Boolean);
      // Batch fetch vendors with filter instead of individual lookups
      const vendorRecords = await base44.entities.User.filter({ email: { $in: vendorEmails } });
      return vendorRecords.reduce((acc, vendor) => {
        if (vendor?.email) acc[vendor.email] = vendor;
        return acc;
      }, {});
    },
    enabled: items.length > 0,
    staleTime: 300000,
  });

  const itemsWithDistance = React.useMemo(() => {
    if (!user?.latitude || !user?.longitude) {
      return items.map(item => ({ ...item, distance: null }));
    }

    return items.map(item => {
      const vendor = vendors[item.vendor_email];
      if (!vendor?.latitude || !vendor?.longitude) {
        return { ...item, distance: null };
      }
      
      const distance = calculateDistance(
        user.latitude,
        user.longitude,
        vendor.latitude,
        vendor.longitude
      );
      
      return { ...item, distance };
    });
  }, [items, vendors, user?.latitude, user?.longitude]);

  // Get available sub-categories based on top-level category
  const availableSubCategories = React.useMemo(() => {
    if (topLevelCategory === "all") {
      // Show all sub-categories from all top-level categories
      return Object.values(CATEGORY_STRUCTURE).flatMap(cat => cat.subCategories);
    }
    return CATEGORY_STRUCTURE[topLevelCategory]?.subCategories || [];
  }, [topLevelCategory]);

  const handleTopLevelCategoryClick = (categoryKey) => {
    if (topLevelCategory === categoryKey) {
      // If clicking the same category, reset to "all"
      setTopLevelCategory("all");
      setCategoryFilter("all");
    } else {
      setTopLevelCategory(categoryKey);
      setCategoryFilter("all"); // Reset sub-category when changing top-level
    }
    setCurrentPage(1);
  };

  const filteredItems = React.useMemo(() => {
    const result = itemsWithDistance.filter(item => {
      const vendor = vendors[item.vendor_email];
      const vendorName = vendor?.full_name || vendor?.email?.split('@')[0] || '';

      const matchesSearch = !searchQuery || 
        item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.signer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.team?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        vendorName.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Top-level category filter
      let matchesTopLevel = true;
      if (topLevelCategory !== "all") {
        const topCatConfig = CATEGORY_STRUCTURE[topLevelCategory];
        const categoryMap = {
          'comics': 'comic_pop_culture'
        };
        const targetMediaCategory = categoryMap[topLevelCategory] || topLevelCategory;

        // Check media_category first
        const matchesMediaCategory = item.media_category?.includes(targetMediaCategory);

        // Check subcategories (legacy support for sports primarily)
        const matchesSubCategory = topCatConfig ? topCatConfig.subCategories.some(
          subCat => item.sport?.toLowerCase() === subCat.toLowerCase()
        ) : false;

        matchesTopLevel = matchesMediaCategory || matchesSubCategory;
      }
      
      // Sub-category filter
      const matchesCategory = categoryFilter === "all" || 
        item.sport?.toLowerCase() === categoryFilter.toLowerCase();
      
      let matchesRadius = true;
      if (radiusFilter !== "nationwide" && user?.latitude && user?.longitude) {
        if (item.distance !== null) {
          const radiusMiles = parseInt(radiusFilter);
          matchesRadius = item.distance <= radiusMiles;
        }
      }
      
      // Educational items are always shown, regardless of showSoldItems
      const matchesShowSold = showSoldItems || item.status !== "sold" || item.is_educational_display_item;
      
      return matchesSearch && matchesTopLevel && matchesCategory && matchesRadius && matchesShowSold;
      });

      return result;
  }, [itemsWithDistance, searchQuery, topLevelCategory, categoryFilter, radiusFilter, showSoldItems, user, vendors]);

  const paginatedItems = React.useMemo(() => {
    const userInterests = user?.interests_tags || [];
    
    // NEW: Separate educational items from regular items
    const educationalItems = filteredItems.filter(item => item.is_educational_display_item);
    const regularItems = filteredItems.filter(item => !item.is_educational_display_item);

    let scoredItems = regularItems.map(item => {
      let relevanceScore = 0;
      
      if (userInterests && userInterests.length > 0) {
        const interests = userInterests.map(t => t.toLowerCase());
        interests.forEach(interest => {
          if (item.signer?.toLowerCase().includes(interest)) relevanceScore += 3;
          if (item.team?.toLowerCase().includes(interest)) relevanceScore += 3;
          if (item.sport?.toLowerCase().includes(interest)) relevanceScore += 2;
          if (item.year?.toString().includes(interest)) relevanceScore += 1;
          if (item.tags?.some(tag => tag.toLowerCase().includes(interest))) relevanceScore += 2;
          if (item.title?.toLowerCase().includes(interest)) relevanceScore += 1;
        });
      }

      const boost = boostMap.get(item.id);
      const isBoosted = !!boost;
      if (isBoosted && relevanceScore > 0) {
        relevanceScore *= (boost.boost_multiplier || 3.0);
      }
      
      return { ...item, relevanceScore, isBoosted, boost };
    });

    if (sortBy === "ranking") {
      scoredItems.sort((a, b) => (b.ranking_score || 0) - (a.ranking_score || 0));
    } else if (sortBy === "distance" && user?.latitude && user?.longitude) {
      scoredItems.sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
    } else if (sortBy === "price_low") {
      scoredItems.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sortBy === "price_high") {
      scoredItems.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sortBy === "authenticity") {
      scoredItems.sort((a, b) => (b.authenticity_meter || 0) - (a.authenticity_meter || 0));
    } else if (sortBy === "newest") {
      scoredItems.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    } else {
      scoredItems.sort((a, b) => {
        if (b.relevanceScore !== a.relevanceScore) {
          return b.relevanceScore - a.relevanceScore;
        }
        return new Date(b.created_date) - new Date(a.created_date);
      });
    }

    const personalizedPool = scoredItems.filter(item => item.relevanceScore > 0);
    const discoveryPool = scoredItems.filter(item => item.relevanceScore === 0);

    const pageOffset = (currentPage - 1) * 10; // Items per page for personalized/discovery is 10 each, totaling 20 per 'logical' page
    const personalizedForPage = personalizedPool.slice(pageOffset, pageOffset + PERSONALIZED_COUNT);
    const discoveryForPage = discoveryPool.slice(pageOffset, pageOffset + DISCOVERY_COUNT);

    // Educational items always show first on page 1, before any other items.
    // They are not paginated and are only shown on the first page.
    const finalItems = currentPage === 1 
      ? [...educationalItems, ...personalizedForPage, ...discoveryForPage]
      : [...personalizedForPage, ...discoveryForPage];

    // Total pages calculation should be based on the total number of regular items that can be paginated.
    // Educational items don't contribute to total pages or pagination logic as they are always fixed on page 1.
    const totalPaginatedItemsCount = Math.max(personalizedPool.length, discoveryPool.length);
    const totalPages = Math.ceil(totalPaginatedItemsCount / ITEMS_PER_PAGE);

    return {
      items: finalItems,
      totalPages: totalPages
    };
  }, [filteredItems, user, sortBy, boostMap, currentPage]);

  const handlePageChange = useCallback((newPage) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setTopLevelCategory("all");
    setCategoryFilter("all");
    setRadiusFilter("nationwide");
    setShowSoldItems(true);
    setCurrentPage(1);
  }, []);

  // Standard search works automatically via the filteredItems useMemo dependence on searchQuery

  const getAuthenticityColor = (score) => {
    if (score >= 80) return "text-green-600 bg-green-50";
    if (score >= 60) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  // Use the live shared active role context (updated instantly on role switch in Layout)
  const { activeRole } = useActiveRole();
  const currentRole = activeRole || user?.current_role || "collector";
  const currentRoleColor = getContextColor(currentRole);

  const hasLocation = user?.latitude && user?.longitude;
  const localItemsCount = itemsWithDistance.filter(item => item.distance !== null && item.distance <= 50).length;

  const getItemTags = useCallback((item) => {
    const tags = [];
    if (item.signer) tags.push(item.signer);
    if (item.team) tags.push(item.team);
    if (item.sport) tags.push(item.sport);
    if (item.year) tags.push(item.year.toString());
    return tags.slice(0, 4);
  }, []);

  return (
    <PageTransition>
      <div className="min-h-screen app-bg" style={(() => { const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000" width="120" height="120"><g fill="' + currentRoleColor + '" opacity="0.09"><path d="M1484.95,1280.1c15.59-51.15,33.82-101.35,54.55-150.61c11.03-26.22,22.88-52.09,34.33-78.13c1.18-2.69,3.81-5.85,1.57-8.4c-3.1-3.52-6.31,0.13-9.02,1.63c-44.27,24.48-90.85,41.49-141.64,46.33c-67.23,6.4-129.81-7.74-187.8-41.75c-82.12-48.16-139.76-118.93-183.84-201.83c-18.02-33.89-33.57-68.88-44.87-105.66c-0.67-2.17-1.36-4.38-2.38-6.39c-1.3-2.57-2-6.34-5.9-5.86c-3.14,0.39-3.39,3.82-4.24,6.17c-4.01,11.05-7.6,22.26-11.71,33.27c-31.86,85.42-77.5,162.09-144.05,225.29c-52.34,49.71-112.47,84.94-184.64,96.76c-67.32,11.03-131.34-0.73-192.62-29.5c-9.95-4.67-19.58-10.01-29.36-15.04c-2.32-1.19-4.89-3.58-7.28-1.78c-3.22,2.43-0.64,5.59,0.51,8.19c9.66,21.86,19.66,43.57,29.1,65.52c22.66,52.66,42.35,106.43,60.15,160.91c0.33,1,0.3,2.11,0.81,6.1c-11.8-22.47-22.26-42.44-32.75-62.38c-65.11-123.77-138.96-242.19-218.62-357.06c-5.21-7.51-11.29-10.02-20.04-9.93c-37.98,0.41-64.6-29.94-62.94-69.59c1.23-29.4,28.67-54.87,58.92-56.92c33.06-2.25,61.48,17.84,68.1,48.18c4.76,21.83,0.27,41.47-14.8,58.11c-4.85,5.35-5.97,9.26-1.24,15.58c48.61,64.89,103.24,123.32,174.36,164.27c14.49,8.34,29.73,15.09,45.13,21.58c9.22,3.88,13.65,1.21,17.63-7.34c22.12-47.46,36.73-97.13,44.54-148.83c4.81-31.81,6.68-63.83,7.09-96c0.13-10.49-3.76-14.64-14.2-16c-34.31-4.47-57.01-36.65-51.71-72.13c5.19-34.78,37.17-58.6,71.38-53.46c25.18,3.79,43.26,17.34,51.42,41.09c8.3,24.16,4.81,47.57-13.92,66.44c-6.59,6.64-5.05,11.14-0.46,17.44c35.71,49.02,77.11,92.71,123.11,132.09c19.31,16.53,38.99,32.63,58.61,48.78c12.11,9.97,13.6,9.66,23.87-1.61c47.21-51.83,83.59-110.67,112.67-174.2c15.64-34.17,29.1-69.17,40.8-104.9c3.21-9.81,2.06-14.7-8.51-18.85c-29.66-11.64-44.12-41.56-37.76-74.38c4.66-24.05,31.05-51.48,63.19-51.07c31.02,0.4,56.34,19.44,62.72,47.6c7.15,31.59-6.82,62.67-35.83,75.88c-11.41,5.19-13.02,10.92-9.27,21.97c28.47,83.82,64.75,163.62,118.56,234.6c12.16,16.04,25,31.48,39.3,45.71c4.57,4.55,8.28,5.38,13.58,1.13c67.96-54.47,133.31-111.51,185-182.52c6.49-8.92,6.77-14.33-1.31-22.81c-18.7-19.65-20.37-53.14-5.55-76.26c15.34-23.93,43.6-34.12,72.92-26.28c25.12,6.72,43.72,30.67,44.37,57.12c0.77,31.59-14.73,55.16-42.3,64.33c-0.72,0.24-1.42,0.55-2.15,0.76c-21.64,6.24-21.86,6.24-21.58,28.68c0.98,78.71,16.21,154.43,48.25,226.54c8.5,19.13,8.65,19.11,27.44,11.28c61.87-25.79,112.21-67.26,157.32-115.81c18.87-20.3,36.13-41.94,53.16-63.79c6.05-7.77,6.92-12.87-0.39-21.11c-23.83-26.86-18.28-71.73,10.32-91.93c31.21-22.06,75.46-13.65,93.76,17.81c19.14,32.9,6.47,75.4-27.2,91.3c-8.41,3.97-17.38,5.85-26.53,5.15c-9.1-0.7-14.64,3.09-19.72,10.35c-58.94,84.35-114.22,171.02-165.51,260.23C1540.38,1175.42,1512.32,1227.49,1484.95,1280.1z"/><path d="M1464.47,1386.21c-10.67,16.41-25.06,24.62-40.34,31.42c-35.92,15.98-73.95,24.65-112.27,32.57c-33.82,6.99-68.16,10.34-102.22,15.62c-20.15,3.12-40.77,3.2-61.17,4.81c-72.28,5.7-144.7,5.93-217.08,4.21c-41.6-0.99-83.18-4.17-124.67-8.22c-56.65-5.54-112.8-13.75-167.96-27.85c-28.32-7.24-56.22-15.92-81.34-31.55c-8.06-5.01-15.4-10.81-21.56-22.31c7.43,3.09,12.35,5.19,17.3,7.18c51.05,20.58,104.64,30.88,158.75,38.77c89.84,13.1,180.21,18.17,270.99,18.73c116.24,0.72,231.89-5.06,346.5-25.45c44.49-7.92,88.5-17.85,129.77-37.18C1460.09,1386.54,1461.26,1386.65,1464.47,1386.21z"/></g></svg>'; return { overscrollBehaviorY: 'none', backgroundImage: 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")', backgroundRepeat: 'repeat' }; })()}>
      {/* Updated Hero Section with New Tagline */}
      <div className="bg-gradient-to-r from-blue-600 via-green-600 to-orange-600 text-white py-16 px-6 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-end pr-12 opacity-10 pointer-events-none z-0">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/46533c917_Photoroom_20251118_202357.png"
            alt=""
            className="w-[600px] h-[600px] object-contain"
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </div>

        <div className="max-w-7xl mx-auto relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Memorabilia & Fine Art Kingdom
          </h1>

          <p className="text-xl mb-8 text-white">
            Every item vetted by our community of experts
          </p>
          
          <div className="flex justify-center mb-6">
            <LaunchCountdown variant="compact" />
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="bg-card rounded-2xl shadow-2xl dark:shadow-lg p-2 flex gap-2 border border-border">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/50" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by player, team, or item type..."
                  className="pl-12 border-0 focus-visible:ring-0 text-lg bg-background text-foreground"
                  style={{ color: currentRoleColor }}
                />
              </div>
              <Button 
                className="px-4 sm:px-8 text-white transition-all duration-300"
                style={{ backgroundColor: currentRoleColor }}
              >
                Search
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
       {/* Test Mode Banner */}
       {user && (
         <div className="mb-4 rounded-xl border-2 border-dashed border-yellow-400 dark:border-yellow-500/60 bg-yellow-50 dark:bg-yellow-900/20 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
           <div className="flex items-center gap-2 flex-shrink-0">
             <span className="text-xl">💳</span>
             <span className="text-sm font-bold text-yellow-800 dark:text-yellow-300 uppercase tracking-wide">Test Mode Active</span>
           </div>
           <div className="flex-1 text-sm text-yellow-700 dark:text-yellow-400">
             You're an early user! Use card <span className="font-mono font-semibold">4242 4242 4242 4242</span>, any future expiry, and any 3-digit CVC to test checkout.
           </div>
           <div className="text-xs text-yellow-600 dark:text-yellow-500 flex-shrink-0">
             🚀 Live <strong>May 25, 2026</strong>
           </div>
         </div>
       )}

       {/* Official Sweepstakes Rules */}
       <div className="mb-8">
         <SweepstakesRules />
       </div>

       {/* Top-Level Category Cards */}
       <div className="mb-8">
         <h2 className="text-2xl font-bold text-foreground mb-4">Browse by Category</h2>
          <div className="flex gap-3 overflow-x-auto pb-4 snap-x no-scrollbar">
            {Object.entries(CATEGORY_STRUCTURE).map(([key, category]) => (
              <motion.button
                key={key}
                onClick={() => handleTopLevelCategoryClick(key)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`relative overflow-hidden rounded-xl p-4 text-left transition-shadow duration-150 min-w-[140px] md:min-w-[180px] flex-1 snap-start ${
                  topLevelCategory === key
                    ? 'ring-2 ring-offset-2 shadow-xl'
                    : 'shadow-md hover:shadow-lg'
                }`}
                style={{
                  ringColor: topLevelCategory === key ? currentRoleColor : 'transparent'
                }}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${category.gradient} opacity-90`}></div>
                <div className="relative z-10">
                  <div className="text-2xl mb-2">{category.icon}</div>
                  <h3 className="text-white font-bold text-sm md:text-base mb-1 leading-tight">{category.label}</h3>
                  <p className="text-white/90 text-[10px]">
                    {category.subCategories.length} categories
                  </p>
                </div>
                {topLevelCategory === key && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 right-2 bg-white rounded-full p-1 z-20"
                  >
                    <Star className="w-3 h-3 fill-current" style={{ color: currentRoleColor }} />
                  </motion.div>
                )}
              </motion.button>
            ))}
          </div>
          
          {topLevelCategory !== "all" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 text-center"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTopLevelCategory("all");
                  setCategoryFilter("all");
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                Clear Category Filter
              </Button>
            </motion.div>
          )}
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-xl p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="font-bold text-red-900 mb-2">Failed to Load Items</h3>
                <p className="text-sm text-red-800 mb-4">{error.message}</p>
                <Button
                  onClick={() => queryClient.invalidateQueries(['marketplace-items'])}
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-100"
                >
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        )}

        {hasLocation && localItemsCount > 0 && (
          <div className={`mb-6 bg-gradient-to-r from-blue-600 via-green-600 to-orange-600 text-white rounded-xl p-4 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <MapPin className="w-6 h-6" />
              <div>
                <p className="font-semibold">Local Items Near You</p>
                <p className="text-sm opacity-90">
                  {localItemsCount} items within 50 miles
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="bg-white/20 border-white/40 text-white hover:bg-white/30"
              onClick={() => {
                setRadiusFilter("50");
                setSortBy("distance");
              }}
            >
              Show Local
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-4 items-center justify-between mb-8">
          <div className="flex gap-3 flex-wrap">
            <MobileSelector
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              trigger={<><Filter className="w-4 h-4 mr-2 hidden sm:inline" /><span>{categoryFilter === "all" ? "Sub-Category" : categoryFilter.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span></>}
              title="Select Category"
              items={[
                { value: "all", label: topLevelCategory === "all" ? "All Categories" : "All in Category" },
                ...(topLevelCategory === "all" 
                  ? [
                      { value: "baseball", label: "Baseball" },
                      { value: "basketball", label: "Basketball" },
                      { value: "football", label: "Football" },
                      { value: "hockey", label: "Hockey" },
                      { value: "boxing", label: "Boxing" },
                      { value: "soccer", label: "Soccer" },
                      { value: "golf", label: "Golf" },
                      { value: "tennis", label: "Tennis" },
                      { value: "movies", label: "Movies" },
                      { value: "tv_shows", label: "TV Shows" },
                      { value: "music", label: "Music" },
                      { value: "theater", label: "Theater" },
                      { value: "political", label: "Political" },
                      { value: "military", label: "Military" },
                      { value: "space", label: "Space" },
                      { value: "aviation", label: "Aviation" },
                      { value: "comic_books", label: "Comic Books" },
                      { value: "toys", label: "Toys" },
                      { value: "video_games", label: "Video Games" },
                      { value: "anime", label: "Anime" }
                    ]
                  : availableSubCategories.map(subCat => ({
                      value: subCat,
                      label: subCat.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
                    })))
              ]}
            />

            {hasLocation && (
              <MobileSelector
                value={radiusFilter}
                onValueChange={setRadiusFilter}
                trigger={<><MapPin className="w-4 h-4 mr-2 hidden sm:inline" /><span>{radiusFilter === "nationwide" ? "Distance" : `Within ${radiusFilter} miles`}</span></>}
                title="Select Distance"
                items={[
                  { value: "nationwide", label: "Nationwide" },
                  { value: "10", label: "Within 10 miles" },
                  { value: "25", label: "Within 25 miles" },
                  { value: "50", label: "Within 50 miles" },
                  { value: "100", label: "Within 100 miles" },
                  { value: "250", label: "Within 250 miles" }
                ]}
              />
            )}

            <MobileSelector
              value={sortBy}
              onValueChange={setSortBy}
              trigger={<><SlidersHorizontal className="w-4 h-4 mr-2 hidden sm:inline" /><span>{sortBy === "ranking" ? "Sort by" : sortBy.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span></>}
               title="Sort Items"
               items={[
                 { value: "ranking", label: "Platform Ranking" },
                 { value: "newest", label: "Newest First" },
                 ...(hasLocation ? [{ value: "distance", label: "Nearest First" }] : []),
                 { value: "price_low", label: "Price: Low to High" },
                 { value: "price_high", label: "Price: High to Low" },
                 { value: "authenticity", label: "Highest Authenticity" }
               ]}
            />

            <Button
              variant={showSoldItems ? "default" : "outline"}
              onClick={() => setShowSoldItems(!showSoldItems)}
              style={showSoldItems ? { backgroundColor: currentRoleColor } : undefined}
            >
              <Filter className="w-4 h-4 mr-2" />
              {showSoldItems ? "Hide Sold" : "Show Sold"}
            </Button>
          </div>

          <p className="text-muted-foreground">
            {isLoading ? "Loading..." : `Showing ${paginatedItems.items.length} of ${filteredItems.length} items`}
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array(8).fill(0).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-square bg-muted rounded-t-lg"></div>
                <CardContent className="p-4 space-y-3">
                  <div className="h-4 bg-muted rounded"></div>
                  <div className="h-3 bg-muted rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : paginatedItems.items.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-12 h-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No items found</h3>
            <p className="text-muted-foreground mb-4">
              {items.length === 0 ? "No items in the marketplace yet. Check back soon!" : "Try adjusting your filters"}
            </p>
            <Button 
              onClick={handleClearFilters}
              variant="outline"
            >
              Clear All Filters
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {paginatedItems.items.map((item) => {
                const vendor = vendors[item.vendor_email];
                const isSold = item.status === "sold";
                const isEducational = item.is_educational_display_item;
                const isFineArt = item.media_category?.includes('fine_art');
                const itemTags = getItemTags(item);
                
                const getCategoryBadge = (item) => {
                  if (item.media_category?.includes('fine_art')) {
                    return { label: 'Fine Art', icon: Palette, className: 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200' };
                  }
                  if (item.media_category?.includes('entertainment') || item.media_category?.includes('music')) {
                    return { label: 'Entertainment', icon: Film, className: 'bg-pink-100 text-pink-700 border-pink-200 hover:bg-pink-200' };
                  }
                  if (item.media_category?.includes('historical')) {
                    return { label: 'Historical', icon: Landmark, className: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200' };
                  }
                  if (item.media_category?.includes('comic_pop_culture')) {
                    return { label: 'Pop Culture', icon: Zap, className: 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200' };
                  }
                  // Check for sports last since 'item.sport' exists on many non-sports items as a subcategory field
                  if (item.media_category?.includes('sports') || item.sport) {
                    return { label: item.sport || 'Sports', icon: Trophy, className: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200' };
                  }
                  return null;
                };

                const categoryBadge = getCategoryBadge(item);

                return (
                  <div key={item.id} className="group relative">
                    {/* You Listed This Item Badge - inside image, bottom-right, semi-transparent */}

                    {/* Like Button (top right) */}
                    {user && !isSold && user.email !== item.vendor_email && (
                      <div className="absolute top-3 right-12 z-30">
                        <motion.button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleLikeMutation.mutate(item);
                          }}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          aria-label={userLikes.some(like => like.item_id === item.id) ? "Unlike" : "Like"}
                          className="bg-card/90 dark:bg-muted/40 dark:border dark:border-border backdrop-blur-sm rounded-full p-2 shadow-lg hover:bg-card dark:hover:bg-muted/60 transition-colors"
                        >
                          <Heart className={`w-5 h-5 ${
                            userLikes.some(like => like.item_id === item.id) 
                              ? 'fill-blue-500 text-blue-500' 
                              : 'text-muted-foreground'
                          }`} />
                        </motion.button>
                      </div>
                    )}

                    {/* Favorite Button (top left) */}
                    {user && !isSold && user.email !== item.vendor_email && (
                      <div className="absolute top-3 left-3 z-30">
                        <motion.button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleFavoriteMutation.mutate(item);
                          }}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          aria-label={userFavorites.some(fav => fav.item_id === item.id) ? "Remove from favorites" : "Add to favorites"}
                          aria-pressed={userFavorites.some(fav => fav.item_id === item.id)}
                          className="bg-card/90 dark:bg-muted/40 dark:border dark:border-border backdrop-blur-sm rounded-full p-2 shadow-lg hover:bg-card dark:hover:bg-muted/60 transition-colors"
                        >
                          <Heart className={`w-5 h-5 ${
                            userFavorites.some(fav => fav.item_id === item.id) 
                              ? 'fill-red-500 text-red-500' 
                              : 'text-muted-foreground'
                          }`} />
                        </motion.button>
                      </div>
                    )}

                    <Link to={createPageUrl(`ItemDetails?id=${item.id}`)}>
                      {/* Educational badge overlay */}
                      {isEducational && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
                          <Badge 
                            className="text-xs shadow-lg font-bold px-3 py-1 animate-pulse"
                            style={{ 
                              background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                              color: 'white',
                              border: '2px solid white'
                            }}
                          >
                            🎓 EDUCATIONAL SAMPLE
                          </Badge>
                        </div>
                      )}

                      {isSold && !isEducational && (
                        <div className="absolute inset-0 z-20 pointer-events-none">
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-15deg]">
                            <Badge 
                              className="text-4xl font-black px-8 py-3 shadow-2xl border-4"
                              style={{ 
                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                color: 'white',
                                borderColor: 'white',
                                textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                              }}
                            >
                              SOLD
                            </Badge>
                          </div>
                        </div>
                      )}

                      {item.active_auction_id && !isSold && !isEducational && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
                          <Badge 
                            className="text-xs shadow-lg animate-pulse font-bold px-3 py-1 flex items-center gap-1"
                            style={{ 
                              background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                              color: 'white',
                              border: '2px solid white'
                            }}
                          >
                            <Gavel className="w-3 h-3" />
                            AUCTION
                          </Badge>
                        </div>
                      )}

                      {item.isBoosted && !item.active_auction_id && !isSold && !isEducational && (
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
                          <Badge 
                            className="text-xs shadow-lg animate-pulse font-bold px-3 py-1"
                            style={{ 
                              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                              color: 'white',
                              border: '2px solid white'
                            }}
                          >
                            ⚡ BOOSTED
                          </Badge>
                        </div>
                      )}

                      {item.distance !== null && !isSold && !isEducational && (
                        <div className="absolute -top-2 -left-2 z-10">
                          <Badge 
                            className="text-xs shadow-lg flex items-center gap-1"
                            style={{ 
                              backgroundColor: item.distance <= 25 ? '#10b981' : item.distance <= 50 ? '#3b82f6' : '#6b7280',
                              color: 'white' 
                            }}
                          >
                            <MapPin className="w-3 h-3" />
                            {Math.round(item.distance)} mi
                          </Badge>
                        </div>
                      )}
                      
                      <Card 
                        className={`overflow-hidden hover:shadow-xl transition-shadow duration-200 border-2 ${
                          isEducational ? 'border-green-400' : 
                          isSold ? 'opacity-75' : ''
                        }`}
                        style={{ 
                          borderColor: isEducational ? '#10b981' : 
                                      item.isBoosted && !isSold ? '#f59e0b' : 
                                      (item.relevanceScore > 0 && !isSold ? `${currentRoleColor}40` : 'transparent'),
                          boxShadow: isEducational ? '0 0 20px rgba(16, 185, 129, 0.3)' : 
                                    item.isBoosted && !isSold ? '0 0 20px rgba(245, 158, 11, 0.3)' : undefined
                        }}
                      >
                        <div className={`aspect-square bg-muted relative overflow-hidden ${isSold && !isEducational ? 'grayscale' : ''}`}>
                          {item.images?.[0] ? (
                            <img 
                              src={item.images[0]} 
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Star className="w-16 h-16 text-muted-foreground/30" />
                            </div>
                          )}
                          
                          <div className="absolute top-3 right-3">
                            <Badge 
                              className={`${getAuthenticityColor(item.authenticity_meter)} border-2 border-white shadow-lg flex items-center gap-1`}
                            >
                              <ShieldCheck className="w-3 h-3" />
                              {item.authenticity_meter}%
                            </Badge>
                          </div>

                          {item.grade_status && !isEducational && !isFineArt && (
                            <div className="absolute top-3 left-3">
                              <Badge className="bg-card text-foreground border-2 border-border shadow-lg capitalize dark:bg-card dark:text-foreground dark:border-border">
                                {item.grade_status.replace(/_/g, ' ')}
                              </Badge>
                            </div>
                          )}

                          {user && user.email === item.vendor_email && (
                            <div className="absolute bottom-2 right-2 z-20">
                              <Badge className="text-white text-[10px] px-2 py-0.5 flex items-center gap-1" style={{ backgroundColor: 'rgba(37,99,235,0.7)', backdropFilter: 'blur(4px)' }}>
                                ✓ Your listing
                              </Badge>
                            </div>
                          )}
                        </div>

                        <CardContent className="p-4">
                          {vendor && !isEducational && (
                            <div className="mb-3 pb-3 border-b border-border">
                              <VendorBadge vendor={vendor} size="sm" showRating={true} />
                            </div>
                          )}

                          <div className="mb-2">
                            {categoryBadge && !isEducational && (
                              <Badge className={`mb-1 w-fit flex items-center gap-1 text-[10px] px-1.5 py-0.5 ${categoryBadge.className}`}>
                                <categoryBadge.icon className="w-3 h-3" />
                                <span className="capitalize">{categoryBadge.label}</span>
                              </Badge>
                            )}
                            <h3 
                              className={`font-semibold text-foreground line-clamp-2 ${isSold && !isEducational ? 'line-through opacity-60' : ''}`}
                            >
                              {item.title}
                            </h3>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-border">
                            <div>
                              {isEducational ? (
                                <p className="text-xl font-bold text-green-600 flex items-center gap-1">
                                  <Gift className="w-5 h-5" />
                                  FREE
                                </p>
                              ) : item.price ? (
                                <p className={`text-xl font-bold text-foreground ${isSold ? 'opacity-60' : ''}`}>
                                  ${item.price.toLocaleString()}
                                </p>
                              ) : (
                                <p className="text-sm text-muted-foreground">Price not set</p>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                {item.total_votes || 0}
                              </span>
                              {item.like_count > 0 && (
                                <span className="flex items-center gap-1 text-blue-600">
                                  <Heart className="w-3.5 h-3.5 fill-blue-600" />
                                  {item.like_count}
                                </span>
                              )}
                              {item.marketplace_state && item.marketplace_state !== 'live_unreviewed' && (() => {
                                const stateColors = {
                                  live_trusted: 'text-green-600',
                                  live_reviewing: 'text-yellow-600',
                                  live_flagged: 'text-orange-600',
                                  suppressed: 'text-red-600',
                                };
                                const stateLabels = {
                                  live_trusted: '✓ Trusted',
                                  live_reviewing: '⟳ Reviewing',
                                  live_flagged: '⚠ Flagged',
                                  suppressed: '⛔ Suppressed',
                                };
                                return (
                                  <span className={`text-[10px] font-medium ${stateColors[item.marketplace_state] || ''}`}>
                                    {stateLabels[item.marketplace_state]}
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>

                    {itemTags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {itemTags.map((tag) => {
                          const isInterest = isTagInInterests(tag);
                          return (
                            <motion.button
                              key={tag}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleTagInterestToggle(tag);
                              }}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="focus:outline-none"
                            >
                              <Badge 
                                variant="outline" 
                                className="text-xs cursor-pointer hover:shadow-md transition-all flex items-center gap-1.5 px-2 py-1"
                                style={{
                                  backgroundColor: isInterest ? `${currentRoleColor}15` : 'transparent',
                                  color: currentRoleColor,
                                  borderColor: currentRoleColor,
                                  borderWidth: isInterest ? '2px' : '1px'
                                }}
                              >
                                {tag}
                                <Heart 
                                  className={`w-3 h-3 transition-all ${isInterest ? 'fill-current' : ''}`}
                                  style={{ color: currentRoleColor }}
                                />
                              </Badge>
                            </motion.button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {paginatedItems.totalPages > 1 && (
              <div className="mt-12 mb-6 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="border-border"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>

                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(5, paginatedItems.totalPages) }, (_, i) => {
                    let pageNum;
                    if (paginatedItems.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= paginatedItems.totalPages - 2) {
                      pageNum = paginatedItems.totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "outline"}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-10 h-10 p-0 ${currentPage !== pageNum ? 'border-border' : ''}`}
                        style={currentPage === pageNum ? { backgroundColor: currentRoleColor } : undefined}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === paginatedItems.totalPages}
                  className="border-border"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </PageTransition>
    );
}