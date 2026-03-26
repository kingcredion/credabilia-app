import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Star } from "lucide-react";
import { motion } from "framer-motion";

export default function VendorBadge({ vendor, size = "sm", showRating = true, animated = false, clickable = true }) {
  if (!vendor) return null;

  const getCredibilityColor = (score) => {
    if (score >= 90) return { bg: "#10b981", light: "#d1fae5", text: "#065f46" };
    if (score >= 75) return { bg: "#3b82f6", light: "#dbeafe", text: "#1e40af" };
    if (score >= 60) return { bg: "#f59e0b", light: "#fef3c7", text: "#92400e" };
    return { bg: "#ef4444", light: "#fee2e2", text: "#991b1b" };
  };

  const credibility = vendor.vendor_credibility || 50;
  const colors = getCredibilityColor(credibility);
  
  const avatarSize = size === "lg" ? "w-16 h-16" : size === "md" ? "w-12 h-12" : "w-8 h-8";
  const textSize = size === "lg" ? "text-base" : size === "md" ? "text-sm" : "text-xs";
  const badgeSize = size === "lg" ? "text-sm px-3 py-1" : size === "md" ? "text-xs px-2 py-1" : "text-[10px] px-2 py-0.5";

  const content = (
    <div className={`flex items-center gap-2 ${clickable ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}>
      <div className="relative">
        <Avatar className={`${avatarSize} ring-2 ring-offset-1`} style={{ ringColor: colors.bg }}>
          <AvatarImage src={vendor.avatar_url} />
          <AvatarFallback style={{ backgroundColor: colors.bg, color: 'white' }}>
            {(vendor.full_name || vendor.email || 'V')[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {credibility >= 90 && (
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5">
            <ShieldCheck className="w-3 h-3 text-green-600" />
          </div>
        )}
      </div>
      
      <div className="flex flex-col min-w-0">
        <span className={`font-semibold text-gray-900 truncate ${textSize}`}>
          {vendor.full_name || vendor.email?.split('@')[0] || 'Vendor'}
        </span>
        {showRating && (
          <div className="flex items-center gap-1">
            <Badge 
              className={`${badgeSize} font-bold flex items-center gap-1`}
              style={{ 
                backgroundColor: colors.bg, 
                color: 'white' 
              }}
            >
              <Star className="w-2.5 h-2.5 fill-current" />
              {credibility}%
            </Badge>
            {vendor.vendor_total_sales > 0 && (
              <span className="text-[10px] text-gray-500">
                {vendor.vendor_total_sales} sales
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const wrappedContent = clickable ? (
    <Link to={createPageUrl(`VendorProfile?email=${vendor.email}`)}>
      {content}
    </Link>
  ) : content;

  if (animated) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {wrappedContent}
      </motion.div>
    );
  }

  return wrappedContent;
}