
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Users, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function SweepstakesCounter() {
  const [showDetails, setShowDetails] = useState(false);

  // Fetch active sweepstakes
  const { data: activeSweepstakes } = useQuery({
    queryKey: ['active-sweepstakes'],
    queryFn: async () => {
      const sweepstakes = await base44.entities.Sweepstakes.filter({ status: 'active' });
      return sweepstakes[0] || null;
    },
    staleTime: 300000, // Cache for 5 minutes
  });

  // Fetch total user count
  const { data: userCount, isLoading: userCountLoading } = useQuery({
    queryKey: ['total-user-count'],
    queryFn: async () => {
      try {
        const users = await base44.entities.User.list();
        return users.length;
      } catch (error) {
        console.error('❌ Error fetching user count:', error);
        return 0;
      }
    },
    refetchInterval: 300000, // Reduced to every 5 minutes instead of 1 minute
    staleTime: 240000, // Cache for 4 minutes
    retry: 2, // Reduced retries
  });

  // Removed useEffect for console logging, as per changes.

  if (!activeSweepstakes) return null;

  const progress = userCount && activeSweepstakes.target_user_count 
    ? (userCount / activeSweepstakes.target_user_count) * 100 
    : 0;

  // Show loading state if user count is being fetched
  const displayCount = userCountLoading ? '...' : (userCount || 0).toLocaleString();

  return (
    <>
      <button
        onClick={() => setShowDetails(true)}
        className="flex items-center gap-3 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 text-white px-4 py-2 rounded-full shadow-lg hover:scale-105 transition-transform"
      >
        {/* King Credion in Jersey - Small */}
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/4fc94efae_Photoroom_20251111_173034.png"
          alt="King Credion"
          className="h-12 w-auto object-contain"
          loading="lazy"
        />

        {/* User Count */}
        <div className="text-left">
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4" />
            <span className="font-mono font-bold text-lg">
              {displayCount}
            </span>
            <span className="text-sm opacity-90">/ 1M</span>
          </div>
          <p className="text-xs opacity-90 font-semibold">Win $25K Jersey!</p>
        </div>
      </button>

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-500" />
              1 Million User Sweepstakes
            </DialogTitle>
            <DialogDescription>
              You're automatically entered by signing up!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Prize Image */}
            <div className="relative">
              <img
                src={activeSweepstakes.prize_image_url}
                alt={activeSweepstakes.prize_name}
                className="w-full h-auto object-contain rounded-xl border-4 border-yellow-400 shadow-2xl"
                loading="lazy"
              />
              <Badge className="absolute top-4 right-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-lg px-4 py-2 shadow-lg">
                ${activeSweepstakes.prize_value.toLocaleString()} Value
              </Badge>
            </div>

            {/* Prize Details */}
            <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-6 border-2 border-orange-200">
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {activeSweepstakes.prize_name}
              </h3>
              <p className="text-gray-700 mb-4">
                {activeSweepstakes.prize_description || "An authentic Michael Jordan signed jersey from his championship era - a piece of basketball history!"}
              </p>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-gray-700">Current Users</span>
                  <span className="font-bold text-orange-600">
                    {displayCount} / {activeSweepstakes.target_user_count.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 transition-all duration-1000"
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600">
                  {progress.toFixed(1)}% complete
                </p>
              </div>
            </div>
            
            {/* How It Works */}
            <div className="bg-blue-50 rounded-xl p-6 border-2 border-blue-200">
              <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                How It Works
              </h4>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">1.</span>
                  <span>Every user who signs up before we hit 1 million users is automatically entered</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">2.</span>
                  <span>When we reach 1 million users, we'll randomly select a winner</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">3.</span>
                  <span>The winner will be notified via email and announced on the platform</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">4.</span>
                  <span>After this, we'll have quarterly giveaways for the community!</span>
                </li>
              </ul>
            </div>

            {/* Your Status */}
            <div className="bg-green-50 rounded-xl p-4 border-2 border-green-200 text-center">
              <p className="text-green-900 font-semibold flex items-center justify-center gap-2">
                <Trophy className="w-5 h-5 text-green-600" />
                You're entered! Good luck!
              </p>
              <p className="text-xs text-green-700 mt-1">
                Invite friends to help us reach 1 million users faster
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
