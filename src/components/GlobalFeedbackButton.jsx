import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertCircle, Sparkles, Trophy, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";

export default function GlobalFeedbackButton({ user }) {
  const [showDialog, setShowDialog] = useState(false);
  const [feedbackType, setFeedbackType] = useState("bug_report");
  const [feedbackSubject, setFeedbackSubject] = useState("");
  const [feedbackDescription, setFeedbackDescription] = useState("");
  const [feedbackScreenshot, setFeedbackScreenshot] = useState(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  
  const queryClient = useQueryClient();

  const submitFeedbackMutation = useMutation({
    mutationFn: async ({ type, subject, description, screenshot }) => {
      if (!user) throw new Error("Please sign in to submit feedback");
      
      const pageUrl = window.location.href;
      
      let screenshotUrl = null;
      if (screenshot) {
        setUploadingScreenshot(true);
        const { file_url } = await base44.integrations.Core.UploadFile({ file: screenshot });
        screenshotUrl = file_url;
        setUploadingScreenshot(false);
      }
      
      await base44.entities.TechnicalFeedback.create({
        user_email: user.email,
        user_name: user.full_name || user.email,
        feedback_type: type,
        subject: subject,
        description: description,
        page_url: pageUrl,
        screenshot_url: screenshotUrl,
        status: "new",
        priority: type === "bug_report" || type === "technical_issue" ? "high" : "medium"
      });
    },
    onSuccess: () => {
      setShowDialog(false);
      setFeedbackSubject("");
      setFeedbackDescription("");
      setFeedbackScreenshot(null);
      setFeedbackError(null);
      
      alert("✅ Thank you! Your feedback has been submitted. If it's a bug, our team will investigate. If it's an improvement that gets implemented, you'll earn bonus XP!");
    },
    onError: (error) => {
      setFeedbackError(error.message || "Failed to submit feedback. Please try again.");
      setUploadingScreenshot(false);
    },
  });

  const openDialog = (type) => {
    setFeedbackType(type);
    setFeedbackSubject("");
    setFeedbackDescription("");
    setFeedbackScreenshot(null);
    setFeedbackError(null);
    setShowDialog(true);
  };

  if (!user) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <motion.button
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.05 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 group focus:outline-none"
          >
            <div className="bg-yellow-400 text-yellow-950 px-4 py-2 rounded-full text-xs font-bold shadow-xl border-2 border-yellow-200 flex items-center gap-2 relative overflow-hidden">
              <div className="absolute inset-0 bg-white/20 animate-[pulse_2s_ease-in-out_infinite]" />
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-600 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
              </span>
              <span className="relative z-10">BETA: Report Bug</span>
            </div>
            
            <div
              className="w-14 h-14 rounded-full shadow-2xl bg-gradient-to-br from-orange-500 to-red-600 text-white flex items-center justify-center ring-4 ring-white/20 transition-all group-hover:ring-yellow-400/50"
            >
              <MessageSquare className="w-6 h-6" />
            </div>
          </motion.button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => openDialog("bug_report")} className="cursor-pointer">
            <AlertCircle className="w-4 h-4 mr-2 text-red-600" />
            <div>
              <p className="font-semibold">Report Bug</p>
              <p className="text-xs text-gray-500">Something not working?</p>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog("improvement_suggestion")} className="cursor-pointer">
            <Sparkles className="w-4 h-4 mr-2 text-blue-600" />
            <div>
              <p className="font-semibold">Suggest Idea</p>
              <p className="text-xs text-gray-500">Earn XP for good ideas!</p>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {feedbackType === "bug_report" || feedbackType === "technical_issue" ? (
                <>
                  <AlertCircle className="w-6 h-6 text-red-600" />
                  Report Technical Issue
                </>
              ) : (
                <>
                  <Sparkles className="w-6 h-6 text-blue-600" />
                  Suggest an Improvement
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {feedbackType === "bug_report" || feedbackType === "technical_issue" 
                ? "Help us identify and fix bugs to improve the platform for everyone"
                : "Share your ideas to make Credabilia better. Implemented suggestions earn you bonus XP!"
              }
            </DialogDescription>
          </DialogHeader>

          {feedbackError && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-900 mb-1">Submission Failed</p>
                  <p className="text-xs text-red-700">{feedbackError}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type of Feedback
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFeedbackType("bug_report")}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    feedbackType === "bug_report"
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-red-300'
                  }`}
                >
                  <AlertCircle className={`w-6 h-6 mx-auto mb-2 ${feedbackType === "bug_report" ? 'text-red-600' : 'text-gray-400'}`} />
                  <p className="text-sm font-semibold">Bug Report</p>
                </button>
                <button
                  onClick={() => setFeedbackType("improvement_suggestion")}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    feedbackType === "improvement_suggestion"
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <Sparkles className={`w-6 h-6 mx-auto mb-2 ${feedbackType === "improvement_suggestion" ? 'text-blue-600' : 'text-gray-400'}`} />
                  <p className="text-sm font-semibold">Improvement Idea</p>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subject *
              </label>
              <Input
                value={feedbackSubject}
                onChange={(e) => setFeedbackSubject(e.target.value)}
                placeholder={feedbackType === "bug_report" ? "e.g., Search filter not working on mobile" : "e.g., Add dark mode option"}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Detailed Description *
              </label>
              <Textarea
                value={feedbackDescription}
                onChange={(e) => setFeedbackDescription(e.target.value)}
                placeholder={
                  feedbackType === "bug_report" 
                    ? "Describe what went wrong, what you expected to happen, and steps to reproduce the issue..."
                    : "Describe your improvement idea in detail. What problem would it solve? How would it make Credabilia better?"
                }
                rows={6}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Screenshot (Optional)
              </label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setFeedbackScreenshot(e.target.files?.[0] || null)}
                className="cursor-pointer"
              />
              <p className="text-xs text-gray-500 mt-1">
                📸 A screenshot helps us understand the issue better
              </p>
              {feedbackScreenshot && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
                  ✓ {feedbackScreenshot.name} selected
                </div>
              )}
            </div>

            {feedbackType === "improvement_suggestion" ? (
              <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg p-4">
                <p className="text-sm text-green-900 font-semibold mb-1 flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  💰 Earn XP for Implemented Ideas!
                </p>
                <p className="text-xs text-green-800">
                  If your improvement is reviewed and implemented by our team, you'll earn <strong>bonus XP points</strong> as a thank you for helping make Credabilia better!
                </p>
              </div>
            ) : (
              <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
                <p className="text-sm text-orange-900 font-semibold mb-1">
                  🚨 Critical bugs get priority attention
                </p>
                <p className="text-xs text-orange-800">
                  Our development team will investigate and work on fixing the issue as quickly as possible. Thank you for helping us improve!
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDialog(false);
                setFeedbackError(null);
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={() => submitFeedbackMutation.mutate({
                type: feedbackType,
                subject: feedbackSubject,
                description: feedbackDescription,
                screenshot: feedbackScreenshot
              })}
              disabled={!feedbackSubject.trim() || !feedbackDescription.trim() || submitFeedbackMutation.isPending || uploadingScreenshot}
              className={feedbackType === "bug_report" 
                ? "bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 w-full sm:w-auto"
                : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 w-full sm:w-auto"
              }
            >
              {uploadingScreenshot ? "Uploading Screenshot..." : submitFeedbackMutation.isPending ? "Submitting..." : "Submit Feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}