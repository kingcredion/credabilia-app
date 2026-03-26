/**
 * Vendor trust signals and info for quote card
 * Shows verified badge, rating, avatar, etc.
 */
import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Star, Shield, CheckCircle2 } from 'lucide-react';
import { hasLiveStripeConnect } from '@/lib/stripeStatus';

export default function QuoteVendorInfo({ vendorEmail, vendorName, vendorData, vendorRating, reviewCount }) {
  const initials = (vendorName || vendorEmail || 'V').split(' ').map(n => n[0]).join('').toUpperCase();

  return (
    <div className="flex items-start gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
      <Avatar className="w-10 h-10 flex-shrink-0">
        {vendorData?.avatar_url && <AvatarImage src={vendorData.avatar_url} />}
        <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white text-sm font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-foreground truncate">
            {vendorName || vendorEmail.split('@')[0]}
          </p>
          {hasLiveStripeConnect(vendorData) && (
            <Shield className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" title="Verified seller" />
          )}
        </div>

        {/* Rating if available */}
        {vendorRating && reviewCount !== undefined && (
          <div className="flex items-center gap-1 mb-1">
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-3 h-3 ${i < Math.floor(vendorRating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-1">
              {vendorRating.toFixed(1)} ({reviewCount} reviews)
            </span>
          </div>
        )}

        {/* Trust badge */}
        <Badge variant="outline" className="text-[10px] h-5 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
          <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
          Secure payment via Credabilia
        </Badge>
      </div>
    </div>
  );
}