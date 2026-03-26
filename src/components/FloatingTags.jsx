import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

export default function FloatingTags({ tags = [], roleColor = "#3b82f6", onTagClick, user, onInterestsUpdate }) {
  const [favoriteTags, setFavoriteTags] = useState([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user?.interests_tags) {
      setFavoriteTags(user.interests_tags);
    }
  }, [user?.interests_tags]);

  const handleTagClick = async (tag, e) => {
    e.stopPropagation();
    
    if (!user) return;

    const isFavorited = favoriteTags.some(t => t.toLowerCase() === tag.toLowerCase());
    let newFavorites;

    if (isFavorited) {
      newFavorites = favoriteTags.filter(t => t.toLowerCase() !== tag.toLowerCase());
    } else {
      newFavorites = [...favoriteTags, tag];
    }

    setFavoriteTags(newFavorites);

    try {
      await base44.auth.updateMe({ interests_tags: newFavorites });
      queryClient.invalidateQueries(['marketplace-items']);
      
      if (onInterestsUpdate) {
        onInterestsUpdate();
      }
    } catch (error) {
      console.error("Error updating favorites:", error);
      setFavoriteTags(favoriteTags);
    }
  };

  const isFavorite = (tag) => {
    return favoriteTags.some(t => t.toLowerCase() === tag.toLowerCase());
  };

  if (tags.length === 0) return null;

  // SIMPLIFIED: Static 3-row grid instead of continuous animation
  const numberOfRows = 3;
  const tagsPerRow = Math.ceil(tags.length / numberOfRows);
  
  const rows = Array.from({ length: numberOfRows }, (_, rowIndex) => {
    const startIndex = rowIndex * tagsPerRow;
    return tags.slice(startIndex, startIndex + tagsPerRow);
  });

  return (
    <div className="relative py-6 bg-gradient-to-r from-white via-gray-50 to-white dark:from-background dark:via-background dark:to-background border-y border-gray-200 dark:border-border">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-white dark:from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white dark:from-background to-transparent z-10 pointer-events-none" />
      
      <div className="max-w-7xl mx-auto px-6">
        <div className="space-y-3">
          {rows.map((rowTags, rowIndex) => (
            <div key={rowIndex} className="flex gap-2 flex-wrap justify-center">
              {rowTags.map((tag) => {
                const isTagFavorited = isFavorite(tag);
                
                return (
                  <motion.button
                    key={tag}
                    onClick={(e) => handleTagClick(tag, e)}
                    className="relative group cursor-pointer"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Badge
                      className="text-sm px-4 py-2 transition-all shadow-sm whitespace-nowrap flex items-center gap-2"
                      style={{ 
                        backgroundColor: isTagFavorited ? roleColor : `${roleColor}15`,
                        color: isTagFavorited ? 'white' : roleColor,
                        borderColor: `${roleColor}80`,
                        border: '1.5px solid'
                      }}
                    >
                      <span>#{tag}</span>
                      <Heart 
                        className={`w-4 h-4 transition-all ${isTagFavorited ? 'fill-current' : ''}`}
                        style={{ color: isTagFavorited ? 'white' : roleColor }}
                      />
                    </Badge>
                  </motion.button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Info text */}
      <div className="absolute bottom-3 right-6 text-xs text-gray-400 dark:text-muted-foreground z-20 flex items-center gap-2">
        <span>✨</span>
        <span>
          {favoriteTags.length > 0 
            ? `${favoriteTags.length} interests selected • Click tags to add/remove`
            : `Click tags to save your interests • ${tags.length} available`}
        </span>
      </div>
    </div>
  );
}