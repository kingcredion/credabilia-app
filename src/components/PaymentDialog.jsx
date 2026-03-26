import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Lock,
  CheckCircle,
  AlertCircle,
  Sparkles
} from "lucide-react";

export default function PaymentDialog({ 
  open, 
  onClose, 
  onConfirm,
  amount,
  recipientName,
  itemTitle,
  quoteId,
  isProcessing = false
}) {
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvv, setCvv] = useState("");
  const [saveCard, setSaveCard] = useState(false);

  const handleConfirm = () => {
    onConfirm({
      quoteId,
      amount,
      paymentMethod: 'stripe'
    });
  };

  const isFormValid = true;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            Confirm Payment
          </DialogTitle>
          <DialogDescription>
            Complete your purchase securely
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-1">
          {/* Payment Summary */}
          <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-4 border-2 border-blue-200">
            <p className="text-sm text-gray-600 mb-1">Paying to</p>
            <p className="font-semibold text-gray-900 mb-3">{recipientName}</p>
            
            {itemTitle && (
              <>
                <p className="text-sm text-gray-600 mb-1">For</p>
                <p className="font-medium text-gray-900 text-sm mb-3 line-clamp-2">{itemTitle}</p>
              </>
            )}
            
            <div className="pt-3 border-t border-blue-200 flex items-center justify-between">
              <span className="text-sm text-gray-600">Total Amount</span>
              <span className="text-2xl font-bold text-gray-900">
                ${amount?.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="space-y-4">
            <div className="bg-white border rounded-lg p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-full">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Credit / Debit Card</p>
                  <p className="text-xs text-gray-500">Secure checkout via Stripe</p>
                </div>
              </div>
              <div className="h-5 w-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                <div className="h-2.5 w-2.5 bg-blue-600 rounded-full" />
              </div>
            </div>
            

          </div>

          {/* Security Notice */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
            <Lock className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-green-800">
              <p className="font-semibold mb-1">Secure Payment via Stripe</p>
              <p>Your payment information is encrypted and processed securely. Credabilia never stores your card details.</p>
            </div>
          </div>

          {/* Demo Notice Removed - Stripe Enabled */}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isFormValid || isProcessing}
            className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Processing...
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 mr-2" />
                Pay ${amount?.toLocaleString()}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}