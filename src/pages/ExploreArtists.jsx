import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Search,
  Filter,
  MapPin,
  MessageSquare,
  Palette,
  CheckCircle,
  Globe,
  Instagram,
  X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function ExploreArtists() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("all");
  const [commissionFilter, setCommissionFilter] = useState("all");

  const { data: artists = [], isLoading } = useQuery({
    queryKey: ['explore-artists'],
    queryFn: async () => {
      const activeArtists = await base44.entities.Artist.filter({ status: "active" });
      const artistsWithUserData = await Promise.all(activeArtists.map(async (artist) => {
        try {
          const users = await base44.entities.User.filter({ email: artist.user_email });
          const userData = users[0] || {};
          return {
            ...artist,
            avatar_url: userData.avatar_url,
            location: userData.location,
            opted_in: userData.opted_into_artist_profile === true
          };
        } catch {
          return { ...artist, opted_in: false };
        }
      }));
      return artistsWithUserData.filter(a => a.opted_in && a.commission_open !== undefined);
    },
    initialData: [],
  });

  const allSpecialties = useMemo(() => {
    const s = new Set();
    artists.forEach(a => a.specialties?.forEach(sp => s.add(sp)));
    return Array.from(s).sort();
  }, [artists]);

  const filteredArtists = useMemo(() => artists.filter(artist => {
    const matchesSearch = !searchQuery ||
      artist.artist_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artist.bio?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artist.specialties?.some(s => s.toLowerCase().includes(searchQuery.toLowerCase())) ||
      artist.location?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSpecialty = specialtyFilter === "all" || artist.specialties?.includes(specialtyFilter);
    const matchesCommission = commissionFilter === "all" ||
      (commissionFilter === "open" && artist.commission_open) ||
      (commissionFilter === "closed" && !artist.commission_open);

    return matchesSearch && matchesSpecialty && matchesCommission;
  }), [artists, searchQuery, specialtyFilter, commissionFilter]);

  const hasActiveFilters = searchQuery || specialtyFilter !== "all" || commissionFilter !== "all";

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white dark:from-pink-950/20 dark:to-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-600 via-rose-500 to-orange-500 text-white py-10 px-6 shadow-lg">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Find Talented Artists</h1>
          <p className="text-white/80 mb-6">Discover creators for custom commissions and unique artwork</p>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, specialty, location..."
                className="pl-10 bg-white text-gray-900"
              />
            </div>
            <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
              <SelectTrigger className="w-full sm:w-52 bg-white text-gray-900">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Specialty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Specialties</SelectItem>
                {allSpecialties.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={commissionFilter} onValueChange={setCommissionFilter}>
              <SelectTrigger className="w-full sm:w-48 bg-white text-gray-900">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Artists</SelectItem>
                <SelectItem value="open">Commissions Open</SelectItem>
                <SelectItem value="closed">Commissions Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between mt-3">
            <p className="text-sm text-white/80">
              {isLoading ? "Loading..." : `${filteredArtists.length} ${filteredArtists.length === 1 ? 'artist' : 'artists'} found`}
            </p>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchQuery(""); setSpecialtyFilter("all"); setCommissionFilter("all"); }}
                className="text-white/80 hover:text-white hover:bg-white/10 text-xs"
              >
                <X className="w-3 h-3 mr-1" /> Clear filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Artist Grid */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-48 bg-gray-200 rounded-xl"></div>
              </div>
            ))}
          </div>
        ) : filteredArtists.length === 0 ? (
          <div className="text-center py-20">
            <Palette className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No artists found</h3>
            <p className="text-sm text-gray-500">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredArtists.map(artist => (
              <ArtistCard key={artist.id} artist={artist} onView={() => navigate(createPageUrl(`ArtistProfile?id=${artist.id}`))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ArtistCard({ artist, onView }) {
  return (
    <Card
      className="hover:shadow-lg transition-all cursor-pointer group border hover:border-pink-300 dark:hover:border-pink-500"
      onClick={onView}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <Avatar className="w-14 h-14 ring-2 ring-pink-100 ring-offset-1 flex-shrink-0">
            <AvatarImage src={artist.avatar_url} />
            <AvatarFallback className="bg-pink-100 text-pink-600 text-lg font-bold">
              {(artist.artist_name || 'A')[0]}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-foreground truncate group-hover:text-pink-600 transition-colors">
              {artist.artist_name}
            </h3>
            {artist.location && (
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />
                {artist.location}
              </p>
            )}
            <div className="mt-1">
              {artist.commission_open ? (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5">
                  <CheckCircle className="w-2.5 h-2.5 mr-1" />
                  Commissions Open
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] px-1.5 text-gray-500">
                  Closed
                </Badge>
              )}
            </div>
          </div>
        </div>

        {artist.bio && (
          <p className="text-xs text-gray-600 dark:text-muted-foreground line-clamp-2 mb-3">
            {artist.bio}
          </p>
        )}

        {artist.specialties?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {artist.specialties.slice(0, 4).map(s => (
              <Badge key={s} variant="outline" className="text-[10px] bg-pink-50 text-pink-700 border-pink-100">
                {s}
              </Badge>
            ))}
            {artist.specialties.length > 4 && (
              <Badge variant="outline" className="text-[10px]">+{artist.specialties.length - 4}</Badge>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-border">
          {artist.total_sales > 0 && (
            <span className="text-xs text-gray-500">{artist.total_sales} commissions</span>
          )}
          {artist.instagram_handle && (
            <a
              href={`https://instagram.com/${artist.instagram_handle}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-pink-500 hover:text-pink-700 flex items-center gap-1"
            >
              <Instagram className="w-3 h-3" />@{artist.instagram_handle}
            </a>
          )}
          <Button size="sm" className="ml-auto bg-pink-600 hover:bg-pink-700 text-xs h-7 px-3">
            View Profile
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}