import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, MapPin, Check, ChevronDown } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function ShippingAddressUpdater({ open, onClose, transactionId, buyerEmail, vendorEmail }) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [userAddresses, setUserAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [addressDrawerOpen, setAddressDrawerOpen] = useState(false);
  const queryClient = useQueryClient();
  const isMobile = typeof window !== "undefined" &&
    window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;

  useEffect(() => {
    if (open && buyerEmail) {
      loadUserAddresses();
    }
  }, [open, buyerEmail]);

  const loadUserAddresses = async () => {
    setLoading(true);
    setError(null);
    try {
      const addresses = await base44.entities.UserAddress.filter({ user_email: buyerEmail });
      setUserAddresses(addresses);
      if (addresses.length > 0) {
        setSelectedAddressId(addresses[0].id);
        setSelectedAddress(addresses[0]);
      }
    } catch (err) {
      setError('Failed to load addresses: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddressSelect = (addressId) => {
    setSelectedAddressId(addressId);
    const selected = userAddresses.find(a => a.id === addressId);
    setSelectedAddress(selected);
  };

  const handleUpdateSeller = async () => {
    if (!selectedAddress || !transactionId) return;
    
    // Validate address schema before proceeding
    if (!selectedAddress?.full_name || !selectedAddress?.line1 || !selectedAddress?.city || !selectedAddress?.state || !selectedAddress?.postal_code) {
      console.error("Selected shipping address is incomplete:", selectedAddress);
      setError('Selected address is missing required fields. Please try another address.');
      return;
    }
    
    setSubmitting(true);
    setError(null);
    try {
      // Update transaction with shipping details from selected address
      const shippingDetails = {
        name: selectedAddress.full_name || '',
        address: {
          line1: selectedAddress.line1 || '',
          line2: selectedAddress.line2 || '',
          city: selectedAddress.city || '',
          state: selectedAddress.state || '',
          postal_code: selectedAddress.postal_code || '',
          country: selectedAddress.country || 'US'
        },
        phone: selectedAddress.phone || ''
      };

      await base44.entities.Transaction.update(transactionId, {
        shipping_details: shippingDetails,
        shipping_address_status: 'buyer_updated',
        shipping_address_updated_at: new Date().toISOString()
      });

      // Notify vendor
      const txns = await base44.entities.Transaction.filter({ id: transactionId });
      if (txns.length) {
        const txn = txns[0];
        await base44.entities.Notification.create({
          user_email: txn.vendor_email,
          type: 'item_sold',
          title: '📦 Buyer updated shipping address',
          message: 'Shipping address is now available. Refresh shipping data to create the label.',
          read: false,
          related_item_id: txn.item_id
        });
      }

      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['my-transactions'] });
      
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to update shipping address:", err);
      setError('Failed to update address: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Shipping Address</DialogTitle>
          <DialogDescription>
            Select or manage your shipping address for this order
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700">
              Address updated successfully! Seller has been notified.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : userAddresses.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex flex-col gap-2">
                <span>No saved addresses found. You need to add a shipping address before continuing.</span>
                <Link
                  to={createPageUrl("Settings?section=addresses")}
                  className="inline-flex items-center gap-1 text-sm font-semibold underline text-blue-600"
                  onClick={onClose}
                >
                  Go to Address Settings →
                </Link>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Select Shipping Address
                </label>
                {isMobile ? (
                  <Drawer open={addressDrawerOpen} onOpenChange={setAddressDrawerOpen}>
                    <button
                      onClick={() => setAddressDrawerOpen(true)}
                      className="w-full px-3 py-2 text-sm rounded-md border border-gray-300 bg-white text-left flex items-center justify-between shadow-sm hover:bg-gray-50 transition-colors"
                      style={{ minHeight: "40px" }}
                    >
                      <span className="text-gray-700">
                        {selectedAddress
                          ? `${selectedAddress.full_name} • ${selectedAddress.city}, ${selectedAddress.state}`
                          : "Choose an address"}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                    </button>
                    <DrawerContent className="px-4 pb-6">
                      <DrawerHeader className="px-0 pt-2 pb-4">
                        <DrawerTitle className="text-lg font-semibold">Select address</DrawerTitle>
                      </DrawerHeader>
                      <div className="space-y-2 max-h-[60vh] overflow-y-auto py-2">
                        {userAddresses.map((addr) => (
                          <button
                            key={addr.id}
                            onClick={() => {
                              handleAddressSelect(addr.id);
                              setAddressDrawerOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors text-sm ${
                              addr.id === selectedAddressId
                                ? "bg-blue-50 border-l-4 border-blue-600"
                                : "border-l-4 border-transparent hover:bg-gray-50"
                            }`}
                            style={{ minHeight: "48px" }}
                          >
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{addr.full_name}</p>
                              <p className="text-xs text-gray-600">{addr.city}, {addr.state}</p>
                            </div>
                            {addr.id === selectedAddressId && (
                              <Check className="h-5 w-5 text-blue-600 flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </DrawerContent>
                  </Drawer>
                ) : (
                  <div className="px-3 py-2 text-sm rounded-md border border-gray-300 bg-white text-gray-700">
                    {selectedAddress
                      ? `${selectedAddress.full_name} • ${selectedAddress.city}, ${selectedAddress.state}`
                      : "Choose an address"}
                  </div>
                )}
              </div>

              {selectedAddress && (
                <Card className="bg-gray-50">
                  <CardContent className="pt-4 text-sm space-y-1">
                    <p className="font-semibold text-gray-900 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {selectedAddress.full_name}
                    </p>
                    <p className="text-gray-600">{selectedAddress.line1}</p>
                    {selectedAddress.line2 && (
                      <p className="text-gray-600">{selectedAddress.line2}</p>
                    )}
                    <p className="text-gray-600">
                      {selectedAddress.city}, {selectedAddress.state} {selectedAddress.postal_code}
                    </p>
                    {selectedAddress.phone && (
                      <p className="text-gray-600">Phone: {selectedAddress.phone}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting || loading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpdateSeller}
            disabled={submitting || loading || !selectedAddress || success}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              'Update Seller'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}