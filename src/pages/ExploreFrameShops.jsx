import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  MapPin, Star, Phone, ExternalLink, Search, Building2, Palette,
  ChevronRight, Users, Brush, Package
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";

export default function ExploreFrameShops() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const { data: frameShops = [], isLoading: shopsLoading } = useQuery({
    queryKey: ["frame-shops-explore"],
    queryFn: async () => {
      return await base44.entities.FrameShop.filter({ status: "active" });
    },
    staleTime: 120000,
  });

  // Fetch all active artists directly from Artist entity
  const { data: artists = [], isLoading: artistsLoading } = useQuery({
    queryKey: ["artists-explore"],
    queryFn: async () => {
      return await base44.entities.Artist.filter({ status: "active" });
    },
    staleTime: 120000,
  });

  // Fetch user data for artists to get avatars/names
  const { data: artistUsers = [] } = useQuery({
    queryKey: ["artist-users", artists.map(a => a.user_email).join(",")],
    queryFn: async () => {
      if (artists.length === 0) return [];
      const allUsers = await base44.entities.User.list();
      const artistEmails = new Set(artists.map(a => a.user_email));
      return allUsers.filter(u => artistEmails.has(u.email));
    },
    enabled: artists.length > 0,
    staleTime: 120000,
  });

  const artistUserMap = React.useMemo(() => {
    const map = {};
    artistUsers.forEach(u => { map[u.email] = u; });
    return map;
  }, [artistUsers]);

  const filteredShops = frameShops.filter(shop =>
    !searchQuery ||
    shop.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    shop.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    shop.services_offered?.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredArtists = artists.filter(artist =>
    !searchQuery ||
    artist.artist_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    artist.bio?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    artist.specialties?.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const isLoading = shopsLoading || artistsLoading;

  return (
    <div className="min-h-screen app-bg">
      {/* Hero */}
      <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-blue-700 text-white pt-12 pb-16 px-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 flex items-center justify-end pr-12 pointer-events-none">
          <Building2 className="w-96 h-96" />
        </div>
        <div className="max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">Creative Hub</h1>
            <p className="text-white/80 text-lg">Discover local frame shops and talented artists</p>
          </div>
          <div className="max-w-2xl mx-auto">
            <div className="glass-card-strong rounded-2xl p-2 flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search shops, artists, specialties..."
                  className="pl-12 border-0 focus-visible:ring-0 text-gray-900"
                />
              </div>
              <Button className="bg-purple-600 hover:bg-purple-700 px-6">Search</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card className="glass-card border-border/50 text-center p-4">
            <p className="text-3xl font-bold text-purple-600">{frameShops.length}</p>
            <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <Building2 className="w-4 h-4" /> Frame Shops
            </p>
          </Card>
          <Card className="glass-card border-border/50 text-center p-4">
            <p className="text-3xl font-bold text-pink-600">{artists.length}</p>
            <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
              <Palette className="w-4 h-4" /> Artists
            </p>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="glass-card border-border/50 mb-6 w-full sm:w-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="frameshops">
              <Building2 className="w-4 h-4 mr-1" /> Frame Shops ({filteredShops.length})
            </TabsTrigger>
            <TabsTrigger value="artists">
              <Palette className="w-4 h-4 mr-1" /> Artists ({filteredArtists.length})
            </TabsTrigger>
          </TabsList>

          {/* Frame Shops Tab */}
          <TabsContent value="all" className="space-y-8">
            <FrameShopsSection shops={filteredShops} isLoading={shopsLoading} />
            <ArtistsSection artists={filteredArtists} artistUserMap={artistUserMap} isLoading={artistsLoading} />
          </TabsContent>

          <TabsContent value="frameshops">
            <FrameShopsSection shops={filteredShops} isLoading={shopsLoading} />
          </TabsContent>

          <TabsContent value="artists">
            <ArtistsSection artists={filteredArtists} artistUserMap={artistUserMap} isLoading={artistsLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function FrameShopsSection({ shops, isLoading }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-foreground mb-4 flex items-center gap-2">
         <Building2 className="w-5 h-5 text-purple-600" />
         Frame Shops
      </h2>
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3].map(i => <Card key={i} className="animate-pulse h-48" />)}
        </div>
      ) : shops.length === 0 ? (
        <Card className="dark:bg-muted/30">
          <CardContent className="py-12 text-center text-gray-500 dark:text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No frame shops found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shops.map((shop, idx) => (
            <motion.div key={shop.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
              <Link to={createPageUrl(`FrameShopProfile?id=${shop.id}`)}>
                <Card className="glass-card border-border/50 hover:shadow-lg hover:border-purple-400/40 transition-all cursor-pointer h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                       <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center flex-shrink-0">
                         <Building2 className="w-6 h-6 text-purple-600" />
                       </div>
                       <div className="flex-1 min-w-0">
                         <h3 className="font-bold text-gray-900 dark:text-foreground truncate">{shop.business_name}</h3>
                        {shop.rating > 0 && (
                          <div className="flex items-center gap-1 text-sm">
                            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                            <span className="dark:text-foreground">{shop.rating.toFixed(1)}</span>
                            <span className="text-gray-500 dark:text-muted-foreground">({shop.review_count})</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {shop.address && (
                      <p className="text-sm text-gray-500 dark:text-muted-foreground flex items-start gap-1 mb-3">
                        <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <span className="line-clamp-1">{shop.address}</span>
                      </p>
                    )}
                    {shop.services_offered?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {shop.services_offered.slice(0, 3).map(s => (
                          <Badge key={s} variant="outline" className="text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800">
                            {s}
                          </Badge>
                        ))}
                        {shop.services_offered.length > 3 && (
                          <Badge variant="outline" className="text-xs">+{shop.services_offered.length - 3}</Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtistsSection({ artists, artistUserMap, isLoading }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-foreground mb-4 flex items-center gap-2">
         <Palette className="w-5 h-5 text-pink-600" />
         Artists
       </h2>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <Card key={i} className="animate-pulse h-48" />)}
        </div>
      ) : artists.length === 0 ? (
        <Card className="dark:bg-muted/30">
          <CardContent className="py-12 text-center text-gray-500 dark:text-muted-foreground">
            <Palette className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No artists found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {artists.map((artist, idx) => {
            const userProfile = artistUserMap[artist.user_email];
            return (
              <motion.div key={artist.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
                <Link to={createPageUrl(`ArtistProfile?id=${artist.id}`)}>
                    <Card className="glass-card border-border/50 hover:shadow-lg hover:border-pink-400/40 transition-all cursor-pointer h-full">
                    <CardContent className="p-5 text-center">
                      <Avatar className="w-16 h-16 mx-auto mb-3 ring-2 ring-pink-200 dark:ring-pink-900">
                         <AvatarImage src={userProfile?.avatar_url} className="object-cover" />
                         <AvatarFallback className="bg-gradient-to-br from-pink-400 to-rose-600 text-white text-xl">
                           {(artist.artist_name || 'A')[0].toUpperCase()}
                         </AvatarFallback>
                       </Avatar>
                       <h3 className="font-bold text-gray-900 dark:text-foreground mb-1 truncate">{artist.artist_name}</h3>
                       {artist.bio && (
                         <p className="text-xs text-gray-500 dark:text-muted-foreground line-clamp-2 mb-3">{artist.bio}</p>
                      )}
                      {artist.specialties?.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-1 mb-3">
                          {artist.specialties.slice(0, 3).map(s => (
                            <Badge key={s} variant="outline" className="text-xs bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {artist.commission_open && (
                        <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-0 text-xs">
                          ✓ Commissions Open
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}