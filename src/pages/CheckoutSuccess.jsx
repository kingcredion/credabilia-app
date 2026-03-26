import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Package, MessageSquare, Home, Lock } from "lucide-react";
import { motion } from "framer-motion";

const MASCOT_IMAGE = 'https://media.base44.com/images/public/690badbd56a85b130b88aa42/f5b25aac1_Photoroom_20260325_013155.png';

export default function CheckoutSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);

  // Support both embedded flow (transaction_id) and legacy hosted checkout (session_id)
  const transactionId = searchParams.get("transaction_id");
  const paymentIntentId = searchParams.get("payment_intent");
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    const loadTransaction = async () => {
      try {
        let transactions = [];
        let retries = 0;
        const maxRetries = 3;
        const retryDelay = 1000; // 1 second between retries

        const attemptLoad = async () => {
          if (transactionId) {
            // Embedded Payment Element flow — look up by transaction ID directly
            transactions = await base44.entities.Transaction.filter({ id: transactionId });
          } else if (paymentIntentId) {
            // Stripe redirect fallback from embedded flow
            transactions = await base44.entities.Transaction.filter({ stripe_payment_intent_id: paymentIntentId });
          } else if (sessionId) {
            // Legacy hosted Checkout Session flow
            transactions = await base44.entities.Transaction.filter({ stripe_session_id: sessionId });
          }
          return transactions;
        };

        // Retry briefly if transaction not found immediately (Stripe redirect delay)
        while (!transactions.length && retries < maxRetries) {
          transactions = await attemptLoad();
          if (!transactions.length) {
            retries++;
            if (retries < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          }
        }

        if (!transactions.length) {
          setLoading(false);
          navigate("/Marketplace");
          return;
        }

        const txn = transactions[0];
        // Accept any post-payment status in the canonical lifecycle
        const PAID_STATUSES = ["paid", "escrow", "shipped", "delivered", "completed"];
        if (PAID_STATUSES.includes(txn.status)) {
          setTransaction(txn);
        } else {
          setLoading(false);
          navigate("/Marketplace");
          return;
        }
      } catch (error) {
        console.error("Error loading transaction:", error);
        setLoading(false);
        navigate("/Marketplace");
      } finally {
        setLoading(false);
      }
    };

    loadTransaction();
  }, [transactionId, paymentIntentId, sessionId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verifying your payment with Stripe...</p>
        </div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center py-12 px-4">
        <div className="max-w-md text-center">
          <h2 className="text-2xl font-bold text-red-700 mb-2">Payment Not Confirmed</h2>
          <p className="text-gray-600 mb-6">We couldn't verify your payment. This usually means the payment is still processing.</p>
          <Button onClick={() => navigate("/Marketplace")} className="bg-blue-600 hover:bg-blue-700">
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="border-2 border-green-200 shadow-xl">
            <CardHeader className="text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: "spring" }}
                className="flex justify-center mb-4"
              >
                {!imageFailed ? (
                  <img 
                    src={MASCOT_IMAGE} 
                    alt="Payment Complete" 
                    className="w-32 h-32 object-contain"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <div className="bg-green-100 p-4 rounded-full">
                    <CheckCircle2 className="w-12 h-12 text-green-600" />
                  </div>
                )}
              </motion.div>
              <CardTitle className="text-3xl text-green-700">Payment Confirmed!</CardTitle>
              <p className="text-gray-600 mt-2">Your order is being prepared for shipment.</p>
            </CardHeader>

            <CardContent className="space-y-6">
              {transaction && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount Paid:</span>
                    <span className="font-semibold text-lg">${transaction.sale_amount.toFixed(2)}</span>
                  </div>
                  {transaction.item_title && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Item:</span>
                      <span className="font-medium">{transaction.item_title}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      {transaction.status === "paid" ? "Payment Confirmed — Awaiting Shipment" :
                       transaction.status === "escrow" ? "Payment Confirmed — Work in Progress" :
                       transaction.status === "shipped" ? "Item Shipped" :
                       transaction.status === "delivered" ? "Item Delivered" :
                       transaction.status === "completed" ? "Completed" :
                       "Payment Confirmed"}
                    </span>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-xs text-blue-700 flex gap-2">
                  <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span><strong>Buyer Protected:</strong> If issues arise with your order, contact support within 7 days of delivery for a refund review.</span>
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">What happens next?</h3>
                <ul className="space-y-2 text-sm text-blue-800">
                  <li className="flex gap-2">
                    <Package className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>The seller will ship your item — you'll be notified when it's on the way</span>
                  </li>
                  <li className="flex gap-2">
                    <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Track your package in <strong>Track Packages</strong></span>
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Your payment is secured until delivery</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => navigate("/TrackPackages")}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Package className="w-4 h-4 mr-2" />
                  Track Package
                </Button>
                <Button
                  onClick={() => navigate("/Messages")}
                  variant="outline"
                  className="flex-1"
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  View Messages
                </Button>
                <Button
                  onClick={() => navigate("/Marketplace")}
                  variant="ghost"
                  className="flex-1"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Back to Marketplace
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}