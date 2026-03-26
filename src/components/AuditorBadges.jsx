import React from "react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Trophy,
  Target,
  Star,
  Shield,
  Zap,
  Award,
  Crown,
  Flame,
  TrendingUp,
  CheckCircle,
  Sparkles
} from "lucide-react";

// Define all possible badges/milestones
export const AUDITOR_BADGES = {
  // Audit Count Milestones
  first_audit: {
    id: "first_audit",
    name: "First Audit",
    description: "Complete your first audit",
    icon: CheckCircle,
    color: "#3b82f6",
    requirement: (user) => (user.total_vets || 0) >= 1
  },
  apprentice: {
    id: "apprentice",
    name: "Apprentice Auditor",
    description: "Complete 10 audits",
    icon: Target,
    color: "#10b981",
    requirement: (user) => (user.total_vets || 0) >= 10
  },
  expert: {
    id: "expert",
    name: "Expert Auditor",
    description: "Complete 50 audits",
    icon: Shield,
    color: "#8b5cf6",
    requirement: (user) => (user.total_vets || 0) >= 50
  },
  master: {
    id: "master",
    name: "Master Auditor",
    description: "Complete 100 audits",
    icon: Trophy,
    color: "#f59e0b",
    requirement: (user) => (user.total_vets || 0) >= 100
  },
  legend: {
    id: "legend",
    name: "Legendary Auditor",
    description: "Complete 500 audits",
    icon: Crown,
    color: "#eab308",
    requirement: (user) => (user.total_vets || 0) >= 500
  },

  // Accuracy Milestones
  accurate: {
    id: "accurate",
    name: "Sharp Eye",
    description: "Achieve 85% accuracy rate",
    icon: Star,
    color: "#3b82f6",
    requirement: (user) => ((user.accuracy_rate || 0) * 100) >= 85
  },
  perfectionist: {
    id: "perfectionist",
    name: "Perfectionist",
    description: "Achieve 95% accuracy rate",
    icon: Sparkles,
    color: "#ec4899",
    requirement: (user) => ((user.accuracy_rate || 0) * 100) >= 95
  },

  // Streak Milestones
  consistent: {
    id: "consistent",
    name: "Consistent Auditor",
    description: "Maintain a 7-day audit streak",
    icon: Flame,
    color: "#ef4444",
    requirement: (user) => (user.audit_streak || 0) >= 7
  },
  dedicated: {
    id: "dedicated",
    name: "Dedicated Auditor",
    description: "Maintain a 30-day audit streak",
    icon: Flame,
    color: "#dc2626",
    requirement: (user) => (user.audit_streak || 0) >= 30
  },

  // Daily Challenge Milestones
  daily_champion: {
    id: "daily_champion",
    name: "Daily Champion",
    description: "Complete 10 daily challenges",
    icon: Zap,
    color: "#06b6d4",
    requirement: (user) => (user.daily_challenges_completed || 0) >= 10
  },
  challenge_master: {
    id: "challenge_master",
    name: "Challenge Master",
    description: "Complete 50 daily challenges",
    icon: Award,
    color: "#0891b2",
    requirement: (user) => (user.daily_challenges_completed || 0) >= 50
  },

  // Special Achievements
  top_ten: {
    id: "top_ten",
    name: "Elite Top 10%",
    description: "Reach top 10% of auditors",
    icon: TrendingUp,
    color: "#8b5cf6",
    requirement: (user) => user.is_top_10_auditor || false
  },
  speed_demon: {
    id: "speed_demon",
    name: "Speed Demon",
    description: "Complete 10 audits in one day",
    icon: Zap,
    color: "#f59e0b",
    requirement: (user) => (user.max_audits_per_day || 0) >= 10
  }
};

// Get all earned badges for a user
export const getEarnedBadges = (user) => {
  if (!user) return [];
  
  return Object.values(AUDITOR_BADGES).filter(badge => 
    badge.requirement(user)
  );
};

// Check if user just earned a new badge
export const checkNewBadges = (user, previousUserData) => {
  if (!user || !previousUserData) return [];
  
  const currentBadges = getEarnedBadges(user);
  const previousBadges = getEarnedBadges(previousUserData);
  
  return currentBadges.filter(badge => 
    !previousBadges.some(prev => prev.id === badge.id)
  );
};

export default function AuditorBadges({ user, size = "md", showAll = false, maxDisplay = 6 }) {
  if (!user) return null;

  const earnedBadges = getEarnedBadges(user);
  const displayBadges = showAll ? earnedBadges : earnedBadges.slice(0, maxDisplay);

  if (earnedBadges.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-gray-500">No badges earned yet. Keep auditing!</p>
      </div>
    );
  }

  const badgeSize = size === "lg" ? "w-16 h-16" : size === "md" ? "w-12 h-12" : "w-8 h-8";
  const iconSize = size === "lg" ? "w-8 h-8" : size === "md" ? "w-6 h-6" : "w-4 h-4";

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {displayBadges.map((badge, index) => {
          const Icon = badge.icon;
          
          return (
            <motion.div
              key={badge.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.1 }}
              className="group relative"
            >
              <div
                className={`${badgeSize} rounded-full flex items-center justify-center shadow-lg cursor-pointer border-4 border-white`}
                style={{ backgroundColor: badge.color }}
              >
                <Icon className={`${iconSize} text-white`} />
              </div>
              
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 w-48">
                <div className="bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl">
                  <p className="font-bold mb-1">{badge.name}</p>
                  <p className="text-gray-300">{badge.description}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {!showAll && earnedBadges.length > maxDisplay && (
        <p className="text-xs text-gray-500 mt-2">
          +{earnedBadges.length - maxDisplay} more badges
        </p>
      )}
    </div>
  );
}