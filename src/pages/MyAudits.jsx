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
  Eye,
  Calendar,
  Award,
  Filter,
  Star,
  CheckCircle2,
  AlertTriangle,
  XCircle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Check, ChevronDown } from "lucide-react";

export default function MyAudits() {
  const [user, setUser] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

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

  // Fetch user's votes
  const { data: myVotes, isLoading } = useQuery({
    queryKey: ['my-votes', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Vote.filter({ voter_email: user.email }, "-created_date");
    },
    enabled: !!user?.email,
    initialData: [],
  });

  // Fetch all items for the votes
  const { data: items } = useQuery({
    queryKey: ['voted-items', myVotes],
    queryFn: async () => {
      if (myVotes.length === 0) return [];
      const itemIds = [...new Set(myVotes.map(v => v.item_id))];
      const allItems = await base44.entities.Item.list();
      return allItems.filter(item => itemIds.includes(item.id));
    },
    enabled: myVotes.length > 0,
    initialData: [],
  });

  const filteredVotes = filterType === "all" 
    ? myVotes 
    : myVotes.filter(v => v.vote_type === filterType);

  const getVoteIcon = (type) => {
    switch(type) {
      case 'authentic': return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'suspicious': return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'counterfeit': return <XCircle className="w-5 h-5 text-red-600" />;
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
    if (score >= 80) return "text-green-600 bg-green-50";
    if (score >= 60) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  // Calculate stats
  const authenticVotes = myVotes.filter(v => v.vote_type === "authentic").length;
  const suspiciousVotes = myVotes.filter(v => v.vote_type === "suspicious").length;
  const counterfeitVotes = myVotes.filter(v => v.vote_type === "counterfeit").length;
  const avgConfidence = myVotes.length > 0 
    ? (myVotes.reduce((sum, v) => sum + (v.confidence || 0), 0) / myVotes.length * 100).toFixed(0)
    : 0;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <ShieldCheck className="w-10 h-10 text-green-600" />
            My Audits
          </h1>
          <p className="text-gray-600">
            Track your review history and impact on the community
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Total Reviews</p>
                <ShieldCheck className="w-5 h-5 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{myVotes.length}</p>
              <p className="text-xs text-gray-500 mt-1">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Accuracy Rate</p>
                <Award className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {((user.accuracy_rate || 0.5) * 100).toFixed(0)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">Community-verified</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Avg. Confidence</p>
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{avgConfidence}%</p>
              <p className="text-xs text-gray-500 mt-1">In your verdicts</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">XP Earned</p>
                <Star className="w-5 h-5 text-yellow-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{myVotes.length * 5}</p>
              <p className="text-xs text-gray-500 mt-1">From auditing</p>
            </CardContent>
          </Card>
        </div>

        {/* Vote Distribution */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Your Verdict Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium">Authentic</span>
                  </div>
                  <span className="text-sm font-semibold">{authenticVotes} ({myVotes.length > 0 ? ((authenticVotes / myVotes.length) * 100).toFixed(0) : 0}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-green-600 h-3 rounded-full transition-all"
                    style={{ width: `${myVotes.length > 0 ? (authenticVotes / myVotes.length) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm font-medium">Suspicious</span>
                  </div>
                  <span className="text-sm font-semibold">{suspiciousVotes} ({myVotes.length > 0 ? ((suspiciousVotes / myVotes.length) * 100).toFixed(0) : 0}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-yellow-600 h-3 rounded-full transition-all"
                    style={{ width: `${myVotes.length > 0 ? (suspiciousVotes / myVotes.length) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-medium">Counterfeit</span>
                  </div>
                  <span className="text-sm font-semibold">{counterfeitVotes} ({myVotes.length > 0 ? ((counterfeitVotes / myVotes.length) * 100).toFixed(0) : 0}%)</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-red-600 h-3 rounded-full transition-all"
                    style={{ width: `${myVotes.length > 0 ? (counterfeitVotes / myVotes.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-5 h-5 text-gray-500" />
            <Drawer open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
              <button
                onClick={() => setFilterDrawerOpen(true)}
                className="flex-1 sm:w-48 px-3 py-2 text-sm rounded-md border border-gray-300 bg-white text-left flex items-center justify-between shadow-sm hover:bg-gray-50 transition-colors"
                style={{ minHeight: "40px" }}
              >
                <span className="text-gray-700">
                  {filterType === "all" ? "All Verdicts" : filterType === "authentic" ? "Authentic Only" : filterType === "suspicious" ? "Suspicious Only" : "Counterfeit Only"}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
              </button>
              <DrawerContent className="px-4 pb-6">
                <DrawerHeader className="px-0 pt-2 pb-4">
                  <DrawerTitle className="text-lg font-semibold">Filter by verdict</DrawerTitle>
                </DrawerHeader>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto py-2">
                  {[
                    { value: "all", label: "All Verdicts" },
                    { value: "authentic", label: "Authentic Only" },
                    { value: "suspicious", label: "Suspicious Only" },
                    { value: "counterfeit", label: "Counterfeit Only" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setFilterType(opt.value);
                        setFilterDrawerOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                        opt.value === filterType
                          ? "bg-green-50 border-l-4 border-green-600"
                          : "border-l-4 border-transparent hover:bg-gray-50"
                      }`}
                      style={{ minHeight: "48px" }}
                    >
                      <span className="flex-1">{opt.label}</span>
                      {opt.value === filterType && (
                        <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </DrawerContent>
            </Drawer>
          </div>
          <p className="text-sm text-gray-600">
            {filteredVotes.length} {filteredVotes.length === 1 ? 'audit' : 'audits'}
          </p>
        </div>

        {/* Audits List */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <div className="aspect-square bg-gray-200"></div>
                <CardContent className="p-4 space-y-3">
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredVotes.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <ShieldCheck className="w-24 h-24 text-gray-300 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                No audits yet
              </h3>
              <p className="text-gray-600 mb-6">
                Start reviewing items to build your audit history
              </p>
              <Link to={createPageUrl("VettingQueue")}>
                <Button className="bg-green-600 hover:bg-green-700">
                  Go to Audit Queue
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVotes.map((vote, index) => {
              const item = items.find(i => i.id === vote.item_id);
              if (!item) return null;

              return (
                <motion.div
                  key={vote.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link to={createPageUrl(`ItemDetails?id=${item.id}`)}>
                    <Card className="overflow-hidden hover:shadow-xl transition-all group">
                      {/* Image */}
                      <div className="aspect-square bg-gray-100 relative">
                        {item.images?.[0] ? (
                          <img 
                            src={item.images[0]} 
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Star className="w-16 h-16 text-gray-300" />
                          </div>
                        )}

                        {/* Your Verdict Badge */}
                        <div className="absolute top-3 left-3">
                          <Badge className={`${getVoteBadgeColor(vote.vote_type)} border-2 flex items-center gap-1`}>
                            {getVoteIcon(vote.vote_type)}
                            <span className="capitalize">{vote.vote_type}</span>
                          </Badge>
                        </div>

                        {/* Current Score */}
                        <div className="absolute top-3 right-3">
                          <Badge className={`${getAuthenticityColor(item.authenticity_meter)} border-2 border-white shadow-lg`}>
                            {item.authenticity_meter}% Authentic
                          </Badge>
                        </div>
                      </div>

                      <CardContent className="p-4">
                        <h3 className="font-semibold text-gray-900 mb-3 line-clamp-2 group-hover:text-green-600 transition-colors">
                          {item.title}
                        </h3>

                        {/* Vote Details */}
                        <div className="space-y-2 mb-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Your Confidence:</span>
                            <span className="font-semibold">{((vote.confidence || 0) * 100).toFixed(0)}%</span>
                          </div>
                          
                          {vote.comment && (
                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-xs text-gray-700 line-clamp-3">
                                "{vote.comment}"
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Meta */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {new Date(vote.created_date).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                year: 'numeric'
                              })}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Eye className="w-4 h-4" />
                              {item.views || 0}
                            </span>
                            <span className="flex items-center gap-1">
                              <ShieldCheck className="w-4 h-4" />
                              {item.total_votes || 0}
                            </span>
                          </div>
                        </div>

                        {/* Impact Indicator */}
                        {item.total_votes > 5 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-2 text-xs">
                              <TrendingUp className="w-3 h-3 text-blue-600" />
                              <span className="text-gray-600">
                                Your vote contributed to {item.total_votes} community reviews
                              </span>
                            </div>
                          </div>
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
    </div>
  );
}