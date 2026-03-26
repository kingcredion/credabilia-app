import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Palette,
  LayoutDashboard,
  Store,
  Plus,
  TrendingUp,
  Image as ImageIcon,
  MessageSquare,
  Settings,
  ExternalLink,
  PenTool,
  Clock,
  CheckCircle2,
  XCircle,
  ShieldCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

// Safe date formatter
const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString();
  } catch (e) {
    return "N/A";
  }
};

// Safe number parser
const safeNumber = (val) => {
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

export default function ArtistDashboard() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [artistData, setArtistData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const userData = await base44.auth.me();
        if (isMounted) setUser(userData);
        
        if (userData) {
          // Robust filter to handle potential schema variations
          const artists = await base44.entities.Artist.filter({ user_email: userData.email });
          if (isMounted && artists.length > 0) {
            setArtistData(artists[0]);
          }
        }
      } catch (e) {
        console.error("Failed to load artist data", e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, []);

  const { data: artworks = [] } = useQuery({
    queryKey: ['artist-artworks', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      try {
        return await base44.entities.Item.filter({ vendor_email: user.email }, "-created_date");
      } catch (e) {
        return [];
      }
    },
    enabled: !!user?.email
  });

  const { data: commissions = [] } = useQuery({
    queryKey: ['artist-commissions', artistData?.id],
    queryFn: async () => {
      if (!artistData?.id) return [];
      try {
        // Safe filter
        return await base44.entities.CommissionRequest.filter({ artist_email: artistData.user_email }, "-created_date");
      } catch (e) {
        return [];
      }
    },
    enabled: !!artistData?.id
  });

  const updateCommissionStatusMutation = useMutation({
    mutationFn: async ({ id, status, quote_amount }) => {
      await base44.entities.CommissionRequest.update(id, { 
        status, 
        ...(quote_amount && { quote_amount }) 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['artist-commissions'] });
      toast.success("Commission status updated");
    },
    onError: () => toast.error("Failed to update commission")
  });

  const toggleCommissionsMutation = useMutation({
    mutationFn: async (isOpen) => {
      if (!artistData?.id) return;
      await base44.entities.Artist.update(artistData.id, { commission_open: isOpen });
    },
    onSuccess: (_, isOpen) => {
      setArtistData(prev => ({ ...prev, commission_open: isOpen }));
      queryClient.invalidateQueries({ queryKey: ['artist-profile'] });
      toast.success(isOpen ? "Commissions opened" : "Commissions closed");
    },
    onError: () => toast.error("Failed to update settings")
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading Artist Dashboard...</p>
        </div>
      </div>
    );
  }

  // Graceful fallback if no artist profile found
  if (!artistData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full text-center dark:bg-card dark:border-border">
          <CardContent className="p-8">
            <Palette className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">Artist Profile Not Found</h2>
            <p className="text-muted-foreground mb-6">You need to create an artist profile to access this dashboard.</p>
            <Link to={createPageUrl("Onboarding")}>
              <Button className="bg-pink-600 hover:bg-pink-700">Create Profile</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isApproved = artistData.status === 'active';

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Hero Banner */}
        <div 
          className="relative mb-8 rounded-2xl overflow-hidden text-white shadow-xl min-h-[240px] flex items-end"
          style={{
            backgroundImage: 'url(https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/d25cfa59f_Photoroom_20251216_110752.png)',
            backgroundPosition: 'right bottom',
            backgroundSize: 'auto 90%',
            backgroundRepeat: 'no-repeat',
          }}
        >
           <div className="absolute inset-0 bg-gradient-to-r from-pink-600 via-pink-600 to-rose-600 opacity-85 z-10"></div>
           <div className="relative z-20 p-8 md:p-12 max-w-2xl w-full">
             <div className="flex items-center gap-3 mb-4">
               <div className="p-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/10">
                 <Palette className="w-8 h-8 text-pink-100" />
               </div>
               <Badge className="bg-pink-400/50 hover:bg-pink-400/60 text-white border-white/10">Verified Artist</Badge>
             </div>
             <h1 className="text-3xl md:text-4xl font-bold mb-4 text-white">Artist Studio</h1>
             <p className="text-pink-100 text-lg mb-6 max-w-lg">
               Manage your portfolio, track art sales, and connect with collectors through commissions.
             </p>
             <div className="flex flex-wrap gap-3">
               <Link to={createPageUrl("CreateListing")}>
                <Button className="bg-white text-pink-600 hover:bg-pink-50 border-0 shadow-lg">
                  <Plus className="w-4 h-4 mr-2" />
                  New Artwork
                </Button>
               </Link>
               <Link to={createPageUrl(`ArtistProfile?id=${artistData.id}`)}>
                 <Button variant="outline" className="text-white border-white/20 hover:bg-white/10">
                   <ExternalLink className="w-4 h-4 mr-2" />
                   View Public Profile
                 </Button>
               </Link>
             </div>
           </div>
           </div>

           {!isApproved && (
          <Card className="border-l-4 border-amber-500 bg-amber-500/10 dark:bg-amber-900/20">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-full text-amber-600 dark:text-amber-500">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-amber-900 dark:text-amber-300">Profile Under Review</h3>
                <p className="text-sm text-amber-800 dark:text-amber-300/80">
                  Your artist profile is currently pending approval. You can still upload artwork, but your profile won't be publicly listed in the artist directory until approved.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-card dark:bg-muted/30 border-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 rounded-lg bg-pink-500/10 dark:bg-pink-900/20">
                  <ImageIcon className="w-5 h-5 text-pink-600 dark:text-pink-500" />
                </div>
                <Badge className="bg-pink-500/20 text-pink-700 dark:text-pink-400 text-xs">Portfolio</Badge>
              </div>
              <p className="text-2xl font-bold text-foreground">{artworks.length}</p>
              <p className="text-sm text-muted-foreground mt-1">Total Artworks</p>
            </CardContent>
          </Card>

          <Card className="bg-card dark:bg-muted/30 border-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 rounded-lg bg-green-500/10 dark:bg-green-900/20">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-500" />
                </div>
                <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 text-xs">Sales</Badge>
              </div>
              <p className="text-2xl font-bold text-foreground">{safeNumber(artistData.total_sales)}</p>
              <p className="text-sm text-muted-foreground mt-1">Total Sales</p>
            </CardContent>
          </Card>

          <Card className="bg-pink-500/10 dark:bg-pink-900/20 border-pink-500/30 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-pink-100 to-transparent opacity-50 rounded-bl-full pointer-events-none"></div>
            <CardContent className="p-6 relative z-10">
              <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2">
                   <Palette className="w-4 h-4 text-pink-600 dark:text-pink-500" />
                   <p className="text-sm font-medium text-pink-900 dark:text-pink-300">Commissions</p>
                 </div>
                <Switch 
                  checked={!!artistData.commission_open}
                  onCheckedChange={(checked) => toggleCommissionsMutation.mutate(checked)}
                  className="data-[state=checked]:bg-pink-600"
                />
              </div>
              <h3 className={`text-2xl font-bold ${artistData.commission_open ? "text-pink-600 dark:text-pink-400" : "text-muted-foreground"}`}>
                 {artistData.commission_open ? "Open" : "Closed"}
               </h3>
               <p className={`text-xs mt-1 ${artistData.commission_open ? "text-pink-700 dark:text-pink-400" : "text-muted-foreground"}`}>
                 {artistData.commission_open ? "Accepting new requests" : "Not accepting requests"}
               </p>
            </CardContent>
          </Card>
          
           <Card className="bg-card dark:bg-muted/30 border-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2 rounded-lg bg-blue-500/10 dark:bg-blue-900/20">
                  <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-500" />
                </div>
                <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs">Inbox</Badge>
              </div>
              <Link to={createPageUrl("Messages")}>
                <Button variant="link" className="p-0 h-auto font-semibold text-blue-600 dark:text-blue-500">
                  Go to Inbox &rarr;
                </Button>
              </Link>
            </CardContent>
           </Card>
        </div>

        <Tabs defaultValue="artworks" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="artworks">Artworks</TabsTrigger>
            <TabsTrigger value="commissions">
              Commissions
              {commissions.filter(c => c?.status === 'pending_review').length > 0 && (
                <Badge className="ml-2 bg-pink-600 hover:bg-pink-700">{commissions.filter(c => c?.status === 'pending_review').length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="commissions">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold text-foreground">Commission Requests</h2>
                </div>

                {commissions.length === 0 ? (
                        <Card className="bg-muted/40 dark:bg-muted/20 border-dashed border-border">
                          <CardContent className="p-12 text-center">
                            <PenTool className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-foreground mb-2">No commissions yet</h3>
                            <p className="text-muted-foreground">
                        {artistData.commission_open 
                          ? "Requests will appear here when collectors contact you." 
                          : "Enable commissions in the dashboard to start receiving requests."}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {commissions.map((request) => (
                      <Card key={request.id} className="bg-card dark:bg-muted/30 border-border shadow-sm hover:shadow-md transition-all">
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start">
                                      <div>
                                        <CardTitle className="text-lg text-foreground">{request.title || "Untitled Request"}</CardTitle>
                                        <p className="text-sm text-muted-foreground">From: {request.collector_name || "Unknown"}</p>
                                      </div>
                            <Badge className={
                              request.status === 'pending_review' ? 'bg-yellow-500' :
                              request.status === 'in_progress' ? 'bg-blue-500' :
                              request.status === 'completed' ? 'bg-green-500' :
                              'bg-gray-500'
                            }>
                              {request.status?.replace('_', ' ') || "Unknown"}
                            </Badge>
                            {request.payment_status === 'escrow_held' && (
                             <Badge className="bg-purple-500/20 text-purple-700 dark:text-purple-400 ml-2">
                               <ShieldCheck className="w-3 h-3 mr-1" />
                               Funds in Escrow
                             </Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-muted-foreground block">Budget</span>
                              <span className="text-foreground">{request.budget_range || "N/A"}</span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground block">Deadline</span>
                              <span className="text-foreground">{request.deadline ? formatDate(request.deadline) : "No deadline"}</span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground block">Medium</span>
                              <span className="text-foreground">{request.medium || "N/A"}</span>
                            </div>
                            <div>
                              <span className="font-medium text-muted-foreground block">Dimensions</span>
                              <span className="text-foreground">{request.dimensions || "N/A"}</span>
                            </div>
                          </div>

                          <div className="bg-muted/50 dark:bg-muted/20 p-3 rounded-lg text-sm border border-border">
                            <span className="font-medium text-muted-foreground block mb-1">Description</span>
                            <p className="text-foreground">{request.description || "No description provided."}</p>
                          </div>

                          {request.status === 'pending_review' && (
                            <div className="flex gap-2 justify-end pt-2">
                              <Button 
                                 variant="outline" 
                                 className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-500/10 dark:hover:bg-red-900/20 border-red-200 dark:border-red-500/30"
                                 onClick={() => updateCommissionStatusMutation.mutate({ id: request.id, status: 'declined' })}
                               >
                                 Decline
                               </Button>
                              <Link to={createPageUrl(`Messages?startConversation=${request.collector_email}&commissionRequestId=${request.id}&name=${encodeURIComponent(request.collector_name)}&type=commission_request`)}>
                                <Button className="bg-pink-600 hover:bg-pink-700">
                                  Reply / Quote
                                </Button>
                              </Link>
                            </div>
                          )}

                          {request.status === 'in_progress' && (
                            <div className="flex gap-2 justify-end pt-2">
                              <Button 
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => updateCommissionStatusMutation.mutate({ id: request.id, status: 'completed_pending_approval' })}
                              >
                                Submit for Review
                              </Button>
                              <Link to={createPageUrl(`Messages?startConversation=${request.collector_email}&commissionRequestId=${request.id}&name=${encodeURIComponent(request.collector_name)}&type=commission_request`)}>
                                <Button variant="outline">
                                  Message Collector
                                </Button>
                              </Link>
                            </div>
                          )}
                          
                          {request.status === 'completed_pending_approval' && (
                             <div className="flex gap-2 justify-end pt-2">
                                <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 pointer-events-none">
                                  Waiting for Collector Approval
                                </Badge>
                                <Link to={createPageUrl(`Messages?startConversation=${request.collector_email}&commissionRequestId=${request.id}&name=${encodeURIComponent(request.collector_name)}&type=commission_request`)}>
                                  <Button variant="outline">
                                    Message
                                  </Button>
                                </Link>
                             </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Sidebar content for commissions tab */}
              <div className="space-y-6">
               <Card className="bg-card dark:bg-muted/30 border-border">
                 <CardHeader>
                   <CardTitle className="text-lg text-foreground">Commission Settings</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4">
                   <div className="flex items-center justify-between">
                     <span className="text-sm font-medium text-foreground">Accepting Requests</span>
                     <Switch 
                       checked={!!artistData.commission_open}
                       onCheckedChange={(checked) => toggleCommissionsMutation.mutate(checked)}
                     />
                   </div>
                   <p className="text-xs text-muted-foreground">
                     When enabled, a "Commission" button will appear on your public profile allowing collectors to send you custom requests.
                   </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="artworks">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <h2 className="text-xl font-bold text-foreground">Your Artworks</h2>
                
                {artworks.length === 0 ? (
                  <Card className="bg-muted/40 dark:bg-muted/20 border-dashed border-border">
                    <CardContent className="p-12 text-center">
                      <Palette className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">No artworks yet</h3>
                      <p className="text-muted-foreground mb-6">Start building your portfolio by uploading your first piece.</p>
                      <Link to={createPageUrl("CreateListing")}>
                        <Button className="bg-pink-600 hover:bg-pink-700">Upload Artwork</Button>
                      </Link>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {artworks.slice(0, 4).map((artwork) => (
                      <Card key={artwork.id} className="overflow-hidden hover:shadow-md transition-shadow bg-card dark:bg-muted/30 border-border">
                        <div className="aspect-video bg-muted relative">
                          {artwork.images?.[0] ? (
                            <img 
                              src={artwork.images[0]} 
                              alt={artwork.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                              <ImageIcon className="w-8 h-8" />
                            </div>
                          )}
                          <div className="absolute top-2 right-2">
                            <Badge className={
                              artwork.status === 'active' ? 'bg-green-500' : 
                              artwork.status === 'sold' ? 'bg-gray-500' : 'bg-yellow-500'
                            }>
                              {artwork.status}
                            </Badge>
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <h3 className="font-semibold text-foreground truncate mb-1">{artwork.title}</h3>
                          <p className="text-sm text-muted-foreground mb-3">${safeNumber(artwork.price).toLocaleString()}</p>
                          <div className="flex items-center justify-between">
                             <Link to={createPageUrl(`ItemDetails?id=${artwork.id}`)}>
                              <Button variant="ghost" size="sm" className="text-xs">View</Button>
                            </Link>
                            <Link to={createPageUrl(`EditListing?id=${artwork.id}`)}>
                              <Button variant="outline" size="sm" className="text-xs">Edit</Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Sidebar content for artworks tab */}
              <div className="space-y-6">
                <Card className="bg-card dark:bg-muted/30 border-border">
                  <CardHeader>
                    <CardTitle className="text-lg text-foreground">Artist Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-center mb-4">
                      <Avatar className="w-20 h-20 mx-auto mb-3">
                        <AvatarImage src={user.avatar_url} />
                        <AvatarFallback className="bg-pink-600 text-white">{(artistData.artist_name || 'A')[0]}</AvatarFallback>
                      </Avatar>
                      <h3 className="font-bold text-foreground">{artistData.artist_name}</h3>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-border">
                      <div>
                        <span className="text-sm font-medium text-muted-foreground block">Bio</span>
                        <p className="text-sm text-foreground line-clamp-3">{artistData.bio || "No bio added yet."}</p>
                      </div>

                      {artistData.portfolio_url && (
                        <div>
                          <span className="text-sm font-medium text-muted-foreground block">Portfolio</span>
                          <a href={artistData.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-sm text-pink-600 dark:text-pink-500 hover:underline truncate block">
                            {artistData.portfolio_url}
                          </a>
                        </div>
                      )}

                       {artistData.instagram_handle && (
                        <div>
                          <span className="text-sm font-medium text-muted-foreground block">Instagram</span>
                          <p className="text-sm text-foreground">@{artistData.instagram_handle.replace('@', '')}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-4 px-1 py-2 bg-muted/50 dark:bg-muted/20 rounded-lg border border-border">
                      <span className="text-sm font-medium text-foreground">Commissions</span>
                      <Switch 
                        checked={!!artistData.commission_open}
                        onCheckedChange={(checked) => toggleCommissionsMutation.mutate(checked)}
                        className="scale-90 data-[state=checked]:bg-pink-600"
                      />
                    </div>

                    <Link to={createPageUrl("Settings")}>
                        <Button variant="outline" className="w-full mt-4">Edit Profile</Button>
                    </Link>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}