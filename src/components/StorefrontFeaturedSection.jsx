import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";
import ProfileItemGrid from "./ProfileItemGrid";

export default function StorefrontFeaturedSection({
  activeListings,
  user,
  vendors,
  userFavorites,
  toggleFavoriteMutation,
  boostMap,
  isTagInInterests,
  handleTagInterestToggle,
  getItemTags,
  currentRoleColor,
  itemsLoading,
}) {
  // Use first 6 active listings as featured fallback
  const featuredItems = React.useMemo(() => {
    if (!activeListings?.length) return [];
    return activeListings.slice(0, 6);
  }, [activeListings]);

  if (itemsLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array(6).fill(0).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <div className="aspect-square bg-gray-200 rounded-t-lg"></div>
            <CardContent className="p-4 space-y-3">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (featuredItems.length === 0) {
    return (
      <div className="text-center py-16 bg-card rounded-xl border border-border">
        <Star className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-foreground mb-2">No Featured Items</h3>
        <p className="text-muted-foreground">Featured items will appear here once listings are created.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
        <p className="text-sm text-muted-foreground">Handpicked selection from this storefront</p>
      </div>
      <ProfileItemGrid
        items={featuredItems}
        user={user}
        vendors={vendors}
        userFavorites={userFavorites}
        toggleFavoriteMutation={toggleFavoriteMutation}
        boostMap={boostMap}
        isTagInInterests={isTagInInterests}
        handleTagInterestToggle={handleTagInterestToggle}
        getItemTags={getItemTags}
        currentRoleColor={currentRoleColor}
      />
    </div>
  );
}