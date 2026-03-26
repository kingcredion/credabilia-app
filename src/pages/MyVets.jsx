import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  TrendingUp,
  Award,
  Calendar,
  Eye
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function MyVets() {
  const [user, setUser] = useState(null);

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

  const { data: myVotes, isLoading } = useQuery({
    queryKey: ['my-vets', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Vote.filter({ voter_email: user.email }, "-created_date");
    },
    enabled: !!user?.email,
    initialData: [],
  });

  // Fetch items for the votes
  const { data: items } = useQuery({
    queryKey: ['vets-items', myVotes],
    queryFn: async () => {
      if (myVotes.length === 0) return [];
      const itemIds = [...new Set(myVotes.map(v => v.item_id))];
      const itemPromises = itemIds.map(id => 
        base44.entities.Item.filter({ id }).then(items => items[0])
      );
      return await Promise.all(itemPromises);
    },
    enabled: myVotes.length > 0,
    initialData: [],
  });

  const getVoteIcon = (type) => {
    switch(type) {
      case 'authentic': return <ShieldCheck className="w-5 h-5 text-green-600" />;
      case 'suspicious': return <ShieldAlert className="w-5 h-5 text-yellow-600" />;
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

  const authenticVotes = myVotes.filter(v => v.vote_type === 'authentic').length;
  const suspiciousVotes = myVotes.filter(v => v.vote_type === 'suspicious').length;
  const counterfeitVotes = myVotes.filter(v => v.vote_type === 'counterfeit').length;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            My Vetting History
          </h1>
          <p className="text-muted-foreground">
            Track your contributions to the community
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-green-600 to-green-700 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm mb-1">Total Vets</p>
                  <p className="text-3xl font-bold">{myVotes.length}</p>
                </div>
                <ShieldCheck className="w-12 h-12 text-green-200" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Authentic</p>
                  <p className="text-3xl font-bold text-green-600">{authenticVotes}</p>
                </div>
                <ShieldCheck className="w-12 h-12 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Suspicious</p>
                  <p className="text-3xl font-bold text-yellow-600">{suspiciousVotes}</p>
                </div>
                <ShieldAlert className="w-12 h-12 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Counterfeit</p>
                  <p className="text-3xl font-bold text-red-600">{counterfeitVotes}</p>
                </div>
                <ShieldX className="w-12 h-12 text-red-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Vetting History */}
        <Card>
          <CardHeader>
            <CardTitle>Your Reviews ({myVotes.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array(3).fill(0).map((_, i) => (
                  <div key={i} className="animate-pulse flex gap-4 p-4">
                    <div className="w-24 h-24 bg-gray-200 rounded-lg"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : myVotes.length === 0 ? (
              <div className="text-center py-12">
                <ShieldCheck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No vetting history yet
                </h3>
                <p className="text-gray-600 mb-4">
                  Start reviewing items to build your reputation
                </p>
                <Link to={createPageUrl("VettingQueue")}>
                  <Badge className="bg-green-600 text-white px-4 py-2 cursor-pointer hover:bg-green-700">
                    Go to Vetting Queue
                  </Badge>
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {myVotes.map((vote, index) => {
                  const item = items.find(i => i?.id === vote.item_id);
                  
                  return (
                    <div key={vote.id || index}>
                      <div className="flex gap-4">
                        {/* Item Image */}
                        <Link 
                          to={createPageUrl(`ItemDetails?id=${vote.item_id}`)}
                          className="flex-shrink-0"
                        >
                          <div className="w-24 h-24 bg-muted rounded-lg overflow-hidden hover:opacity-80 transition-opacity">
                            {item?.images?.[0] ? (
                              <img 
                                src={item.images[0]} 
                                alt={item.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ShieldCheck className="w-8 h-8 text-gray-400" />
                              </div>
                            )}
                          </div>
                        </Link>

                        {/* Vote Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <Link 
                                to={createPageUrl(`ItemDetails?id=${vote.item_id}`)}
                                className="font-semibold text-foreground hover:text-green-600 transition-colors"
                              >
                                {item?.title || 'Item details'}
                              </Link>
                              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                                <Calendar className="w-3 h-3" />
                                <span>
                                  Reviewed {new Date(vote.created_date).toLocaleDateString('en-US', { 
                                    year: 'numeric', 
                                    month: 'short', 
                                    day: 'numeric' 
                                  })}
                                </span>
                              </div>
                            </div>

                            <Badge className={`${getVoteBadgeColor(vote.vote_type)} border flex items-center gap-1 ml-4`}>
                              {getVoteIcon(vote.vote_type)}
                              <span className="capitalize">{vote.vote_type}</span>
                            </Badge>
                          </div>

                          {/* Confidence Bar */}
                          {vote.confidence !== undefined && (
                            <div className="mb-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-muted-foreground">Your Confidence:</span>
                                <span className="text-xs font-semibold text-foreground">
                                  {(vote.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-1.5">
                                <div 
                                  className="bg-green-600 h-1.5 rounded-full"
                                  style={{ width: `${vote.confidence * 100}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Comment */}
                          {vote.comment && (
                            <div className="bg-muted/40 p-3 rounded-lg">
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                "{vote.comment}"
                              </p>
                            </div>
                          )}

                          {/* Item Current Status */}
                          {item && (
                            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                              <div className="flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" />
                                <span>Current Score: {item.authenticity_meter}%</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" />
                                <span>{item.total_votes || 0} total votes</span>
                              </div>
                              {item.views !== undefined && (
                                <div className="flex items-center gap-1">
                                  <Eye className="w-3 h-3" />
                                  <span>{item.views} views</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {index < myVotes.length - 1 && <Separator className="mt-6" />}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rank Info */}
        {user && myVotes.length > 0 && (
          <Card className="mt-8 bg-gradient-to-r from-green-600 to-green-700 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Award className="w-12 h-12 text-green-200" />
                  <div>
                    <h3 className="text-2xl font-bold capitalize">{user.rank || 'Bronze'} Vettor</h3>
                    <p className="text-green-100 text-sm">
                      {user.xp || 0} XP • {((user.accuracy_rate || 0.5) * 100).toFixed(0)}% Accuracy
                    </p>
                  </div>
                </div>
                <Link to={createPageUrl("Leaderboard")}>
                  <Badge className="bg-white text-green-600 hover:bg-green-50 cursor-pointer px-4 py-2">
                    View Leaderboard
                  </Badge>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}