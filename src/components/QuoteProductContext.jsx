/**
 * Product/Service Context Display for Quote Cards
 * Shows what the buyer is paying for with details, images, dimensions, etc.
 */
import React from 'react';
import { Badge } from '@/components/ui/badge';

export default function QuoteProductContext({
  serviceType,
  description,
  imageUrl,
  dimensions,
  turnaroundEstimate,
  notes,
}) {
  const getServiceTypeLabel = (type) => {
    const labels = {
      frame_shop: '🖼️ Picture Framing',
      artist_commission: '🎨 Artist Commission',
      custom_service: '✨ Custom Service',
      item_sale: '💎 Item Price Offer',
    };
    return labels[type] || type?.replace(/_/g, ' ');
  };

  return (
    <div className="space-y-3 mb-3">
      {/* Service Type Badge */}
      {serviceType && (
        <div>
          <Badge variant="secondary" className="text-xs capitalize">
            {getServiceTypeLabel(serviceType)}
          </Badge>
        </div>
      )}

      {/* Main Description */}
      <div>
        <p className="text-sm font-medium text-foreground mb-1">
          {serviceType === 'item_sale' ? 'Offered Price:' : 'What you\'re paying for:'}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>

      {/* Image Preview (if available) */}
      {imageUrl && (
        <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 h-32">
          <img
            src={imageUrl}
            alt="Item preview"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Details Grid */}
      {(dimensions || turnaroundEstimate || notes) && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          {dimensions && (
            <div>
              <p className="text-xs text-muted-foreground font-medium">Dimensions</p>
              <p className="text-sm text-foreground">{dimensions}</p>
            </div>
          )}
          {turnaroundEstimate && (
            <div>
              <p className="text-xs text-muted-foreground font-medium">Turnaround</p>
              <p className="text-sm text-foreground">{turnaroundEstimate}</p>
            </div>
          )}
          {notes && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground font-medium">Additional Notes</p>
              <p className="text-sm text-foreground">{notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}