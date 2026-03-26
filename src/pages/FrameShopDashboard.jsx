import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Building2,
  Clock,
  Package,
  DollarSign,
  Star,
  Send,
  Eye,
  AlertCircle,
  Plus,
  X,
  Sparkles,
  Users,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Mail
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

// Analytics helper
const getAnalyticsData = (quotes) => {
  if (!Array.isArray(quotes)) return [];
  
  const months = [];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push({
      name: monthNames[d.getMonth()] || "N/A",
      monthIndex: d.getMonth(),
      year: d.getFullYear(),
      revenue: 0,
      jobs: 0
    });
  }

  quotes.forEach(quote => {
    if (quote?.status === 'accepted' && quote?.created_date) {
      try {
        const quoteDate = new Date(quote.created_date);
        if (isNaN(quoteDate.getTime())) return;

        const monthData = months.find(m => 
          m.monthIndex === quoteDate.getMonth() && 
          m.year === quoteDate.getFullYear()
        );
        
        if (monthData) {
          // Check both field names safely
          const rawAmount = quote.amount !== undefined ? quote.amount : (quote.quote_amount !== undefined ? quote.quote_amount : 0);
          monthData.revenue += safeNumber(rawAmount);
          monthData.jobs += 1;
        }
      } catch (err) {
        console.warn("Analytics processing error:", err);
      }
    }
  });

  return months;
};

