import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Upload, Video, Loader2, Calendar, Hash, CheckCircle, Sparkles, Youtube, Trash2 } from "lucide-react";
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
  { id: "youtube", name: "YouTube", icon: <Youtube className="w-4 h-4" />, color: "#FF0000", autoUpload: true },
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
  const [videoSize, setVideoSize] = useState("1080x1920");
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
    if (open) fetchSettings();
  }, [open]);

  const fetchSettings = async () => {
    setLoadingSettings(true);
    try {
      const settings = await base44.entities.SystemSetting.filter({ key: 'auto_video_gen_enabled' });
      if (settings.length > 0) setAutoGenEnabled(settings[0].value === 'true');
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
      alert(enabled ? "Auto-generation enabled! The system will now generate 5 videos daily." : "Auto-generation disabled.");
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
        alert(`Started generation for ${data.results.length} videos.`);
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
        alert("No new videos finished yet.");
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
      const generationParams = { model: 'sora-2-pro', prompt: soraPrompt, size: videoSize, seconds: 8 };
      if (referenceImage) {
        if (referenceImage instanceof File) {
          setGenerationStatus("Uploading reference image...");
          const { file_url } = await base44.integrations.Core.UploadFile({ file: referenceImage });
          generationParams.input_reference = file_url;
        } else {
          generationParams.input_reference = referenceImage;
        }
      }
      const { data: video } = await base44.functions.invoke('sora', { action: 'create', ...generationParams });
      if (!video || !video.id) throw new Error("Failed to start generation");
      setGeneratedVideoId(video.id);
      setGenerationStatus(video.status);
      if (video.progress) setGenerationProgress(video.progress);
      let currentVideo = video;
      while (currentVideo.status === 'in_progress' || currentVideo.status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const { data: updatedVideo } = await base44.functions.invoke('sora', { action: 'retrieve', id: currentVideo.id });
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
          throw new Error("Video completed but no URL found");
        }
      } else {
        throw new Error(`Generation failed: ${currentVideo.status}`);
      }
    } catch (error) {
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
      const { data: video } = await base44.functions.invoke('sora', { action: 'remix', id: generatedVideoId, body: { prompt: remixPrompt } });
      if (!video || !video.id) throw new Error("Failed to start remix");
      setGeneratedVideoId(video.id);
      setGenerationStatus(video.status);
      if (video.progress) setGenerationProgress(video.progress);
      let currentVideo = video;
      while (currentVideo.status === 'in_progress' || currentVideo.status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const { data: updatedVideo } = await base44.functions.invoke('sora', { action: 'retrieve', id: currentVideo.id });
        currentVideo = updatedVideo;
        setGenerationStatus(currentVideo.status);
        if (currentVideo.progress) setGenerationProgress(currentVideo.progress);
      }
      if (currentVideo.status === 'succeeded' || currentVideo.status === 'completed') {
        const videoUrl = currentVideo.url || currentVideo.output?.[0] || currentVideo.output_url;
        if (videoUrl) {
          setFormData({ ...formData, video_url: videoUrl });
          alert("Remixed!");
          setRemixPrompt("");
        } else {
          throw new Error("Remix completed but no URL found");
        }
      } else {
        throw new Error(`Remix failed: ${currentVideo.status}`);
      }
    } catch (error) {
      alert("Failed to remix: " + error.message);
    } finally {
      setRemixingVideo(false);
      setGenerationStatus("");
    }
  };

  const fetchGeneratedVideos = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await base44.functions.invoke('sora', { action: 'list' });
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

  const handleDeleteVideo = () => { if (generatedVideoId) deleteVideoById(generatedVideoId); };

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
    setFormData({ title: "", description: "", video_url: "", thumbnail_url: "", platforms: [], scheduled_date: "", hashtags: [] });
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
      <DialogContent className="w-full max-w-lg max-h-[92vh] overflow-y-auto p-0 gap-0">
        {/* Sticky header */}
        <DialogHeader className="sticky top-0 z-10 bg-background border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0" />
            Ad Campaign Manager
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-4 space-y-4">
          <Tabs defaultValue="scheduled" className="w-full">
            {/* Horizontally scrollable tab bar */}
            <div className="overflow-x-auto -mx-4 px-4">
              <TabsList className="flex w-max min-w-full gap-1 h-9 mb-4">
                <TabsTrigger value="scheduled" className="text-xs px-3 h-7 flex items-center gap-1.5 whitespace-nowrap" onClick={fetchScheduledPosts}>
                  <Calendar className="w-3 h-3" /> Auto-Campaign
                </TabsTrigger>
                <TabsTrigger value="sora" className="text-xs px-3 h-7 flex items-center gap-1.5 whitespace-nowrap">
                  <Sparkles className="w-3 h-3" /> AI Gen
                </TabsTrigger>
                <TabsTrigger value="upload" className="text-xs px-3 h-7 flex items-center gap-1.5 whitespace-nowrap">
                  <Upload className="w-3 h-3" /> Upload
                </TabsTrigger>
                <TabsTrigger value="library" className="text-xs px-3 h-7 flex items-center gap-1.5 whitespace-nowrap">
                  <Video className="w-3 h-3" /> Library
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ── Auto-Campaign Tab ── */}
            <TabsContent value="scheduled">
              <div className="space-y-3">
                {/* Compact auto-gen toggle */}
                <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                        Daily Auto-Campaign
                      </p>
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5 leading-tight">
                        Generates &amp; schedules 5 Shorts daily
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-bold ${autoGenEnabled ? "text-green-600" : "text-gray-400"}`}>
                        {autoGenEnabled ? "ON" : "OFF"}
                      </span>
                      <div
                        className={`w-10 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${autoGenEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                        onClick={() => toggleAutoGeneration(!autoGenEnabled)}
                      >
                        <div className={`bg-white w-5 h-5 rounded-full shadow transform transition-transform ${autoGenEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </div>
                  </div>

                  {autoGenEnabled && (
                    <div className="mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-700 flex gap-2">
                      <Button size="sm" variant="outline" onClick={triggerDailyCampaign} className="text-xs h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-100 bg-white flex-1">
                        <Sparkles className="w-3 h-3 mr-1" /> Trigger Batch
                      </Button>
                      <Button size="sm" variant="outline" onClick={checkGenerations} className="text-xs h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-100 bg-white flex-1">
                        <Loader2 className="w-3 h-3 mr-1" /> Check Status
                      </Button>
                    </div>
                  )}
                </div>

                {/* Queue header */}
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Upcoming
                  </p>
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="sm" onClick={fetchScheduledPosts} disabled={loadingScheduled} className="h-7 text-xs px-2">
                      {loadingScheduled ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleProcessQueue} disabled={processingQueue} className="h-7 text-xs px-2">
                      {processingQueue ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                      <span className="ml-1">Publish</span>
                    </Button>
                  </div>
                </div>

                {scheduledPosts.length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {scheduledPosts.map(post => (
                      <div key={post.id} className="flex gap-2.5 p-2.5 rounded-lg border border-border bg-card">
                        <div className="w-12 h-12 bg-muted rounded flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {post.thumbnail_url
                            ? <img src={post.thumbnail_url} alt="" className="w-full h-full object-cover" />
                            : <Video className="w-4 h-4 text-muted-foreground" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{post.title}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{post.description}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                              {new Date(post.scheduled_date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </Badge>
                            <Badge className={`text-[10px] h-4 px-1.5 ${new Date(post.scheduled_date) <= new Date() ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                              {new Date(post.scheduled_date) <= new Date() ? "Due" : "Upcoming"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 bg-muted/40 rounded-lg border border-dashed border-border">
                    <Calendar className="w-6 h-6 text-muted-foreground mx-auto mb-1.5" />
                    <p className="text-xs text-muted-foreground">No scheduled posts</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Upload Tab ── */}
            <TabsContent value="upload">
              {!formData.video_url ? (
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/40 transition-colors">
                  {uploadingVideo ? (
                    <>
                      <Loader2 className="w-6 h-6 text-blue-600 animate-spin mb-1" />
                      <p className="text-xs text-muted-foreground">Uploading...</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground">Tap to upload video</p>
                      <p className="text-[11px] text-muted-foreground/70">MP4, MOV, AVI</p>
                    </>
                  )}
                  <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} disabled={uploadingVideo} />
                </label>
              ) : (
                <div className="flex items-center gap-2.5 p-2.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                  <Video className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-green-900 dark:text-green-300">Video ready</p>
                    <a href={formData.video_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-green-700 hover:underline">View</a>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setFormData({ ...formData, video_url: "" })} className="h-7 text-xs px-2">
                    Change
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ── Library Tab ── */}
            <TabsContent value="library">
              <VideoLibrary />
            </TabsContent>

            {/* ── AI Gen Tab ── */}
            <TabsContent value="sora">
              <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <p className="text-sm font-semibold text-purple-900 dark:text-purple-300">Sora AI Generation</p>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">Size</label>
                    <Select value={videoSize} onValueChange={setVideoSize}>
                      <SelectTrigger className="h-8 text-xs bg-white dark:bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1080x1920">1080×1920 — Shorts / TikTok</SelectItem>
                        <SelectItem value="1280x720">1280×720 — YouTube Landscape</SelectItem>
                        <SelectItem value="1080x1080">1080×1080 — Square</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">Prompt</label>
                    <Textarea
                      placeholder="Describe the video..."
                      className="min-h-[80px] text-sm bg-white dark:bg-background"
                      value={soraPrompt}
                      onChange={(e) => setSoraPrompt(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">Reference Image (optional)</label>
                    <Input type="file" accept="image/*" className="h-8 text-xs bg-white dark:bg-background" onChange={(e) => setReferenceImage(e.target.files?.[0] || null)} />
                    {referenceImage && <p className="text-[11px] text-green-600 mt-1">Selected: {referenceImage.name}</p>}
                  </div>

                  {!formData.video_url ? (
                    <div>
                      <Button
                        className="w-full h-9 text-sm bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                        onClick={handleSoraGeneration}
                        disabled={generatingVideo || !soraPrompt}
                      >
                        {generatingVideo ? (
                          <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Generating {generationProgress}%</>
                        ) : (
                          <><Sparkles className="w-3.5 h-3.5 mr-2" />Generate</>
                        )}
                      </Button>
                      {generatingVideo && (
                        <div className="mt-2">
                          <p className="text-[11px] text-purple-700 mb-1">{generationStatus}</p>
                          <div className="w-full bg-purple-200 rounded-full h-1.5">
                            <div className="bg-purple-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${generationProgress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-2.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                        <Video className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <p className="text-xs font-medium text-green-900 dark:text-green-300 flex-1">Video ready</p>
                        <div className="flex gap-1">
                          {generatedVideoId && (
                            <Button variant="ghost" size="sm" onClick={handleDeleteVideo} className="h-7 text-xs px-2 text-red-600">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => { setFormData({ ...formData, video_url: "" }); setGeneratedVideoId(null); }} className="h-7 text-xs px-2">
                            New
                          </Button>
                        </div>
                      </div>

                      {generatedVideoId && (
                        <>
                          {/* Remix */}
                          <div>
                            <label className="block text-xs font-medium text-purple-800 dark:text-purple-300 mb-1">Remix</label>
                            <div className="flex gap-2">
                              <Input
                                placeholder="Remix prompt..."
                                value={remixPrompt}
                                onChange={(e) => setRemixPrompt(e.target.value)}
                                className="h-8 text-xs bg-white dark:bg-background"
                              />
                              <Button
                                onClick={handleRemix}
                                disabled={remixingVideo || !remixPrompt}
                                className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white px-3"
                              >
                                {remixingVideo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              </Button>
                            </div>
                            {remixingVideo && (
                              <div className="mt-1.5">
                                <div className="w-full bg-purple-200 rounded-full h-1">
                                  <div className="bg-purple-600 h-1 rounded-full transition-all" style={{ width: `${generationProgress}%` }} />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* History */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs font-semibold text-purple-900 dark:text-purple-300">History</p>
                              <Button variant="ghost" size="sm" onClick={fetchGeneratedVideos} disabled={loadingHistory} className="h-6 text-xs px-2">
                                {loadingHistory ? <Loader2 className="w-3 h-3 animate-spin" /> : "Refresh"}
                              </Button>
                            </div>
                            {generatedVideos.length > 0 ? (
                              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                                {generatedVideos.map((vid) => (
                                  <div key={vid.id} className="border border-border rounded-lg p-2 bg-white dark:bg-card text-xs relative group">
                                    <div className="flex justify-between items-center mb-1">
                                      <Badge variant="outline" className="text-[10px] h-4">{vid.status}</Badge>
                                      <button onClick={() => deleteVideoById(vid.id)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                    <p className="line-clamp-2 text-muted-foreground mb-1.5 text-[11px]">{vid.prompt || "No prompt"}</p>
                                    {(vid.url || vid.output?.[0] || vid.output_url) && (
                                      <Button size="sm" variant="secondary" className="w-full h-6 text-[10px]"
                                        onClick={() => { setFormData({ ...formData, video_url: vid.url || vid.output?.[0] || vid.output_url }); setGeneratedVideoId(vid.id); }}>
                                        Select
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-muted-foreground italic text-center py-3">No history</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* ── Manual scheduling fields (always visible) ── */}
          <div className="space-y-3 pt-2 border-t border-border">
            {/* Thumbnail */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1.5">Thumbnail (optional)</label>
              {!formData.thumbnail_url ? (
                <label className="flex items-center justify-center gap-2 w-full h-16 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/40 transition-colors">
                  {uploadingThumbnail
                    ? <><Loader2 className="w-4 h-4 animate-spin text-blue-500" /><span className="text-xs text-muted-foreground">Uploading...</span></>
                    : <><Upload className="w-4 h-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Upload thumbnail</span></>
                  }
                  <input type="file" accept="image/*" className="hidden" onChange={handleThumbnailUpload} disabled={uploadingThumbnail} />
                </label>
              ) : (
                <div className="relative h-20 rounded-lg overflow-hidden">
                  <img src={formData.thumbnail_url} alt="Thumbnail" className="w-full h-full object-cover" />
                  <Button variant="ghost" size="sm" onClick={() => setFormData({ ...formData, thumbnail_url: "" })} className="absolute top-1 right-1 h-6 text-xs px-2 bg-white/90">
                    Change
                  </Button>
                </div>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Title *</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Amazing Sports Memorabilia Collection"
                className="h-9 text-sm"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Caption</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Check out these incredible pieces..."
                rows={3}
                className="text-sm resize-none"
              />
            </div>

            {/* Hashtags */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Hashtags</label>
              <div className="flex gap-2 mb-1.5">
                <Input
                  value={hashtagInput}
                  onChange={(e) => setHashtagInput(e.target.value)}
                  onKeyPress={(e) => { if (e.key === 'Enter') { e.preventDefault(); addHashtag(); } }}
                  placeholder="sports memorabilia"
                  className="h-8 text-sm"
                />
                <Button onClick={addHashtag} variant="outline" size="sm" className="h-8 w-8 p-0 flex-shrink-0">
                  <Hash className="w-3.5 h-3.5" />
                </Button>
              </div>
              {formData.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {formData.hashtags.map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="cursor-pointer text-xs h-6" onClick={() => removeHashtag(tag)}>
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Platform selection — compact chip style */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-2">Platforms *</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((platform) => {
                  const selected = formData.platforms.includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      onClick={() => togglePlatform(platform.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        selected
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300'
                          : 'border-border text-muted-foreground hover:border-gray-400'
                      }`}
                    >
                      <span className="flex-shrink-0">
                        {typeof platform.icon === 'string' ? platform.icon : platform.icon}
                      </span>
                      {platform.name}
                      {platform.autoUpload && <Badge className="text-[9px] h-3.5 px-1 bg-red-100 text-red-700 border-0 ml-0.5">AUTO</Badge>}
                      {selected && <CheckCircle className="w-3 h-3 text-purple-600 ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Schedule date */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Schedule Date & Time</label>
              <Input
                type="datetime-local"
                value={formData.scheduled_date}
                onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Leave empty to save as draft.</p>
            </div>

            {/* Notice */}
            <div className="flex gap-2.5 p-2.5 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg">
              <Calendar className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-orange-900 dark:text-orange-300">Backend Functions Required</p>
                <p className="text-[11px] text-orange-700 dark:text-orange-400 mt-0.5 leading-tight">
                  Enable backend functions in dashboard settings to activate automatic platform posting.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <DialogFooter className="sticky bottom-0 bg-background border-t px-4 py-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { onClose(); resetForm(); }} className="flex-1">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!formData.title || !formData.video_url || formData.platforms.length === 0 || savePostMutation.isPending}
            className="flex-1 bg-purple-600 hover:bg-purple-700"
          >
            {savePostMutation.isPending ? "Saving..." : formData.scheduled_date ? "Schedule" : "Save Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}