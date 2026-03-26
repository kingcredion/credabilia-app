import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Zap, Trophy, Coins, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const DAILY_AUDIT_TARGET = 5; // Complete 5 audits per day
const DAILY_BONUS_XP = 25; // Bonus XP for completing daily challenge
const DAILY_BONUS_CREDITS = 50; // Bonus credits (0.50 USD value)

export default function DailyChallenge({ user, auditsToday = 0 }) {
  if (!user) return null;

  const progress = Math.min(100, (auditsToday / DAILY_AUDIT_TARGET) * 100);
  const isCompleted = auditsToday >= DAILY_AUDIT_TARGET;
  const remaining = Math.max(0, DAILY_AUDIT_TARGET - auditsToday);

  return (
    <Card className="bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50 border-2 border-purple-300 shadow-lg relative overflow-hidden">
      {/* Animated background effect */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-0 w-32 h-32 bg-purple-400 rounded-full filter blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-cyan-400 rounded-full filter blur-3xl animate-pulse delay-75"></div>
      </div>

      <CardHeader className="pb-3 relative">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-purple-900">
            <Zap className="w-6 h-6 text-purple-600" />
            Daily Audit Challenge
          </CardTitle>
          {isCompleted && (
            <Badge className="bg-gradient-to-r from-green-500 to-green-600 text-white font-bold animate-pulse">
              ✓ COMPLETED
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 relative">
        {/* Challenge Description */}
        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-4 border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">
              Complete <strong>{DAILY_AUDIT_TARGET} audits</strong> today
            </p>
            <Badge variant="outline" className="text-purple-700 border-purple-300">
              {auditsToday} / {DAILY_AUDIT_TARGET}
            </Badge>
          </div>

          <Progress 
            value={progress} 
            className="h-3 bg-purple-100"
            style={{
              background: 'linear-gradient(to right, #f3e8ff, #e9d5ff)'
            }}
          />

          {!isCompleted && (
            <p className="text-xs text-gray-600 mt-2">
              🎯 {remaining} more {remaining === 1 ? 'audit' : 'audits'} to complete the challenge
            </p>
          )}
        </div>

        {/* Rewards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-yellow-100 to-orange-100 rounded-lg p-3 border-2 border-yellow-300">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-5 h-5 text-orange-600" />
              <p className="text-xs font-semibold text-orange-900">Bonus XP</p>
            </div>
            <p className="text-2xl font-bold text-orange-800">+{DAILY_BONUS_XP}</p>
          </div>

          <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-lg p-3 border-2 border-green-300 relative overflow-hidden">
            {/* Credion Credit Coin Background */}
            <div className="absolute -bottom-2 -right-2 opacity-20">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/507a748cd_CredionCredittansparent.png"
                alt=""
                className="w-16 h-16 object-contain"
              />
            </div>
            <div className="relative">
              <div className="flex items-center gap-2 mb-1">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/507a748cd_CredionCredittansparent.png"
                  alt=""
                  className="w-5 h-5 object-contain"
                />
                <p className="text-xs font-semibold text-green-900">Bonus Credits</p>
              </div>
              <p className="text-2xl font-bold text-green-800">+{DAILY_BONUS_CREDITS}</p>
            </div>
          </div>
        </div>

        {/* Completion Message */}
        <AnimatePresence>
          {isCompleted && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg p-4 text-center"
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <Trophy className="w-6 h-6" />
                <p className="font-bold text-lg">Challenge Complete! 🎉</p>
              </div>
              <p className="text-sm text-green-100">
                You've earned <strong>+{DAILY_BONUS_XP} XP</strong> and <strong>+{DAILY_BONUS_CREDITS} Credion Credits</strong>
              </p>
              <p className="text-xs text-green-200 mt-2">
                Come back tomorrow for a new challenge!
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Streak Info */}
        {user.daily_challenge_streak > 0 && (
          <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-2xl">🔥</div>
              <div>
                <p className="text-xs text-orange-700 font-medium">Challenge Streak</p>
                <p className="text-lg font-bold text-orange-900">{user.daily_challenge_streak} days</p>
              </div>
            </div>
            <p className="text-xs text-orange-600">Keep it going!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}