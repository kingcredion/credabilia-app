import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Crown,
  Gift,
  DollarSign,
  Sparkles,
  Send,
  Heart,
  Pin,
  Shield,
  TrendingUp,
  Calendar,
  MessageCircle,
  Lock,
  Eye
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { format } from "date-fns";

export default function FounderCircleDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [investorData, setInvestorData] = useState(null);
  const [newPost, setNewPost] = useState("");

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);

      let investor = null;
      if (userData.user_type === "indiegogo_investor") {
        const investors = await base44.entities.IndiegogoInvestor.filter({
          user_email: userData.email
        });
        investor = investors.length > 0 && investors[0].status === "verified" ? investors[0] : null;
      } else if (userData.role === "admin") {
        // Admins can access the first verified investor for testing
        const investors = await base44.entities.IndiegogoInvestor.filter({
          status: "verified"
        }, "-created_date");
        investor = investors?.[0];
      }

      if (investor) {
        setInvestorData(investor);
      } else {
        navigate(createPageUrl("Marketplace"));
      }
    } catch (error) {
      console.error("Error loading user:", error);
      navigate(createPageUrl("Marketplace"));
    }
  };

  const { data: giveaways = [] } = useQuery({
    queryKey: ['founder-giveaways'],
    queryFn: () => base44.entities.Giveaway.filter({ status: "active" }),
    enabled: !!investorData
  });

  const { data: posts = [] } = useQuery({
    queryKey: ['founder-posts'],
    queryFn: () => base44.entities.FounderPost.list("-created_date"),
    enabled: !!investorData
  });

  const createPostMutation = useMutation({
    mutationFn: (postData) => base44.entities.FounderPost.create(postData),
    onSuccess: () => {
      queryClient.invalidateQueries(['founder-posts']);
      setNewPost("");
    }
  });

  const likePostMutation = useMutation({
    mutationFn: ({ postId, likes }) => 
      base44.entities.FounderPost.update(postId, { likes: likes + 1 }),
    onSuccess: () => {
      queryClient.invalidateQueries(['founder-posts']);
    }
  });

  const handlePostSubmit = () => {
    if (!newPost.trim()) return;
    
    createPostMutation.mutate({
      author_email: user.email,
      author_name: user.full_name || user.email.split('@')[0],
      content: newPost,
      is_founder_post: false
    });
  };

  if (!user || !investorData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your exclusive dashboard...</p>
        </div>
      </div>
    );
  }

  const nextGiveaway = giveaways[0];
  const founderPosts = posts.filter(p => p.is_founder_post);
  const communityPosts = posts.filter(p => !p.is_founder_post);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          {/* Hero Banner */}
          <div 
            className="relative mb-8 rounded-2xl overflow-hidden text-white shadow-xl min-h-[240px] flex items-end"
            style={{
              backgroundImage: 'url(https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/e1bb7b419_IMG_0622.png)',
              backgroundPosition: 'right bottom',
              backgroundSize: 'auto 90%',
              backgroundRepeat: 'no-repeat',
            }}
          >
             <div className="absolute inset-0 bg-gradient-to-r from-amber-600 via-amber-600 to-amber-700 opacity-85 z-10"></div>
             <div className="relative z-20 p-8 md:p-12 max-w-2xl w-full">
               <div className="flex items-center gap-3 mb-4">
                 <div className="p-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/10">
                   <Crown className="w-8 h-8 text-amber-100" />
                 </div>
                 <Badge className="bg-white/20 hover:bg-white/30 text-white border-white/10">Founder's Circle</Badge>
               </div>
               <h1 className="text-3xl md:text-4xl font-bold mb-4 text-white">Welcome back</h1>
               <p className="text-white/90 text-lg mb-6 max-w-lg">
                 Your exclusive space as an early backer. Enjoy lifetime perks, rewards, and direct access to the team.
               </p>
               <Link to={createPageUrl(`FounderProfile?id=${investorData.id}`)}>
                 <Button className="bg-white text-amber-700 hover:bg-amber-50 border-0 shadow-lg">
                   <Eye className="w-4 h-4 mr-2" />
                   View Public Profile
                 </Button>
               </Link>
             </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card dark:bg-amber-900/20 border border-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 rounded-lg bg-amber-500/10 dark:bg-amber-900/30">
                    <DollarSign className="w-5 h-5 text-amber-600 dark:text-amber-500" />
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">Credits</Badge>
                </div>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-500">
                  ${(investorData.store_credits_balance || 0) / 100}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Store Credits</p>
              </CardContent>
            </Card>

            <Card className="bg-card dark:bg-amber-900/20 border border-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 rounded-lg bg-amber-500/10 dark:bg-amber-900/30">
                    <Shield className="w-5 h-5 text-amber-700 dark:text-amber-600" />
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">Tier</Badge>
                </div>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-600 capitalize">
                  {investorData.founder_circle_tier?.replace('_', ' ')}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Founder Tier</p>
              </CardContent>
            </Card>

            <Card className="bg-card dark:bg-amber-900/20 border border-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 rounded-lg bg-amber-500/10 dark:bg-amber-900/30">
                    <Gift className="w-5 h-5 text-amber-700 dark:text-amber-600" />
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">Perks</Badge>
                </div>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-600">
                  {investorData.rewards_granted?.length || 0}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Rewards Received</p>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Giveaways & Perks */}
          <div className="lg:col-span-2 space-y-6">
            {/* Fee Waiver Notice */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Card className={`text-white border-0 shadow-xl ${
                investorData.founder_circle_tier === 'elite_tier'
                  ? 'bg-gradient-to-r from-green-600 to-emerald-700'
                  : 'bg-gradient-to-r from-blue-600 to-blue-700'
              }`}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-white/20 rounded-full">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      {investorData.founder_circle_tier === 'elite_tier' ? (
                        <>
                          <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                            <Crown className="w-5 h-5" />
                            Lifetime 0% Seller Fees - Elite Tier
                          </h3>
                          <p className="text-white/90 text-sm mb-3">
                            As an <strong>Elite Tier</strong> Indiegogo Founder's Circle member, you pay <strong>ZERO platform fees</strong> on all your listings. 
                            Only shipping costs apply. This exclusive benefit is yours forever!
                          </p>
                          <div className="bg-white/20 rounded-lg p-3 backdrop-blur-sm">
                            <p className="text-xs text-white/80 mb-1">Your Seller Fee Rate</p>
                            <p className="text-3xl font-bold">0%</p>
                            <p className="text-xs text-white/90 mt-1">Standard users pay 12%</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3 className="text-xl font-bold mb-2">Reduced Platform Fees</h3>
                          <p className="text-white/90 text-sm">
                            As a Standard Tier Founder's Circle member, you enjoy reduced platform fees. 
                            Upgrade to Elite Tier for 0% fees forever!
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Giveaway Section */}
            {nextGiveaway ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="border border-amber-600/30 bg-card dark:bg-amber-900/10 shadow-lg overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-amber-600 to-amber-700 text-white">
                    <CardTitle className="flex items-center gap-2">
                      <Gift className="w-6 h-6" />
                      Exclusive Giveaway
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        {nextGiveaway.image_url && (
                          <img
                            src={nextGiveaway.image_url}
                            alt={nextGiveaway.title}
                            className="w-full h-48 object-cover rounded-lg mb-4"
                          />
                        )}
                        <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 mb-2 capitalize">
                          {nextGiveaway.frequency}
                        </Badge>
                        <h4 className="text-xl font-bold text-foreground mb-2">
                          {nextGiveaway.title}
                        </h4>
                        <p className="text-muted-foreground text-sm mb-4">
                          {nextGiveaway.description}
                        </p>
                      </div>
                      <div className="space-y-4">
                        <div className="bg-muted/50 dark:bg-muted/20 rounded-lg p-4 border border-border">
                          <p className="text-sm text-muted-foreground mb-1">Estimated Value</p>
                          <p className="text-2xl font-bold text-foreground">
                            ${nextGiveaway.estimated_value?.toLocaleString()}
                          </p>
                        </div>
                        <div className="bg-muted/50 dark:bg-muted/20 rounded-lg p-4 border border-border">
                          <p className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Draw Date
                          </p>
                          <p className="text-lg font-semibold text-foreground">
                            {format(new Date(nextGiveaway.draw_date), 'MMMM d, yyyy')}
                          </p>
                        </div>
                        <div className="bg-green-500/10 dark:bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                          <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-1">
                            ✓ You're automatically entered
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-400/80">
                            All Founder's Circle members are entered in every giveaway
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <Card className="border border-amber-600/30 bg-card dark:bg-amber-900/10">
                <CardContent className="p-8 text-center">
                  <Gift className="w-16 h-16 text-amber-600 dark:text-amber-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-foreground mb-2">
                    Next Giveaway Coming Soon
                  </h3>
                  <p className="text-muted-foreground">
                    Stay tuned! We're preparing an exclusive giveaway just for Founder's Circle members.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Spontaneous Credits */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <Sparkles className="w-6 h-6" />
                    <h3 className="text-xl font-bold">Surprise Rewards</h3>
                  </div>
                  <p className="text-white/90 text-sm mb-4">
                    Keep an eye on this space! We occasionally drop surprise store credits and 
                    special perks for our most loyal backers. Your next reward could appear at any time!
                  </p>
                  <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
                    <p className="text-xs text-white/80 mb-1">Last surprise reward</p>
                    <p className="text-lg font-bold">Coming soon...</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Right Column - Community */}
          <div className="space-y-6">
            <Card className="border border-amber-600/30 bg-card dark:bg-amber-900/10 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-amber-600 to-amber-700 text-white">
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  Community Window
                </CardTitle>
                <p className="text-xs text-white/90 mt-1">
                  Connect with fellow founders and the team
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {/* New Post Form */}
                  <div className="p-4 border-b border-border dark:bg-muted/20">
                    <Textarea
                      value={newPost}
                      onChange={(e) => setNewPost(e.target.value)}
                      placeholder="Share your thoughts with the community..."
                      className="mb-2 dark:bg-muted dark:border-border dark:text-foreground"
                      rows={3}
                    />
                    <Button
                      onClick={handlePostSubmit}
                      disabled={!newPost.trim() || createPostMutation.isLoading}
                      className="w-full bg-amber-600 hover:bg-amber-700"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Post
                    </Button>
                  </div>

                {/* Posts Feed */}
                <div className="max-h-[600px] overflow-y-auto">
                  {/* Founder Posts */}
                  {founderPosts.map(post => (
                    <div
                      key={post.id}
                      className="p-4 border-b border-border bg-amber-500/5 dark:bg-amber-900/10"
                    >
                      <div className="flex items-start gap-3">
                        <Avatar className="w-10 h-10 ring-2 ring-amber-500">
                          <AvatarFallback className="bg-amber-600 text-white font-bold">
                            👑
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-foreground">{post.author_name}</p>
                            <Badge className="bg-amber-600 text-white text-xs">
                              Founder
                            </Badge>
                            {post.pinned && (
                              <Pin className="w-3 h-3 text-amber-600 dark:text-amber-500" />
                            )}
                          </div>
                          <p className="text-sm text-foreground mb-2">{post.content}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{format(new Date(post.created_date), 'MMM d, h:mm a')}</span>
                            <button
                              onClick={() => likePostMutation.mutate({ postId: post.id, likes: post.likes || 0 })}
                              className="flex items-center gap-1 hover:text-red-600"
                            >
                              <Heart className="w-3 h-3" />
                              {post.likes || 0}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Community Posts */}
                  {communityPosts.map(post => (
                    <div key={post.id} className="p-4 border-b border-border hover:bg-muted/50 dark:hover:bg-muted/20">
                      <div className="flex items-start gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarFallback className="bg-amber-600 text-white">
                            {post.author_name?.[0]?.toUpperCase() || 'F'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-foreground">{post.author_name}</p>
                            <Badge variant="outline" className="text-xs dark:border-border">
                              Founder Member
                            </Badge>
                          </div>
                          <p className="text-sm text-foreground mb-2">{post.content}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>{format(new Date(post.created_date), 'MMM d, h:mm a')}</span>
                            <button
                              onClick={() => likePostMutation.mutate({ postId: post.id, likes: post.likes || 0 })}
                              className="flex items-center gap-1 hover:text-red-600"
                            >
                              <Heart className="w-3 h-3" />
                              {post.likes || 0}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {posts.length === 0 && (
                    <div className="p-8 text-center">
                      <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">
                        Be the first to post in the community!
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Exclusive Access Badge */}
            <Card className="bg-amber-500/10 dark:bg-amber-900/20 border border-amber-500/30">
              <CardContent className="p-6 text-center">
                <Lock className="w-10 h-10 mx-auto mb-3 text-amber-600 dark:text-amber-400" />
                <h3 className="font-bold text-lg text-foreground mb-2">Exclusive Access</h3>
                <p className="text-xs text-muted-foreground">
                  This dashboard is reserved for Founder's Circle members only. 
                  Thank you for your early support! 🙏
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}