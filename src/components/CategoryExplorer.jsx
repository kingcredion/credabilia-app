import React from "react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { 
  Trophy, 
  Film, 
  Music, 
  BookOpen, 
  Sparkles
} from "lucide-react";

const categoryIcons = {
  sports: Trophy,
  entertainment: Film,
  music: Music,
  historical: BookOpen,
  comic_pop_culture: Sparkles
};

const categoryColors = {
  sports: { bg: "#3b82f6", light: "#dbeafe" },
  entertainment: { bg: "#ec4899", light: "#fce7f3" },
  music: { bg: "#8b5cf6", light: "#ede9fe" },
  historical: { bg: "#f59e0b", light: "#fef3c7" },
  comic_pop_culture: { bg: "#10b981", light: "#d1fae5" }
};

const categoryLabels = {
  sports: "Sports",
  entertainment: "Entertainment",
  music: "Music",
  historical: "Historical",
  comic_pop_culture: "Comics & Pop Culture"
};

export default function CategoryExplorer({ selectedCategory, onCategorySelect, roleColor, userInterestsCount = {} }) {
  return (
    <div className="bg-white dark:bg-card border-y dark:border-border border-gray-200 shadow-sm dark:shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 sm:py-3">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: roleColor }} />
          <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-foreground">Explore by Category</h3>
        </div>

        {/* Horizontal scrollable on mobile, grid on desktop */}
        <div className="flex md:grid md:grid-cols-5 gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {Object.keys(categoryIcons).map((category) => {
            const Icon = categoryIcons[category];
            const colors = categoryColors[category];
            const isSelected = selectedCategory === category;
            const interestCount = userInterestsCount[category] || 0;
            
            return (
              <motion.button
                key={category}
                onClick={() => onCategorySelect(isSelected ? null : category)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="relative px-3 py-2 rounded-lg border-2 transition-all hover:shadow-md dark:hover:shadow-lg flex-shrink-0 flex items-center gap-2 min-w-max md:min-w-0 md:flex-col md:text-center md:gap-0 dark:bg-white/5"
                style={{
                  borderColor: isSelected ? colors.bg : '#e5e7eb',
                  backgroundColor: isSelected ? colors.light : 'white'
                }}
              >
                <div 
                  className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 md:mb-2 md:mx-auto"
                  style={{ backgroundColor: `${colors.bg}20` }}
                >
                  <Icon className="w-4 h-4 md:w-5 md:h-5" style={{ color: colors.bg }} />
                </div>
                
                <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-foreground whitespace-nowrap md:whitespace-normal">
                  {categoryLabels[category]}
                </p>
                
                {interestCount > 0 && (
                  <Badge 
                    className="absolute -top-1 -right-1 text-[10px] px-1.5 py-0.5 h-5 min-w-[20px] flex items-center justify-center"
                    style={{ backgroundColor: colors.bg, color: 'white' }}
                  >
                    {interestCount}
                  </Badge>
                )}

                {isSelected && (
                  <div className="absolute inset-0 rounded-lg border-2 md:border-4 animate-pulse pointer-events-none"
                    style={{ borderColor: colors.bg }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}