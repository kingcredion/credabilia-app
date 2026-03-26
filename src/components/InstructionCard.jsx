import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Truck, Clock, Info } from "lucide-react";

export default function InstructionCard({ 
  instructions, 
  offersDelivery, 
  deliveryFee, 
  onRequestDelivery,
  isSender 
}) {
  return (
    <Card className="border-2 border-blue-100 bg-blue-50/30 overflow-hidden my-2 max-w-md">
      <CardHeader className="bg-blue-100/50 pb-3 pt-4">
        <CardTitle className="text-base flex items-center gap-2 text-blue-900">
          <Info className="w-5 h-5" />
          Next Steps: Receiving Your Item
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Pickup Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            <div className="bg-white p-1.5 rounded-md shadow-sm">
              <MapPin className="w-4 h-4 text-purple-600" />
            </div>
            Pickup Information
          </div>
          <div className="bg-white p-3 rounded-lg border border-blue-100 text-sm text-gray-700 whitespace-pre-wrap">
            {instructions}
          </div>
        </div>

        {/* Delivery Section */}
        {offersDelivery && (
          <div className="pt-2 border-t border-blue-200">
            <div className="flex items-center justify-between mb-2 mt-2">
              <div className="flex items-center gap-2 font-semibold text-gray-900">
                <div className="bg-white p-1.5 rounded-md shadow-sm">
                  <Truck className="w-4 h-4 text-green-600" />
                </div>
                Local Delivery Available
              </div>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                ${deliveryFee.toLocaleString()} Fee
              </Badge>
            </div>
            
            <p className="text-xs text-gray-600 mb-3">
              Prefer delivery? Request it below and a payment link for the fee will be sent.
            </p>

            {!isSender && (
              <Button 
                onClick={() => onRequestDelivery(deliveryFee)}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
                size="sm"
              >
                Request Delivery (${deliveryFee})
              </Button>
            )}
            
            {isSender && (
              <p className="text-xs text-center text-gray-500 italic bg-white/50 p-2 rounded">
                Waiting for customer to choose pickup or delivery...
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}