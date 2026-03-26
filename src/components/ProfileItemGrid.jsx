import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";
import { Heart, ShieldCheck, MapPin, Gavel, Gift, TrendingUp, Package, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import VendorBadge from "./VendorBadge";

export default function ProfileItemGrid({ 
  items, 
  user, 
  vendors, 
  userFavorites, 
  toggleFavoriteMutation, 
  boostMap,
  isTagInInterests,
  handleTagInterestToggle,
  getItemTags,
  currentRoleColor = "#3b82f6" 
}) {
  
  const getAuthenticityColor = (score) => {
    if (score >= 80) return "text-green-600 bg-green-50";
    if (score >= 60) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
        <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-600">No items listed yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
      {items.map((item) => {
        const vendor = vendors[item.vendor_email];
        const isSold = item.status === "sold";
        const isEducational = item.is_educational_display_item;
        const itemTags = getItemTags ? getItemTags(item) : [];
        const isBoosted = boostMap ? boostMap.has(item.id) : false;
        const boost = boostMap ? boostMap.get(item.id) : null;
        
        return (
          <div key={item.id} className="group relative">
            {/* Favorite Button */}
            {user && !isSold && toggleFavoriteMutation && (
              <div className="absolute top-3 left-3 z-30">
                <motion.button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFavoriteMutation.mutate(item);
                  }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-lg hover:bg-white transition-colors"
                >
                  <Heart className={`w-5 h-5 ${
                    userFavorites?.some(fav => fav.item_id === item.id) 
                      ? 'fill-red-500 text-red-500' 
                      : 'text-gray-400'
                  }`} />
                </motion.button>
              </div>
            )}

            <Link to={createPageUrl(`ItemDetails?id=${item.id}`)}>
              {/* Educational badge overlay */}
              {isEducational && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
                  <Badge 
                    className="text-xs shadow-lg font-bold px-3 py-1 animate-pulse"
                    style={{ 
                      background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                      color: 'white',
                      border: '2px solid white'
                    }}
                  >
                    🎓 EDUCATIONAL SAMPLE
                  </Badge>
                </div>
              )}

              {isSold && !isEducational && (
                <div className="absolute inset-0 z-20 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[-15deg]">
                    <Badge 
                      className="text-4xl font-black px-8 py-3 shadow-2xl border-4"
                      style={{ 
                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                        color: 'white',
                        borderColor: 'white',
                        textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                      }}
                    >
                      SOLD
                    </Badge>
                  </div>
                </div>
              )}

              {item.active_auction_id && !isSold && !isEducational && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
                  <Badge 
                    className="text-xs shadow-lg animate-pulse font-bold px-3 py-1 flex items-center gap-1"
                    style={{ 
                      background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                      color: 'white',
                      border: '2px solid white'
                    }}
                  >
                    <Gavel className="w-3 h-3" />
                    AUCTION
                  </Badge>
                </div>
              )}

              {isBoosted && !item.active_auction_id && !isSold && !isEducational && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
                  <Badge 
                    className="text-xs shadow-lg animate-pulse font-bold px-3 py-1"
                    style={{ 
                      background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: 'white',
                      border: '2px solid white'
                    }}
                  >
                    ⚡ BOOSTED
                  </Badge>
                </div>
              )}

              {item.distance !== null && item.distance !== undefined && !isSold && !isEducational && (
                <div className="absolute -top-2 -left-2 z-10">
                  <Badge 
                    className="text-xs shadow-lg flex items-center gap-1"
                    style={{ 
                      backgroundColor: item.distance <= 25 ? '#10b981' : item.distance <= 50 ? '#3b82f6' : '#6b7280',
                      color: 'white' 
                    }}
                  >
                    <MapPin className="w-3 h-3" />
                    {Math.round(item.distance)} mi
                  </Badge>
                </div>
              )}
              
              <Card 
                className={`overflow-hidden hover:shadow-xl transition-all duration-300 border-2 ${
                  isEducational ? 'border-green-400' : 
                  isSold ? 'opacity-75' : ''
                }`}
                style={{ 
                  borderColor: isEducational ? '#10b981' : 
                               isBoosted && !isSold ? '#f59e0b' : 
                               (item.relevanceScore > 0 && !isSold ? `${currentRoleColor}40` : 'transparent'),
                  boxShadow: isEducational ? '0 0 20px rgba(16, 185, 129, 0.3)' : 
                               isBoosted && !isSold ? '0 0 20px rgba(245, 158, 11, 0.3)' : undefined
                }}
              >
                <div className={`aspect-square bg-gray-100 relative overflow-hidden ${isSold && !isEducational ? 'grayscale' : ''}`}>
                  {item.images?.[0] ? (
                    <img 
                      src={item.images[0]} 
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Star className="w-16 h-16 text-gray-300" />
                    </div>
                  )}
                  
                  <div className="absolute top-3 right-3">
                    <Badge 
                      className={`${getAuthenticityColor(item.authenticity_meter || 50)} border-2 border-white shadow-lg flex items-center gap-1`}
                    >
                      <ShieldCheck className="w-3 h-3" />
                      {item.authenticity_meter || 50}%
                    </Badge>
                  </div>

                  {item.grade_status && !isEducational && (
                    <div className="absolute top-3 left-3">
                      <Badge className="bg-white text-gray-900 border-2 border-gray-200 shadow-lg capitalize">
                        {item.grade_status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  )}
                </div>

                <CardContent className="p-4">
                  {vendor && !isEducational && (
                    <div className="mb-3 pb-3 border-b border-gray-100">
                      <VendorBadge vendor={vendor} size="sm" showRating={true} />
                    </div>
                  )}

                  <h3 
                    className={`font-semibold text-gray-900 mb-2 line-clamp-2 ${isSold && !isEducational ? 'line-through opacity-60' : ''}`}
                  >
                    {item.title}
                  </h3>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div>
                      {isEducational ? (
                        <p className="text-xl font-bold text-green-600 flex items-center gap-1">
                          <Gift className="w-5 h-5" />
                          FREE
                        </p>
                      ) : item.price ? (
                        <p className={`text-xl font-bold text-gray-900 ${isSold ? 'opacity-60' : ''}`}>
                          ${item.price.toLocaleString()}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500">Price not set</p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" />
                        {item.views || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-4 h-4" />
                        {item.total_votes || 0}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {itemTags.length > 0 && handleTagInterestToggle && (
              <div className="mt-2 flex flex-wrap gap-2">
                {itemTags.map((tag) => {
                  const isInterest = isTagInInterests ? isTagInInterests(tag) : false;
                  return (
                    <motion.button
                      key={tag}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleTagInterestToggle(tag);
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="focus:outline-none"
                    >
                      <Badge 
                        variant="outline" 
                        className="text-xs cursor-pointer hover:shadow-md transition-all flex items-center gap-1.5 px-2 py-1"
                        style={{
                          backgroundColor: isInterest ? `${currentRoleColor}10` : 'white',
                          color: currentRoleColor,
                          borderColor: currentRoleColor,
                          borderWidth: isInterest ? '2px' : '1px'
                        }}
                      >
                        {tag}
                        <Heart 
                          className={`w-3 h-3 transition-all ${isInterest ? 'fill-current' : ''}`}
                          style={{ color: currentRoleColor }}
                        />
                      </Badge>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}