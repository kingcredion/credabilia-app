import React from "react";
import {
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFallbackTrustScore } from "@/utils/trustScore";

export default function CredibilityMeter({
  item,
  totalVotes = 0,
  authenticVotes = 0,
}) {
  // Use new trust fields if available, fallback to legacy authenticity_meter
  const finalScore = getFallbackTrustScore(item);
  const authenticatorScore = item.authenticator_score ?? 60;
  const communityScore = item.community_score ?? 50;
  const authenticatorWeight = item.authenticator_weight ?? 80;
  const communityWeight = item.community_weight ?? 20;

  // Determine color and status based on final score
  const getScoreColor = (score) => {
    if (score >= 80)
      return {
        bg: "#10b981",
        light: "#d1fae5",
        text: "#065f46",
        label: "Highly Credible",
        icon: <ShieldCheck className="w-6 h-6" />,
      };
    if (score >= 60)
      return {
        bg: "#f59e0b",
        light: "#fef3c7",
        text: "#92400e",
        label: "Moderately Credible",
        icon: <AlertTriangle className="w-6 h-6" />,
      };
    return {
      bg: "#ef4444",
      light: "#fee2e2",
      text: "#991b1b",
      label: "Low Credibility",
      icon: <TrendingDown className="w-6 h-6" />,
    };
  };

  const scoreData = getScoreColor(finalScore);

  return (
    <Card className="border-0 overflow-hidden dark:bg-white/[0.05] dark:border-white/10 dark:backdrop-blur-md bg-white/40 backdrop-blur-sm border border-white/20 shadow-lg">
      <div
        className="p-4 dark:bg-transparent"
        style={{
          background: `linear-gradient(135deg, ${scoreData.light}20, transparent)`,
        }}
      >
        {/* Header - Final Judgment */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="p-3 rounded-full"
              style={{ backgroundColor: scoreData.bg, color: "white" }}
            >
              {scoreData.icon}
            </div>
            <div>
              <h3 className="font-bold text-lg" style={{ color: scoreData.text }}>
                Final Judgment
              </h3>
              <p className="text-xs text-gray-600">
                Expert trust + Community vetting
              </p>
            </div>
          </div>
          <Badge
            className="text-2xl px-4 py-2 font-bold"
            style={{
              backgroundColor: scoreData.bg,
              color: "white",
            }}
          >
            {finalScore}%
          </Badge>
        </div>

        {/* Main Score Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold" style={{ color: scoreData.text }}>
              {scoreData.label}
            </span>
            <span className="text-xs text-gray-500">
              {totalVotes} expert {totalVotes === 1 ? "review" : "reviews"}
            </span>
          </div>

          <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden">
            {/* Background gradient indicators */}
            <div className="absolute inset-0 flex">
              <div className="flex-1 bg-red-100"></div>
              <div className="flex-1 bg-yellow-100"></div>
              <div className="flex-1 bg-green-100"></div>
            </div>

            {/* Actual score bar */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${finalScore}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="absolute inset-y-0 left-0 rounded-full shadow-lg flex items-center justify-end pr-2"
              style={{
                background: `linear-gradient(90deg, ${scoreData.bg}dd, ${scoreData.bg})`,
              }}
            >
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="w-3 h-3 rounded-full bg-white"
              />
            </motion.div>

            {/* Score markers */}
            <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
              <span className="text-[10px] font-bold text-gray-500">0</span>
              <span className="text-[10px] font-bold text-gray-500">50</span>
              <span className="text-[10px] font-bold text-gray-500">100</span>
            </div>
          </div>
        </div>

        {/* Dual Score Breakdown Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* Authenticator Score */}
          <div className="dark:bg-blue-500/10 dark:border-blue-500/20 dark:backdrop-blur-sm bg-blue-50/40 border border-blue-200/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold dark:text-blue-300 text-blue-900">
                Authenticator Trust
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <p className="text-2xl font-bold text-blue-600">
                {authenticatorScore}
              </p>
              <p className="text-xs text-blue-500">%</p>
            </div>
            <p className="text-[10px] dark:text-blue-300/70 text-blue-700 mt-1">
              Certificate • AI analysis
            </p>
          </div>

          {/* Community Score */}
          <div className="dark:bg-purple-500/10 dark:border-purple-500/20 dark:backdrop-blur-sm bg-purple-50/40 border border-purple-200/40 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-semibold dark:text-purple-300 text-purple-900">
                Community Verdict
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <p className="text-2xl font-bold text-purple-600">
                {communityScore}
              </p>
              <p className="text-xs text-purple-500">%</p>
            </div>
            <p className="text-[10px] dark:text-purple-300/70 text-purple-700 mt-1">
              {totalVotes} expert reviews
            </p>
          </div>
        </div>

        {/* Community Influence & Weighting */}
        <div className="grid grid-cols-2 gap-3 mb-6 dark:bg-white/[0.05] dark:border-white/10 dark:backdrop-blur-sm bg-white/40 rounded-lg p-3 border border-white/20">
          <div className="text-center">
            <p className="text-[10px] dark:text-muted-foreground text-gray-600 mb-1">Expert Weight</p>
            <p className="text-sm font-bold dark:text-foreground text-gray-900">
              {authenticatorWeight}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] dark:text-muted-foreground text-gray-600 mb-1">Community Weight</p>
            <p className="text-sm font-bold dark:text-foreground text-gray-900">
              {communityWeight}%
            </p>
          </div>
        </div>

        {/* Vote Breakdown */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="text-center p-2 dark:bg-green-500/10 dark:border-green-500/20 dark:backdrop-blur-sm bg-green-50/40 rounded-lg border border-green-200/40">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ShieldCheck className="w-3 h-3 text-green-600" />
              <span className="text-[10px] dark:text-muted-foreground text-gray-600">Authentic</span>
            </div>
            <p className="text-lg font-bold text-green-600">{item.authentic_votes || 0}</p>
          </div>

          <div className="text-center p-2 dark:bg-yellow-500/10 dark:border-yellow-500/20 dark:backdrop-blur-sm bg-yellow-50/40 rounded-lg border border-yellow-200/40">
            <div className="flex items-center justify-center gap-1 mb-1">
              <AlertTriangle className="w-3 h-3 text-yellow-600" />
              <span className="text-[10px] dark:text-muted-foreground text-gray-600">Suspicious</span>
            </div>
            <p className="text-lg font-bold text-yellow-600">
              {item.suspicious_votes || 0}
            </p>
          </div>

          <div className="text-center p-2 dark:bg-red-500/10 dark:border-red-500/20 dark:backdrop-blur-sm bg-red-50/40 rounded-lg border border-red-200/40">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingDown className="w-3 h-3 text-red-600" />
              <span className="text-[10px] dark:text-muted-foreground text-gray-600">Counterfeit</span>
            </div>
            <p className="text-lg font-bold text-red-600">
              {item.counterfeit_votes || 0}
            </p>
          </div>
        </div>

        {/* Trust Message */}
        <div
          className="p-3 dark:bg-white/[0.05] dark:border-white/10 dark:backdrop-blur-sm bg-white/40 rounded-lg border border-white/20"
        >
          <p className="text-xs text-center dark:text-muted-foreground text-gray-600 leading-relaxed">
            {finalScore >= 80 &&
              "✅ Strong authentication. Expert credentials + positive community consensus = trustworthy purchase."}
            {finalScore >= 60 &&
              finalScore < 80 &&
              "⚠️ Moderate trust. Expert analysis is positive but community opinions vary. Additional expert reviews recommended."}
            {finalScore < 60 &&
              "❌ Low credibility. Consider requesting more expert verification before purchasing."}
          </p>
        </div>

        {/* Dynamic Weighting Explanation */}
        <div className="mt-4 pt-4 border-t dark:border-white/10 border-gray-200">
          <p className="text-[10px] dark:text-muted-foreground text-gray-600 mb-2">
            <strong>How weighting works:</strong> Early votes are weighted toward expert authentication.
            As more community reviews accumulate, their influence increases.
          </p>
          {totalVotes < 10 && (
            <p className="text-[10px] dark:text-yellow-300/80 dark:bg-yellow-500/10 text-yellow-700 bg-yellow-50/40 p-2 rounded">
              📊 {10 - totalVotes} more reviews needed for balanced community influence
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}