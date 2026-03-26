import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Truck, 
  MapPin, 
  Send,
  Info
} from "lucide-react";

export default function SendInstructionsDialog({ 
  open, 
  onClose, 
  onSend, 
  shopSettings,
  isProcessing = false
}) {
  const [instructions, setInstructions] = useState("");
  const [offersDelivery, setOffersDelivery] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState("0");

  useEffect(() => {
    if (open && shopSettings) {
      setInstructions(shopSettings.pickup_instructions || `Please pick up your item at:\n${shopSettings.business_name}\n${shopSettings.address}\n\nHours: ${shopSettings.operating_hours || 'Standard Business Hours'}`);
      setOffersDelivery(shopSettings.offers_local_delivery || false);
      setDeliveryFee(shopSettings.local_delivery_fee?.toString() || "0");
    }
  }, [open, shopSettings]);

  const handleSend = () => {
    onSend({
      instructions,
      offersDelivery,
      deliveryFee: parseFloat(deliveryFee)
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-600" />
            Send Pickup/Delivery Instructions
          </DialogTitle>
          <DialogDescription>
            Provide instructions to the customer for receiving their item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="instructions" className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-500" />
              Pickup Instructions
            </Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Enter address, hours, and any special pickup notes..."
              rows={5}
              className="resize-none"
            />
            <p className="text-xs text-gray-500">
              You can edit this for this specific customer without changing your default settings.
            </p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-gray-600" />
                <Label htmlFor="delivery-toggle" className="cursor-pointer">Offer Local Delivery?</Label>
              </div>
              <Switch
                id="delivery-toggle"
                checked={offersDelivery}
                onCheckedChange={setOffersDelivery}
              />
            </div>

            {offersDelivery && (
              <div className="animate-in slide-in-from-top-2 duration-200">
                <Label htmlFor="delivery-fee" className="text-sm mb-1.5 block">Delivery Fee ($)</Label>
                <Input
                  id="delivery-fee"
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-gray-500 mt-2 flex items-start gap-1">
                  <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  If the customer selects delivery, a new payment request for this fee will be sent automatically.
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={!instructions.trim() || isProcessing}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isProcessing ? "Sending..." : "Send Instructions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}