import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Upload, Video, Loader2, Calendar, Hash, CheckCircle, Sparkles, Youtube, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import VideoLibrary from "./VideoLibrary";

const PLATFORMS = [
  { id: "youtube", name: "YouTube", icon: <Youtube className="w-6 h-6" />, color: "#FF0000", autoUpload: true },
  { id: "tiktok", name: "TikTok", icon: "🎵", color: "#000000" },
  { id: "facebook", name: "Facebook", icon: "📘", color: "#1877F2" },
  { id: "instagram", name: "Instagram", icon: "📸", color: "#E4405F" },
  { id: "twitter", name: "Twitter/X", icon: "🐦", color: "#1DA1F2" },
];

export default function VideoScheduler({ user, open, onClose }) {
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    video_url: "",
    thumbnail_url: "",
    platforms: [],
    scheduled_date: "",
    hashtags: []
  });
  const [hashtagInput, setHashtagInput] = useState("");
  const [soraPrompt, setSoraPrompt] = useState("");
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState("");
  const [videoSize, setVideoSize] = useState("1080x1920"); // Default to Vertical for Shorts
  const [referenceImage, setReferenceImage] = useState(null);
  const [generatedVideoId, setGeneratedVideoId] = useState(null);
  const [remixPrompt, setRemixPrompt] = useState("");
  const [remixingVideo, setRemixingVideo] = useState(false);
  const [generatedVideos, setGeneratedVideos] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [scheduledPosts, setScheduledPosts] = useState([]);
  const [loadingScheduled, setLoadingScheduled] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [autoGenEnabled, setAutoGenEnabled] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
        fetchSettings();
    }
  }, [open]);

  const fetchSettings = async () => {
    setLoadingSettings(true);
    try {
        const settings = await base44.entities.SystemSetting.filter({ key: 'auto_video_gen_enabled' });
        if (settings.length > 0) {
            setAutoGenEnabled(settings[0].value === 'true');
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoadingSettings(false);
    }
  };

  const toggleAutoGeneration = async (enabled) => {
    setLoadingSettings(true);
    try {
        const settings = await base44.entities.SystemSetting.filter({ key: 'auto_video_gen_enabled' });
        if (settings.length > 0) {
            await base44.entities.SystemSetting.update(settings[0].id, { value: enabled.toString() });
        } else {
            await base44.entities.SystemSetting.create({ 
                key: 'auto_video_gen_enabled', 
                value: enabled.toString(),
                description: 'Enable daily automatic video generation campaign'
            });
        }
        setAutoGenEnabled(enabled);
        if (enabled) {
            alert("Auto-generation enabled! The system will now generate 5 videos daily.");
        } else {
            alert("Auto-generation disabled.");
        }
    } catch (e) {
        alert("Failed to update settings");
    } finally {
        setLoadingSettings(false);
    }
  };

  const triggerDailyCampaign = async () => {
    if (!confirm("Generate 5 new videos right now? This will use OpenAI credits.")) return;
    try {
        const { data } = await base44.functions.invoke('generateDailyCampaign', { force: true });
        if (data.success) {
            alert(`Started generation for ${data.results.length} videos. They will appear in 'Scheduled' once ready.`);
            fetchScheduledPosts();
        } else {
            alert("Failed: " + (data.message || "Unknown error"));
        }
    } catch (e) {
        alert("Error: " + e.message);
    }
  };

  const checkGenerations = async () => {
      try {
          const { data } = await base44.functions.invoke('checkVideoGenerations');
          if (data.updates.length > 0) {
              alert(`${data.updates.length} videos finished generating!`);
              fetchScheduledPosts();
          } else {
              alert("No new videos finished yet. Check back later.");
          }
      } catch (e) {
          console.error(e);
      }
  };

  const fetchScheduledPosts = async () => {
    setLoadingScheduled(true);
    try {
      const posts = await base44.entities.ScheduledPost.filter({ status: 'scheduled' }, '-scheduled_date');
      setScheduledPosts(posts);
    } catch (error) {
      console.error("Failed to fetch scheduled posts:", error);
    } finally {
      setLoadingScheduled(false);
    }
  };

  const handleProcessQueue = async () => {
    if (!confirm("Run the scheduler now? This will attempt to publish any posts that are due.")) return;
    
    setProcessingQueue(true);
    try {
      const { data } = await base44.functions.invoke('processScheduledPosts');
      alert(`Processed ${data.processed} posts.`);
      fetchScheduledPosts();
    } catch (error) {
      alert("Failed to process queue: " + error.message);
    } finally {
      setProcessingQueue(false);
    }
  };

  const handleSoraGeneration = async () => {
    if (!soraPrompt) return;

    setGeneratingVideo(true);
    setGenerationStatus("Starting...");
    setGenerationProgress(0);

    try {
      const generationParams = {
        model: 'sora-2-pro',
        prompt: soraPrompt,
        size: videoSize,
        seconds: 8,
      };

      if (referenceImage) {
        // Note: Sending file objects to backend via JSON isn't directly supported.
        // Ideally we should upload it first, then send URL.
        // For now, assuming referenceImage logic might need adjustment if it's a File object.
        // Let's assume we skip it or user needs to upload it elsewhere first if we want to be strict.
        // But to keep it simple and assuming backend can handle it or we implement upload logic later:
        // Actually, let's warn user or upload it if we can. 
        // Best approach: Upload to base44 storage first if it's a File.
        if (referenceImage instanceof File) {
            setGenerationStatus("Uploading reference image...");
            const { file_url } = await base44.integrations.Core.UploadFile({ file: referenceImage });
            generationParams.input_reference = file_url;
        } else {
            generationParams.input_reference = referenceImage;
        }
      }

      // 1. Create Generation Task
      const { data: video } = await base44.functions.invoke('sora', {
        action: 'create',
        ...generationParams
      });

      if (!video || !video.id) throw new Error("Failed to start generation");

      setGeneratedVideoId(video.id);
      setGenerationStatus(video.status);
      if (video.progress) setGenerationProgress(video.progress);

      // 2. Poll for completion
      let currentVideo = video;
      while (currentVideo.status === 'in_progress' || currentVideo.status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const { data: updatedVideo } = await base44.functions.invoke('sora', {
            action: 'retrieve',
            id: currentVideo.id
        });
        currentVideo = updatedVideo;
        
        setGenerationStatus(currentVideo.status);
        if (currentVideo.progress) setGenerationProgress(currentVideo.progress);
      }

      if (currentVideo.status === 'succeeded' || currentVideo.status === 'completed') {
        const videoUrl = currentVideo.url || currentVideo.output?.[0] || currentVideo.output_url;
        if (videoUrl) {
          setFormData({ ...formData, video_url: videoUrl });
          alert("Video generated successfully!");
        } else {
          throw new Error("Video completed but no URL found in response");
        }
      } else {
        throw new Error(`Generation failed with status: ${currentVideo.status}`);
      }

    } catch (error) {
      console.error("Sora generation error:", error);
      alert("Failed to generate video: " + error.message);
    } finally {
      setGeneratingVideo(false);
      setGenerationStatus("");
    }
  };

  const handleRemix = async () => {
    if (!remixPrompt || !generatedVideoId) return;

    setRemixingVideo(true);
    setGenerationStatus("Starting Remix...");
    setGenerationProgress(0);

    try {
      const { data: video } = await base44.functions.invoke('sora', {
        action: 'remix',
        id: generatedVideoId,
        body: { prompt: remixPrompt }
      });

      if (!video || !video.id) throw new Error("Failed to start remix");
      
      setGeneratedVideoId(video.id);
      setGenerationStatus(video.status);
      if (video.progress) setGenerationProgress(video.progress);

      let currentVideo = video;
      while (currentVideo.status === 'in_progress' || currentVideo.status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const { data: updatedVideo } = await base44.functions.invoke('sora', {
            action: 'retrieve',
            id: currentVideo.id
        });
        currentVideo = updatedVideo;

        setGenerationStatus(currentVideo.status);
        if (currentVideo.progress) setGenerationProgress(currentVideo.progress);
      }

      if (currentVideo.status === 'succeeded' || currentVideo.status === 'completed') {
        const videoUrl = currentVideo.url || currentVideo.output?.[0] || currentVideo.output_url;
        if (videoUrl) {
          setFormData({ ...formData, video_url: videoUrl });
          alert("Video remixed successfully!");
          setRemixPrompt("");
        } else {
          throw new Error("Remix completed but no URL found");
        }
      } else {
        throw new Error(`Remix failed with status: ${currentVideo.status}`);
      }

    } catch (error) {
      console.error("Remix error:", error);
      alert("Failed to remix video: " + error.message);
    } finally {
      setRemixingVideo(false);
      setGenerationStatus("");
    }
  };

  const fetchGeneratedVideos = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await base44.functions.invoke('sora', { action: 'list' });
      // Handle response structure { data: [...] } or just [...]
      setGeneratedVideos(Array.isArray(data) ? data : data.data || []);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteVideoById = async (id) => {
    if (!confirm("Delete this video?")) return;

    try {
      await base44.functions.invoke('sora', { action: 'delete', id });
      
      alert("Video deleted");
      if (id === generatedVideoId) {
        setFormData({ ...formData, video_url: "" });
        setGeneratedVideoId(null);
        setGenerationStatus("");
      }
      fetchGeneratedVideos();
    } catch (error) {
      alert(error.message);
    }
  };
  
  // Initial fetch when tab is opened/active is handled by UI logic below or user click
  // But let's add an effect to fetch history on mount if we are in the sora tab (or let user click refresh)

  const handleDeleteVideo = () => {
    if (generatedVideoId) deleteVideoById(generatedVideoId);
  };

  const savePostMutation = useMutation({
    mutationFn: async (postData) => {
      return await base44.entities.ScheduledPost.create({
        admin_email: user.email,
        ...postData,
        status: postData.scheduled_date ? "scheduled" : "draft"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
      resetForm();
      onClose();
    },
  });

  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingVideo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, video_url: file_url });
    } catch (error) {
      alert("Failed to upload video");
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingThumbnail(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData({ ...formData, thumbnail_url: file_url });
    } catch (error) {
      alert("Failed to upload thumbnail");
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const togglePlatform = (platformId) => {
    const platforms = formData.platforms.includes(platformId)
      ? formData.platforms.filter(p => p !== platformId)
      : [...formData.platforms, platformId];
    setFormData({ ...formData, platforms });
  };

  const addHashtag = () => {
    if (!hashtagInput.trim()) return;
    const tag = hashtagInput.startsWith('#') ? hashtagInput : `#${hashtagInput}`;
    if (!formData.hashtags.includes(tag)) {
      setFormData({ ...formData, hashtags: [...formData.hashtags, tag] });
    }
    setHashtagInput("");
  };

  const removeHashtag = (tag) => {
    setFormData({ ...formData, hashtags: formData.hashtags.filter(h => h !== tag) });
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      video_url: "",
      thumbnail_url: "",
      platforms: [],
      scheduled_date: "",
      hashtags: []
    });
    setHashtagInput("");
  };

  const handleSave = () => {
    if (!formData.title || !formData.video_url || formData.platforms.length === 0) {
      alert("Please fill in title, upload video, and select at least one platform");
      return;
    }
    savePostMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600" />
            Auto-Ad Campaign Manager
          </DialogTitle>
          <DialogDescription>
            Manage your automated YouTube ad campaign and view scheduled posts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Video Source */}
          <Tabs defaultValue="scheduled" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="scheduled" className="flex items-center gap-2" onClick={fetchScheduledPosts}>
                <Calendar className="w-4 h-4 text-blue-500" /> Auto-Campaign
              </TabsTrigger>
              <TabsTrigger value="sora" className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-500" /> Manual AI Gen
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="w-4 h-4" /> Manual Upload
              </TabsTrigger>
              <TabsTrigger value="library" className="flex items-center gap-2">
                <Video className="w-4 h-4 text-green-500" /> Library
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Video File *
                </label>
                {!formData.video_url ? (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="flex flex-col items-center">
                      {uploadingVideo ? (
                        <>
                          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
                          <p className="text-sm text-gray-600">Uploading video...</p>
                        </>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-gray-400 mb-2" />
                          <p className="text-sm text-gray-600">Click to upload video</p>
                          <p className="text-xs text-gray-500">MP4, MOV, AVI supported</p>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={handleVideoUpload}
                      disabled={uploadingVideo}
                    />
                  </label>
                ) : (
                  <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <Video className="w-6 h-6 text-green-600" />
                      <div className="flex-1">
                        <p className="font-medium text-green-900">Video ready</p>
                        <a href={formData.video_url} target="_blank" rel="noopener noreferrer" className="text-xs text-green-700 hover:underline">
                          View video
                        </a>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData({ ...formData, video_url: "" })}
                      >
                        Change
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="scheduled">
              <div className="space-y-4">
                {/* Auto-Gen Controls - MOVED TO TOP */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-xl border-2 border-indigo-100 mb-6 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h4 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-indigo-600" />
                                Daily Auto-Campaign
                            </h4>
                            <p className="text-sm text-indigo-700 mt-1">
                                Automatically generate & schedule 5 YouTube Shorts daily.
                            </p>
                        </div>
                        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-full border border-indigo-100 shadow-sm">
                            <span className={`text-sm font-bold ${autoGenEnabled ? "text-green-600" : "text-gray-500"}`}>
                                {autoGenEnabled ? "ACTIVE" : "PAUSED"}
                            </span>
                            <div 
                                className={`w-12 h-7 rounded-full p-1 transition-colors cursor-pointer ${autoGenEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                                onClick={() => toggleAutoGeneration(!autoGenEnabled)}
                            >
                                <div className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${autoGenEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                            </div>
                        </div>
                    </div>
                    
                    {autoGenEnabled && (
                        <div className="mt-4 pt-4 border-t border-indigo-200/50 flex flex-wrap gap-3">
                            <Button size="sm" variant="outline" onClick={triggerDailyCampaign} className="text-xs h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-100 bg-white">
                                <Sparkles className="w-3 h-3 mr-2" /> Trigger Batch Now
                            </Button>
                            <Button size="sm" variant="outline" onClick={checkGenerations} className="text-xs h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-100 bg-white">
                                <Loader2 className="w-3 h-3 mr-2" /> Check Status
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex justify-between items-center px-1">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Upcoming & Generating
                  </h3>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={fetchScheduledPosts} disabled={loadingScheduled}>
                      {loadingScheduled ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh List"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleProcessQueue} disabled={processingQueue} className="text-xs">
                      {processingQueue ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <CheckCircle className="w-3 h-3 mr-2" />}
                      Force Publish
                    </Button>
                  </div>
                </div>

                {scheduledPosts.length > 0 ? (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {scheduledPosts.map(post => (
                      <Card key={post.id} className="p-3 border border-gray-200">
                        <div className="flex gap-3">
                          <div className="w-16 h-16 bg-gray-100 rounded-md overflow-hidden flex-shrink-0">
                             {post.thumbnail_url ? (
                               <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" />
                             ) : (
                               <Video className="w-6 h-6 m-auto mt-4 text-gray-400" />
                             )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate">{post.title}</h4>
                            <p className="text-xs text-gray-500 truncate">{post.description}</p>
                            <div className="flex items-center gap-2 mt-2 text-xs">
                              <Badge variant="secondary" className="text-[10px]">
                                {new Date(post.scheduled_date).toLocaleString()}
                              </Badge>
                              <div className="flex gap-1">
                                {post.platforms.map(p => (
                                  <span key={p} className="uppercase font-bold text-[9px] text-gray-600">{p}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center">
                             <Badge className={new Date(post.scheduled_date) <= new Date() ? "bg-red-100 text-red-700 hover:bg-red-100" : "bg-blue-100 text-blue-700 hover:bg-blue-100"}>
                               {new Date(post.scheduled_date) <= new Date() ? "Due Now" : "Upcoming"}
                             </Badge>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No scheduled posts found</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="library">
              <VideoLibrary />
            </TabsContent>

            <TabsContent value="sora">
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  <h3 className="font-semibold text-purple-900">Sora AI Video Generation</h3>
                </div>
                
                <div className="space-y-3">
                  {/* API Key managed via backend secrets now */}

                  <div>
                    <label className="block text-sm font-medium text-purple-800 mb-1">
                      Video Size (Aspect Ratio)
                    </label>
                    <Select value={videoSize} onValueChange={setVideoSize}>
                      <SelectTrigger className="w-full bg-white mb-3">
                        <SelectValue placeholder="Select video size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1080x1920">
                          1080x1920 (9:16) - YouTube Shorts / TikTok / Reels
                        </SelectItem>
                        <SelectItem value="1280x720">
                          1280x720 (16:9) - Standard YouTube / Landscape
                        </SelectItem>
                        <SelectItem value="1080x1080">
                          1080x1080 (1:1) - Square / Instagram Feed
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-purple-800 mb-1">
                      Prompt
                    </label>
                    <Textarea 
                      placeholder="Describe the video you want to generate... e.g., A cinematic drone shot of a vintage baseball card collection with dramatic lighting."
                      className="min-h-[100px] bg-white"
                      value={soraPrompt}
                      onChange={(e) => setSoraPrompt(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-purple-800 mb-1">
                      Reference Image (Optional)
                    </label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="file"
                        accept="image/*"
                        className="bg-white"
                        onChange={(e) => setReferenceImage(e.target.files?.[0] || null)}
                      />
                      {referenceImage && (
                        <div className="text-xs text-green-600 font-medium">
                          Selected: {referenceImage.name}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-purple-600 mt-1">
                      Upload an image to guide the video generation (e.g. animate a static photo).
                    </p>
                  </div>
                  
                  {!formData.video_url ? (
                    <div>
                      <Button 
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white mb-2"
                        onClick={handleSoraGeneration}
                        disabled={generatingVideo || !soraPrompt}
                      >
                        {generatingVideo ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating... {generationProgress}%
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Generate Video
                          </>
                        )}
                      </Button>
                      {generatingVideo && (
                        <div className="text-center">
                          <p className="text-xs text-purple-700 font-medium mb-1">Status: {generationStatus}</p>
                          <div className="w-full bg-purple-200 rounded-full h-2">
                            <div 
                              className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${generationProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                     <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mt-2">
                        <div className="flex items-center gap-3">
                          <Video className="w-6 h-6 text-green-600" />
                          <div className="flex-1">
                            <p className="font-medium text-green-900">Sora video generated!</p>
                            <p className="text-xs text-green-700">Ready for scheduling</p>
                          </div>
                          <div className="flex gap-2">
                            {generatedVideoId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDeleteVideo}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4 mr-1" />
                                Delete
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setFormData({ ...formData, video_url: "" });
                                setGeneratedVideoId(null);
                              }}
                            >
                              New
                            </Button>
                          </div>
                        </div>
                        
                        {generatedVideoId && (
                          <div className="mt-3 pt-3 border-t border-green-200">
                            {/* History Section */}
                            <div className="mt-6 pt-6 border-t border-purple-200">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-purple-900">Generation History</h4>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={fetchGeneratedVideos}
                                  disabled={loadingHistory}
                                >
                                  {loadingHistory ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}
                                </Button>
                              </div>
                              
                              {generatedVideos.length > 0 ? (
                                <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                                  {generatedVideos.map((vid) => (
                                    <div key={vid.id} className="border border-gray-200 rounded-lg p-2 bg-white text-xs relative group">
                                      <div className="flex justify-between items-start mb-1">
                                        <Badge variant="outline" className="text-[10px]">{vid.status}</Badge>
                                        <button 
                                          onClick={() => deleteVideoById(vid.id)}
                                          className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <p className="line-clamp-2 text-gray-600 mb-2" title={vid.prompt}>{vid.prompt || "No prompt"}</p>
                                      {(vid.url || vid.output?.[0] || vid.output_url) && (
                                        <Button 
                                          size="sm" 
                                          variant="secondary" 
                                          className="w-full h-6 text-[10px]"
                                          onClick={() => {
                                            const url = vid.url || vid.output?.[0] || vid.output_url;
                                            setFormData({ ...formData, video_url: url });
                                            setGeneratedVideoId(vid.id);
                                          }}
                                        >
                                          Select
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500 italic text-center py-4">No history found</p>
                              )}
                            </div>

                            <label className="block text-sm font-medium text-purple-800 mb-1 mt-4">
                              Remix Video
                            </label>
                            <div className="flex gap-2">
                              <Input 
                                placeholder="E.g. Shift colors to teal and rust, add warm backlight..."
                                value={remixPrompt}
                                onChange={(e) => setRemixPrompt(e.target.value)}
                                className="bg-white"
                              />
                              <Button 
                                onClick={handleRemix}
                                disabled={remixingVideo || !remixPrompt}
                                className="bg-purple-600 hover:bg-purple-700 text-white whitespace-nowrap"
                              >
                                {remixingVideo ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Sparkles className="w-4 h-4" />
                                )}
                                <span className="ml-2">Remix</span>
                              </Button>
                            </div>
                            {remixingVideo && (
                              <div className="mt-2">
                                <p className="text-xs text-purple-700 font-medium mb-1">Remixing: {generationStatus}</p>
                                <div className="w-full bg-purple-200 rounded-full h-1.5">
                                  <div 
                                    className="bg-purple-600 h-1.5 rounded-full transition-all duration-500"
                                    style={{ width: `${generationProgress}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Thumbnail Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Thumbnail Image (Optional)
            </label>
            {!formData.thumbnail_url ? (
              <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="flex flex-col items-center">
                  {uploadingThumbnail ? (
                    <>
                      <Loader2 className="w-6 h-6 text-blue-600 animate-spin mb-2" />
                      <p className="text-xs text-gray-600">Uploading...</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-gray-400 mb-2" />
                      <p className="text-xs text-gray-600">Upload thumbnail</p>
                    </>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleThumbnailUpload}
                  disabled={uploadingThumbnail}
                />
              </label>
            ) : (
              <div className="relative">
                <img src={formData.thumbnail_url} alt="Thumbnail" className="w-full h-32 object-cover rounded-lg" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormData({ ...formData, thumbnail_url: "" })}
                  className="absolute top-2 right-2 bg-white/90"
                >
                  Change
                </Button>
              </div>
            )}
          </div>

          {/* Title & Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title *
            </label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Amazing Sports Memorabilia Collection"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description/Caption
            </label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Check out these incredible pieces from our collection..."
              rows={4}
            />
          </div>

          {/* Hashtags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hashtags
            </label>
            <div className="flex gap-2 mb-2">
              <Input
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addHashtag();
                  }
                }}
                placeholder="sports memorabilia"
              />
              <Button onClick={addHashtag} variant="outline">
                <Hash className="w-4 h-4" />
              </Button>
            </div>
            {formData.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.hashtags.map((tag, idx) => (
                  <Badge key={idx} variant="outline" className="cursor-pointer" onClick={() => removeHashtag(tag)}>
                    {tag} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Platform Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Select Platforms to Post * (at least one)
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => togglePlatform(platform.id)}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    formData.platforms.includes(platform.id)
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{typeof platform.icon === 'string' ? platform.icon : platform.icon}</span>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-sm">{platform.name}</p>
                        {platform.autoUpload && (
                          <Badge className="text-[9px] h-4 px-1 bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
                            AUTO
                          </Badge>
                        )}
                      </div>
                      {formData.platforms.includes(platform.id) && (
                        <CheckCircle className="w-4 h-4 text-purple-600 inline-block mt-1" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Schedule Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Schedule Date & Time
            </label>
            <Input
              type="datetime-local"
              value={formData.scheduled_date}
              onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to save as draft. Schedule for automatic posting.
            </p>
          </div>

          {/* Notice */}
          <Card className="bg-orange-50 border-2 border-orange-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-orange-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-orange-900 mb-1">
                    Backend Functions Required
                  </p>
                  <p className="text-xs text-orange-800">
                    Video upload and scheduling is ready. To enable automatic posting to social platforms, 
                    enable backend functions in your dashboard settings. The system will then handle posting at the scheduled time.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            onClose();
            resetForm();
          }}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!formData.title || !formData.video_url || formData.platforms.length === 0 || savePostMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {savePostMutation.isPending ? "Saving..." : formData.scheduled_date ? "Schedule Post" : "Save as Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}