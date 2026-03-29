import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { MessageSquare, Send, Clock, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

export default function ItemComments({ itemId, user }) {
  const navigate = useNavigate();
  const [commentText, setCommentText] = useState("");
  const queryClient = useQueryClient();

  const { data: comments, isLoading } = useQuery({
    queryKey: ['item-comments', itemId],
    queryFn: async () => {
      return await base44.entities.Comment.filter({ item_id: itemId }, "-created_date");
    },
    initialData: [],
  });

  const postCommentMutation = useMutation({
    mutationFn: async (text) => {
      if (!user) throw new Error("Please sign in to comment");
      
      return await base44.entities.Comment.create({
        item_id: itemId,
        user_email: user.email,
        user_name: user.full_name || user.email.split('@')[0],
        user_avatar: user.avatar_url,
        comment_text: text
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-comments', itemId] });
      setCommentText("");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId) => {
      return await base44.entities.Comment.delete(commentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-comments', itemId] });
    },
  });

  const handleSubmitComment = () => {
    if (!commentText.trim()) return;
    postCommentMutation.mutate(commentText);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitComment();
    }
  };

  const getTimeAgo = (timestamp) => {
    const seconds = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Discussion ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {user && (
          <div className="flex gap-3">
            <Avatar className="w-10 h-10 flex-shrink-0">
              <AvatarImage src={user.avatar_url} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                {(user.full_name || user.email)[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Share your thoughts about this item..."
                rows={2}
                className="resize-none"
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleSubmitComment}
                  disabled={!commentText.trim() || postCommentMutation.isPending}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {postCommentMutation.isPending ? (
                    "Posting..."
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Post Comment
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {!user && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <p className="text-sm text-blue-900 mb-3">
              Sign in to join the discussion
            </p>
            <Button
              onClick={() => navigate(`/SignIn?returnUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`)}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              Sign In
            </Button>
          </div>
        )}

        <div className="space-y-4 mt-6">
          <AnimatePresence>
            {comments.map((comment) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex gap-3"
              >
                <Link to={createPageUrl(`Profile?email=${comment.user_email}`)}>
                  <Avatar className="w-10 h-10 flex-shrink-0 ring-2 ring-gray-200 hover:ring-blue-400 transition-all">
                    <AvatarImage src={comment.user_avatar} />
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                      {(comment.user_name || comment.user_email)[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>

                <div className="flex-1 min-w-0">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <Link 
                        to={createPageUrl(`Profile?email=${comment.user_email}`)}
                        className="font-semibold text-gray-900 hover:text-blue-600 text-sm"
                      >
                        {comment.user_name}
                      </Link>
                      {user?.email === comment.user_email && (
                        <button
                          onClick={() => deleteCommentMutation.mutate(comment.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                      {comment.comment_text}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 px-3">
                    <Clock className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-500">{getTimeAgo(comment.created_date)}</span>
                    {comment.is_edited && (
                      <Badge variant="outline" className="text-xs">Edited</Badge>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {comments.length === 0 && (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No comments yet. Be the first to comment!</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}