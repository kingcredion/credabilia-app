import React from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Star, CheckCircle, MapPin, MessageSquare, Eye } from "lucide-react";

/**
 * Unified profile header for all special accounts (Artist, FrameShop, Influencer, Founder)
 * Provides consistent visual skeleton while allowing role-specific customization
 */
export default function UnifiedProfileHeader({
  displayName,
  headline, // e.g., "Professional Artist" or "Custom Framing Specialist"
  avatarUrl,
  fallbackInitial,
  gradientFrom, // e.g., "from-pink-500"
  gradientVia,  // e.g., "via-rose-500"
  gradientTo,   // e.g., "to-red-500"
  credionImageUrl, // Role-specific character/mascot
  location,
  rating,
  reviewCount,
  totalSales,
  isVerified = false,
  isOwner = false,
  profileType, // e.g., "Artist Profile", "Frame Shop Profile"
  isPreviewMode = false,
  onMessage,
  onManageDashboard,
  dashboardLabel = "Manage Dashboard",
  dashboardIcon: DashboardIcon,
  dashboardRoute,
  onPreviewPublic, // New preview action
  onExitPreview,
}) {
  return (
    <div className="relative z-0">
      {/* Preview Mode Banner */}
      {isPreviewMode && (
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-6 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Eye className="w-4 h-4" />
            Previewing as Customer
          </div>
          {onExitPreview && (
            <button 
              onClick={onExitPreview}
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              Exit Preview
            </button>
          )}
        </div>
      )}

      <div
        className="relative mb-8 overflow-hidden text-white shadow-xl min-h-[300px] flex items-end"
        style={{
          backgroundImage: credionImageUrl ? `url(${credionImageUrl})` : undefined,
          backgroundPosition: "right bottom",
          backgroundSize: "auto 90%",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Gradient overlay */}
        <div
          className={`absolute inset-0 bg-gradient-to-r ${gradientFrom} ${gradientVia} ${gradientTo} opacity-85 z-10`}
        ></div>

        {/* Profile Type Badge */}
        {profileType && (
          <div className="absolute top-6 right-6 z-20">
            <div className="bg-white/20 backdrop-blur-sm border border-white/30 text-white px-3 py-1.5 rounded-full text-xs font-medium">
              {profileType}
            </div>
          </div>
        )}

        {/* Content container */}
        <div className="max-w-7xl mx-auto px-6 w-full flex items-end pt-24 md:pt-32 pb-8 relative z-20">
          <div className="flex flex-col md:flex-row items-center md:items-end gap-6 w-full pb-4">
          {/* Avatar section */}
          <div className="flex items-end gap-4 relative flex-shrink-0">
            <div className="w-40 h-40 rounded-full ring-4 ring-white/30 shadow-2xl bg-white overflow-hidden relative z-20">
              <Avatar className="w-full h-full">
                <AvatarImage src={avatarUrl} className="object-cover" />
                <AvatarFallback className="text-lg font-bold" style={{
                  backgroundColor: `hsl(${Math.random() * 360}, 70%, 85%)`,
                }}>
                  {fallbackInitial}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Verification badge */}
            {isVerified && (
              <div className="absolute bottom-2 right-2 z-30 bg-green-500 text-white p-1.5 rounded-full ring-2 ring-white shadow-md">
                <CheckCircle className="w-6 h-6" />
              </div>
            )}
          </div>

          {/* Info section */}
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl md:text-5xl font-bold mb-2 drop-shadow-md">
              {displayName}
            </h1>
            <p className="text-lg opacity-90 mb-4 drop-shadow-sm">{headline}</p>
            
            <div className="flex flex-wrap items-center gap-4 text-sm md:text-base opacity-90 justify-center md:justify-start">
              {location && (
                <span className="flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
                  <MapPin className="w-4 h-4" />
                  {location}
                </span>
              )}
              {rating > 0 && (
                <span className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  {rating} ({reviewCount} reviews)
                </span>
              )}
              {totalSales > 0 && (
                <span className="flex items-center gap-1 bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm">
                  <CheckCircle className="w-4 h-4" />
                  {totalSales} {totalSales === 1 ? 'sale' : 'sales'}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            {isOwner ? (
              <>
                <Link to={dashboardRoute}>
                  <Button
                    className={`bg-white text-white hover:bg-gray-100 border-none font-semibold`}
                    style={{
                      backgroundColor: "white",
                      color: gradientFrom.split("-")[1] === "pink" ? "#be123c" :
                             gradientFrom.split("-")[1] === "purple" ? "#6b21a8" :
                             gradientFrom.split("-")[1] === "green" ? "#15803d" :
                             "#b45309",
                    }}
                  >
                    {DashboardIcon && <DashboardIcon className="w-4 h-4 mr-2" />}
                    {dashboardLabel}
                  </Button>
                </Link>
                {onPreviewPublic && (
                  <Button
                    variant="outline"
                    className="bg-white/10 border-white/40 text-white hover:bg-white/20 backdrop-blur-sm shadow-lg"
                    onClick={onPreviewPublic}
                    size="sm"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Preview
                  </Button>
                )}
              </>
            ) : (
              <Button
                variant="outline"
                className="bg-white/10 border-white/40 text-white hover:bg-white/20 backdrop-blur-sm shadow-lg"
                onClick={onMessage}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Message
              </Button>
            )}
          </div>
          </div>
          </div>
          </div>
          </div>
          );
          }