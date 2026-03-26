import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Package,
  ExternalLink,
  DollarSign,
  ShieldCheck,
  Handshake,
  Zap,
  X,
  TrendingUp
} from "lucide-react";

export default function ItemContextCard({ 
  item, 
  showActions = false,
  isSellerView = false,
  onSendQuote,
  onDeclineInquiry,
  isDeclined = false
}) {
  if (!item) return null;

  return (
    <Card className={`border-2 border-blue-300 dark:border-blue-600 bg-gradient-to-br from-blue-50 dark:from-blue-950 to-cyan-50 dark:to-cyan-950 shadow-lg hover:shadow-xl transition-shadow ${isDeclined ? 'opacity-60' : ''}`}>
      <CardContent className="p-4 space-y-3">
        {/* Status Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Handshake className={`w-4 h-4 ${isDeclined ? 'text-red-500 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'} ${isDeclined ? '' : 'animate-pulse'}`} />
            <span className={`text-xs font-bold uppercase tracking-wide ${isDeclined ? 'text-red-700 dark:text-red-300' : 'text-blue-700 dark:text-blue-300'}`}>
              {isDeclined ? 'Inquiry Declined' : 'Negotiating This Item'}
            </span>
          </div>
          {isDeclined && (
            <Badge className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 text-xs">
              Closed
            </Badge>
          )}
        </div>

        {/* Item Display */}
        <div className="flex gap-3">
          {/* Item Image */}
          <Link 
            to={createPageUrl(`ItemDetails?id=${item.id}`)}
            className="flex-shrink-0"
          >
            <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden hover:opacity-80 transition-opacity ring-2 ring-blue-200 dark:ring-blue-700">
              {item.images?.[0] ? (
                <img 
                  src={item.images[0]} 
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </div>
          </Link>

          {/* Item Details */}
          <div className="flex-1 min-w-0">
            <Link 
              to={createPageUrl(`ItemDetails?id=${item.id}`)}
              className="block hover:underline"
            >
              <h4 className="font-bold text-gray-900 dark:text-foreground text-sm mb-1 line-clamp-2">
                {item.title}
              </h4>
            </Link>

            {/* Trust & Status Badges */}
            <div className="flex flex-wrap gap-1 mb-2">
              {item.authenticity_meter && (
                <Badge variant="outline" className="text-xs bg-white dark:bg-card">
                  <ShieldCheck className="w-3 h-3 mr-0.5" />
                  {item.authenticity_meter}%
                </Badge>
              )}
              {item.status && (
                <Badge 
                  className="text-xs"
                  variant={item.status === 'sold' ? 'destructive' : 'default'}
                >
                  {item.status === 'sold' ? 'SOLD' : item.status.toUpperCase()}
                </Badge>
              )}
            </div>

            {/* Price - Bold */}
            {item.price && (
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  ${item.price.toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground">asking price</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="border-t border-blue-200 dark:border-blue-700 pt-3 space-y-2">
          <Link to={createPageUrl(`ItemDetails?id=${item.id}`)} className="block">
            <Button variant="outline" size="sm" className="w-full text-xs">
              <ExternalLink className="w-3 h-3 mr-1" />
              View Full Listing
            </Button>
          </Link>

          {/* Seller Actions */}
          {isSellerView && showActions && item.status === 'active' && !isDeclined && (
            <div className="space-y-2">
              <Button 
                onClick={onSendQuote}
                size="sm" 
                className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white text-xs"
              >
                <DollarSign className="w-3 h-3 mr-1" />
                Send Offer
              </Button>
              <Button 
                onClick={onSendQuote}
                size="sm"
                variant="outline"
                className="w-full text-xs"
              >
                <TrendingUp className="w-3 h-3 mr-1" />
                Update Price
              </Button>
              <Button 
                onClick={onDeclineInquiry}
                size="sm"
                variant="outline"
                className="w-full text-xs text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <X className="w-3 h-3 mr-1" />
                Decline Inquiry
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}