/**
 * Quote Display Card in DM Thread
 * 
 * Shows quote details and handles payment action.
 * Displays different UI based on role (vendor vs. buyer) and quote status.
 * 
 * Conversion Optimizations:
 * - Live countdown timer on pending quotes
 * - Trust badges (secure payment, protected purchase)
 * - Product/service context
 * - Strong CTA copy ("Accept & Pay", "Pay Instantly")
 * - Saved payment method detection
 * - Service type icons
 * - Vendor credibility signals
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Clock, DollarSign, Zap, Lock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import QuoteCountdownTimer from './QuoteCountdownTimer';
import QuoteTrustBadges from './QuoteTrustBadges';
import QuoteProductContext from './QuoteProductContext';

export default function QuoteMessageCard({
  quote,
  isSender,
  onPayClick,
  currentUserEmail,
  vendorData,
  hasSavedPaymentMethod,
}) {
  const isBuyer = quote.buyer_email === currentUserEmail;
  const isVendor = quote.vendor_email === currentUserEmail;

  // Check expiration
  const isExpired = useMemo(() => {
    if (!quote.expires_at) return false;
    const now = new Date();
    const expiresAt = new Date(quote.expires_at);
    return now > expiresAt;
  }, [quote.expires_at]);

  // Determine if quote is paid (check both fields since webhook sets both)
  const isQuotePaid = quote.payment_status === 'paid' || quote.status === 'paid';

  // Track conversion analytics
  const trackAnalytics = useCallback((eventName, metadata) => {
    base44.analytics.track({
      eventName,
      properties: {
        quote_id: quote.id,
        vendor_id: quote.vendor_id,
        buyer_id: quote.buyer_id,
        amount: quote.amount / 100, // Always display as dollars in analytics
        service_type: quote.service_type,
        ...metadata,
      },
    }).catch(() => {});
  }, [quote]);

  // Status styling
  const getStatusDisplay = () => {
    const statusMap = {
      pending: {
        color: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800',
        badge: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
        icon: Clock,
        label: quote.service_type === 'item_sale' ? 'Price Offer' : 'Awaiting Payment',
      },
      accepted: {
        color: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
        badge: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
        icon: CheckCircle2,
        label: 'Payment Confirmed',
      },
      paid: {
        color: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800',
        badge: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
        icon: CheckCircle2,
        label: 'Payment Confirmed',
      },
      escrow: {
        color: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
        badge: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
        icon: CheckCircle2,
        label: 'Payment Confirmed',
      },
      expired: {
        color: 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800',
        badge: 'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200',
        icon: AlertCircle,
        label: 'Expired',
      },
      cancelled: {
        color: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
        badge: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
        icon: AlertCircle,
        label: 'Cancelled',
      },
    };

    const displayStatus = isExpired && quote.status === 'pending' ? 'expired' : quote.status;
    return statusMap[displayStatus] || statusMap.pending;
  };

  const statusDisplay = getStatusDisplay();
  const StatusIcon = statusDisplay.icon;

  // Format expiration time
  const formatExpiresAt = (iso) => {
    if (!iso) return null;
    const date = new Date(iso);
    const now = new Date();
    const diff = date - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (diff < 0) return 'Expired';
    if (hours > 24) return `Expires in ${Math.floor(hours / 24)}d`;
    if (hours > 0) return `Expires in ${hours}h`;
    return `Expires in ${minutes}m`;
  };

  const expiresIn = formatExpiresAt(quote.expires_at);

  const handlePayClick = () => {
    trackAnalytics('quote_payment_clicked', { payment_method_available: !!hasSavedPaymentMethod });
    onPayClick?.(quote);
  };

  const getCTAText = () => {
    if (hasSavedPaymentMethod) {
      // Would be improved with actual saved card details from Stripe
      return (
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4" />
          <span>Pay Instantly</span>
        </div>
      );
    }
    return 'Accept & Pay';
  };

  return (
    <Card className={`border-2 ${statusDisplay.color}`}>
      <CardContent className="p-4 space-y-3">
        {/* Product Context (if available) */}
        {quote.service_type && (
          <QuoteProductContext
            serviceType={quote.service_type}
            description={quote.description}
            turnaroundEstimate={quote.turnaround_estimate}
          />
        )}

        {/* Price Section - Large & Prominent */}
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Total Amount</span>
            <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              ${(quote.amount / 100).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center justify-between">
          <Badge className={statusDisplay.badge}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {statusDisplay.label}
          </Badge>
          <QuoteCountdownTimer expiresAt={quote.expires_at} status={quote.status} />
        </div>

        {/* Trust Badges */}
        <QuoteTrustBadges
          vendor={quote.vendor_email.split('@')[0]}
          vendorRating={vendorData?.rating}
          vendorReviewCount={vendorData?.review_count}
          showSecurePayment={true}
        />

        {/* Vendor Info */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {quote.service_type === 'item_sale' ? 'Vendor Offer' : 'From:'}
            </span>{' '}
            {vendorData?.business_name || quote.vendor_email.split('@')[0]}
          </p>
        </div>

        {/* Action Buttons */}
        {isBuyer && quote.status === 'pending' && !isExpired && (
          <Button
            onClick={handlePayClick}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold h-10 text-base"
            size="lg"
          >
            {getCTAText()}
          </Button>
        )}

        {isQuotePaid && (
          <div className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded px-4 py-2 text-center text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 inline mr-2" />
            Payment Confirmed — Work in Progress ✅
            <p className="text-xs font-normal mt-1 opacity-80">Payment is held securely and only released once work is completed</p>
          </div>
        )}

        {(isExpired || quote.status === 'expired') && (
          <div className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded px-4 py-3 text-center text-sm opacity-75">
            This quote has expired
          </div>
        )}

        {quote.status === 'cancelled' && (
          <div className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded px-4 py-3 text-center text-sm">
            <AlertCircle className="w-4 h-4 inline mr-2" />
            This quote was cancelled
          </div>
        )}
      </CardContent>
    </Card>
  );
}