import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Truck } from "lucide-react";

export default function RequestDeliveryDialog({ open, onClose, onConfirm, deliveryFee, isProcessing }) {
  const [address, setAddress] = useState("");
  const [instructions, setInstructions] = useState("");

  const handleSubmit = () => {
    onConfirm({ address, instructions });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-green-600" />
            Request Local Delivery
          </DialogTitle>
          <DialogDescription>
            Provide your delivery details. A fee of ${deliveryFee?.toLocaleString()} will be added to your quote.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Delivery Address</Label>
            <Textarea
              placeholder="Full street address, apt/suite, city, zip..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Delivery Instructions (Optional)</Label>
            <Textarea
              placeholder="Gate code, leave at door, ring bell, etc..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!address.trim() || isProcessing} className="bg-green-600 hover:bg-green-700">
            {isProcessing ? "Requesting..." : `Confirm Request ($${deliveryFee})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}