import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Users, MapPin, Award, Trophy } from "lucide-react";
import { motion } from "framer-motion";

export default function UserSearch() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: users, isLoading } = useQuery({
    queryKey: ['all-users-public'],
    queryFn: async () => {
      // Fetch activity events to find active users
      const events = await base44.entities.ActivityEvent.list('-created_date', 200);
      
      const userMap = new Map();
      
      // Add current user if logged in
      try {
        const me = await base44.auth.me();
        if (me) {
          userMap.set(me.email, me);
        }
      } catch (e) {
        // Not logged in
      }

      // Extract unique users from activity
      events.forEach(e => {
        if (e.user_email && !userMap.has(e.user_email)) {
          userMap.set(e.user_email, {
            id: e.user_id || `temp-${e.user_email}`,
            email: e.user_email,
            full_name: e.user_name || e.user_email.split('@')[0],
            avatar_url: e.user_avatar,
            location: 'Active Member', // Placeholder
            rank: 'Member', // Placeholder
            xp: 0
          });
        }
      });

      return Array.from(userMap.values());
    },
    initialData: [],
  });

  const filteredUsers = users.filter(user => {
    if (!searchQuery.trim()) return false;
    const query = searchQuery.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(query) ||
      user.username?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users by name, username, or email..."
          className="pl-10"
        />
      </div>

      {!searchQuery.trim() ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Find Community Members
            </h3>
            <p className="text-gray-600 text-sm">
              Search for collectors, vendors, and auditors to follow
            </p>
          </CardContent>
        </Card>
      ) : filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No users found
            </h3>
            <p className="text-gray-600 text-sm">
              Try a different search term
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredUsers.map((user, index) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card 
                className="hover:shadow-lg transition-all hover:border-blue-300 cursor-pointer"
                onClick={() => navigate(createPageUrl(`Profile?email=${user.email}`))}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-16 h-16 ring-2 ring-gray-200">
                      <AvatarImage src={user.avatar_url} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xl">
                        {(user.full_name || user.email)[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900 truncate">
                          {user.full_name || user.email.split('@')[0]}
                        </h3>
                        {user.username && (
                          <span className="text-sm text-gray-500">@{user.username}</span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 mb-2">
                        <Badge variant="outline" className="capitalize">
                          <Award className="w-3 h-3 mr-1" />
                          {user.rank || 'Member'}
                        </Badge>
                        {user.xp > 0 && (
                          <Badge className="bg-orange-500 text-white">
                            <Trophy className="w-3 h-3 mr-1" />
                            {user.xp} XP
                          </Badge>
                        )}
                        {user.total_vets > 0 && (
                          <Badge className="bg-green-500 text-white">
                            {user.total_vets} Audits
                          </Badge>
                        )}
                      </div>

                      {user.location && (
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {user.location}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}