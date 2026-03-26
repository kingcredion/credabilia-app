import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Home, ShoppingCart } from "lucide-react";
import { motion } from "framer-motion";

export default function CheckoutCanceled() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="border-2 border-amber-200 shadow-xl">
            <CardHeader className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="flex justify-center mb-4"
              >
                <div className="bg-amber-100 p-4 rounded-full">
                  <AlertCircle className="w-12 h-12 text-amber-600" />
                </div>
              </motion.div>
              <CardTitle className="text-3xl text-amber-700">Payment Canceled</CardTitle>
              <p className="text-gray-600 mt-2">Your payment was not completed.</p>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="font-semibold text-amber-900 mb-2">What happened?</h3>
                <p className="text-sm text-amber-800">
                  You've been redirected from the payment checkout. Your cart has been saved, so you can return anytime to complete your purchase.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-gray-900">Next steps:</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex gap-2">
                    <span className="font-semibold text-amber-600">•</span>
                    <span>Review your order details</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-amber-600">•</span>
                    <span>Try a different payment method</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-amber-600">•</span>
                    <span>Contact support if you experience issues</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => navigate(-1)}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Back to Checkout
                </Button>
                <Button
                  onClick={() => navigate("/Marketplace")}
                  variant="outline"
                  className="flex-1"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Continue Shopping
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}