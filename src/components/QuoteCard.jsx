import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  Calendar,
  Package,
  Palette
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function QuoteCard({ 
  quote, 
  isReceiver, 
  onAccept, 
  onReject, 
  onCounter,
  isProcessing 
}) {
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterAmount, setCounterAmount] = useState(quote.amount);
  const [counterMessage, setCounterMessage] = useState("");

  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted': return 'bg-green-100 text-green-800 border-green-300';
      case 'rejected': return 'bg-red-100 text-red-800 border-red-300';
      case 'countered': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'pending': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'expired': return 'bg-gray-100 text-gray-800 border-gray-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const isExpired = quote.valid_until && new Date(quote.valid_until) < new Date();
  const canInteract = isReceiver && quote.status === 'pending' && !isExpired;
  const isPaid = quote.payment_status === 'paid' || (quote.status === 'accepted' && quote.payment_status === 'paid');

  const handleCounterSubmit = () => {
    if (counterAmount <= 0 || !counterMessage.trim()) return;
    onCounter({
      amount: counterAmount,
      message: counterMessage
    });
    setShowCounterForm(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3"
    >
      <Card className={`border-2 ${
        isPaid 
          ? 'border-gray-200 bg-gray-50 dark:bg-white/[0.03] dark:border-white/5 grayscale opacity-80' 
          : quote.status === 'rejected' 
          ? 'border-red-200 bg-red-50/30 dark:bg-red-900/10 dark:border-red-500/20' 
          : 'border-blue-300 bg-blue-50/30 dark:bg-blue-900/10 dark:border-blue-500/20'
      }`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${quote.quote_type === 'framing_quote' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                {quote.quote_type === 'framing_quote' ? (
                  <Package className="w-5 h-5 text-purple-600" />
                ) : quote.quote_type === 'commission_quote' ? (
                  <Palette className="w-5 h-5 text-pink-600" />
                ) : (
                  <DollarSign className="w-5 h-5 text-blue-600" />
                )}
              </div>
              <div>
                <CardTitle className="text-base">
                  {quote.quote_type === 'framing_quote' ? 'Framing Quote' : 
                   quote.quote_type === 'commission_quote' ? 'Commission Quote' :
                   quote.quote_type === 'counter_offer' ? 'Counter Quote' : 'Price Quote'}
                </CardTitle>
                <p className="text-xs text-gray-500">
                  From {isReceiver ? quote.sender_name : 'You'}
                </p>
              </div>
            </div>
            <Badge className={getStatusColor(quote.status)}>
              {isPaid ? '✅ Payment Confirmed' : 
               quote.status === 'accepted' ? 'Accepted' : 
               quote.status === 'pending' ? 'Awaiting Response' :
               quote.status === 'expired' ? 'Expired' :
               quote.status.replace(/_/g, ' ')}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Price Display */}
          <div className="flex items-center justify-between p-3 bg-white dark:bg-white/[0.05] dark:border-white/10 dark:backdrop-blur-sm rounded-lg border-2 border-gray-200 dark:border-white/10">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-300 mb-1">Quoted Price</p>
              <p className="text-2xl font-bold text-gray-900">
                ${quote.amount.toLocaleString()}
              </p>
              {quote.original_amount && quote.original_amount !== quote.amount && (
                <p className="text-xs text-gray-500 line-through">
                  Originally ${quote.original_amount.toLocaleString()}
                </p>
              )}
            </div>
            {quote.quote_type === 'framing_quote' && quote.estimated_completion_days && (
              <div className="text-right">
                <p className="text-xs text-gray-600 mb-1">Estimated Time</p>
                <div className="flex items-center gap-1 text-gray-900">
                  <Clock className="w-4 h-4" />
                  <span className="font-semibold">{quote.estimated_completion_days} days</span>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {quote.description && (
            <div className="p-3 bg-white dark:bg-white/[0.05] dark:border-white/10 dark:backdrop-blur-sm rounded-lg border border-gray-200 dark:border-white/10">
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{quote.description}</p>
            </div>
          )}

          {/* Materials Included (for framing quotes) */}
          {quote.materials_included && quote.materials_included.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Included:</p>
              <div className="flex flex-wrap gap-1">
                {quote.materials_included.map((material, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    ✓ {material}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Terms */}
          {quote.terms && (
            <div className="text-xs text-gray-600 italic">
              <p className="font-semibold mb-1">Terms:</p>
              <p>{quote.terms}</p>
            </div>
          )}

          {/* Valid Until */}
          {quote.valid_until && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Calendar className="w-3 h-3" />
              <span>
                {isExpired ? 'Expired on' : 'Valid until'} {new Date(quote.valid_until).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
            </div>
          )}

          {/* Paid Notice */}
          {isPaid && (
            <div className="text-center py-2 border-t border-green-200 mt-2 bg-green-50 rounded-lg px-3">
              <p className="text-sm font-bold text-green-700 flex items-center justify-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Payment Confirmed — Work in Progress
              </p>
              <p className="text-xs text-green-600 mt-1">Payment is held securely and only released once work is completed</p>
              {quote.paid_at && (
                <p className="text-xs text-green-600 mt-1">
                  Paid on {new Date(quote.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          )}
          
          {/* Accepted but awaiting payment */}
          {quote.status === 'accepted' && !isPaid && (
            <div className="text-center py-2 border-t border-blue-200 mt-2">
              <p className="text-sm font-semibold text-blue-700 flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" />
                Payment Pending — Review Quote
              </p>
            </div>
          )}

          {/* Action Buttons (only for receiver on pending quotes) */}
          {canInteract && (
            <AnimatePresence mode="wait">
              {!showCounterForm ? (
                <motion.div
                  key="actions"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex gap-2 pt-2"
                >
                  <Button
                    onClick={onAccept}
                    disabled={isProcessing}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Accept
                  </Button>
                  <Button
                    onClick={() => setShowCounterForm(true)}
                    disabled={isProcessing}
                    variant="outline"
                    className="flex-1"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Counter
                  </Button>
                  <Button
                    onClick={onReject}
                    disabled={isProcessing}
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="counter-form"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3 pt-2 border-t border-gray-200"
                >
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      Your Counter Amount
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                      <Input
                        type="number"
                        value={counterAmount}
                        onChange={(e) => setCounterAmount(parseFloat(e.target.value))}
                        className="pl-7"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      Message (optional)
                    </label>
                    <Textarea
                      value={counterMessage}
                      onChange={(e) => setCounterMessage(e.target.value)}
                      placeholder="Explain your counter quote..."
                      rows={2}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleCounterSubmit}
                      disabled={isProcessing || counterAmount <= 0}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      Send Counter
                    </Button>
                    <Button
                      onClick={() => setShowCounterForm(false)}
                      variant="outline"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Status Message for non-interactive states */}
          {!canInteract && quote.status === 'pending' && !isReceiver && (
            <p className="text-xs text-gray-500 text-center pt-2">
              Waiting for response...
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}