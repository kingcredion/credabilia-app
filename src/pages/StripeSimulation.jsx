import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { CreditCard, ShieldCheck, Lock, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

// ⚠️  INTERNAL TOOL — not linked from any user-facing page.
// Accessible only by direct URL for admin/dev testing.
export default function StripeSimulation() {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  
  const amount = queryParams.get("amount");
  const productName = queryParams.get("productName");
  const successUrl = queryParams.get("successUrl");
  const cancelUrl = queryParams.get("cancelUrl");
  const transactionId = queryParams.get("transactionId");

  const [processing, setProcessing] = useState(false);

  const handlePayment = async () => {
    const shippingDetails = {
      name: document.getElementById('ship-name').value,
      address: {
        line1: document.getElementById('ship-line1').value,
        city: document.getElementById('ship-city').value,
        state: document.getElementById('ship-state').value,
        postal_code: document.getElementById('ship-zip').value,
        country: document.getElementById('ship-country').value,
      }
    };

    if (!shippingDetails.name || !shippingDetails.address.line1 || !shippingDetails.address.city || !shippingDetails.address.state || !shippingDetails.address.postal_code) {
      alert("Please fill in all shipping fields");
      return;
    }

    setProcessing(true);
    try {
      // Call backend to simulate successful payment processing with shipping details
      await base44.functions.invoke("simulatePayment", { 
        transactionId,
        shippingDetails 
      });
      
      // Artificial delay for realism
      setTimeout(() => {
        window.location.href = successUrl;
      }, 1500);
    } catch (error) {
      console.error("Payment simulation failed:", error);
      setProcessing(false);
      alert("Simulation failed. See console.");
    }
  };

  const handleCancel = () => {
    window.location.href = cancelUrl;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-t-4 border-t-purple-600">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto bg-purple-100 p-3 rounded-full w-16 h-16 flex items-center justify-center mb-4">
            <CreditCard className="w-8 h-8 text-purple-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">Payment Simulation</CardTitle>
          <CardDescription>Internal Testing Tool — Not a live checkout</CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6 pt-4">
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">Product</span>
              <span className="font-medium text-gray-900">{productName}</span>
            </div>
            <div className="flex justify-between items-center text-lg font-bold">
              <span className="text-gray-900">Total</span>
              <span className="text-gray-900">${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-3 border rounded-md flex items-center gap-3 bg-white">
              <div className="bg-blue-600 rounded w-8 h-5"></div>
              <span className="font-mono text-gray-600">•••• •••• •••• 4242</span>
            </div>
            <div className="flex gap-3">
              <div className="p-3 border rounded-md flex-1 bg-white">
                <span className="text-gray-400 text-sm">MM / YY</span>
              </div>
              <div className="p-3 border rounded-md w-24 bg-white">
                <span className="text-gray-400 text-sm">CVC</span>
              </div>
            </div>
          </div>

          {/* Shipping Address Form */}
          <div className="space-y-3 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              Shipping Address
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input
                  type="text"
                  placeholder="Full Name"
                  className="w-full p-2 text-sm border rounded-md"
                  id="ship-name"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="text"
                  placeholder="Address Line 1"
                  className="w-full p-2 text-sm border rounded-md"
                  id="ship-line1"
                />
              </div>
              <input
                type="text"
                placeholder="City"
                className="w-full p-2 text-sm border rounded-md"
                id="ship-city"
              />
              <input
                type="text"
                placeholder="State"
                className="w-full p-2 text-sm border rounded-md"
                id="ship-state"
              />
              <input
                type="text"
                placeholder="ZIP Code"
                className="w-full p-2 text-sm border rounded-md"
                id="ship-zip"
              />
              <input
                type="text"
                placeholder="Country"
                className="w-full p-2 text-sm border rounded-md"
                id="ship-country"
                defaultValue="US"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500 justify-center">
            <Lock className="w-3 h-3" />
            <span>This is a secure simulation. No real money will be charged.</span>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 pb-6">
          <Button 
            className="w-full h-12 text-lg bg-purple-600 hover:bg-purple-700" 
            onClick={handlePayment}
            disabled={processing}
          >
            {processing ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </span>
            ) : (
              `Pay $${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            )}
          </Button>
          <Button 
            variant="ghost" 
            className="w-full text-gray-500" 
            onClick={handleCancel}
            disabled={processing}
          >
            Cancel Payment
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}