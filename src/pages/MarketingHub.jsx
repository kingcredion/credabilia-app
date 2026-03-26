import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  Target,
  BarChart3,
  Plus,
  Sparkles,
  Globe,
  Eye,
  MousePointer,
  ShoppingCart,
  Calendar,
  Settings,
  Zap,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Pause,
  Play,
  Trash2,
  Video
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import VideoScheduler from "../components/VideoScheduler";
import ScheduledPostsList from "../components/ScheduledPostsList";

const PLATFORM_ICONS = {
  google_ads: "🔍",
  facebook_ads: "📘",
  instagram_ads: "📸",
  tiktok_ads: "🎵",
  twitter_ads: "🐦",
  klaviyo: "📧",
  manual: "✍️"
};

const PLATFORM_COLORS = {
  google_ads: "#4285F4",
  facebook_ads: "#1877F2",
  instagram_ads: "#E4405F",
  tiktok_ads: "#000000",
  twitter_ads: "#1DA1F2",
  klaviyo: "#25CC88",
  manual: "#6B7280"
};

export default function MarketingHub() {
  const [user, setUser] = useState(null);
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [showVideoScheduler, setShowVideoScheduler] = useState(false); // NEW STATE
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [generatingAI, setGeneratingAI] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false); // NEW STATE
  const [aiResult, setAiResult] = useState(null);
  const [videoGenCount, setVideoGenCount] = useState("15");
  const [autoGenEnabled, setAutoGenEnabled] = useState(false);
  const [videoProvider, setVideoProvider] = useState("runway"); // NEW STATE: 'runway' or 'sora'
  
  const [campaignForm, setCampaignForm] = useState({
    campaign_name: "",
    platform: "google_ads",
    budget_allocated: "",
    target_audience: {
      age_range: "",
      interests: [],
      locations: [],
      demographics: ""
    },
    ad_creative: {
      headline: "",
      description: "",
      call_to_action: "",
      image_url: ""
    },
    start_date: "",
    end_date: ""
  });

  const queryClient = useQueryClient();

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

  // Fetch marketing budget
  const { data: budgetData } = useQuery({
    queryKey: ['marketing-budget'],
    queryFn: async () => {
      const budgets = await base44.entities.MarketingBudget.list();
      if (budgets.length === 0) {
        // Create initial budget
        return await base44.entities.MarketingBudget.create({
          total_allocated: 0,
          total_spent: 0,
          available_balance: 0,
          allocation_percentage: 5.0,
          auto_allocate: true
        });
      }
      return budgets[0];
    },
    initialData: null,
  });

  // Fetch campaigns
  const { data: campaigns } = useQuery({
    queryKey: ['marketing-campaigns'],
    queryFn: async () => {
      return await base44.entities.MarketingCampaign.list("-created_date");
    },
    initialData: [],
  });

  // Fetch platform connections
  const { data: connections } = useQuery({
    queryKey: ['platform-connections'],
    queryFn: async () => {
      return await base44.entities.PlatformConnection.list();
    },
    initialData: [],
  });

  // Fetch transactions for budget calculation (live only)
  const { data: transactions } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const all = await base44.entities.Transaction.list("-created_date", 100);
      return all.filter(t =>
        !t.is_simulated &&
        t.payment_method !== 'simulated_stripe' &&
        t.payment_method !== 'simulated_purchase' &&
        !t.stripe_payment_intent_id?.startsWith('sim_')
      );
    },
    initialData: [],
  });

  // Fetch scheduled posts - NEW QUERY
  const { data: scheduledPosts } = useQuery({
    queryKey: ['scheduled-posts'],
    queryFn: async () => {
      return await base44.entities.ScheduledPost.list("-created_date");
    },
    initialData: [],
  });

  // Fetch auto-gen setting
  const { data: autoGenSetting } = useQuery({
    queryKey: ['system-setting-auto-gen'],
    queryFn: async () => {
      const settings = await base44.entities.SystemSetting.filter({ key: 'auto_video_gen_enabled' });
      if (settings.length > 0) {
        setAutoGenEnabled(settings[0].value === 'true');
        return settings[0];
      }
      return null;
    },
  });

  // Toggle auto-gen mutation
  const toggleAutoGenMutation = useMutation({
    mutationFn: async (enabled) => {
      const settings = await base44.entities.SystemSetting.filter({ key: 'auto_video_gen_enabled' });
      if (settings.length > 0) {
        return await base44.entities.SystemSetting.update(settings[0].id, { value: String(enabled) });
      } else {
        return await base44.entities.SystemSetting.create({
          key: 'auto_video_gen_enabled',
          value: String(enabled),
          description: 'Enable automatic daily video generation'
        });
      }
    },
    onSuccess: (data) => {
      setAutoGenEnabled(data.value === 'true');
      queryClient.invalidateQueries({ queryKey: ['system-setting-auto-gen'] });
    },
  });

  // Create/Update campaign mutation
  const saveCampaignMutation = useMutation({
    mutationFn: async (campaignData) => {
      if (editingCampaign) {
        return await base44.entities.MarketingCampaign.update(editingCampaign.id, campaignData);
      }
      return await base44.entities.MarketingCampaign.create(campaignData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      setShowCampaignDialog(false);
      setEditingCampaign(null);
      resetCampaignForm();
    },
  });

  // Update budget mutation
  const updateBudgetMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.MarketingBudget.update(budgetData.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-budget'] });
    },
  });

  // Delete campaign mutation
  const deleteCampaignMutation = useMutation({
    mutationFn: async (campaignId) => {
      return await base44.entities.MarketingCampaign.delete(campaignId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
    },
  });

  const handleGenerateDailyVideos = async () => {
    if (!confirm(`Are you sure you want to generate today's video campaign? This will create ${videoGenCount} new video posts.`)) return;
    
    setGeneratingVideos(true);
    try {
      const response = await base44.functions.invoke('generateDailyCampaign', { 
        force: true,
        count: parseInt(videoGenCount),
        provider: videoProvider
      });
      alert(`Successfully started generation for ${response.data.results.length} videos!`);
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
    } catch (error) {
      console.error("Error generating videos:", error);
      alert("Failed to generate videos: " + error.message);
    } finally {
      setGeneratingVideos(false);
    }
  };

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    
    setGeneratingAI(true);
    
    try {
      const prompt = `You are an expert marketing campaign manager for Credabilia, a memorabilia marketplace.

User request: ${aiPrompt}

Generate a complete marketing campaign including:
1. Campaign name (catchy and relevant)
2. Target audience (age range, interests, locations, demographics)
3. Ad creative (headline, description, call to action)
4. Suggested budget
5. Recommended platform (google_ads, facebook_ads, instagram_ads, tiktok_ads, or twitter_ads)
6. Campaign duration suggestion

Return as JSON with this exact structure:
{
  "campaign_name": "string",
  "platform": "google_ads|facebook_ads|instagram_ads|tiktok_ads|twitter_ads",
  "budget_allocated": number,
  "target_audience": {
    "age_range": "string (e.g., 25-45)",
    "interests": ["string array"],
    "locations": ["string array"],
    "demographics": "string"
  },
  "ad_creative": {
    "headline": "string (max 60 chars)",
    "description": "string (max 200 chars)",
    "call_to_action": "string"
  },
  "duration_days": number
}`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: prompt,
        response_json_schema: {
          type: "object",
          properties: {
            campaign_name: { type: "string" },
            platform: { type: "string" },
            budget_allocated: { type: "number" },
            target_audience: {
              type: "object",
              properties: {
                age_range: { type: "string" },
                interests: { type: "array", items: { type: "string" } },
                locations: { type: "array", items: { type: "string" } },
                demographics: { type: "string" }
              }
            },
            ad_creative: {
              type: "object",
              properties: {
                headline: { type: "string" },
                description: { type: "string" },
                call_to_action: { type: "string" }
              }
            },
            duration_days: { type: "number" }
          },
          required: ["campaign_name", "platform", "budget_allocated", "target_audience", "ad_creative"]
        }
      });

      setAiResult(result);
      setCampaignForm({
        ...result,
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date(Date.now() + (result.duration_days || 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
      
    } catch (error) {
      console.error("Error generating campaign:", error);
      alert("Failed to generate campaign. Please try again.");
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleSaveCampaign = () => {
    saveCampaignMutation.mutate({
      ...campaignForm,
      ai_generated: !!aiResult,
      ai_prompt: aiResult ? aiPrompt : null,
      status: "draft"
    });
  };

  const resetCampaignForm = () => {
    setCampaignForm({
      campaign_name: "",
      platform: "google_ads",
      budget_allocated: "",
      target_audience: {
        age_range: "",
        interests: [],
        locations: [],
        demographics: ""
      },
      ad_creative: {
        headline: "",
        description: "",
        call_to_action: "",
        image_url: ""
      },
      start_date: "",
      end_date: ""
    });
    setAiResult(null);
    setAiPrompt("");
  };

  const handleEditCampaign = (campaign) => {
    setEditingCampaign(campaign);
    setCampaignForm(campaign);
    setShowCampaignDialog(true);
  };

  const calculateMetrics = () => {
    const totalSpent = campaigns.reduce((sum, c) => sum + (c.budget_spent || 0), 0);
    const totalImpressions = campaigns.reduce((sum, c) => sum + (c.impressions || 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.clicks || 0), 0);
    const totalConversions = campaigns.reduce((sum, c) => sum + (c.conversions || 0), 0);
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    
    return {
      totalSpent,
      totalImpressions,
      totalClicks,
      totalConversions,
      avgCTR
    };
  };

  const metrics = calculateMetrics();

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">
              Only administrators can access the Marketing Hub.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
                <Target className="w-10 h-10 text-purple-600" />
                Marketing Hub
              </h1>
              <p className="text-gray-600">
                AI-powered marketing campaigns & analytics
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-3 items-center">
                 <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-gray-200 shadow-sm px-3 mr-2">
                    <Label htmlFor="auto-gen" className="text-xs font-medium text-gray-700">Auto</Label>
                    <Switch 
                      id="auto-gen" 
                      checked={autoGenEnabled}
                      onCheckedChange={(checked) => toggleAutoGenMutation.mutate(checked)}
                    />
                 </div>

                 <div className="w-[100px]">
                    <Select value={videoProvider} onValueChange={setVideoProvider}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="AI Model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="runway">Runway</SelectItem>
                        <SelectItem value="sora">Sora</SelectItem>
                      </SelectContent>
                    </Select>
                 </div>

                 <div className="w-[80px]">
                    <Select value={videoGenCount} onValueChange={setVideoGenCount}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Count" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 Videos</SelectItem>
                        <SelectItem value="10">10 Videos</SelectItem>
                        <SelectItem value="15">15 Videos</SelectItem>
                      </SelectContent>
                    </Select>
                 </div>

                <Button
                  onClick={handleGenerateDailyVideos}
                  disabled={generatingVideos}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                >
                  {generatingVideos ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-5 h-5 mr-2" />
                  )}
                  Generate {videoGenCount} Videos
                </Button>
                
                <Button
                  onClick={() => setShowVideoScheduler(true)}
                  className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700"
                >
                  <Video className="w-5 h-5 mr-2" />
                  Schedule Post
                </Button>

                <Button
                  onClick={() => {
                    setShowAIDialog(true);
                    resetCampaignForm();
                  }}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  <Sparkles className="w-5 h-5 mr-2" />
                  AI Campaign
                </Button>
                <Button
                  onClick={() => {
                    setShowCampaignDialog(true);
                    setEditingCampaign(null);
                    resetCampaignForm();
                  }}
                  variant="outline"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create Campaign
                </Button>
              </div>
            </div>
          </div>

          {/* Backend Integration Notice */}
          <Card className="bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-300">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-orange-900 mb-1">Developer Integration Needed</h4>
                  <p className="text-sm text-orange-800">
                    Platform connections (Google Ads, Facebook, etc.) require backend functions for secure API integration. 
                    Campaigns can be created and managed here, but connecting to external platforms needs custom backend code.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Budget Overview */}
        {budgetData && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <DollarSign className="w-8 h-8" />
                  <Badge className="bg-white/20 text-white">Budget</Badge>
                </div>
                <p className="text-3xl font-bold mb-1">
                  ${budgetData.available_balance?.toFixed(2) || "0.00"}
                </p>
                <p className="text-sm text-white/80">Available Balance</p>
                <p className="text-xs text-white/60 mt-2">
                  {budgetData.allocation_percentage}% of sales allocated
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <Eye className="w-8 h-8 text-blue-600" />
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900 mb-1">
                  {metrics.totalImpressions.toLocaleString()}
                </p>
                <p className="text-sm text-gray-600">Total Impressions</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <MousePointer className="w-8 h-8 text-purple-600" />
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900 mb-1">
                  {metrics.totalClicks.toLocaleString()}
                </p>
                <p className="text-sm text-gray-600">Total Clicks</p>
                <p className="text-xs text-gray-500 mt-1">
                  CTR: {metrics.avgCTR.toFixed(2)}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <ShoppingCart className="w-8 h-8 text-orange-600" />
                  <TrendingUp className="w-5 h-5 text-orange-600" />
                </div>
                <p className="text-3xl font-bold text-gray-900 mb-1">
                  {metrics.totalConversions}
                </p>
                <p className="text-sm text-gray-600">Conversions</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="videos" className="w-full"> {/* CHANGED DEFAULT VALUE */}
          <TabsList className="grid w-full grid-cols-4 mb-8"> {/* CHANGED GRID-COLS TO 4 */}
            {/* NEW TAB TRIGGER */}
            <TabsTrigger value="videos">
              <Video className="w-4 h-4 mr-2" />
              Video Posts
            </TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="platforms">Platforms</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Video Posts Tab - NEW */}
          <TabsContent value="videos">
            <ScheduledPostsList posts={scheduledPosts} />
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns">
            {campaigns.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Target className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    No campaigns yet
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Create your first marketing campaign with AI assistance
                  </p>
                  <Button
                    onClick={() => {
                      setShowAIDialog(true);
                      resetCampaignForm();
                    }}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    <Sparkles className="w-5 h-5 mr-2" />
                    Generate Campaign with AI
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {campaigns.map((campaign) => (
                  <Card key={campaign.id} className="hover:shadow-xl transition-all">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-3xl">{PLATFORM_ICONS[campaign.platform]}</span>
                            <div>
                              <h3 className="text-xl font-bold text-gray-900">
                                {campaign.campaign_name}
                              </h3>
                              <p className="text-sm text-gray-600 capitalize">
                                {campaign.platform.replace('_', ' ')}
                              </p>
                            </div>
                            {campaign.ai_generated && (
                              <Badge className="bg-purple-100 text-purple-700">
                                <Sparkles className="w-3 h-3 mr-1" />
                                AI Generated
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge
                            className={`${
                              campaign.status === 'active' ? 'bg-green-500' :
                              campaign.status === 'paused' ? 'bg-yellow-500' :
                              campaign.status === 'completed' ? 'bg-blue-500' :
                              campaign.status === 'failed' ? 'bg-red-500' :
                              'bg-gray-500'
                            } text-white capitalize`}
                          >
                            {campaign.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditCampaign(campaign)}
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm('Delete this campaign?')) {
                                deleteCampaignMutation.mutate(campaign.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </div>

                      {/* Campaign Metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-600">Budget</p>
                          <p className="text-lg font-bold text-gray-900">
                            ${campaign.budget_allocated?.toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500">
                            Spent: ${(campaign.budget_spent || 0).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Impressions</p>
                          <p className="text-lg font-bold text-gray-900">
                            {(campaign.impressions || 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Clicks</p>
                          <p className="text-lg font-bold text-gray-900">
                            {(campaign.clicks || 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">CTR</p>
                          <p className="text-lg font-bold text-gray-900">
                            {(campaign.ctr || 0).toFixed(2)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">ROAS</p>
                          <p className="text-lg font-bold text-gray-900">
                            {(campaign.roas || 0).toFixed(2)}x
                          </p>
                        </div>
                      </div>

                      {/* Ad Creative Preview */}
                      {campaign.ad_creative && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-xs font-medium text-gray-500 mb-2">Ad Preview</p>
                          <h4 className="font-bold text-gray-900 mb-1">
                            {campaign.ad_creative.headline}
                          </h4>
                          <p className="text-sm text-gray-700 mb-2">
                            {campaign.ad_creative.description}
                          </p>
                          {campaign.ad_creative.call_to_action && (
                            <Badge className="bg-blue-600 text-white">
                              {campaign.ad_creative.call_to_action}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Target Audience */}
                      {campaign.target_audience && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {campaign.target_audience.age_range && (
                            <Badge variant="outline">
                              Age: {campaign.target_audience.age_range}
                            </Badge>
                          )}
                          {campaign.target_audience.interests?.map((interest, idx) => (
                            <Badge key={idx} variant="outline">
                              {interest}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Platforms Tab */}
          <TabsContent value="platforms">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {['klaviyo', 'google_ads', 'facebook_ads', 'instagram_ads', 'tiktok_ads', 'twitter_ads'].map((platform) => {
                const connection = connections.find(c => c.platform_name === platform);
                let isConnected = connection?.connection_status === 'connected';
                
                if (platform === 'klaviyo') {
                  isConnected = true; // Manually connected via layout injection
                }
                
                return (
                  <Card key={platform} className="hover:shadow-lg transition-all">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                            style={{ backgroundColor: `${PLATFORM_COLORS[platform]}15` }}
                          >
                            {PLATFORM_ICONS[platform]}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 capitalize">
                              {platform.replace('_', ' ')}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {isConnected ? (connection?.account_name || 'Connected') : 'Not connected'}
                            </p>
                          </div>
                        </div>
                        
                        {isConnected ? (
                          <Badge className="bg-green-500 text-white">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Connected
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">
                            <XCircle className="w-3 h-3 mr-1" />
                            Disconnected
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm text-gray-600 mb-4">
                        {isConnected 
                          ? `Last synced: ${connection?.last_sync_date ? new Date(connection.last_sync_date).toLocaleDateString() : 'Active'}`
                          : 'Connect your account to launch campaigns on this platform'
                        }
                      </p>

                      <Button
                        className="w-full"
                        variant={isConnected ? "outline" : "default"}
                        disabled
                      >
                        <Globe className="w-4 h-4 mr-2" />
                        {isConnected ? 'Manage Connection' : 'Connect Account'}
                        <span className="ml-2 text-xs">(Requires Backend)</span>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="mt-6 bg-blue-50 border-2 border-blue-200">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <Zap className="w-6 h-6 text-blue-600 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-blue-900 mb-2">Backend Integration Required</h4>
                    <p className="text-sm text-blue-800 mb-3">
                      To connect these platforms, your developer will need to implement OAuth flows and API integrations 
                      using backend functions. Each platform has specific requirements:
                    </p>
                    <ul className="text-sm text-blue-800 space-y-1 ml-4">
                      <li>• Google Ads: OAuth 2.0 + Google Ads API</li>
                      <li>• Facebook/Instagram: Facebook Business API</li>
                      <li>• TikTok: TikTok Marketing API</li>
                      <li>• Twitter: Twitter Ads API</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            {budgetData && (
              <Card>
                <CardHeader>
                  <CardTitle>Budget Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sales Allocation Percentage
                    </label>
                    <div className="flex items-center gap-4">
                      <Input
                        type="number"
                        value={budgetData.allocation_percentage}
                        onChange={(e) => {
                          updateBudgetMutation.mutate({
                            allocation_percentage: parseFloat(e.target.value)
                          });
                        }}
                        className="w-32"
                        step="0.5"
                        min="0"
                        max="100"
                      />
                      <span className="text-gray-600">% of each sale goes to marketing budget</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">Auto-Allocate from Sales</p>
                      <p className="text-sm text-gray-600">
                        Automatically add percentage from each transaction
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={budgetData.auto_allocate}
                      onChange={(e) => {
                        updateBudgetMutation.mutate({
                          auto_allocate: e.target.checked
                        });
                      }}
                      className="w-5 h-5"
                    />
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Budget Summary</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-green-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Total Allocated</p>
                        <p className="text-2xl font-bold text-green-600">
                          ${budgetData.total_allocated?.toFixed(2) || "0.00"}
                        </p>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Total Spent</p>
                        <p className="text-2xl font-bold text-orange-600">
                          ${budgetData.total_spent?.toFixed(2) || "0.00"}
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Available</p>
                        <p className="text-2xl font-bold text-blue-600">
                          ${budgetData.available_balance?.toFixed(2) || "0.00"}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Video Scheduler Dialog - NEW */}
      <VideoScheduler 
        user={user}
        open={showVideoScheduler}
        onClose={() => setShowVideoScheduler(false)}
      />

      {/* AI Campaign Generator Dialog */}
      <Dialog open={showAIDialog} onOpenChange={setShowAIDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-600" />
              AI Campaign Generator
            </DialogTitle>
            <DialogDescription>
              Describe your marketing goal and let AI create a complete campaign for you
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Example: Create a campaign to attract basketball memorabilia collectors aged 25-45 in major US cities..."
              rows={4}
              disabled={generatingAI}
            />

            <Button
              onClick={handleGenerateWithAI}
              disabled={!aiPrompt.trim() || generatingAI}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              {generatingAI ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating Campaign...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Generate Campaign
                </>
              )}
            </Button>

            {aiResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="border-t pt-4"
              >
                <h4 className="font-semibold text-gray-900 mb-3">Generated Campaign</h4>
                <div className="space-y-3 bg-gray-50 rounded-lg p-4">
                  <div>
                    <p className="text-xs text-gray-600">Campaign Name</p>
                    <p className="font-medium text-gray-900">{aiResult.campaign_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Platform</p>
                    <Badge>{aiResult.platform.replace('_', ' ')}</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Ad Headline</p>
                    <p className="font-medium text-gray-900">{aiResult.ad_creative?.headline}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Description</p>
                    <p className="text-sm text-gray-700">{aiResult.ad_creative?.description}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Suggested Budget</p>
                    <p className="font-medium text-gray-900">${aiResult.budget_allocated}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAIDialog(false)}>
              Cancel
            </Button>
            {aiResult && (
              <Button onClick={() => {
                setShowAIDialog(false);
                setShowCampaignDialog(true);
              }}>
                Review & Create Campaign
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Create/Edit Dialog */}
      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCampaign ? 'Edit Campaign' : 'Create Campaign'}
            </DialogTitle>
            <DialogDescription>
              {aiResult ? 'Review and customize your AI-generated campaign' : 'Set up your marketing campaign details'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign Name *
                </label>
                <Input
                  value={campaignForm.campaign_name}
                  onChange={(e) => setCampaignForm({...campaignForm, campaign_name: e.target.value})}
                  placeholder="Spring Sale Campaign"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Platform *
                </label>
                <Select
                  value={campaignForm.platform}
                  onValueChange={(value) => setCampaignForm({...campaignForm, platform: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google_ads">Google Ads</SelectItem>
                    <SelectItem value="facebook_ads">Facebook Ads</SelectItem>
                    <SelectItem value="instagram_ads">Instagram Ads</SelectItem>
                    <SelectItem value="tiktok_ads">TikTok Ads</SelectItem>
                    <SelectItem value="twitter_ads">Twitter Ads</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Budget (USD) *
              </label>
              <Input
                type="number"
                value={campaignForm.budget_allocated}
                onChange={(e) => setCampaignForm({...campaignForm, budget_allocated: parseFloat(e.target.value)})}
                placeholder="500"
              />
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold text-gray-900 mb-3">Ad Creative</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Headline
                  </label>
                  <Input
                    value={campaignForm.ad_creative?.headline || ""}
                    onChange={(e) => setCampaignForm({
                      ...campaignForm,
                      ad_creative: {...campaignForm.ad_creative, headline: e.target.value}
                    })}
                    placeholder="Authentic Sports Memorabilia"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <Textarea
                    value={campaignForm.ad_creative?.description || ""}
                    onChange={(e) => setCampaignForm({
                      ...campaignForm,
                      ad_creative: {...campaignForm.ad_creative, description: e.target.value}
                    })}
                    placeholder="Discover verified memorabilia from your favorite sports..."
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Call to Action
                  </label>
                  <Input
                    value={campaignForm.ad_creative?.call_to_action || ""}
                    onChange={(e) => setCampaignForm({
                      ...campaignForm,
                      ad_creative: {...campaignForm.ad_creative, call_to_action: e.target.value}
                    })}
                    placeholder="Shop Now"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold text-gray-900 mb-3">Target Audience</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Age Range
                  </label>
                  <Input
                    value={campaignForm.target_audience?.age_range || ""}
                    onChange={(e) => setCampaignForm({
                      ...campaignForm,
                      target_audience: {...campaignForm.target_audience, age_range: e.target.value}
                    })}
                    placeholder="25-45"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Demographics
                  </label>
                  <Input
                    value={campaignForm.target_audience?.demographics || ""}
                    onChange={(e) => setCampaignForm({
                      ...campaignForm,
                      target_audience: {...campaignForm.target_audience, demographics: e.target.value}
                    })}
                    placeholder="Sports enthusiasts, collectors"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <Input
                  type="date"
                  value={campaignForm.start_date}
                  onChange={(e) => setCampaignForm({...campaignForm, start_date: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date
                </label>
                <Input
                  type="date"
                  value={campaignForm.end_date}
                  onChange={(e) => setCampaignForm({...campaignForm, end_date: e.target.value})}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCampaignDialog(false);
              setEditingCampaign(null);
              resetCampaignForm();
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCampaign}
              disabled={!campaignForm.campaign_name || !campaignForm.budget_allocated || saveCampaignMutation.isPending}
            >
              {saveCampaignMutation.isPending ? "Saving..." : editingCampaign ? "Update Campaign" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}