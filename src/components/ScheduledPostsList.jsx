import React from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Video, 
  Calendar, 
  Trash2, 
  ExternalLink, 
  Clock,
  CheckCircle,
  AlertCircle,
  Edit,
  Loader2,
  Info,
  RotateCcw
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { motion } from "framer-motion";

const PLATFORM_ICONS = {
  youtube: "🎥",
  tiktok: "🎵",
  facebook: "📘",
  instagram: "📸",
  twitter: "🐦"
};

export default function ScheduledPostsList({ posts }) {
  const queryClient = useQueryClient();

  const deletePostMutation = useMutation({
    mutationFn: async (postId) => {
      return await base44.entities.ScheduledPost.delete(postId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
    },
  });

  const retryPostMutation = useMutation({
    mutationFn: async (postId) => {
      return await base44.functions.invoke('retryPostGeneration', { postId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] });
      alert("Generation restarted!");
    },
    onError: (err) => {
      alert("Failed to retry: " + err.message);
    }
  });

  const getStatusBadge = (post) => {
    const { status, scheduled_date, metadata } = post;
    
    if (status === "generating") {
      return (
        <Badge className="bg-purple-500 text-white">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Generating Video...
        </Badge>
      );
    }
    if (status === "posted") {
      return (
        <Badge className="bg-green-500 text-white">
          <CheckCircle className="w-3 h-3 mr-1" />
          Posted
        </Badge>
      );
    }
    if (status === "failed") {
      return (
        <Popover>
          <PopoverTrigger className="cursor-pointer">
            <Badge className="bg-red-500 text-white hover:bg-red-600 transition-colors pointer-events-none">
              <AlertCircle className="w-3 h-3 mr-1" />
              Failed (Click for info)
            </Badge>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <h4 className="font-medium text-red-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Generation Failed
              </h4>
              <div className="text-sm text-gray-700 bg-red-50 p-2 rounded border border-red-100">
                {metadata?.error || "Unknown error occurred during generation."}
              </div>

              <Button 
                size="sm" 
                className="w-full bg-red-600 hover:bg-red-700 text-white"
                onClick={() => retryPostMutation.mutate(post.id)}
                disabled={retryPostMutation.isPending}
              >
                {retryPostMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                Retry Generation
              </Button>

              {metadata?.full_error_object && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Technical Details:</p>
                  <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                    {JSON.stringify(metadata.full_error_object, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      );
    }
    if (status === "scheduled") {
      const isPast = new Date(scheduled_date) < new Date();
      return (
        <Badge className={isPast ? "bg-yellow-500 text-white" : "bg-blue-500 text-white"}>
          <Clock className="w-3 h-3 mr-1" />
          {isPast ? "Pending" : "Scheduled"}
        </Badge>
      );
    }
    return (
      <Badge variant="outline">
        Draft
      </Badge>
    );
  };

  if (posts.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Video className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No scheduled posts yet
          </h3>
          <p className="text-gray-600">
            Upload and schedule your first video to get started
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8">
      {posts.map((post, index) => (
        <motion.div
          key={post.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <Card className="hover:shadow-lg transition-all">
            <CardContent className="p-8">
              <div className="flex gap-8">
                {/* Thumbnail */}
                <div className="w-56 h-40 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                  {post.thumbnail_url ? (
                    <img 
                      src={post.thumbnail_url} 
                      alt={post.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="w-12 h-12 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-2">
                        {post.title}
                      </h3>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {post.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      {getStatusBadge(post)}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm('Delete this scheduled post?')) {
                            deletePostMutation.mutate(post.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  </div>

                  {/* Platforms */}
                  {post.platforms && post.platforms.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {post.platforms?.map((platform, idx) => (
                        <Badge key={idx} variant="outline" className="flex items-center gap-1">
                          <span>{PLATFORM_ICONS[platform]}</span>
                          <span className="capitalize">{platform}</span>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Hashtags */}
                  {post.hashtags && post.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {post.hashtags.map((tag, idx) => (
                        <span key={idx} className="text-xs text-blue-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Schedule Info */}
                  <div className="flex items-center gap-4 text-xs text-gray-600 pt-4 border-t border-gray-200">
                    {post.scheduled_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(post.scheduled_date).toLocaleString()}
                      </span>
                    )}
                    {post.video_url && (
                      <a 
                        href={post.video_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View Video
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}