export default function FrameShopDashboard() {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const isPreviewMode = urlParams.get("preview") === "true";
  const previewShopId = urlParams.get("shopId");
  
  const [user, setUser] = useState(null);
  const [frameShop, setFrameShop] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  // UI State
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteDetails, setQuoteDetails] = useState("");
  const [aiDraftingQuote, setAiDraftingQuote] = useState(false);

  // Profile Form State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [logisticsForm, setLogisticsForm] = useState({});
  const [showPerformanceChart, setShowPerformanceChart] = useState(false);

  // 1. Load User & Shop
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        if (isPreviewMode && previewShopId === "demo") {
          setUser({ email: "admin@example.com", full_name: "Admin Preview", role: "admin" });
          setFrameShop({
            id: "demo",
            user_email: "demo@example.com",
            business_name: "Demo Frame Shop",
            status: "active",
            rating: 5.0
          });
          setIsLoading(false);
          return;
        }

        const userData = await base44.auth.me();
        if (!isMounted) return;
        setUser(userData);

        if (userData) {
          let shop = null;
          if (isPreviewMode && previewShopId) {
            const shops = await base44.entities.FrameShop.filter({ id: previewShopId });
            shop = shops?.[0];
          } else if (userData.role === 'admin') {
            // Admins can access the first active frame shop for testing/management
            const shops = await base44.entities.FrameShop.filter({ status: 'active' }, '-created_date');
            shop = shops?.[0];
          } else {
            const shops = await base44.entities.FrameShop.filter({ user_email: userData.email });
            shop = shops?.[0];
          }

          if (isMounted) {
            setFrameShop(shop || null);
            if (shop) {
              setProfileForm({
                business_name: shop.business_name || "",
                description: shop.description || "",
                address: shop.address || "",
                contact_phone: shop.contact_phone || "",
                website_url: shop.website_url || "",
                operating_hours: shop.operating_hours || "",
                services_offered: Array.isArray(shop.services_offered) ? shop.services_offered : []
              });
              setLogisticsForm({
                pickup_instructions: shop.pickup_instructions || "",
                offers_local_delivery: !!shop.offers_local_delivery,
                local_delivery_fee: safeNumber(shop.local_delivery_fee)
              });
            }
          }
        }
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadData();
    return () => { isMounted = false; };
  }, [isPreviewMode, previewShopId]);

  // 2. Data Queries
  const { data: framingRequests = [] } = useQuery({
    queryKey: ['shop-framing-requests', frameShop?.id],
    queryFn: async () => {
      if (!frameShop?.id || frameShop.id === "demo") return [];
      // Handle potential email casing issues by filtering effectively
      return await base44.entities.FramingRequest.filter({ 
        frame_shop_email: frameShop.user_email 
      }, "-created_date");
    },
    enabled: !!frameShop?.id,
    initialData: []
  });

  const { data: myQuotes = [] } = useQuery({
    queryKey: ['shop-quotes', frameShop?.id],
    queryFn: async () => {
      if (!frameShop?.id || frameShop.id === "demo") return [];
      // Use Quote entity for standard messaging/transactions
      return await base44.entities.Quote.filter({ 
        sender_email: frameShop.user_email,
        quote_type: 'framing_quote'
      }, "-created_date");
    },
    enabled: !!frameShop?.id,
    initialData: []
  });

  // 3. Derived Data (Memoized for performance & safety)
  const dashboardStats = useMemo(() => {
    const pending = framingRequests.filter(r => r?.status === "pending_quote");
    const completed = framingRequests.filter(r => r?.status === "completed");
    
    // Calculate Active Jobs with Deadlines
    const active = framingRequests
      .filter(r => ["accepted", "in_progress"].includes(r?.status))
      .map(job => {
        const quote = myQuotes.find(q => q.framing_request_id === job.id && q.status === 'accepted');
        let dueDate = null;
        let daysRemaining = null;
        let urgency = 'normal';

        if (quote?.accepted_date && quote?.estimated_turnaround) {
          try {
            const daysMatch = String(quote.estimated_turnaround).match(/\d+/);
            if (daysMatch) {
              const days = parseInt(daysMatch[0]);
              const accepted = new Date(quote.accepted_date);
              if (!isNaN(accepted.getTime())) {
                dueDate = new Date(accepted);
                dueDate.setDate(dueDate.getDate() + days);
                const now = new Date();
                daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                
                if (daysRemaining < 0) urgency = 'overdue';
                else if (daysRemaining <= 3) urgency = 'critical';
                else if (daysRemaining <= 7) urgency = 'warning';
              }
            }
          } catch (e) {
            console.warn("Deadline calc error:", e);
          }
        }
        return { ...job, quote, dueDate, daysRemaining, urgency };
      })
      .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999));

    const revenue = myQuotes
      .filter(q => q?.status === "accepted")
      .reduce((sum, q) => {
        const amt = q.amount !== undefined ? q.amount : (q.quote_amount !== undefined ? q.quote_amount : 0);
        return sum + safeNumber(amt);
      }, 0);

    return { pending, active, completed, revenue };
  }, [framingRequests, myQuotes]);

  const analyticsData = useMemo(() => getAnalyticsData(myQuotes), [myQuotes]);

  // 4. Mutations
  const updateProfileMutation = useMutation({
    mutationFn: async (data) => {
      if (isPreviewMode) return;
      return await base44.entities.FrameShop.update(frameShop.id, data);
    },
    onSuccess: (updatedShop) => {
      setFrameShop(updatedShop);
      setIsEditingProfile(false);
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ['frame-shop'] });
    },
    onError: () => toast.error("Failed to update profile")
  });

  const submitQuoteMutation = useMutation({
    mutationFn: async (data) => {
      if (isPreviewMode) return;
      
      // Use backend sendQuote function for consistency
      const response = await base44.functions.invoke('sendQuote', {
        quote_type: 'framing_quote',
        vendor_email: user.email,
        vendor_name: frameShop.business_name,
        buyer_email: selectedRequest.collector_email,
        buyer_name: selectedRequest.collector_name,
        amount: Math.round(safeNumber(data.quote_amount) * 100), // Convert to cents
        description: data.quote_details,
        conversation_id: selectedRequest.id,
        framing_request_id: selectedRequest.id,
        estimated_turnaround: "7-10 business days"
      });

      if (response.data?.error) throw new Error(response.data.error);

      // Update framing request status
      await base44.entities.FramingRequest.update(selectedRequest.id, {
        status: "quoted",
        quote_id: response.data.quote.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-quotes'] });
      queryClient.invalidateQueries({ queryKey: ['shop-framing-requests'] });
      setShowQuoteDialog(false);
      setQuoteAmount("");
      setQuoteDetails("");
      setSelectedRequest(null);
      toast.success("Quote sent successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send quote");
    }
  });

  const submitForReviewMutation = useMutation({
    mutationFn: async (requestId) => {
      if (isPreviewMode) return;
      
      await base44.entities.FramingRequest.update(requestId, {
        status: 'completed_pending_approval'
      });

      // Find request details to get user email
      const request = framingRequests.find(r => r.id === requestId);
      if (request) {
        await base44.entities.Message.create({
          sender_email: user.email,
          sender_name: frameShop.business_name,
          receiver_email: request.collector_email,
          receiver_name: request.collector_name,
          message: "🏁 Your framing job is complete! Please review and approve to release the payment.",
          conversation_type: "framing_request",
          framing_request_id: request.id
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop-framing-requests'] });
      toast.success("Submitted for review");
    },
    onError: () => toast.error("Failed to submit for review")
  });

  // 5. Deferred secondary metrics — loaded on demand
  const [secondaryMetricsLoaded, setSecondaryMetricsLoaded] = useState(false);

  // 6. Handlers
  const handleDraftQuoteWithAI = async () => {
    if (!selectedRequest) return;
    setAiDraftingQuote(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Draft a framing quote for item: ${selectedRequest.item_type}, Dimensions: ${selectedRequest.dimensions}, Desc: ${selectedRequest.description}, Budget: ${selectedRequest.budget_range}. JSON only: { "description": "string", "price": number }`,
        response_json_schema: {
          type: "object",
          properties: { description: { type: "string" }, price: { type: "number" } },
          required: ["description", "price"]
        }
      });
      setQuoteDetails(res.description || "");
      setQuoteAmount(res.price ? String(res.price) : "");
    } catch (e) {
      toast.error("AI drafting failed");
    } finally {
      setAiDraftingQuote(false);
    }
  };

  // Render Loading
   if (isLoading) {
     return (
       <div className="min-h-screen flex items-center justify-center bg-background">
         <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
       </div>
     );
   }

   // Render Pending Approval State
   if (frameShop && frameShop.status === "pending_approval") {
     return (
       <div className="min-h-screen flex items-center justify-center bg-background p-4">
         <Card className="max-w-md w-full text-center dark:bg-card dark:border-border">
           <CardContent className="pt-6">
             <Clock className="w-16 h-16 text-amber-600 dark:text-amber-500 mx-auto mb-4" />
             <h2 className="text-2xl font-bold text-foreground mb-2">Application Pending Review</h2>
             <p className="text-muted-foreground mb-4">
               Step 1 of 2: Your frame shop application has been received. Our team will review your business details within 24-48 hours.
             </p>
             <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/30 rounded-lg p-4 mb-6">
               <p className="text-xs font-mono text-amber-800 dark:text-amber-300 mb-2 opacity-70">Status: Pending Approval</p>
               <p className="text-sm text-amber-900 dark:text-amber-200">
                 <strong>{frameShop.business_name}</strong>
               </p>
             </div>
             <p className="text-xs text-muted-foreground mb-6">
               After approval, you'll activate your dashboard to start receiving framing requests.
             </p>
             <Link to={createPageUrl("Settings?section=roles")}>
               <Button>Back to Settings</Button>
             </Link>
           </CardContent>
         </Card>
       </div>
     );
   }

   // Render Rejected State
   if (frameShop && frameShop.status === "rejected") {
     return (
       <div className="min-h-screen flex items-center justify-center bg-background p-4">
         <Card className="max-w-md w-full text-center dark:bg-card dark:border-border">
           <CardContent className="pt-6">
             <AlertCircle className="w-16 h-16 text-red-600 dark:text-red-500 mx-auto mb-4" />
             <h2 className="text-2xl font-bold text-foreground mb-2">Application Not Approved</h2>
             <p className="text-muted-foreground mb-4">
               Your frame shop application was reviewed but not approved at this time.
             </p>
             <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/30 rounded-lg p-3 mb-6">
               <p className="text-xs text-red-700 dark:text-red-300">
                 Please contact support for details and to discuss reapplying.
               </p>
             </div>
             <div className="flex flex-col gap-2">
               <Link to={createPageUrl("Settings?section=roles")}>
                 <Button className="w-full">Review or Reapply</Button>
               </Link>
               <Link to={createPageUrl("CredionSupport")}>
                 <Button variant="outline" className="w-full">Contact Support</Button>
               </Link>
             </div>
           </CardContent>
         </Card>
       </div>
     );
   }

   // Render Suspended State
   if (frameShop && frameShop.status === "suspended") {
     return (
       <div className="min-h-screen flex items-center justify-center bg-background p-4">
         <Card className="max-w-md w-full text-center dark:bg-card dark:border-border">
           <CardContent className="pt-6">
             <AlertCircle className="w-16 h-16 text-red-600 dark:text-red-500 mx-auto mb-4" />
             <h2 className="text-2xl font-bold text-foreground mb-2">Account Suspended</h2>
             <p className="text-muted-foreground mb-4">
               Your frame shop account has been suspended and is no longer active.
             </p>
             <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-500/30 rounded-lg p-3 mb-6">
               <p className="text-xs text-red-700 dark:text-red-300">
                 Please reach out to support to understand why and discuss next steps.
               </p>
             </div>
             <Link to={createPageUrl("CredionSupport")}>
               <Button className="w-full">Contact Support</Button>
             </Link>
           </CardContent>
         </Card>
       </div>
     );
   }

   // Render No Shop State
    if (!frameShop) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full text-center dark:bg-card dark:border-border">
            <CardContent className="pt-6">
              <Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-foreground mb-2">No Frame Shop Account</h2>
              <p className="text-muted-foreground mb-6">
                Apply to become a frame shop partner and start receiving custom framing requests.
              </p>
              <div className="bg-muted/40 dark:bg-muted/20 border border-border rounded-lg p-3 mb-6">
                <p className="text-xs text-muted-foreground">
                  The application process takes 24-48 hours. Once approved, you'll activate your dashboard.
                </p>
              </div>
             <Link to={createPageUrl("Settings?section=roles")}>
               <Button className="w-full">Apply for Frame Shop</Button>
             </Link>
           </CardContent>
         </Card>
       </div>
      );
    }

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Header */}
      <div className="bg-card dark:bg-white/[0.05] border-b border-border sticky top-0 z-30 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-purple-500/10 dark:bg-purple-900/30 p-2 rounded-lg">
            <Building2 className="w-6 h-6 text-purple-600 dark:text-purple-500" />
          </div>
          <div>
            <h1 className="font-bold text-foreground">{frameShop.business_name}</h1>
            <p className="text-xs text-muted-foreground">Business Dashboard</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Link to={createPageUrl(`FrameShopProfile?id=${frameShop.id}`)}>
            <Button variant="outline" size="sm" className="hidden sm:flex">
              <Eye className="w-4 h-4 mr-2" /> View Public
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero Banner */}
        <div 
          className="relative mb-8 rounded-2xl overflow-hidden text-white shadow-xl min-h-[240px] flex items-end"
          style={{
            backgroundImage: 'url(https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/6da0f949c_optimizedphotoshopowner.png)',
            backgroundPosition: 'right bottom',
            backgroundSize: 'auto 90%',
            backgroundRepeat: 'no-repeat',
          }}
        >
           <div className="absolute inset-0 bg-gradient-to-r from-purple-700 via-purple-700 to-purple-800 opacity-85 z-10"></div>
           <div className="relative z-20 p-8 md:p-12 max-w-2xl w-full">
             <div className="flex items-center gap-3 mb-4">
               <div className="p-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/10">
                 <Building2 className="w-8 h-8 text-purple-200" />
               </div>
               <Badge className="bg-purple-500/50 hover:bg-purple-500/60 text-white border-white/10">Frame Shop Partner</Badge>
             </div>
             <h1 className="text-3xl md:text-4xl font-bold mb-4 text-white">Welcome back, {frameShop.business_name}</h1>
             <p className="text-purple-100 text-lg mb-6 max-w-lg">
               Manage your custom framing requests, track active jobs, and grow your business with King Credion's partner tools.
             </p>
             <div className="flex flex-wrap gap-3">
               <Link to={createPageUrl(`FrameShopProfile?id=${frameShop.id}`)}>
                 <Button className="bg-white text-purple-900 hover:bg-purple-50 border-0 shadow-lg">
                   <Eye className="w-4 h-4 mr-2" /> View Public Profile
                 </Button>
               </Link>
               <Button variant="outline" className="text-white border-white/20 hover:bg-white/10" onClick={() => setActiveTab('profile')}>
                 Edit Shop Settings
               </Button>
             </div>
           </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="bg-card dark:bg-white/[0.05] border border-border p-1 rounded-xl shadow-sm grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="requests">
              Requests
              {dashboardStats.pending.length > 0 && (
                <Badge className="ml-2 bg-blue-600 text-[10px] px-1.5">{dashboardStats.pending.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="jobs">Active Jobs</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-6">
            {/* PRIMARY STATS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard title="Revenue" value={`$${dashboardStats.revenue.toLocaleString()}`} icon={DollarSign} color="green" />
              <StatCard title="Active Jobs" value={dashboardStats.active.length} icon={Clock} color="blue" />
              <StatCard title="Pending" value={dashboardStats.pending.length} icon={Package} color="yellow" />
            </div>

            {/* SECONDARY STAT — optional display */}
            {secondaryMetricsLoaded && (
              <Card className="bg-card dark:bg-muted/30 border-border">
                 <CardContent className="p-4">
                   <div className="flex items-center justify-between">
                     <div>
                       <p className="text-sm font-medium text-muted-foreground">Overall Rating</p>
                       <h3 className="text-2xl font-bold text-foreground">{frameShop.rating || "N/A"}</h3>
                     </div>
                     <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                       <Star className="w-6 h-6 text-orange-600 dark:text-orange-500" />
                     </div>
                   </div>
                 </CardContent>
               </Card>
              )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               {/* Performance Chart — collapsible */}
               <Card className="lg:col-span-2 bg-card dark:bg-muted/30 border-border">
                 <CardHeader>
                   <button className="flex items-center justify-between w-full text-left" onClick={() => setShowPerformanceChart(v => !v)}>
                     <CardTitle className="flex items-center gap-2 text-foreground">
                       <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-500" /> Performance Chart
                     </CardTitle>
                     {showPerformanceChart ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                   </button>
                   {/* Compact summary always visible */}
                   <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                     <span>Revenue: <b className="text-purple-600 dark:text-purple-500">${dashboardStats.revenue.toLocaleString()}</b></span>
                     <span>Completed: <b className="text-green-600 dark:text-green-500">{dashboardStats.completed.length}</b></span>
                   </div>
                 </CardHeader>
                 {showPerformanceChart && (
                   <CardContent>
                     {analyticsData.every(d => d.revenue === 0) ? (
                           <div className="text-center py-8 text-muted-foreground text-sm">No revenue data yet</div>
                         ) : (
                           <div className="space-y-2">
                             {analyticsData.filter(d => d.revenue > 0).map(d => (
                               <div key={d.name} className="flex items-center gap-3">
                                 <span className="text-xs text-muted-foreground w-8">{d.name}</span>
                                 <div className="flex-1 bg-muted rounded-full h-2">
                                   <div className="h-full bg-purple-600 rounded-full" style={{ width: `${Math.max((d.revenue / (dashboardStats.revenue || 1)) * 100, 2)}%` }} />
                                 </div>
                                 <span className="text-xs font-semibold text-foreground w-16 text-right">${d.revenue.toFixed(0)}</span>
                               </div>
                             ))}
                           </div>
                         )}
                   </CardContent>
                 )}
               </Card>

               <Card className="bg-card dark:bg-muted/30 border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Recent Activity</CardTitle>
                  {!secondaryMetricsLoaded && (
                    <button
                      className="text-xs text-blue-600 dark:text-blue-500 hover:text-blue-700 dark:hover:text-blue-400 mt-1"
                      onClick={() => setSecondaryMetricsLoaded(true)}
                    >
                      Load activity →
                    </button>
                  )}
                </CardHeader>
                {secondaryMetricsLoaded && (
                  <CardContent>
                    <div className="space-y-4">
                      {framingRequests.slice(0, 5).map((req, i) => (
                        <div key={i} className="flex gap-3 pb-3 border-b border-border last:border-0">
                          <div className={`w-2 h-2 mt-1.5 rounded-full ${req.status === 'completed' ? 'bg-green-600 dark:bg-green-500' : 'bg-blue-600 dark:bg-blue-500'}`} />
                          <div>
                            <p className="text-sm font-medium text-foreground">{req.title}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(req.created_date)}</p>
                          </div>
                        </div>
                      ))}
                      {!framingRequests.length && <p className="text-sm text-muted-foreground">No activity yet</p>}
                    </div>
                  </CardContent>
                )}
               </Card>
            </div>
          </TabsContent>

          {/* REQUESTS */}
          <TabsContent value="requests">
            <div className="grid gap-4">
              {dashboardStats.pending.length === 0 ? (
                <EmptyState icon={Package} title="No Pending Requests" desc="You're all caught up!" />
              ) : (
                dashboardStats.pending.map(req => (
                  <RequestCard 
                    key={req.id} 
                    req={req} 
                    onQuote={() => { setSelectedRequest(req); setShowQuoteDialog(true); }}
                    hasQuote={myQuotes.some(q => q.framing_request_id === req.id)} 
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* JOBS */}
          <TabsContent value="jobs">
            <div className="grid gap-4">
              {dashboardStats.active.length === 0 ? (
                <EmptyState icon={Clock} title="No Active Jobs" desc="Accepted jobs appear here" />
              ) : (
                dashboardStats.active.map(job => (
                  <JobCard 
                    key={job.id} 
                    job={job} 
                    onSubmitForReview={(id) => submitForReviewMutation.mutate(id)}
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* PROFILE */}
          <TabsContent value="profile">
            <Card>
              <CardHeader className="flex flex-row justify-between">
                <div>
                  <CardTitle>Shop Settings</CardTitle>
                  <CardDescription>Update your business information</CardDescription>
                </div>
                <Button variant={isEditingProfile ? "secondary" : "outline"} onClick={() => {
                  if (isEditingProfile) updateProfileMutation.mutate({ ...profileForm, ...logisticsForm });
                  else setIsEditingProfile(true);
                }}>
                  {isEditingProfile ? "Save Changes" : "Edit Profile"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Business Name</Label>
                      <Input 
                        disabled={!isEditingProfile} 
                        value={profileForm.business_name || ""} 
                        onChange={e => setProfileForm(p => ({...p, business_name: e.target.value}))} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input 
                        disabled={!isEditingProfile} 
                        value={profileForm.address || ""} 
                        onChange={e => setProfileForm(p => ({...p, address: e.target.value}))} 
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input 
                        disabled={!isEditingProfile} 
                        value={profileForm.contact_phone || ""} 
                        onChange={e => setProfileForm(p => ({...p, contact_phone: e.target.value}))} 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Website</Label>
                      <Input 
                        disabled={!isEditingProfile} 
                        value={profileForm.website_url || ""} 
                        onChange={e => setProfileForm(p => ({...p, website_url: e.target.value}))} 
                      />
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                   <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/40 dark:bg-muted/20">
                     <div>
                       <Label className="text-base">Local Delivery</Label>
                       <p className="text-xs text-muted-foreground">Enable local delivery options for customers</p>
                     </div>
                     <Switch 
                       checked={logisticsForm.offers_local_delivery} 
                       disabled={!isEditingProfile}
                       onCheckedChange={c => setLogisticsForm(p => ({...p, offers_local_delivery: c}))}
                     />
                   </div>
                   {logisticsForm.offers_local_delivery && (
                     <div className="max-w-xs">
                       <Label>Delivery Fee ($)</Label>
                       <Input 
                         type="number" 
                         disabled={!isEditingProfile}
                         value={logisticsForm.local_delivery_fee || ""}
                         onChange={e => setLogisticsForm(p => ({...p, local_delivery_fee: parseFloat(e.target.value)}))}
                       />
                     </div>
                   )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Quote Dialog */}
      <Dialog open={showQuoteDialog} onOpenChange={setShowQuoteDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Quote</DialogTitle>
            <DialogDescription>For {selectedRequest?.collector_name}'s request</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-purple-500/10 dark:bg-purple-900/20 p-4 rounded-lg flex justify-between items-center border border-purple-500/30">
              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 font-medium">
                <Sparkles className="w-4 h-4" /> AI Assistant
              </div>
              <Button size="sm" variant="secondary" onClick={handleDraftQuoteWithAI} disabled={aiDraftingQuote}>
                {aiDraftingQuote ? "Generating..." : "Auto-Draft"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Price ($)</Label>
                <Input type="number" value={quoteAmount} onChange={e => setQuoteAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Details</Label>
                <Textarea className="h-24" value={quoteDetails} onChange={e => setQuoteDetails(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuoteDialog(false)}>Cancel</Button>
            <Button onClick={() => submitQuoteMutation.mutate({ quote_amount: quoteAmount, quote_details: quoteDetails })}>
              Send Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-components to keep main file clean
const StatCard = ({ title, value, icon: Icon, color }) => (
  <Card className="bg-card dark:bg-muted/30 border-border">
    <CardContent className="p-6 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <h3 className="text-2xl font-bold text-foreground">{value}</h3>
      </div>
      <div className={`p-2.5 bg-${color}-500/10 dark:bg-${color}-900/30 rounded-lg`}>
        <Icon className={`w-5 h-5 text-${color}-600 dark:text-${color}-500`} />
      </div>
    </CardContent>
  </Card>
);

const EmptyState = ({ icon: Icon, title, desc }) => (
  <div className="text-center py-12 bg-card dark:bg-muted/30 rounded-xl border border-border">
    <Icon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
    <h3 className="text-lg font-medium text-foreground">{title}</h3>
    <p className="text-muted-foreground">{desc}</p>
  </div>
);

const RequestCard = ({ req, onQuote, hasQuote }) => (
  <Card className="bg-card dark:bg-muted/30 border-border">
    <CardContent className="p-6">
      <div className="flex flex-col md:flex-row gap-6">
         {req.reference_images?.[0] && (
           <img src={req.reference_images[0]} alt="Ref" className="w-full md:w-48 h-48 object-cover rounded-lg bg-muted" />
         )}
        <div className="flex-1 space-y-3">
          <div className="flex justify-between">
            <div>
              <h3 className="text-xl font-bold text-foreground">{req.title}</h3>
              <p className="text-sm text-muted-foreground">{req.collector_name} • {formatDate(req.created_date)}</p>
            </div>
            <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">New</Badge>
          </div>
          <p className="text-muted-foreground bg-muted/40 dark:bg-muted/20 p-3 rounded-lg text-sm border border-border">{req.description}</p>
          <div className="flex justify-end gap-3">
             <Link to={createPageUrl(`Messages?startConversation=${req.collector_email}&name=${req.collector_name}&type=framing_request&itemId=${req.id}&framingRequestId=${req.id}`)}>
               <Button variant="outline">Message</Button>
             </Link>
             <Button onClick={onQuote} disabled={hasQuote} className="bg-purple-600">
               {hasQuote ? "Quote Sent" : "Create Quote"}
             </Button>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
);

const JobCard = ({ job, onSubmitForReview }) => (
  <Card className={`bg-card dark:bg-muted/30 border-border ${job.urgency === 'overdue' ? 'border-red-500/50 dark:border-red-500/40 bg-red-500/10 dark:bg-red-900/20' : ''}`}>
    <CardContent className="p-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
      <div className="flex gap-4 items-start">
        <div className={`p-2 rounded-full flex-shrink-0 ${job.urgency === 'overdue' ? 'bg-red-500/20 text-red-700 dark:text-red-400' : 'bg-blue-500/20 text-blue-700 dark:text-blue-400'}`}>
          <Clock className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-foreground break-words">{job.title}</h4>
            {job.payment_status === 'escrow_held' && (
              <Badge className="bg-purple-500/20 text-purple-700 dark:text-purple-400 text-[10px] flex-shrink-0">
                <ShieldCheck className="w-3 h-3 mr-1" />
                Escrow
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {job.collector_name} • Due: {job.dueDate ? formatDate(job.dueDate) : "N/A"}
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
        {job.status === 'in_progress' && (
          <Button 
            size="sm" 
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => onSubmitForReview(job.id)}
          >
            Submit for Review
          </Button>
        )}
        {job.status === 'completed_pending_approval' && (
          <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 pointer-events-none justify-center">
            Pending Approval
          </Badge>
        )}
        <Link to={createPageUrl(`Messages?startConversation=${job.collector_email}&name=${job.collector_name}`)} className="flex-1 sm:flex-1 md:flex-initial">
          <Button variant="outline" size="sm" className="w-full sm:w-auto"><Mail className="w-4 h-4 mr-2" /> Contact</Button>
        </Link>
      </div>
    </CardContent>
  </Card>
);