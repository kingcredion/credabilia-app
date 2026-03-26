import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Truck, Package, MapPin, ExternalLink, AlertCircle, CheckCircle2, Settings } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function ShippingDialog({ open, onClose, item, transaction, user, onLabelCreated }) {
  const [step, setStep] = useState(1); // 1: Address/Details, 2: Rates, 3: Success
  const [loading, setLoading] = useState(false);
  const [rates, setRates] = useState([]);
  const [selectedRate, setSelectedRate] = useState(null);
  const [labelData, setLabelData] = useState(null);
  const [error, setError] = useState(null);
  const [freshTransaction, setFreshTransaction] = useState(null);
  const [noSenderAddress, setNoSenderAddress] = useState(false);
  const queryClient = useQueryClient();

  const [fromAddress, setFromAddress] = useState({
    name: user?.full_name || "",
    street1: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    phone: "",
    email: user?.email || ""
  });

  const [toAddress, setToAddress] = useState({
    name: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    phone: "",
    email: item?.buyer_email || ""
  });

  const [parcel, setParcel] = useState({
    length: item?.length || "",
    width: item?.width || "",
    height: item?.height || "",
    distance_unit: item?.distance_unit || "in",
    weight: item?.weight || "",
    mass_unit: item?.weight_unit || "lb"
  });

  // Reset when dialog opens, fetch fresh transaction data
  useEffect(() => {
    const initializeDialog = async () => {
      if (open && transaction?.id) {
        setStep(1);
        setRates([]);
        setSelectedRate(null);
        setLabelData(null);
        setError(null);
        setNoSenderAddress(false);

        try {
          // Load seller's default UserAddress as the "from" address
          if (user?.email) {
            const senderAddresses = await base44.entities.UserAddress.filter({ user_email: user.email });
            const defaultSender = senderAddresses.find(a => a.is_default) || senderAddresses[0] || null;
            if (defaultSender) {
              setFromAddress({
                name: defaultSender.recipient_name || user.full_name || "",
                street1: defaultSender.address_line1 || "",
                street2: defaultSender.address_line2 || "",
                city: defaultSender.city || "",
                state: defaultSender.state || "",
                zip: defaultSender.postal_code || "",
                country: defaultSender.country || "US",
                phone: defaultSender.phone || "",
                email: user.email || "",
              });
              setNoSenderAddress(false);
            } else {
              setNoSenderAddress(true);
            }
          }

          // Fetch fresh transaction data to get latest shipping status
          const fresh = await base44.entities.Transaction.filter({ id: transaction.id });
          const currentTxn = fresh[0] || transaction;
          setFreshTransaction(currentTxn);

          if (currentTxn?.shipping_details?.address) {
            const { address, name } = currentTxn.shipping_details;
            setToAddress(prev => ({
              ...prev,
              name: name || item?.buyer_email || "",
              street1: address.line1 || "",
              street2: address.line2 || "",
              city: address.city || "",
              state: address.state || "",
              zip: address.postal_code || "",
              country: address.country || "US",
              phone: currentTxn?.shipping_details?.phone || "",
              email: item?.buyer_email || ""
            }));
          } else if (item?.buyer_email) {
            setToAddress(prev => ({ ...prev, email: item.buyer_email }));
          }
        } catch (err) {
          console.error("Failed to fetch fresh transaction data:", err);
          // Validate shipping_details exists before proceeding
          if (transaction?.shipping_details?.address) {
            setFreshTransaction(transaction);
          } else {
            console.warn("Fresh transaction fetch failed and transaction has no shipping address — dialog may not show address fields");
            setFreshTransaction(transaction);
          }
        }
      }
    };
    initializeDialog();
  }, [open, item, transaction]);

  const handleGetRates = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!fromAddress.street1 || !fromAddress.zip || !toAddress.street1 || !toAddress.zip || !parcel.weight) {
        throw new Error("Please fill in all required address and package fields.");
      }

      const response = await base44.functions.invoke("shippo", {
        action: "get_rates",
        payload: { address_from: fromAddress, address_to: toAddress, parcels: [parcel] }
      });

      if (response.data.error) throw new Error(response.data.error);

      const shipment = response.data;
      if (shipment.rates && shipment.rates.length > 0) {
        setRates(shipment.rates);
        setStep(2);
      } else {
        throw new Error("No shipping rates found for these addresses.");
      }
    } catch (err) {
      console.error("Failed to get shipping rates:", err);
      setError(err.message || "Failed to get rates");
    } finally {
      setLoading(false);
    }
  };

  const handleBuyLabel = async () => {
    if (!selectedRate) return;
    setLoading(true);
    setError(null);
    try {
      const txnId = (freshTransaction || transaction)?.id;
      if (!txnId) throw new Error("Transaction ID is missing — cannot create label without a linked transaction.");

      const response = await base44.functions.invoke("shippo", {
        action: "create_label",
        payload: {
          rate_object_id: selectedRate.object_id,
          recipient_email: toAddress.email,
          recipient_name: toAddress.name,
          // Always pass the exact transaction_id so the Shipment record is correctly linked
          transaction_id: txnId,
          item_id: item?.id || "",
          vendor_email: user?.email || "",
          buyer_email: (freshTransaction || transaction)?.buyer_email || toAddress.email || "",
        }
      });

      if (response.data.error) throw new Error(response.data.error);

      const result = response.data;
      if (result.status === "SUCCESS") {
        setLabelData(result);
        setStep(3);
        // Invalidate relevant queries so lists refresh
        queryClient.invalidateQueries({ queryKey: ['vendor-sold-listings'] });
        queryClient.invalidateQueries({ queryKey: ['vendor-transactions'] });
        queryClient.invalidateQueries({ queryKey: ['my-shipments'] });
        if (onLabelCreated) onLabelCreated(result);
      } else {
        throw new Error(result.messages?.[0]?.text || "Failed to purchase label");
      }
    } catch (err) {
      console.error("Failed to create shipping label:", err);
      setError(err.message || "Failed to create label");
    } finally {
      setLoading(false);
    }
  };

  const renderStep1 = () => {
    const currentTxn = freshTransaction || transaction;
    const isMissingAddress = !currentTxn?.shipping_details?.address || currentTxn?.shipping_address_status === 'missing';

    if (noSenderAddress) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-2">
            <span>You need a default sender address before creating shipping labels.</span>
            <Link
              to={createPageUrl("Settings?section=addresses")}
              className="inline-flex items-center gap-1 text-sm font-medium underline"
              onClick={onClose}
            >
              <Settings className="w-3 h-3" />
              Go to Settings → Addresses
            </Link>
          </AlertDescription>
        </Alert>
      );
    }

    return (
    <div className="space-y-4">
      {isMissingAddress && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Shipping address is missing. Buyer has been notified to provide their address.
          </AlertDescription>
        </Alert>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 space-y-2">
            <h4 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4" /> Ship From</h4>
            <Input placeholder="Name" value={fromAddress.name} onChange={e => setFromAddress({...fromAddress, name: e.target.value})} />
            <Input placeholder="Street" value={fromAddress.street1} onChange={e => setFromAddress({...fromAddress, street1: e.target.value})} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="City" value={fromAddress.city} onChange={e => setFromAddress({...fromAddress, city: e.target.value})} />
              <Input placeholder="State" value={fromAddress.state} onChange={e => setFromAddress({...fromAddress, state: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Zip" value={fromAddress.zip} onChange={e => setFromAddress({...fromAddress, zip: e.target.value})} />
              <Input placeholder="Country" value={fromAddress.country} onChange={e => setFromAddress({...fromAddress, country: e.target.value})} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 space-y-2">
            <h4 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4" /> Ship To</h4>
            <Input placeholder="Name" value={toAddress.name} onChange={e => setToAddress({...toAddress, name: e.target.value})} />
            <Input placeholder="Street" value={toAddress.street1} onChange={e => setToAddress({...toAddress, street1: e.target.value})} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="City" value={toAddress.city} onChange={e => setToAddress({...toAddress, city: e.target.value})} />
              <Input placeholder="State" value={toAddress.state} onChange={e => setToAddress({...toAddress, state: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Zip" value={toAddress.zip} onChange={e => setToAddress({...toAddress, zip: e.target.value})} />
              <Input placeholder="Country" value={toAddress.country} onChange={e => setToAddress({...toAddress, country: e.target.value})} />
            </div>
          </CardContent>
        </Card>
      </div>

      {!isMissingAddress && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <h4 className="font-semibold flex items-center gap-2"><Package className="w-4 h-4" /> Package Details</h4>
          <div className="grid grid-cols-4 gap-2">
            <div><Label>Length</Label><Input type="number" value={parcel.length} onChange={e => setParcel({...parcel, length: e.target.value})} /></div>
            <div><Label>Width</Label><Input type="number" value={parcel.width} onChange={e => setParcel({...parcel, width: e.target.value})} /></div>
            <div><Label>Height</Label><Input type="number" value={parcel.height} onChange={e => setParcel({...parcel, height: e.target.value})} /></div>
            <div>
              <Label>Unit</Label>
              <Select value={parcel.distance_unit} onValueChange={v => setParcel({...parcel, distance_unit: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">in</SelectItem>
                  <SelectItem value="cm">cm</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Weight</Label><Input type="number" value={parcel.weight} onChange={e => setParcel({...parcel, weight: e.target.value})} /></div>
            <div>
              <Label>Unit</Label>
              <Select value={parcel.mass_unit} onValueChange={v => setParcel({...parcel, mass_unit: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lb">lb</SelectItem>
                  <SelectItem value="oz">oz</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="g">g</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          </CardContent>
          </Card>
          )}
          </div>
          );
          };

  const renderStep2 = () => (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-3">
        {rates.map(rate => (
          <div
            key={rate.object_id}
            className={`p-4 border rounded-lg cursor-pointer flex items-center justify-between hover:bg-gray-50 transition-colors ${selectedRate?.object_id === rate.object_id ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}
            onClick={() => setSelectedRate(rate)}
          >
            <div className="flex items-center gap-3">
              {rate.provider_image_75 && <img src={rate.provider_image_75} alt={rate.provider} className="h-8 w-8 object-contain" />}
              <div>
                <p className="font-semibold text-gray-900">{rate.provider} {rate.servicelevel?.name}</p>
                <p className="text-xs text-gray-500">{rate.duration_terms || "Estimated 3-5 days"}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg text-gray-900">${rate.amount}</p>
              <p className="text-xs text-gray-500">{rate.currency}</p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );

  const renderStep3 = () => (
    <div className="text-center py-8 space-y-4">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-8 h-8 text-green-600" />
      </div>
      <h3 className="text-2xl font-bold text-gray-900">Label Created!</h3>
      <p className="text-gray-600">Your shipping label is ready. Tracking info has been saved.</p>
      <div className="bg-gray-50 border rounded-lg p-4 text-left space-y-2 max-w-sm mx-auto">
        <p className="text-xs text-gray-500 uppercase font-semibold">Tracking Number</p>
        <p className="font-mono text-sm font-bold">{labelData?.tracking_number}</p>
      </div>
      <div className="flex justify-center gap-3 pt-2">
        <Button asChild className="bg-orange-600 hover:bg-orange-700">
          <a href={labelData?.label_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-4 h-4 mr-2" />
            Download Label
          </a>
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Shipping Label</DialogTitle>
          <DialogDescription>Ship: {item?.title}</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="py-2">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>

        <DialogFooter>
          {step === 1 && (
            <Button onClick={handleGetRates} disabled={loading || noSenderAddress} className="bg-orange-600 hover:bg-orange-700">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Get Rates
            </Button>
          )}
          {step === 2 && (
            <div className="flex gap-2 w-full justify-end">
              <Button variant="outline" onClick={() => setStep(1)} disabled={loading}>Back</Button>
              <Button onClick={handleBuyLabel} disabled={loading || !selectedRate} className="bg-orange-600 hover:bg-orange-700">
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Buy Label {selectedRate && `($${selectedRate.amount})`}
              </Button>
            </div>
          )}
          {step === 3 && <Button onClick={onClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}