import React, { useEffect } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MASCOT_IMAGE = 'https://media.base44.com/images/public/690badbd56a85b130b88aa42/f5b25aac1_Photoroom_20260325_013155.png';

export default function SuccessScreen({ onClose }) {
  // Auto-close after 7 seconds so users can see the success state
  useEffect(() => {
    const timer = setTimeout(onClose, 7000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="text-center space-y-4 py-6">
      <div className="flex justify-center">
        <img 
          src={MASCOT_IMAGE} 
          alt="Payment Complete" 
          className="w-32 h-32 object-contain animate-bounce"
          onError={(e) => {
            // Fallback if image fails to load
            e.target.style.display = 'none';
          }}
        />
      </div>
      <div>
        <p className="font-semibold text-gray-900 text-lg">Payment Confirmed!</p>
        <p className="text-sm text-gray-600 mt-1">Your order is being prepared for shipment.</p>
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
          <Lock className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700"><strong>Buyer Protected:</strong> If issues arise with your order, contact support within 7 days of delivery for a refund review.</p>
        </div>
      </div>
      <p className="text-xs text-gray-500">Closing in a moment...</p>
      <Button onClick={onClose} variant="outline" className="w-full">Close Now</Button>
    </div>
  );
}