import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Package, DollarSign, ShieldCheck, Bookmark } from "lucide-react";
import { motion } from "framer-motion";

export default function ProfileItemCard({ item, gradientClass, user, onToggleFavorite, isFavorited }) {
  const isFeatured = !!gradientClass;
  
  return (
    <Link
      to={createPageUrl(`ItemDetails?id=${item.id}`)}
      className="group h-full block"
    >
      <motion.div
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 700, damping: 40, mass: 0.4 }}
        className="h-full"
      >
      <Card className={`overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 relative h-full flex flex-col border border-gray-200 dark:border-white/10 ${isFeatured ? 'border-none ring-2 ring-white/50' : 'group-hover:border-blue-400'} ${gradientClass || ''}`}>
        <div className="aspect-square bg-gray-100 relative overflow-hidden">
          {item.images?.[0] ? (
            <img 
              src={item.images[0]} 
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-50">
              <Star className="w-12 h-12 text-gray-300" />
            </div>
          )}
          
          {/* Status / Featured Badges — top-left */}
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
            {item.status === 'active' && (
              <Badge className="bg-green-500/90 backdrop-blur-sm text-white text-xs shadow-sm hover:bg-green-600">
                Active
              </Badge>
            )}
            {item.status === 'sold' && (
              <Badge className="bg-red-500/90 backdrop-blur-sm text-white text-xs shadow-sm hover:bg-red-600">
                Sold
              </Badge>
            )}
            {item.is_educational_display_item && (
              <Badge className="bg-purple-500/90 backdrop-blur-sm text-white text-xs shadow-sm hover:bg-purple-600">
                Display Only
              </Badge>
            )}
            {isFeatured && (
              <Badge className="bg-yellow-400/90 text-yellow-900 backdrop-blur-sm text-xs shadow-sm font-bold flex items-center gap-1">
                <Star className="w-3 h-3 fill-yellow-900" />
                Featured
              </Badge>
            )}
          </div>

          {/* Save/Favorite — top-right */}
          {onToggleFavorite && user && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleFavorite(item);
              }}
              className="absolute top-2 right-2 bg-white/90 dark:bg-white/[0.1] dark:backdrop-blur-md backdrop-blur-sm rounded-full p-2 shadow-sm hover:scale-110 transition-transform z-10"
            >
              <Bookmark className={`w-4 h-4 ${
                isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-400'
              }`} />
            </button>
          )}

          {/* Authenticity Score */}
          <div className="absolute bottom-2 left-2 flex flex-col gap-1 items-start">
            {item.authenticity_meter > 0 && (
              <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-xs font-semibold shadow-sm text-gray-800 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-green-600" />
                {item.authenticity_meter}%
              </Badge>
            )}
          </div>
        </div>

        <CardContent className={`p-4 flex-1 flex flex-col ${isFeatured ? 'bg-transparent' : 'bg-white dark:bg-white/[0.03]'}`}>
          <div className="mb-2">
             <p className={`text-xs line-clamp-1 uppercase tracking-wider font-medium ${isFeatured ? 'text-white/80' : 'text-gray-500'}`}>
                {item.category_path?.[0] || item.sport || "Collectible"}
             </p>
          </div>
          
          <h3 className={`font-bold mb-2 line-clamp-2 text-sm sm:text-base flex-1 transition-colors leading-tight ${isFeatured ? 'text-white group-hover:text-white' : 'text-gray-900 group-hover:text-blue-600'}`}>
            {item.title}
          </h3>
          
          <div className={`mt-auto pt-3 border-t flex items-center justify-between ${isFeatured ? 'border-white/20' : 'border-gray-100'}`}>
             {item.price ? (
                <p className={`text-lg font-bold ${isFeatured ? 'text-white' : 'text-gray-900'}`}>
                  ${item.price.toLocaleString()}
                </p>
              ) : (
                <p className={`text-sm font-medium italic ${isFeatured ? 'text-white/70' : 'text-gray-500'}`}>
                  Price on request
                </p>
              )}
              
              <div className="opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0 duration-300">
                <span className={`text-xs font-semibold flex items-center ${isFeatured ? 'text-white' : 'text-blue-600'}`}>
                    View
                    <svg className="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </span>
              </div>
          </div>
        </CardContent>
      </Card>
      </motion.div>
    </Link>
  );
}