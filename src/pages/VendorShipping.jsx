import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Truck,
  Package,
  Eye,
  ShieldCheck,
  Search,
  Filter,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import ShippingDialog from "../components/ShippingDialog";
import { format } from "date-fns";

export default function VendorShipping() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showShippingDialog, setShowShippingDialog] = useState(false);
  const [selectedItemForShipping, setSelectedItemForShipping] = useState(null);
  const [selectedTransactionForShipping, setSelectedTransactionForShipping] = useState(null);
  const [expandedTransactionId, setExpandedTransactionId] = useState(null);
  const [refreshingTransactionId, setRefreshingTransactionId] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const { data: soldListings, isLoading: listingsLoading } = useQuery({
    queryKey: ['vendor-sold-listings', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Item.filter({ vendor_email: user.email, status: "sold" }, "-created_date");
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const { data: myTransactions } = useQuery({
    queryKey: ['vendor-transactions', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Transaction.filter({ vendor_email: user.email }, "-created_date");
    },
    enabled: !!user?.email,
    initialData: [],
  });

  // Filter items based on search
  const filteredItems = soldListings.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Needs shipping = paid (or escrow) with shipping_status still pending or label_created.
  // "paid" is the canonical post-payment status for direct item sales (set by stripeWebhook).
  // Do NOT rely on status === 'completed' — that is only set after delivery.
  const pendingShippingItems = filteredItems.filter(item => {
    const transaction = myTransactions.find(t => t.item_id === item.id);
    if (!transaction) return false;
    const txStatus = transaction.status;
    const shipStatus = transaction.shipping_status;
    // Prompt to ship when payment is confirmed but label not yet created
    const paymentConfirmed = ['paid', 'escrow', 'shipped', 'delivered'].includes(txStatus);
    const labelNotCreated = !shipStatus || shipStatus === 'pending';
    return paymentConfirmed && labelNotCreated;
  });

  const shippedItems = filteredItems.filter(item => {
    const transaction = myTransactions.find(t => t.item_id === item.id);
    if (!transaction) return false;
    // Has a label or is further along
    return ['label_created', 'shipped', 'delivered', 'returned', 'failed'].includes(transaction.shipping_status);
  });

  const handleShip = (item) => {
    const transaction = myTransactions.find(t => t.item_id === item.id);
    setSelectedItemForShipping(item);
    setSelectedTransactionForShipping(transaction);
    setShowShippingDialog(true);
  };

  const handleRequestAddress = async (transactionId) => {
    if (!transactionId) {
      console.error('Transaction ID is missing — cannot request address');
      return;
    }
    try {
      const txns = await base44.entities.Transaction.filter({ id: transactionId });
      if (!txns.length) {
        console.warn("Transaction not found for address request:", transactionId);
        return;
      }
      const txn = txns[0];

      await base44.entities.Transaction.update(transactionId, {
        shipping_address_status: 'update_requested',
        shipping_address_requested_at: new Date().toISOString(),
        shipping_address_requested_by: user.email
      });

      // Notify buyer — link_url routes to Settings > Addresses for easy action
      await base44.entities.Notification.create({
      user_email: txn.buyer_email,
      type: 'address_requested',
      title: '🚚 Shipping Address Needed',
      message: 'Your seller needs your shipping address before they can ship your item. Please update it now.',
        read: false,
        related_item_id: txn.item_id,
        link_url: createPageUrl("Settings?section=addresses"),
      });

      // Refresh query
      queryClient.invalidateQueries({ queryKey: ['vendor-transactions'] });
    } catch (err) {
      console.error('Failed to request shipping address from buyer:', err);
    }
  };

  const handleRefreshAddress = async (transactionId) => {
    if (!transactionId) {
      console.error('Transaction ID is missing — cannot refresh address');
      return;
    }
    setRefreshingTransactionId(transactionId);
    try {
      const txns = await base44.entities.Transaction.filter({ id: transactionId });
      if (txns.length) {
        queryClient.setQueryData(['vendor-transactions', user?.email], (old) => {
          if (!Array.isArray(old)) return txns;
          return old.map(t => t.id === transactionId ? txns[0] : t);
        });
        await queryClient.invalidateQueries({ queryKey: ['vendor-transactions', user?.email] });
        await queryClient.refetchQueries({ queryKey: ['vendor-transactions', user?.email] });
      } else {
        console.warn("Transaction not found for address refresh:", transactionId);
      }
    } catch (err) {
      console.error('Failed to refresh address data from backend:', err);
    } finally {
      setRefreshingTransactionId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background dark:bg-background px-4 py-6 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Truck className="w-6 md:w-8 h-6 md:h-8 text-orange-600" />
            Shipping Management
          </h1>
          <p className="text-sm md:text-base text-gray-600">
            Manage your orders, print labels, and track shipments
          </p>
        </div>

        {/* Search */}
        <div className="mb-6 flex gap-2 md:gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by item title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 text-sm"
            />
          </div>
        </div>

        {/* Pending Shipping Section */}
        <div className="mb-8">
          <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            Ready to Ship ({pendingShippingItems.length})
          </h2>
          
          <ShippingTable 
            items={pendingShippingItems} 
            transactions={myTransactions} 
            isLoading={listingsLoading}
            onShip={handleShip}
            onRequestAddress={handleRequestAddress}
            onRefreshAddress={handleRefreshAddress}
            expandedTransactionId={expandedTransactionId}
            setExpandedTransactionId={setExpandedTransactionId}
            refreshingTransactionId={refreshingTransactionId}
            user={user}
            emptyMessage="No orders waiting to be shipped"
          />
        </div>

        {/* Shipped History Section */}
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            Shipped History ({shippedItems.length})
          </h2>
          
          <ShippingTable 
            items={shippedItems} 
            transactions={myTransactions} 
            isLoading={listingsLoading}
            onShip={handleShip}
            onRequestAddress={handleRequestAddress}
            onRefreshAddress={handleRefreshAddress}
            expandedTransactionId={expandedTransactionId}
            setExpandedTransactionId={setExpandedTransactionId}
            refreshingTransactionId={refreshingTransactionId}
            user={user}
            isHistory={true}
            emptyMessage="No shipped orders yet"
          />
        </div>

        {selectedItemForShipping && (
          <ShippingDialog
            open={showShippingDialog}
            onClose={() => {
              setShowShippingDialog(false);
              setSelectedItemForShipping(null);
              setSelectedTransactionForShipping(null);
            }}
            item={selectedItemForShipping}
            transaction={selectedTransactionForShipping}
            user={user}
            onLabelCreated={(labelData) => {
              console.log("Label created:", labelData);
              queryClient.invalidateQueries({ queryKey: ['vendor-transactions'] });
              queryClient.invalidateQueries({ queryKey: ['vendor-sold-listings'] });
            }}
          />
        )}
      </div>
    </div>
  );
}

function ShippingTable({ items, transactions, isLoading, onShip, onRequestAddress, onRefreshAddress, expandedTransactionId, setExpandedTransactionId, refreshingTransactionId, user, isHistory, emptyMessage }) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="animate-pulse flex gap-4">
                <div className="w-16 h-16 bg-gray-200 rounded"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="p-8 text-center text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-2 opacity-20" />
          <p>{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  const getAddressStatusBadge = (status) => {
    const configs = {
      missing: { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle, label: 'Address Missing' },
      captured: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2, label: 'Address Captured' },
      update_requested: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: AlertCircle, label: 'Address Requested' },
      buyer_updated: { bg: 'bg-blue-100', text: 'text-blue-700', icon: CheckCircle2, label: 'Buyer Updated' },
      seller_acknowledged: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2, label: 'Acknowledged' }
    };
    const config = configs[status] || configs.missing;
    const Icon = config.icon;
    return (
      <Badge className={`${config.bg} ${config.text} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const transaction = transactions.find(t => t.item_id === item.id);
        const shippingStatus = transaction?.shipping_status || 'pending';
        const addressStatus = transaction?.shipping_address_status || 'missing';
        const isExpanded = expandedTransactionId === transaction?.id;

        return (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border border-gray-200">
                  {item.images?.[0] ? (
                    <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                   <Link
                     to={createPageUrl(`ItemDetails?id=${item.id}`)}
                     className="font-bold text-gray-900 hover:text-orange-600 text-sm line-clamp-2 block mb-1"
                   >
                     {item.title}
                   </Link>

                   <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 mb-2">
                     <Badge
                       className={
                         shippingStatus === 'delivered' ? 'bg-green-100 text-green-700' :
                         shippingStatus === 'shipped' ? 'bg-blue-100 text-blue-700' :
                         shippingStatus === 'label_created' ? 'bg-orange-100 text-orange-700' :
                         shippingStatus === 'returned' ? 'bg-yellow-100 text-yellow-700' :
                         shippingStatus === 'failed' ? 'bg-red-100 text-red-700' :
                         'bg-yellow-100 text-yellow-700'
                       }
                     >
                       {shippingStatus === 'pending' ? 'Awaiting Shipment' :
                        shippingStatus === 'label_created' ? 'Label Created' :
                        shippingStatus === 'shipped' ? 'Shipped' :
                        shippingStatus === 'delivered' ? 'Delivered' :
                        shippingStatus === 'returned' ? 'Returned' :
                        shippingStatus === 'failed' ? 'Failed' : shippingStatus}
                     </Badge>
                     {getAddressStatusBadge(addressStatus)}
                     {transaction?.created_date && (
                       <span className="text-gray-400">{format(new Date(transaction.created_date), 'MMM dd, yyyy')}</span>
                     )}
                   </div>

                   {transaction?.buyer_email && (
                     <p className="text-xs text-gray-500 mb-2 truncate">
                       Buyer: {transaction.buyer_email}
                       {transaction?.shipping_details?.address?.city && ` · ${transaction.shipping_details.address.city}, ${transaction.shipping_details.address.state}`}
                     </p>
                   )}

                   <div className="flex flex-wrap gap-2 mb-2">
                     <Button variant="outline" size="sm" asChild className="h-8 text-xs">
                       <Link to={createPageUrl(`ItemDetails?id=${item.id}`)}>View Item</Link>
                     </Button>

                     {/* Show ship button when payment confirmed but label not yet bought */}
                     {(shippingStatus === 'pending' || !shippingStatus) && (
                       <Button
                         size="sm"
                         className="h-8 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                         onClick={() => onShip(item)}
                       >
                         Buy Shipping Label
                       </Button>
                     )}

                     {isHistory && (
                       <Button
                         size="sm"
                         className="h-8 text-xs bg-gray-100 text-gray-700 hover:bg-gray-200"
                         onClick={() => onShip(item)}
                       >
                         View Label
                       </Button>
                     )}

                     {!isHistory && addressStatus === 'missing' && (
                       <Button
                         size="sm"
                         className="h-8 text-xs bg-red-100 hover:bg-red-200 text-red-700"
                         onClick={() => {
                           if (!transaction?.id) return;
                           onRequestAddress(transaction.id);
                         }}
                       >
                         Request Address
                       </Button>
                     )}

                     {!isHistory && addressStatus === 'buyer_updated' && (
                       <Button
                         size="sm"
                         className="h-8 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700"
                         onClick={() => {
                           if (!transaction?.id) return;
                           onRefreshAddress(transaction.id);
                         }}
                         disabled={refreshingTransactionId === transaction?.id}
                       >
                         {refreshingTransactionId === transaction?.id ? (
                           <>
                             <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                             Refreshing...
                           </>
                         ) : (
                           <>
                             <RefreshCw className="w-3 h-3 mr-1" />
                             Refresh Address
                           </>
                         )}
                       </Button>
                     )}

                     {!isHistory && (
                       <Button
                         size="sm"
                         variant="ghost"
                         className="h-8 text-xs"
                         onClick={() => {
                           if (!transaction?.id) return;
                           setExpandedTransactionId(isExpanded ? null : transaction.id);
                         }}
                       >
                         {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                       </Button>
                     )}
                   </div>

                   {isExpanded && transaction?.shipping_details?.address && (
                     <Card className="mt-3 bg-gray-50">
                       <CardContent className="pt-3 text-xs space-y-1">
                         <p className="font-semibold text-gray-900">{transaction.shipping_details.name || 'N/A'}</p>
                         <p className="text-gray-600">{transaction.shipping_details.address.line1}</p>
                         {transaction.shipping_details.address.line2 && (
                           <p className="text-gray-600">{transaction.shipping_details.address.line2}</p>
                         )}
                         <p className="text-gray-600">
                           {transaction.shipping_details.address.city}, {transaction.shipping_details.address.state} {transaction.shipping_details.address.postal_code}
                         </p>
                         {transaction.shipping_details.phone && (
                           <p className="text-gray-600">Phone: {transaction.shipping_details.phone}</p>
                         )}
                       </CardContent>
                     </Card>
                   )}
                 </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}