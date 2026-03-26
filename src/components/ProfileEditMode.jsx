import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Camera, Loader2, Store, Palette } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import ImageCropper from "./ImageCropper";
import { getSubRoleAccess } from "@/lib/permissions";

export default function ProfileEditMode({
  user,
  displayUser,
  editedUser,
  setEditedUser,
  uploadingAvatar,
  updateUserMutation,
  handleAvatarUpload,
  handleCancelEdit,
  handleSaveProfile,
  handleAddInterest,
  handleRemoveInterest,
  newInterest,
  setNewInterest,
  COMMON_INTERESTS,
}) {
  if (!user) return null;

  const subRoleAccess = getSubRoleAccess(user);
  const isFrameShop = subRoleAccess.canAccessFrameShopTools;
  const isArtist = subRoleAccess.canAccessArtistTools;

  return (
    <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-2xl text-gray-900">
      <h3 className="text-xl font-bold mb-4">Edit Storefront</h3>

      {isFrameShop ? (
        <div className="space-y-6 text-left">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <Avatar className="w-32 h-32 ring-4 ring-purple-100 shadow-xl">
                <AvatarImage src={displayUser.avatar_url} className="object-cover" />
                <AvatarFallback className="bg-purple-100 text-purple-600 text-4xl">
                  {(displayUser.full_name || 'U')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <ImageCropper onImageCropped={handleAvatarUpload} cropShape="round">
                <div className="absolute bottom-0 right-0 bg-purple-600 text-white p-2 rounded-full cursor-pointer hover:bg-purple-700 transition-colors shadow-lg border-2 border-white">
                  <Camera className="w-4 h-4" />
                </div>
              </ImageCropper>
              {uploadingAvatar && (
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Shop Owner Name</label>
            <Input
              value={editedUser.full_name || ""}
              onChange={(e) => setEditedUser({ ...editedUser, full_name: e.target.value })}
              placeholder="Your Name"
            />
          </div>

          <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
            <h4 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
              <Store className="w-4 h-4" />
              Manage Shop Details
            </h4>
            <p className="text-sm text-purple-700 mb-4">
              To edit your shop's business name, address, services, and portfolio, please visit your Shop Dashboard.
            </p>
            <Link to={createPageUrl("FrameShopDashboard")}>
              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                Go to Shop Dashboard
              </Button>
            </Link>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button onClick={handleCancelEdit} variant="outline">Cancel</Button>
            <Button onClick={handleSaveProfile} disabled={updateUserMutation.isPending} className="bg-purple-600 hover:bg-purple-700">Save Changes</Button>
          </div>
        </div>
      ) : isArtist ? (
        <div className="space-y-6 text-left">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <Avatar className="w-32 h-32 ring-4 ring-pink-100 shadow-xl">
                <AvatarImage src={displayUser.avatar_url} className="object-cover" />
                <AvatarFallback className="bg-pink-100 text-pink-600 text-4xl">
                  {(displayUser.full_name || 'U')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <ImageCropper onImageCropped={handleAvatarUpload} cropShape="round">
                <div className="absolute bottom-0 right-0 bg-pink-600 text-white p-2 rounded-full cursor-pointer hover:bg-pink-700 transition-colors shadow-lg border-2 border-white">
                  <Camera className="w-4 h-4" />
                </div>
              </ImageCropper>
              {uploadingAvatar && (
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Artist Name</label>
            <Input
              value={editedUser.full_name || ""}
              onChange={(e) => setEditedUser({ ...editedUser, full_name: e.target.value })}
              placeholder="Your Name"
            />
          </div>

          <div className="bg-pink-50 p-4 rounded-lg border border-pink-100">
            <h4 className="font-semibold text-pink-900 mb-2 flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Manage Artist Portfolio
            </h4>
            <p className="text-sm text-pink-700 mb-4">
              To edit your bio, specialties, portfolio links, and manage commissions, please visit your Artist Studio.
            </p>
            <Link to={createPageUrl("ArtistDashboard")}>
              <Button className="w-full bg-pink-600 hover:bg-pink-700 text-white">
                Go to Artist Studio
              </Button>
            </Link>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button onClick={handleCancelEdit} variant="outline">Cancel</Button>
            <Button onClick={handleSaveProfile} disabled={updateUserMutation.isPending} className="bg-pink-600 hover:bg-pink-700">Save Changes</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
            <Input
              value={editedUser.full_name || ""}
              onChange={(e) => setEditedUser({ ...editedUser, full_name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Storefront Title</label>
            <Input
              value={editedUser.store_title || editedUser.full_name || ""}
              onChange={(e) => setEditedUser({ ...editedUser, store_title: e.target.value })}
              placeholder="e.g., 'Vintage Baseball Collector'"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Store Bio</label>
            <Textarea
              value={editedUser.store_bio || editedUser.bio || ""}
              onChange={(e) => setEditedUser({ ...editedUser, store_bio: e.target.value })}
              placeholder="Tell visitors about your store, collection specialty, or what makes you unique..."
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Specialties & Interests</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {(editedUser.interests_tags || []).map((tag) => (
                <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                  {tag}
                  <button
                    onClick={() => handleRemoveInterest(tag)}
                    className="hover:bg-gray-200 rounded-full p-0.5"
                  >
                    <span className="sr-only">Remove</span>
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2 mb-2">
              <Input
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddInterest(newInterest);
                  }
                }}
                placeholder="Add a specialty (e.g. Vintage Baseball)..."
                className="flex-1"
              />
              <Button 
                onClick={() => handleAddInterest(newInterest)}
                type="button"
                variant="outline"
              >
                Add
              </Button>
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-2">Popular Specialties:</p>
              <div className="flex flex-wrap gap-1">
                {COMMON_INTERESTS.filter(tag => !(editedUser.interests_tags || []).includes(tag)).slice(0, 8).map(tag => (
                  <button
                    key={tag}
                    onClick={() => handleAddInterest(tag)}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded-full transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button onClick={handleCancelEdit} variant="outline">Cancel</Button>
            <Button onClick={handleSaveProfile} disabled={updateUserMutation.isPending}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}