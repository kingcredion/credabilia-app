import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Edit,
  Mail,
  Users,
  MessageSquare,
  Share2,
  Camera,
  Award,
  Star,
  User,
  Store,
  Palette,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import ImageCropper from "./ImageCropper";

export default function StorefrontHeader({
  displayUser,
  isOwnProfile,
  user,
  isFollowing,
  followers,
  following,
  userReviews,
  activeListings,
  isArtist,
  isFrameShopOwner,
  artistProfile,
  myFrameShop,
  uploadingAvatar,
  followMutation,
  toggleCommissionsMutation,
  handleEditProfileClick,
  handleAvatarUpload,
  handleShareProfile,
  setShowMessageDialog,
  setShowCommissionDialog,
  themeGradient,
  themeImage,
  useDarkText,
  useInvertedFilter,
  headerTextColor,
  headerSubTextColor,
  headerBadgeBg,
  headerButtonBg,
}) {
  const averageRating = userReviews.length > 0
    ? (userReviews.reduce((acc, r) => acc + r.rating, 0) / userReviews.length).toFixed(1)
    : 0;

  const displayFollowerCount = followers.length.toLocaleString();
  const displayFollowingCount = following.length.toLocaleString();

  return (
    <div className={`bg-gradient-to-r ${themeGradient} text-white pt-12 pb-16 px-4 relative overflow-hidden`}>
      <div className="absolute inset-0 flex items-center justify-end pr-12 opacity-10 pointer-events-none z-0">
        <img 
          src={themeImage}
          alt=""
          className="w-[600px] h-[600px] object-contain"
          style={{ filter: useInvertedFilter ? 'brightness(0) invert(1)' : 'none' }}
        />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col items-center text-center">
          {/* Avatar */}
          <div className="relative mb-4">
            <Avatar className="w-32 h-32 ring-4 ring-white/30 shadow-2xl">
              <AvatarImage src={displayUser.avatar_url} className="object-cover" />
              <AvatarFallback className="bg-white/10 text-white text-4xl">
                {(displayUser.full_name || 'U')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isOwnProfile && (
              <ImageCropper onImageCropped={handleAvatarUpload} cropShape="round">
                <div className="absolute bottom-0 right-0 bg-white text-blue-600 p-2 rounded-full cursor-pointer hover:bg-gray-100 transition-colors shadow-lg">
                  <Camera className="w-4 h-4" />
                </div>
              </ImageCropper>
            )}
            {uploadingAvatar && (
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              </div>
            )}
          </div>

          {/* Store Name & Badges */}
          <div className="flex flex-col items-center gap-1 mb-4">
            <h1 className={`text-3xl font-bold shadow-sm ${headerTextColor}`}>
              {displayUser.store_title || displayUser.full_name || displayUser.email?.split('@')[0]}
            </h1>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {displayUser.username && (
                <Badge variant="secondary" className={headerBadgeBg}>
                  @{displayUser.username}
                </Badge>
              )}
              <Badge variant="secondary" className={`${headerBadgeBg} capitalize`}>
                <Award className="w-3 h-3 mr-1" />
                {displayUser.rank || 'Bronze'}
              </Badge>
              {userReviews.length > 0 && (
                <Badge variant="secondary" className={`${headerBadgeBg} flex items-center gap-1`}>
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                  {averageRating} ({userReviews.length})
                </Badge>
              )}
            </div>
          </div>

          {/* Store Bio */}
          {(displayUser.store_bio || displayUser.bio) && (
            <div className={`max-w-2xl mx-auto mb-8 ${useDarkText ? 'bg-white/60 text-pink-900 border-pink-200' : 'bg-white/10 text-white/90 border-white/20'} backdrop-blur-md rounded-xl p-4 border`}>
              <p className="text-base leading-relaxed whitespace-pre-wrap">
                {displayUser.store_bio || displayUser.bio}
              </p>
            </div>
          )}

          {/* Storefront Stats */}
          <div className={`flex flex-wrap items-center justify-center gap-6 mb-6 ${headerTextColor}`}>
            <div className="text-center cursor-pointer hover:opacity-80 transition-opacity">
              <p className="text-2xl font-bold">{displayFollowerCount}</p>
              <p className={`text-xs uppercase tracking-wider ${headerSubTextColor}`}>Followers</p>
            </div>
            <div className="text-center cursor-pointer hover:opacity-80 transition-opacity">
              <p className="text-2xl font-bold">{displayFollowingCount}</p>
              <p className={`text-xs uppercase tracking-wider ${headerSubTextColor}`}>Following</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{activeListings.length}</p>
              <p className={`text-xs uppercase tracking-wider ${headerSubTextColor}`}>Listings</p>
            </div>
          </div>

          {/* Action Buttons - Owner vs Visitor */}
          <div className="flex flex-wrap justify-center gap-3">
            {isOwnProfile ? (
              <>
                <Button onClick={handleEditProfileClick} className={headerButtonBg}>
                  <Edit className="w-4 h-4 mr-2" /> Edit Storefront
                </Button>
                <Button onClick={handleShareProfile} className={headerButtonBg}>
                  <Share2 className="w-4 h-4 mr-2" /> Share Store
                </Button>
                <Link to={createPageUrl("Messages")}>
                  <Button className={`bg-white hover:bg-gray-100 ${isArtist ? 'text-pink-600' : 'text-blue-600'}`}>
                    <Mail className="w-4 h-4 mr-2" /> Messages
                  </Button>
                </Link>
                {isArtist && artistProfile && (
                  <div className="flex items-center gap-2 bg-white/50 px-3 py-2 rounded-lg border border-pink-100">
                    <span className={`text-xs font-medium ${artistProfile.commission_open ? 'text-green-600' : 'text-gray-500'}`}>
                      {artistProfile.commission_open ? 'Commissions Open' : 'Commissions Closed'}
                    </span>
                    <Switch 
                      checked={!!artistProfile.commission_open}
                      onCheckedChange={(checked) => toggleCommissionsMutation.mutate(checked)}
                      className="scale-75"
                    />
                  </div>
                )}
                {myFrameShop && (
                  <Link to={createPageUrl("FrameShopDashboard")}>
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white border-none shadow-lg">
                      <Store className="w-4 h-4 mr-2" />
                      Shop Dashboard
                    </Button>
                  </Link>
                )}
              </>
            ) : (
              <>
                <Button
                  onClick={() => followMutation.mutate()}
                  disabled={followMutation.isPending}
                  className={isFollowing ? headerButtonBg : `bg-white hover:bg-gray-100 ${isArtist ? 'text-pink-600' : 'text-blue-600'}`}
                >
                  <Users className="w-4 h-4 mr-2" />
                  {isFollowing ? "Following" : "Follow"}
                </Button>
                <Button onClick={() => setShowMessageDialog(true)} className="bg-green-500 hover:bg-green-600 text-white">
                  <MessageSquare className="w-4 h-4 mr-2" /> Message
                </Button>
                {artistProfile?.commission_open && (
                  <Button 
                    onClick={() => setShowCommissionDialog(true)} 
                    className={`bg-white hover:bg-gray-100 ${isArtist ? 'text-pink-600' : 'text-pink-600'}`}
                  >
                    <Palette className="w-4 h-4 mr-2" /> Commission
                  </Button>
                )}
                <Button onClick={handleShareProfile} variant="ghost" className={`${headerTextColor} hover:bg-white/20`}>
                  <Share2 className="w-4 h-4 mr-2" /> Share Store
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}