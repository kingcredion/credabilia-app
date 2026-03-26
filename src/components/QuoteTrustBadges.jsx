/**
 * Trust Signal Badges for Quote Cards
 * Shows vendor verification, payment security, buyer protection
 */
import React from 'react';
import { Shield, Lock, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function QuoteTrustBadges({ vendor, vendorRating, vendorReviewCount, showSecurePayment = true }) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {showSecurePayment && (
        <Badge variant="outline" className="flex items-center gap-1 text-xs bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
          <Lock className="w-3 h-3" />
          Held Securely Until Complete
        </Badge>
      )}

      {vendorRating && vendorReviewCount > 0 && (
        <Badge variant="outline" className="flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
          <CheckCircle2 className="w-3 h-3" />
          {vendorRating.toFixed(1)}★ ({vendorReviewCount} reviews)
        </Badge>
      )}

      <Badge variant="outline" className="flex items-center gap-1 text-xs bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700">
        <Shield className="w-3 h-3" />
        Protected Purchase
      </Badge>
    </div>
  );
}