import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Play, 
  Trash2, 
  Download, 
  Calendar, 
  Share2, 
  Film,
  Search,
  Maximize2
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";

export default function VideoLibrary() {
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  // Fetch all posts that have a video_url
  const { data: videos, isLoading } = useQuery({
    queryKey: ['video-library'],
    queryFn: async () => {
      // Fetch all posts (sorted by newest first)
      const allPosts = await base44.entities.ScheduledPost.list('-created_date');
      // Filter for ones with actual video URLs
      return allPosts.filter(post => post.video_url && post.video_url.trim() !== "");
    },
    initialData: [],
  });

  const deleteVideoMutation = useMutation({
    mutationFn: async (postId) => {
      return await base44.entities.ScheduledPost.delete(postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video-library'] });
      if (selectedVideo) setSelectedVideo(null);
    },
  });

  const filteredVideos = videos.filter(video => 
    video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    video.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = (e, video) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this video from your library? This cannot be undone.")) {
      deleteVideoMutation.mutate(video.id);
    }
  };

  const handleDownload = (e, url, title) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title || 'video'}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-white/[0.05] dark:border-white/10 dark:backdrop-blur-md p-4 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Film className="w-5 h-5 text-purple-600" />
            Video Library
          </h2>
          <p className="text-sm text-gray-500">
            {videos.length} videos stored in your cloud library
          </p>
        </div>
        
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input 
            placeholder="Search videos..." 
            className="pl-9 bg-gray-50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 dark:bg-white/[0.03] dark:border-white/10 rounded-xl border-2 border-dashed border-gray-200">
          <Film className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No videos found</h3>
          <p className="text-gray-500 max-w-sm mx-auto">
            {searchQuery ? "Try adjusting your search terms" : "Generate or upload videos to see them in your library"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence>
            {filteredVideos.map((video) => (
              <motion.div
                key={video.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group relative bg-white dark:bg-white/[0.05] dark:border-white/10 dark:backdrop-blur-sm rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all cursor-pointer"
                onClick={() => setSelectedVideo(video)}
              >
                {/* Thumbnail / Video Preview */}
                <div className="aspect-[9/16] bg-gray-900 relative">
                  {video.thumbnail_url ? (
                    <img 
                      src={video.thumbnail_url} 
                      alt={video.title}
                      className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                    />
                  ) : (
                    <video 
                      src={video.video_url}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      onMouseOver={e => e.target.play()}
                      onMouseOut={e => {
                        e.target.pause();
                        e.target.currentTime = 0;
                      }}
                    />
                  )}
                  
                  {/* Overlay Controls */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-4">
                    <div className="self-end">
                      <Badge className={`
                        ${video.status === 'posted' ? 'bg-green-500' : 
                          video.status === 'scheduled' ? 'bg-blue-500' : 'bg-gray-500'}
                        text-white border-none shadow-sm
                      `}>
                        {video.status}
                      </Badge>
                    </div>
                    
                    <div className="self-center">
                      <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center transform group-hover:scale-110 transition-transform">
                        <Play className="w-6 h-6 text-white fill-current" />
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                       <Button 
                        size="icon" 
                        variant="ghost" 
                        className="text-white hover:bg-white/20 h-8 w-8"
                        onClick={(e) => handleDownload(e, video.video_url, video.title)}
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="text-red-400 hover:text-red-300 hover:bg-white/20 h-8 w-8"
                        onClick={(e) => handleDelete(e, video)}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3">
                  <h3 className="font-semibold text-gray-900 text-sm truncate" title={video.title}>
                    {video.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    <Calendar className="w-3 h-3" />
                    {new Date(video.created_date).toLocaleDateString()}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Video Player Modal */}
      <Dialog open={!!selectedVideo} onOpenChange={(open) => !open && setSelectedVideo(null)}>
        <DialogContent className="max-w-4xl p-0 bg-black overflow-hidden border-none text-white">
          <div className="relative w-full h-[80vh] flex items-center justify-center bg-black">
            {selectedVideo && (
              <video 
                src={selectedVideo.video_url} 
                controls 
                autoPlay 
                className="max-w-full max-h-full"
              />
            )}
          </div>
          <div className="p-4 bg-gray-900">
            <h3 className="text-lg font-bold">{selectedVideo?.title}</h3>
            <p className="text-gray-400 text-sm mt-1">{selectedVideo?.description}</p>
            <div className="flex gap-2 mt-4">
              <Button 
                variant="secondary" 
                size="sm"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = selectedVideo.video_url;
                  link.download = `${selectedVideo.title}.mp4`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
              >
                <Download className="w-4 h-4 mr-2" /> Download MP4
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}