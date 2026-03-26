import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store, Users, Award, TrendingUp } from "lucide-react";

export default function StorefrontAboutSection({
  displayUser,
  followers,
  following,
  userReviews,
  activeListings,
  isArtist,
}) {
  const storeTitle = displayUser?.store_title || displayUser?.full_name || "Store";
  const storeBio = displayUser?.store_bio || displayUser?.bio || null;
  const specialties = displayUser?.interests_tags || [];
  const averageRating = userReviews.length > 0
    ? (userReviews.reduce((acc, r) => acc + r.rating, 0) / userReviews.length).toFixed(1)
    : null;

  return (
    <div className="space-y-6">
      {/* Store Story */}
      {storeBio && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="w-5 h-5 text-blue-600" />
              About This Store
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {storeBio}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Specialties / Interests */}
      {specialties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              {isArtist ? "Art Specialties" : "Specialties & Interests"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {specialties.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-sm py-1.5 px-3">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Community Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Community Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-2xl font-bold text-foreground">
                {followers.length.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Followers</p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-2xl font-bold text-foreground">
                {following.length.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Following</p>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-2xl font-bold text-foreground">
                {activeListings || 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Listings</p>
            </div>
            {userReviews.length > 0 && (
              <div className="text-center p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <span className="text-2xl font-bold text-yellow-500">{averageRating}</span>
                  <Award className="w-4 h-4 text-yellow-500" />
                </div>
                <p className="text-xs text-muted-foreground">{userReviews.length} Reviews</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}