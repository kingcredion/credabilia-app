import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Sparkles,
  MessageSquare,
  Send,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Crown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";

export default function KingCredionCard({ user, displayUser, isFollowing, followMutation }) {
  const navigate = useNavigate();
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [supportMessage, setSupportMessage] = useState("");
  const [aiError, setAiError] = useState(null);
  const [currentTicket, setCurrentTicket] = useState(null);
  const queryClient = useQueryClient();

  const sendSupportMessageMutation = useMutation({
    mutationFn: async (messageText) => {
      if (!user) {
        throw new Error("Please refresh the page and try again.");
      }

      setAiError(null);
      const timestamp = new Date().toISOString();

      if (currentTicket) {
        const updatedHistory = [
          ...(currentTicket.conversation_history || []),
          { role: "user", message: messageText, timestamp },
        ];

        const credionPrompt = `You are King Credion, the AI Overseer of Credabilia.com.
User's message: ${messageText}
Respond in King Credion's voice. Be brief (2-3 paragraphs max).`;

        let aiResponse;
        try {
          aiResponse = await base44.integrations.Core.InvokeLLM({ prompt: credionPrompt });
        } catch (aiError) {
          throw new Error(`AI service temporarily unavailable: ${aiError.message}`);
        }

        updatedHistory.push({
          role: "credion",
          message: aiResponse,
          timestamp: new Date().toISOString(),
        });

        const escalationCheck = await base44.integrations.Core.InvokeLLM({
          prompt: `Does this require human admin? "${messageText}" Answer ONLY "yes" or "no".`,
        });

        const needsAdmin = escalationCheck.toLowerCase().includes("yes");

        await base44.entities.SupportTicket.update(currentTicket.id, {
          conversation_history: updatedHistory,
          status: needsAdmin ? "awaiting_admin" : "ai_processed",
          ai_initial_response: aiResponse,
        });

        const updated = await base44.entities.SupportTicket.filter({ id: currentTicket.id });
        setCurrentTicket(updated[0]);
      } else {
        const credionPrompt = `You are King Credion, AI Overseer of Credabilia.com.
User's first message: ${messageText}
Greet warmly and respond in King Credion's voice. Brief but thorough (2-3 paragraphs).`;

        let aiResponse;
        try {
          aiResponse = await base44.integrations.Core.InvokeLLM({ prompt: credionPrompt });
        } catch (aiError) {
          throw new Error(`AI service temporarily unavailable: ${aiError.message}`);
        }

        const newTicket = await base44.entities.SupportTicket.create({
          user_email: user.email,
          user_name: user.full_name || user.email.split("@")[0],
          subject: messageText.substring(0, 100),
          user_message: messageText,
          conversation_history: [
            { role: "user", message: messageText, timestamp },
            { role: "credion", message: aiResponse, timestamp: new Date().toISOString() },
          ],
          ai_initial_response: aiResponse,
          status: "ai_processed",
        });

        setCurrentTicket(newTicket);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
      setSupportMessage("");
      setAiError(null);
    },
    onError: (error) => {
      setAiError(error.message || "Failed to send message. Please try again.");
    },
  });

  const handleSendMessage = () => {
    if (!supportMessage.trim() || sendSupportMessageMutation.isPending) return;
    sendSupportMessageMutation.mutate(supportMessage);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const isAdmin = user?.role === "admin" && user?.email === "davyartiz@gmail.com";

  return (
    <>
      <Card className="mb-6 sm:mb-8 border-2 border-orange-300 shadow-2xl overflow-hidden">
        <CardContent className="p-4 sm:p-6 md:p-8 relative">
          {/* Official Badge - Top Right */}
          <div className="absolute top-4 right-4 z-20">
            <Badge className="bg-orange-100 text-orange-600 font-bold flex items-center gap-1 text-xs sm:text-sm border-2 border-orange-300">
              <ShieldCheck className="w-3 h-3 sm:w-4 sm:h-4" />
              Official AI
            </Badge>
          </div>

          <div className="flex flex-col items-center gap-4 sm:gap-6 md:gap-8">
            {/* King Credion Avatar */}
            <img
             src={displayUser.avatar_url}
             alt="King Credion"
             className="w-32 h-32 sm:w-48 sm:h-48 md:w-64 md:h-64 lg:w-80 lg:h-80 object-contain mt-2"
            />

            {/* Info Section */}
            <div className="w-full text-center">
              <div className="mb-3 sm:mb-4">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                  {displayUser.full_name}
                </h1>
                <p className="text-gray-600 text-sm sm:text-base md:text-lg">@{displayUser.username}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 justify-center mb-4">
                {user && !isAdmin && (
                  <Button
                    onClick={() => followMutation.mutate()}
                    disabled={followMutation.isPending}
                    variant={isFollowing ? "outline" : "default"}
                    className={`w-full sm:w-auto ${
                      !isFollowing ? "bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white" : ""
                    }`}
                  >
                    {isFollowing ? "Following" : "Follow King Credion"}
                  </Button>
                )}

                {isAdmin && (
                  <Link to={createPageUrl("AdminTickets")} className="w-full sm:w-auto">
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white w-full">
                      <ShieldCheck className="w-4 h-4 mr-2" />
                      Manage Tickets
                    </Button>
                  </Link>
                )}
              </div>

              <p className="text-gray-700 mb-4 sm:mb-6 leading-relaxed text-sm sm:text-base px-2 sm:px-4 max-w-2xl mx-auto">
                {displayUser.bio}
              </p>

              <div className="grid grid-cols-2 gap-4 sm:gap-6 justify-center pt-4 border-t border-gray-200 max-w-md mx-auto">
                <div className="text-center">
                  <p className="text-xl sm:text-2xl md:text-3xl font-bold text-orange-600">
                    <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 inline" />
                  </p>
                  <p className="text-xs sm:text-sm text-gray-600">AI Overseer</p>
                </div>
                <div className="text-center">
                  <p className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">24/7</p>
                  <p className="text-xs sm:text-sm text-gray-600">Available</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chat Card */}
      <Card className="shadow-xl border-2 border-orange-200">
        <CardHeader className="bg-gradient-to-r from-green-500 to-blue-600 text-white p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <MessageSquare className="w-5 h-5" />
            Chat with King Credion
          </CardTitle>
          <p className="text-xs sm:text-sm text-white/90 mt-1">
            Get instant support and guidance from the AI Overseer
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {!user && (
            <div className="bg-yellow-50 border-b-2 border-yellow-200 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-yellow-900 mb-2">
                    Sign in to chat with King Credion
                  </p>
                  <p className="text-xs text-yellow-800 mb-3">
                    You need to be logged in to use the AI chat feature.
                  </p>
                  <Button
                    onClick={() => navigate(`/SignIn?returnUrl=${encodeURIComponent(window.location.pathname)}`)}
                    size="sm"
                    className="bg-yellow-600 hover:bg-yellow-700"
                  >
                    Sign In to Continue
                  </Button>
                </div>
              </div>
            </div>
          )}

          {aiError && user && (
            <div className="bg-red-50 border-b-2 border-red-200 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-900 mb-1">
                    Unable to Send Message
                  </p>
                  <p className="text-xs text-red-700 mb-2">{aiError}</p>
                  <button
                    onClick={() => setAiError(null)}
                    className="text-xs text-red-600 hover:text-red-800 underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="h-[400px] sm:h-[500px] overflow-y-auto p-3 sm:p-6 space-y-4 bg-gray-50">
            {!currentTicket ? (
              <div className="flex items-center justify-center h-full text-center px-4">
                <div>
                  <Crown className="w-12 h-12 sm:w-16 sm:h-16 text-orange-400 mx-auto mb-4" />
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                    Welcome{user ? `, ${user.full_name || "Valued Member"}` : ""}
                  </h3>
                  <p className="text-sm sm:text-base text-gray-600 max-w-md">
                    I am King Credion, here to assist you. {user ? "How may I help you today?" : "Please sign in to chat with me."}
                  </p>
                </div>
              </div>
            ) : (
              <AnimatePresence>
                {currentTicket.conversation_history?.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex gap-2 sm:gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role !== "user" && (
                      <Avatar className="w-8 h-8 sm:w-10 sm:h-10 ring-2 ring-orange-300 flex-shrink-0">
                        <AvatarImage src={displayUser.avatar_url} className="object-cover" />
                        <AvatarFallback className="bg-gradient-to-br from-green-500 to-blue-600 text-white text-xs sm:text-sm">
                          KC
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div className={`max-w-[75%] sm:max-w-[70%] ${msg.role === "user" ? "order-first" : ""}`}>
                      <div
                        className={`rounded-2xl p-3 sm:p-4 ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white"
                            : msg.role === "admin"
                            ? "bg-purple-600 text-white"
                            : "bg-white border-2 border-orange-200 text-gray-900"
                        }`}
                      >
                        <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {msg.message}
                        </p>
                      </div>
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-1 px-2">
                        {new Date(msg.timestamp).toLocaleString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </p>
                    </div>

                    {msg.role === "user" && (
                      <Avatar className="w-8 h-8 sm:w-10 sm:h-10 ring-2 ring-blue-300 flex-shrink-0">
                        <AvatarImage src={user?.avatar_url} className="object-cover" />
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs sm:text-sm">
                          {(user?.full_name || "U")[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          <div className="p-3 sm:p-4 bg-white border-t-2 border-orange-200">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Textarea
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={user ? "Ask King Credion a question..." : "Sign in to chat..."}
                rows={2}
                className="flex-1 resize-none border-2 border-gray-200 focus:border-orange-400 text-sm sm:text-base"
                disabled={!user || sendSupportMessageMutation.isPending}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!user || !supportMessage.trim() || sendSupportMessageMutation.isPending}
                className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white w-full sm:w-auto sm:h-full px-4 sm:px-6 py-3 sm:py-0"
              >
                {sendSupportMessageMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-0 mr-2" />
                    <span className="sm:hidden">Send</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}