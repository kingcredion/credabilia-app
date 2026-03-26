import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  MapPin,
  Star,
  Package,
  ShieldCheck,
  UserPlus,
  UserCheck,
  Search,
  Loader2,
  Globe,
  X
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { CONTEXT_COLORS as roleColors } from "@/lib/permissions";
import { useState as useStateBase } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Check, ChevronDown } from "lucide-react";

export default function ExploreUsers() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get("role");
  const [roleFilter, setRoleFilter] = useState(roleParam || "all");
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [tempRoleFilter, setTempRoleFilter] = useState(roleParam || "all");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (roleParam) setRoleFilter(roleParam);
  }, [roleParam]);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(console.error);
  }, []);

  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ['all-users-directory'],
    queryFn: () => base44.entities.User.list(null, 500),
    initialData: [],
    staleTime: 300000,
  });

  const { data: allItems = [] } = useQuery({
    queryKey: ['all-items-for-stats'],
    queryFn: () => base44.entities.Item.list(null, 500),
    initialData: [],
    staleTime: 300000,
  });

  const { data: activeArtists = [] } = useQuery({
    queryKey: ['active-artists-directory'],
    queryFn: () => base44.entities.Artist.filter({ status: 'active' }),
    initialData: [],
  });

  const { data: followingMap = {} } = useQuery({
    queryKey: ['user-following-map', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return {};
      const following = await base44.entities.Follow.filter({ follower_email: currentUser.email });
      return following.reduce((acc, f) => { acc[f.following_email] = true; return acc; }, {});
    },
    enabled: !!currentUser?.email,
    initialData: {},
  });

  const followMutation = useMutation({
    mutationFn: async ({ userToFollow, isFollowing }) => {
      if (isFollowing) {
        const follows = await base44.entities.Follow.filter({
          follower_email: currentUser.email,
          following_email: userToFollow.email
        });
        if (follows[0]) await base44.entities.Follow.delete(follows[0].id);
      } else {
        await base44.entities.Follow.create({
          follower_email: currentUser.email,
          follower_name: currentUser.full_name || currentUser.email,
          following_email: userToFollow.email,
          following_name: userToFollow.full_name || userToFollow.email
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-following-map'] }),
  });

  const usersWithStats = useMemo(() => {
    const activeArtistEmails = new Set(activeArtists.map(a => a.user_email?.toLowerCase()));
    const itemsByVendor = new Map();
    allItems.forEach(item => {
      if (item.vendor_email && item.status === "active") {
        itemsByVendor.set(item.vendor_email, (itemsByVendor.get(item.vendor_email) || 0) + 1);
      }
    });
    const interestSet = new Set(currentUser?.interests_tags?.map(i => i.toLowerCase()) || []);

    return allUsers.map(user => {
      const isArtist = activeArtistEmails.has(user.email?.toLowerCase());
      const displayRole = isArtist && roleFilter === 'artist' ? 'artist' : user.current_role;
      const matchingInterests = (user.interests_tags || []).filter(t => interestSet.has(t.toLowerCase())).length;
      return {
        ...user,
        current_role: displayRole,
        matchingInterests,
        itemsListed: itemsByVendor.get(user.email) || 0,
        itemsAudited: user.total_vets || 0
      };
    });
  }, [allUsers, currentUser, allItems, activeArtists, roleFilter]);

  const filteredUsers = useMemo(() => usersWithStats.filter(user => {
    if (user.email === currentUser?.email) return false;
    if (user.email === 'deleted@credabilia.com') return false;

    const matchesSearch = !searchQuery ||
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.location?.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesRole = true;
    if (roleFilter === 'artist') matchesRole = user.current_role === 'artist';
    else if (roleFilter !== "all") matchesRole = user.current_role === roleFilter;

    return matchesSearch && matchesRole;
  }), [usersWithStats, searchQuery, roleFilter, currentUser]);

  const currentRoleColor = roleColors[currentUser?.current_role] || roleColors.collector;

  const getActivityLabel = (role) => {
    const labels = { collector: 'Collecting', vendor: 'Vending', auditor: 'Auditing', artist: 'Creating', picture_frame_shop: 'Framing', influencer: 'Influencer' };
    return labels[role] || role;
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Header */}
      <div className="border-b border-border px-4 sm:px-6 py-4 app-bg shadow-sm">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: `${currentRoleColor}20` }}>
                <Globe className="w-5 h-5" style={{ color: currentRoleColor }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  {roleFilter === 'artist' ? 'Artist Directory' : 'Explore Community'}
                </h1>
                <p className="text-xs text-muted-foreground">{filteredUsers.length} members</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, location..."
                className="pl-10"
              />
            </div>
            {!roleParam && (
              <Drawer open={roleDrawerOpen} onOpenChange={setRoleDrawerOpen}>
                <button
                  onClick={() => {
                    setTempRoleFilter(roleFilter);
                    setRoleDrawerOpen(true);
                  }}
                  className="w-full sm:w-48 px-3 py-2 text-sm rounded-md border border-input bg-transparent text-left flex items-center justify-between shadow-sm hover:bg-accent transition-colors"
                  style={{ minHeight: "36px" }}
                >
                  <span className="text-muted-foreground">
                    {roleFilter === "all" ? "All Members" : roleFilter === "artist" ? "Artists" : roleFilter === "picture_frame_shop" ? "Frame Shops" : roleFilter === "influencer" ? "Influencers" : roleFilter === "vendor" ? "Vendors" : "Auditors"}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                </button>
                <DrawerContent className="px-4 pb-6">
                  <DrawerHeader className="px-0 pt-2 pb-4">
                    <DrawerTitle className="text-lg font-semibold">Filter by role</DrawerTitle>
                  </DrawerHeader>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto py-2">
                    {[
                      { value: "all", label: "All Members" },
                      { value: "artist", label: "Artists" },
                      { value: "picture_frame_shop", label: "Frame Shops" },
                      { value: "influencer", label: "Influencers" },
                      { value: "vendor", label: "Vendors" },
                      { value: "auditor", label: "Auditors" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setTempRoleFilter(opt.value);
                          setRoleFilter(opt.value);
                          setRoleDrawerOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                          opt.value === tempRoleFilter
                            ? "bg-primary/10 border-l-4 border-primary"
                            : "border-l-4 border-transparent hover:bg-muted"
                        }`}
                        style={{ minHeight: "48px" }}
                      >
                        <span className="flex-1">{opt.label}</span>
                        {opt.value === tempRoleFilter && (
                          <Check className="h-5 w-5 text-primary flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </DrawerContent>
              </Drawer>
            )}
            {(searchQuery || roleFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); if (!roleParam) setRoleFilter("all"); }}>
                <X className="w-4 h-4 mr-1" /> Clear
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* User Grid */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(9).fill(0).map((_, i) => (
              <div key={i} className="animate-pulse h-36 bg-gray-200 dark:bg-muted rounded-xl" />
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium mb-1">No users found</p>
            <p className="text-sm text-gray-500">{searchQuery ? 'Try adjusting your search' : 'Check back later'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {filteredUsers.map((user, index) => {
                const isFollowing = followingMap[user.email];
                const roleColor = roleColors[user.current_role] || currentRoleColor;

                return (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  >
                    <Card
                      className="hover:shadow-md transition-all cursor-pointer group"
                      onClick={() => navigate(createPageUrl(`Profile?email=${user.email}`))}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Avatar className="w-11 h-11 ring-2 ring-offset-1 flex-shrink-0" style={{ '--tw-ring-color': `${roleColor}40` }}>
                            <AvatarImage src={user.avatar_url} />
                            <AvatarFallback className="text-white text-sm font-bold" style={{ backgroundColor: roleColor }}>
                              {(user.full_name || user.email)[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <p className="font-semibold text-foreground truncate text-sm">
                                {user.full_name || user.email?.split('@')[0]}
                              </p>
                              <Button
                                size="sm"
                                variant={isFollowing ? "outline" : "default"}
                                onClick={e => { e.stopPropagation(); followMutation.mutate({ userToFollow: user, isFollowing }); }}
                                disabled={followMutation.isPending}
                                className="flex-shrink-0 h-7 w-7 p-0"
                                style={!isFollowing ? { backgroundColor: currentRoleColor } : {}}
                              >
                                {isFollowing ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                              </Button>
                            </div>

                            <Badge
                              className="capitalize text-[10px] px-1.5 mt-1"
                              style={{ backgroundColor: `${roleColor}20`, color: roleColor, border: `1px solid ${roleColor}40` }}
                            >
                              {getActivityLabel(user.current_role)}
                            </Badge>

                            {user.location && (
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                                <MapPin className="w-2.5 h-2.5" />
                                {user.location}
                              </p>
                            )}

                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {user.matchingInterests > 0 && (
                                <Badge variant="outline" className="text-[10px] px-1">
                                  <Star className="w-2.5 h-2.5 mr-0.5" />
                                  {user.matchingInterests} shared
                                </Badge>
                              )}
                              {user.current_role === 'vendor' && user.itemsListed > 0 && (
                                <Badge variant="outline" className="text-[10px] px-1">
                                  <Package className="w-2.5 h-2.5 mr-0.5" />
                                  {user.itemsListed}
                                </Badge>
                              )}
                              {user.current_role === 'auditor' && user.itemsAudited > 0 && (
                                <Badge variant="outline" className="text-[10px] px-1">
                                  <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />
                                  {user.itemsAudited}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}