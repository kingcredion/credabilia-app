import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { 
  MapPin, 
  Globe, 
  Clock, 
  Star, 
  CheckCircle, 
  ArrowLeft,
  Send,
  Camera,
  MessageSquare,
  ShieldCheck,
  ImageIcon,
  Palette,
  Brush,
  Instagram,
  Loader2,
  Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import ImageZoomDialog from "../components/ImageZoomDialog";
import ReviewsSection from "../components/ReviewsSection";
import UnifiedProfileHeader from "../components/profiles/UnifiedProfileHeader";

// Safe number parser
const safeNumber = (val) => {
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

export default function ArtistProfile() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const artistId = searchParams.get("id");
  const artistEmail = searchParams.get("email");
  const isPreviewMode = searchParams.get("preview") === "true";
  
  const [user, setUser] = useState(null);
  const [requestForm, setRequestForm] = useState({
    title: "",
    description: "",
    medium: "",
    dimensions: "",
    budget_range: "",
    deadline: "",
    reference_images: []
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);

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

  const { data: artist, isLoading } = useQuery({
    queryKey: ['artist', artistId || artistEmail, user?.email],
    queryFn: async () => {
      let artists = [];
      if (artistId && artistId !== "undefined") {
        artists = await base44.entities.Artist.filter({ id: artistId });
      } else if (artistEmail) {
        artists = await base44.entities.Artist.filter({ user_email: artistEmail });
      } else if (user?.email) {
        // Fallback for owner viewing their own profile if no params
        artists = await base44.entities.Artist.filter({ user_email: user.email });
      }
      return artists[0] || null;
    },
    enabled: !!(artistId || artistEmail || user?.email)
  });

  const { data: artistOwner } = useQuery({
    queryKey: ['artist-owner', artist?.user_email],
    queryFn: async () => {
      if (!artist?.user_email) return null;
      try {
        const users = await base44.entities.User.list();
        const user = users?.find(u => u.email === artist.user_email);
        return user || null;
      } catch (error) {
        return null;
      }
    },
    enabled: !!artist?.user_email
  });

  // Fetch items for portfolio
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['artist-portfolio-items', artist?.user_email],
    queryFn: async () => {
      if (!artist?.user_email) return [];
      try {
        return await base44.entities.Item.filter({ 
          vendor_email: artist.user_email,
          status: "active" 
        }, "-created_date");
      } catch (e) {
        return [];
      }
    },
    enabled: !!artist?.user_email
  });

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setRequestForm(prev => ({
        ...prev,
        reference_images: [...prev.reference_images, file_url]
      }));
      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in to request a commission");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create the commission request
      const requestData = {
        collector_email: user.email,
        collector_name: user.full_name || user.email.split('@')[0],
        artist_id: artist.id,
        artist_email: artist.user_email,
        title: requestForm.title,
        description: requestForm.description,
        medium: requestForm.medium,
        dimensions: requestForm.dimensions,
        budget_range: requestForm.budget_range,
        deadline: requestForm.deadline,
        reference_images: requestForm.reference_images, // Ensure this array is handled by backend or convert to string if needed? No, entities usually handle arrays.
        status: "pending_review"
      };

      const newRequest = await base44.entities.CommissionRequest.create(requestData);

      // 2. Send DM to the artist
      const messageContent = `
🎨 New Commission Request: ${requestForm.title}

Medium: ${requestForm.medium}
Dimensions: ${requestForm.dimensions}
Budget: ${requestForm.budget_range}
Deadline: ${requestForm.deadline || "None"}

Description:
${requestForm.description}

Please review the request and provide a quote.
      `.trim();

      await base44.entities.Message.create({
        sender_email: user.email,
        sender_name: user.full_name || user.email.split('@')[0],
        receiver_email: artist.user_email,
        receiver_name: artist.artist_name,
        message: messageContent,
        commission_request_id: newRequest.id,
        conversation_type: "commission_request",
        item_title: requestForm.title,
        item_image_url: requestForm.reference_images[0]
      });

      toast.success("Commission request sent successfully! Check your messages for updates.");
      navigate(createPageUrl(`Messages?startConversation=${artist.user_email}`));
    } catch (error) {
      console.error("Submission error:", error);
      toast.error("Failed to submit request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayPrice = (price) => {
    const num = safeNumber(price);
    return num > 0 ? `$${num.toLocaleString()}` : "Price on Request";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-pink-50 dark:bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="min-h-screen bg-pink-50 dark:bg-background p-6 flex flex-col items-center justify-center">
         <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-4">Artist Not Found</h1>
         <p className="text-gray-600 dark:text-muted-foreground mb-6">The artist profile you are looking for does not exist.</p>
        <Button onClick={() => navigate(createPageUrl("ExploreArtists"))}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Artists
        </Button>
      </div>
    );
  }

  if (artist.status !== 'active' && user?.email !== artist.user_email) {
    return (
      <div className="min-h-screen bg-pink-50 dark:bg-background p-6 flex flex-col items-center justify-center">
         <ShieldCheck className="w-16 h-16 text-pink-300 dark:text-pink-700 mb-4" />
         <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-2">Profile Under Review</h1>
         <p className="text-gray-600 dark:text-muted-foreground mb-6 text-center max-w-md">
          This artist profile is currently being vetted by our team. Please check back later.
        </p>
        <Button onClick={() => navigate(createPageUrl("ExploreArtists"))}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Artists
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50 dark:bg-background pb-12">
      <UnifiedProfileHeader
        displayName={artist.artist_name}
        headline="Professional Artist"
        avatarUrl={artistOwner?.avatar_url}
        fallbackInitial={(artist.artist_name || 'A')[0]}
        gradientFrom="from-pink-500"
        gradientVia="via-rose-500"
        gradientTo="to-red-500"
        credionImageUrl="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/d25cfa59f_Photoroom_20251216_110752.png"
        location={artistOwner?.location}
        rating={0}
        reviewCount={0}
        totalSales={safeNumber(artist.total_sales)}
        isVerified={artist.status === 'active'}
        isOwner={user?.email === artist.user_email}
        profileType="Artist Profile"
        isPreviewMode={isPreviewMode}
        onMessage={() => {
           if (!user) {
             toast.error("Please sign in to message");
             return;
           }
           navigate(createPageUrl(`Messages?startConversation=${artist.user_email}&name=${encodeURIComponent(artist.artist_name)}`));
         }}
        dashboardLabel="Manage Studio"
        dashboardIcon={Palette}
        dashboardRoute={createPageUrl("ArtistDashboard")}
        onPreviewPublic={() => {
           if (user?.email !== artist.user_email) return;
           navigate(createPageUrl(`ArtistProfile?id=${artist.id}&preview=true`));
         }}
        onExitPreview={() => {
           navigate(createPageUrl(`ArtistProfile?id=${artist.id}`));
         }}
      />

      <div className="max-w-7xl mx-auto px-6 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Info & Portfolio */}
          <div className="lg:col-span-2 space-y-8">
            <Tabs defaultValue="about" className="w-full">
              <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-6">
                <TabsTrigger 
                  value="about" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-pink-600 data-[state=active]:text-pink-700 data-[state=active]:bg-transparent pb-3 px-1"
                >
                  About & Specialties
                </TabsTrigger>
                <TabsTrigger 
                  value="portfolio"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-pink-600 data-[state=active]:text-pink-700 data-[state=active]:bg-transparent pb-3 px-1"
                >
                  Portfolio ({items.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="reviews"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-pink-600 data-[state=active]:text-pink-700 data-[state=active]:bg-transparent pb-3 px-1"
                >
                  Reviews
                </TabsTrigger>
              </TabsList>

              <TabsContent value="about" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>About the Artist</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 dark:text-muted-foreground whitespace-pre-wrap">{artist.bio || "No bio available."}</p>
                    
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center gap-2 text-pink-700 dark:text-pink-300">
                          <Palette className="w-4 h-4" />
                          Specialties
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {(artist.specialties || []).map((specialty) => (
                            <Badge key={specialty} variant="secondary" className="bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/50">
                              {specialty}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-3 text-sm">
                        {artist.portfolio_url && (
                          <div className="flex items-center gap-3 text-gray-600 dark:text-muted-foreground">
                            <Globe className="w-4 h-4 text-gray-400 dark:text-muted-foreground/60" />
                            <a href={artist.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">
                              Portfolio Website
                            </a>
                          </div>
                        )}
                        {artist.instagram_handle && (
                          <div className="flex items-center gap-3 text-gray-600 dark:text-muted-foreground">
                            <Instagram className="w-4 h-4 text-gray-400 dark:text-muted-foreground/60" />
                            <a href={`https://instagram.com/${artist.instagram_handle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">
                              @{artist.instagram_handle.replace('@', '')}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="portfolio" className="mt-6">
                {itemsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {items.map((item) => (
                  item.images?.[0] && (
                    <div 
                      key={item.id} 
                      className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-muted cursor-pointer hover:opacity-90 transition-opacity relative group"
                          onClick={() => setZoomImage(item.images[0])}
                        >
                          <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-xs truncate">{item.title}</p>
                            <p className="text-[10px] opacity-80">{displayPrice(item.price)}</p>
                          </div>
                        </div>
                      )
                    ))}
                    {items.length === 0 && (
                      <div className="col-span-full py-12 text-center text-gray-500 dark:text-muted-foreground bg-white dark:bg-muted/20 rounded-lg border border-dashed border-pink-200 dark:border-border">
                        <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20 text-pink-400" />
                        <p>No artworks uploaded yet.</p>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="reviews" className="mt-6">
                <ReviewsSection 
                  targetEmail={artist.user_email} 
                  currentUser={user}
                  title="Artist Reviews"
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column: Request Form (only show if not in preview mode or not owner) */}
          {!isPreviewMode && (
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-4">
              {artist.commission_open ? (
                <Card className="border-pink-200 dark:border-border shadow-lg overflow-hidden dark:bg-muted/30">
                  <div className="bg-gradient-to-r from-pink-50 to-orange-50 dark:from-pink-900/20 dark:to-orange-900/20 p-4 border-b border-pink-100 dark:border-border">
                    <h3 className="font-bold text-pink-900 dark:text-pink-300 flex items-center gap-2">
                      <Brush className="w-4 h-4" />
                      Request Commission
                    </h3>
                    <p className="text-xs text-pink-700 dark:text-pink-400 mt-1">
                      Fill out the form below to request a custom artwork.
                    </p>
                  </div>
                  <CardContent className="p-4">
                    <form onSubmit={handleSubmitRequest} className="space-y-4">
                      <div>
                        <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground">Project Title</Label>
                        <Input 
                          placeholder="e.g. Portrait of my dog"
                          value={requestForm.title}
                          onChange={(e) => setRequestForm({...requestForm, title: e.target.value})}
                          required
                          className="mt-1"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground">Medium</Label>
                          <Input 
                            placeholder="e.g. Oil on Canvas"
                            value={requestForm.medium}
                            onChange={(e) => setRequestForm({...requestForm, medium: e.target.value})}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground">Deadline</Label>
                          <Input 
                            type="date"
                            value={requestForm.deadline}
                            onChange={(e) => setRequestForm({...requestForm, deadline: e.target.value})}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground">Dimensions</Label>
                        <Input 
                          placeholder="e.g. 24x36 inches"
                          value={requestForm.dimensions}
                          onChange={(e) => setRequestForm({...requestForm, dimensions: e.target.value})}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground">Budget Range</Label>
                        <Input 
                          placeholder="e.g. $200-$400"
                          value={requestForm.budget_range}
                          onChange={(e) => setRequestForm({...requestForm, budget_range: e.target.value})}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground">Description</Label>
                        <Textarea 
                          placeholder="Describe your vision, style preferences, etc..."
                          value={requestForm.description}
                          onChange={(e) => setRequestForm({...requestForm, description: e.target.value})}
                          required
                          className="mt-1 h-24"
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground mb-2 block">Reference Images (Optional)</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {requestForm.reference_images.map((img, idx) => (
                            <div key={idx} className="relative aspect-square rounded-md overflow-hidden bg-gray-100 dark:bg-muted border dark:border-border">
                              <img src={img} alt="" className="w-full h-full object-cover" />
                            </div>
                          ))}
                          <label className="aspect-square rounded-md border-2 border-dashed border-gray-200 dark:border-border hover:border-pink-400 dark:hover:border-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20 flex flex-col items-center justify-center cursor-pointer transition-colors">
                            <input 
                              type="file" 
                              className="hidden" 
                              accept="image/*"
                              onChange={handleImageUpload}
                              disabled={uploadingImage}
                            />
                            {uploadingImage ? (
                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-600"></div>
                            ) : (
                              <>
                                <Camera className="w-5 h-5 text-gray-400 mb-1" />
                                <span className="text-[10px] text-gray-500">Add Photo</span>
                              </>
                            )}
                          </label>
                        </div>
                      </div>

                      <Button 
                        type="submit" 
                        className="w-full bg-pink-600 hover:bg-pink-700 text-white font-semibold py-6"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Sending..." : "Request Commission"}
                      </Button>
                      
                      {!user && (
                        <p className="text-xs text-center text-red-500 bg-red-50 p-2 rounded">
                          You must be signed in to submit a request.
                        </p>
                      )}
                    </form>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-gray-50 dark:bg-muted/20 border-dashed dark:border-border">
                  <CardContent className="p-6 text-center">
                    <div className="bg-gray-100 dark:bg-muted w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Brush className="w-6 h-6 text-gray-400 dark:text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-foreground">Commissions Closed</h3>
                    <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">
                      This artist is not accepting new commission requests at this time.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Trust Badge */}
              <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 flex gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300">Secure Payments</h4>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                    Payments are held in escrow until you approve the final work.
                  </p>
                </div>
              </div>
            </div>
            </div>
            )}
            </div>
            </div>

            <ImageZoomDialog 
            isOpen={!!zoomImage}
        onClose={() => setZoomImage(null)}
        imageUrl={zoomImage}
      />
    </div>
  );
}