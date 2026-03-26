import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ShieldCheck,
  Star,
  Package,
  Eye,
  TrendingUp,
  Clock,
  CheckCircle,
  Crown,
  Award,
  Zap,
  MapPin,
  Heart,
  MessageSquare,
  UserPlus,
  Trophy
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";

export default function Feed() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("following");

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

  // Fetch activity events
  const { data: activities } = useQuery({
    queryKey: ['activity-feed'],
    queryFn: async () => {
      return await base44.entities.ActivityEvent.list("-created_date", 100);
    },
    initialData: [],
  });

  // Fetch users you're following
  const { data: following } = useQuery({
    queryKey: ['my-following', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Follow.filter({ follower_email: user.email });
    },
    enabled: !!user?.email,
    initialData: [],
  });

  // Filter activities based on tab
  const filteredActivities = React.useMemo(() => {
    if (activeTab === "all") return activities;
    
    if (activeTab === "following") {
      const followingEmails = following.map(f => f.following_email);
      return activities.filter(a => followingEmails.includes(a.user_email));
    }
    
    if (activeTab === "listings") {
      return activities.filter(a => a.event_type === 'new_listing');
    }
    
    if (activeTab === "sales") {
      return activities.filter(a => a.event_type === 'item_sold');
    }
    
    return activities;
  }, [activities, activeTab, following]);

  const getActivityIcon = (type) => {
    switch(type) {
      case 'new_listing': return <Package className="w-5 h-5 text-blue-600" />;
      case 'item_sold': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'new_audit': return <ShieldCheck className="w-5 h-5 text-purple-600" />;
      case 'new_follow': return <UserPlus className="w-5 h-5 text-pink-600" />;
      case 'achievement_unlocked': return <Trophy className="w-5 h-5 text-yellow-600" />;
      case 'rank_up': return <Crown className="w-5 h-5 text-orange-600" />;
      case 'new_review': return <Star className="w-5 h-5 text-amber-600" />;
      default: return <Star className="w-5 h-5 text-gray-400" />;
    }
  };

  const getTimeAgo = (timestamp) => {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-background dark:to-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground mb-2">Community Feed</h1>
          <p className="text-gray-600 dark:text-muted-foreground">
            See what's happening in the Credabilia community
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="following">
              <Heart className="w-4 h-4 mr-2" />
              Following
            </TabsTrigger>
            <TabsTrigger value="all">
              All Activity
            </TabsTrigger>
            <TabsTrigger value="listings">
              New Listings
            </TabsTrigger>
            <TabsTrigger value="sales">
              Sales
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-4">
          {filteredActivities.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <TrendingUp className="w-16 h-16 text-gray-300 dark:text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-foreground mb-2">
                  {activeTab === "following" ? "Follow users to see their activity" : "No activity yet"}
                </h3>
                <p className="text-gray-600 dark:text-muted-foreground mb-4">
                  {activeTab === "following" 
                    ? "Browse the marketplace and follow collectors and vendors to see their updates here"
                    : "Be the first to create some activity in the community!"}
                </p>
                <Link to={createPageUrl("Marketplace")}>
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    Explore Marketplace
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            filteredActivities.map((activity, index) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center">
                          {getActivityIcon(activity.event_type)}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Link to={createPageUrl(`Profile?email=${activity.user_email}`)}>
                              <Avatar className="w-10 h-10 ring-2 ring-gray-200 dark:ring-white/10 hover:ring-blue-400 dark:hover:ring-blue-500/40 transition-all">
                                <AvatarImage src={activity.user_avatar} />
                                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                                  {(activity.user_name || activity.user_email || 'U')[0].toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            </Link>
                            
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link 
                                  to={createPageUrl(`Profile?email=${activity.user_email}`)}
                                  className="font-semibold text-gray-900 dark:text-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                >
                                  {activity.user_name || activity.user_email?.split('@')[0]}
                                </Link>
                                <span className="text-gray-600 dark:text-muted-foreground text-sm">{activity.description}</span>
                              </div>
                              
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-muted-foreground mt-1">
                                <Clock className="w-3 h-3" />
                                {getTimeAgo(activity.created_date)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {activity.related_item_id && (
                          <Link 
                            to={createPageUrl(`ItemDetails?id=${activity.related_item_id}`)}
                            className="block"
                          >
                            <div className="flex gap-4 p-4 bg-gray-50 dark:bg-white/5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                              <div className="w-24 h-24 flex-shrink-0 bg-gray-200 dark:bg-white/10 rounded-lg overflow-hidden">
                                {activity.related_item_image ? (
                                  <img 
                                    src={activity.related_item_image} 
                                    alt={activity.related_item_title}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Star className="w-8 h-8 text-gray-400 dark:text-muted-foreground" />
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-900 dark:text-foreground mb-2 line-clamp-2">
                                  {activity.related_item_title}
                                </h3>
                                {activity.metadata?.price && (
                                  <p className="text-lg font-bold text-gray-900 dark:text-foreground">
                                    ${activity.metadata.price.toLocaleString()}
                                  </p>
                                )}
                              </div>
                            </div>
                          </Link>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}