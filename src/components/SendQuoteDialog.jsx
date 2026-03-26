/**
 * Send Quote Dialog
 * 
 * Allows vendors to send price quotes directly in DMs.
 * Only shown to vendor/frame shop users.
 */
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle } from 'lucide-react';

export default function SendQuoteDialog({ open, onClose, conversationEmail, conversationName, onQuoteSent, itemId, itemPrice }) {
  const [amount, setAmount] = useState(itemPrice ? String(itemPrice) : '');
  const [description, setDescription] = useState('');
  const [serviceType, setServiceType] = useState(itemId ? 'item_sale' : 'custom_service');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSend = async () => {
    setError(null);

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!description.trim()) {
      setError('Please enter a quote description');
      return;
    }

    setIsLoading(true);

    try {
      const response = await base44.functions.invoke('sendQuote', {
        buyer_email: conversationEmail,
        conversation_id: conversationEmail, // Use email as conversation identifier
        amount: Math.round(amountNum * 100), // Convert to cents
        description: description.trim(),
        service_type: serviceType,
      });

      if (response.data.error) {
        setError(response.data.error);
        return;
      }

      console.log(`✅ Quote sent: ${response.data.quote_id}`);
      onQuoteSent?.(response.data);

      // Reset form
      setAmount('');
      setDescription('');
      setServiceType('item_sale');
      onClose();

    } catch (err) {
      setError(err.message || 'Failed to send quote');
      console.error('Error sending quote:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{itemId ? 'Send Offer' : 'Send Quote'}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {itemId ? `Make an offer on this item to ${conversationName}` : `Send a price quote to ${conversationName}`}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <div>
            <Label htmlFor="amount" className="text-sm font-medium mb-2 block">
              Amount (USD)
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7"
                disabled={isLoading}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description" className="text-sm font-medium mb-2 block">
              {itemId ? 'Additional Notes' : 'Description'}
            </Label>
            <Textarea
              id="description"
              placeholder={itemId ? "e.g., My best offer. Open to negotiation..." : "e.g., Custom frame with mat, UV-protective glass..."}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={isLoading}
            />
          </div>

          {!itemId && (
            <div>
              <Label htmlFor="service-type" className="text-sm font-medium mb-2 block">
                Service Type
              </Label>
              <Select value={serviceType} onValueChange={setServiceType} disabled={isLoading}>
                <SelectTrigger id="service-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="item_sale">Item Sale</SelectItem>
                  <SelectItem value="frame_shop">Frame Shop Service</SelectItem>
                  <SelectItem value="artist_commission">Artist Commission</SelectItem>
                  <SelectItem value="custom_service">Custom Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isLoading || !amount || !description}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {itemId ? 'Send Offer' : 'Send Quote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}