import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  MapPin, 
  Phone, 
  Globe, 
  Clock, 
  Star, 
  CheckCircle, 
  ArrowLeft,
  Upload,
  Send,
  Camera,
  MessageSquare,
  ShieldCheck,
  ImageIcon,
  Store,
  Eye
} from "lucide-react";
import UnifiedProfileHeader from "../components/profiles/UnifiedProfileHeader";
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

export default function FrameShopProfile() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const shopId = searchParams.get("id");
  const shopEmail = searchParams.get("email");
  const isPreviewMode = searchParams.get("preview") === "true";
  
  const [user, setUser] = useState(null);
  const [requestForm, setRequestForm] = useState({
    title: "",
    description: "",
    item_type: "memorabilia",
    dimensions: "",
    preferred_style: "",
    budget_range: "",
    urgency: "standard",
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

  const { data: shop, isLoading } = useQuery({
    queryKey: ['frame-shop', shopId || shopEmail],
    queryFn: async () => {
      let shops = [];
      if (shopId) {
        shops = await base44.entities.FrameShop.filter({ id: shopId });
      } else if (shopEmail) {
        shops = await base44.entities.FrameShop.filter({ user_email: shopEmail });
      }
      return shops[0] || null;
    },
    enabled: !!(shopId || shopEmail)
  });

  const { data: shopOwner } = useQuery({
    queryKey: ['shop-owner', shop?.user_email],
    queryFn: async () => {
      if (!shop?.user_email) return null;
      try {
        const users = await base44.entities.User.list();
        const owner = users?.find(u => u.email === shop.user_email);
        return owner || null;
      } catch (error) {
        return null;
      }
    },
    enabled: !!shop?.user_email
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
      toast.error("Please sign in to submit a request");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create the framing request
      const requestData = {
        collector_email: user.email,
        collector_name: user.full_name || user.email.split('@')[0],
        frame_shop_email: shop.user_email,
        frame_shop_name: shop.business_name,
        title: requestForm.title,
        description: requestForm.description,
        item_type: requestForm.item_type,
        dimensions: requestForm.dimensions,
        reference_images: requestForm.reference_images,
        preferred_style: requestForm.preferred_style,
        budget_range: requestForm.budget_range,
        urgency: requestForm.urgency,
        status: "pending_quote"
      };

      const newRequest = await base44.entities.FramingRequest.create(requestData);

      // 2. Send DM to the shop owner
      const messageContent = `
New Framing Request: ${requestForm.title}

Item Type: ${requestForm.item_type}
Dimensions: ${requestForm.dimensions}
Urgency: ${requestForm.urgency}
Budget: ${requestForm.budget_range}

Description:
${requestForm.description}

Please review the request details and provide a quote.
      `.trim();

      await base44.entities.Message.create({
        sender_email: user.email,
        sender_name: user.full_name || user.email.split('@')[0],
        receiver_email: shop.user_email,
        receiver_name: shop.business_name,
        message: messageContent,
        framing_request_id: newRequest.id,
        conversation_type: "framing_request",
        item_title: requestForm.title,
        item_image_url: requestForm.reference_images[0]
      });

      toast.success("Request submitted successfully! Check your messages for updates.");
      navigate(createPageUrl(`Messages?startConversation=${shop.user_email}`));
    } catch (error) {
      console.error("Submission error:", error);
      toast.error("Failed to submit request");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background p-6 flex flex-col items-center justify-center">
         <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-4">Shop Not Found</h1>
        <Button onClick={() => navigate(createPageUrl("ExploreFrameShops"))}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Frame Shops
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background pb-12">
      <UnifiedProfileHeader
        displayName={shop.business_name}
        headline="Custom Framing Specialist"
        avatarUrl={shopOwner?.avatar_url}
        fallbackInitial={(shop.business_name || 'S')[0]}
        gradientFrom="from-purple-950"
        gradientVia="via-purple-800"
        gradientTo="to-indigo-900"
        credionImageUrl="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/9aa7d3ab0_Photoroom_20251215_114827.png"
        location={shop.address}
        rating={shop.rating || 0}
        reviewCount={shop.review_count || 0}
        totalSales={shop.total_jobs_completed || 0}
        isVerified={shop.status === 'active'}
        isOwner={user?.email === shop.user_email}
        profileType="Frame Shop Profile"
        isPreviewMode={isPreviewMode}
        onMessage={() => {
           if (!user) {
             toast.error("Please sign in to message");
             return;
           }
           navigate(createPageUrl(`Messages?startConversation=${shop.user_email}`));
         }}
        dashboardLabel="Manage Shop"
        dashboardIcon={Store}
        dashboardRoute={createPageUrl("FrameShopDashboard")}
        onPreviewPublic={() => {
           if (user?.email !== shop.user_email) return;
           navigate(createPageUrl(`FrameShopProfile?id=${shop.id}&preview=true`));
         }}
        onExitPreview={() => {
           navigate(createPageUrl(`FrameShopProfile?id=${shop.id}`));
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
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-600 data-[state=active]:bg-transparent pb-3 px-1"
                >
                  About & Services
                </TabsTrigger>
                <TabsTrigger 
                  value="portfolio"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-600 data-[state=active]:bg-transparent pb-3 px-1"
                >
                  Portfolio ({shop.portfolio_images?.length || 0})
                </TabsTrigger>
                <TabsTrigger 
                  value="reviews"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-600 data-[state=active]:bg-transparent pb-3 px-1"
                >
                  Reviews
                </TabsTrigger>
              </TabsList>

              <TabsContent value="about" className="mt-6 space-y-6">
                {shopOwner && (
                  <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border-purple-200 dark:border-purple-800">
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <Avatar className="w-16 h-16 ring-2 ring-purple-200 dark:ring-purple-700 flex-shrink-0">
                          <AvatarImage src={shopOwner.avatar_url} className="object-cover" />
                          <AvatarFallback className="bg-gradient-to-br from-purple-400 to-indigo-500 text-white text-lg font-semibold">
                            {(shopOwner.full_name || 'S')[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-1">
                            Owned & Operated By
                          </p>
                          <p className="text-lg font-bold text-purple-950 dark:text-purple-100 mb-1">
                            {shopOwner.full_name || 'Shop Owner'}
                          </p>
                          <p className="text-xs text-purple-700 dark:text-purple-400">
                            Verified Frame Shop Professional
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>About the Shop</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600 dark:text-muted-foreground whitespace-pre-wrap">{shop.description}</p>
                    
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold dark:text-foreground mb-3 flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-purple-600" />
                          Services Offered
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {shop.services_offered?.map((service) => (
                            <Badge key={service} variant="secondary" className="capitalize">
                              {service.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-3 text-sm">
                        {shop.contact_phone && (
                          <div className="flex items-center gap-3 text-gray-600 dark:text-muted-foreground">
                            <Phone className="w-4 h-4 text-gray-400" />
                            {shop.contact_phone}
                          </div>
                        )}
                        {shop.website_url && (
                          <div className="flex items-center gap-3 text-gray-600 dark:text-muted-foreground">
                            <Globe className="w-4 h-4 text-gray-400 dark:text-muted-foreground/60" />
                            <a href={shop.website_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                              Visit Website
                            </a>
                          </div>
                        )}
                        {shop.operating_hours && (
                          <div className="flex items-start gap-3 text-gray-600 dark:text-muted-foreground">
                            <Clock className="w-4 h-4 text-gray-400 dark:text-muted-foreground/60 mt-0.5" />
                            <span className="whitespace-pre-line">{shop.operating_hours}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="portfolio" className="mt-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {shop.portfolio_images?.map((img, idx) => (
                    <div 
                      key={idx} 
                      className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setZoomImage(img)}
                    >
                      <img src={img} alt={`Portfolio ${idx + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                  {(!shop.portfolio_images || shop.portfolio_images.length === 0) && (
                    <div className="col-span-full py-12 text-center text-gray-500 dark:text-muted-foreground bg-white dark:bg-muted/20 rounded-lg border border-dashed dark:border-border">
                      <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No portfolio images uploaded yet.</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="reviews" className="mt-6">
                <ReviewsSection 
                  frameShopId={shop.id} 
                  currentUser={user}
                  title="Shop Reviews"
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column: Request Form (only show if not in preview mode) */}
          {!isPreviewMode && (
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <Card className="border-purple-100 dark:border-border shadow-lg overflow-hidden dark:bg-muted/30">
                <div className="bg-purple-50 dark:bg-purple-900/20 p-4 border-b border-purple-100 dark:border-border">
                  <h3 className="font-bold text-purple-900 dark:text-purple-300 flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Request a Quote
                  </h3>
                  <p className="text-xs text-purple-700 dark:text-purple-400 mt-1">
                    Fill out the form below to start a conversation with the shop owner.
                  </p>
                </div>
                <CardContent className="p-4">
                  <form onSubmit={handleSubmitRequest} className="space-y-4">
                    <div>
                      <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground">Project Title</Label>
                      <Input 
                        placeholder="e.g. Vintage Jersey Framing"
                        value={requestForm.title}
                        onChange={(e) => setRequestForm({...requestForm, title: e.target.value})}
                        required
                        className="mt-1"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground">Type</Label>
                        <Select 
                          value={requestForm.item_type}
                          onValueChange={(val) => setRequestForm({...requestForm, item_type: val})}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="memorabilia">Memorabilia</SelectItem>
                            <SelectItem value="jersey">Jersey</SelectItem>
                            <SelectItem value="photo">Photo/Art</SelectItem>
                            <SelectItem value="card">Trading Card</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground">Urgency</Label>
                        <Select 
                          value={requestForm.urgency}
                          onValueChange={(val) => setRequestForm({...requestForm, urgency: val})}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no_rush">No Rush</SelectItem>
                            <SelectItem value="standard">Standard</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground">Dimensions (Approx)</Label>
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
                      <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground">Description & Style</Label>
                      <Textarea 
                        placeholder="Describe what you need (e.g. double matting, UV glass, black frame)..."
                        value={requestForm.description}
                        onChange={(e) => setRequestForm({...requestForm, description: e.target.value})}
                        required
                        className="mt-1 h-24"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold uppercase text-gray-500 dark:text-muted-foreground mb-2 block">Item Image (Required)</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {requestForm.reference_images.map((img, idx) => (
                          <div key={idx} className="relative aspect-square rounded-md overflow-hidden bg-gray-100 dark:bg-muted border dark:border-border">
                            <img src={img} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                        <label className="aspect-square rounded-md border-2 border-dashed border-gray-200 dark:border-border hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 flex flex-col items-center justify-center cursor-pointer transition-colors">
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*"
                            onChange={handleImageUpload}
                            disabled={uploadingImage}
                          />
                          {uploadingImage ? (
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
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
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-6"
                      disabled={isSubmitting || requestForm.reference_images.length === 0}
                    >
                      {isSubmitting ? "Sending..." : "Submit Request"}
                    </Button>
                    
                    {!user && (
                      <p className="text-xs text-center text-red-500 bg-red-50 p-2 rounded">
                        You must be signed in to submit a request.
                      </p>
                    )}
                  </form>
                </CardContent>
              </Card>

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