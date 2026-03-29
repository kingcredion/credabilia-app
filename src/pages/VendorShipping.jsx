import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Truck, Package, Search, AlertCircle, CheckCircle2,
  RefreshCw, ChevronDown, ChevronUp, Loader2, MapPin,
  ExternalLink, Settings, Clock
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ShippingDialog from "../components/ShippingDialog";
import { format } from "date-fns";

// Shipping-eligible statuses (driven by Transaction, not Item)
// Includes 'pending' for backward-compat with pre-fix transactions stuck at pending.
// NOTE: needsLabel filter below uses inline logic — update both if changing criteria.
const IN_PROGRESS_STATUSES = ['label_created'];
const IN_TRANSIT_STATUSES  = ['shipped'];
const DONE_STATUSES        = ['delivered', 'returned', 'failed'];

export default function VendorShipping() {
  const [user, setUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showShippingDialog, setShowShippingDialog] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null); // { item, transaction }
  const [expandedId, setExpandedId] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (e) {
      console.error("Error loading user:", e);
    }
  };

  // PRIMARY: query transactions by vendor + shipping status (canonical source of truth)
  const { data: transactions = [], isLoading: txLoading } = useQuery({
    queryKey: ['vendor-shipping-transactions', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      // Fetch all transactions for this vendor that have shipping relevance
      const all = await base44.entities.Transaction.filter({ vendor_email: user.email }, "-created_date");
      return all.filter(t => {
        const paid = ['paid', 'escrow', 'shipped', 'delivered', 'completed'].includes(t.status);
        const hasShipping = !!t.item_id; // only physical-item transactions
        return paid && hasShipping;
      });
    },
    enabled: !!user?.email,
    initialData: [],
    refetchInterval: 30000, // poll every 30s for new orders
  });

  // Load items for the transactions we found (batch by unique item IDs)
  const itemIds = [...new Set(transactions.map(t => t.item_id).filter(Boolean))];
  const { data: itemMap = {} } = useQuery({
    queryKey: ['vendor-shipping-items', itemIds.join(',')],
    queryFn: async () => {
      if (!itemIds.length) return {};
      const map = {};
      // Fetch in one pass — filter returns all that match vendor_email + sold status
      const items = await base44.entities.Item.filter({ vendor_email: user.email }, "-created_date", 200);
      items.forEach(it => { map[it.id] = it; });
      return map;
    },
    enabled: !!user?.email && itemIds.length > 0,
    initialData: {},
  });

  // Also load Shipment records for label/tracking details
  const { data: shipments = [] } = useQuery({
    queryKey: ['vendor-shipments', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Shipment.filter({ vendor_email: user.email }, "-created_date");
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const shipmentByTxn = {};
  shipments.forEach(s => { if (s.transaction_id) shipmentByTxn[s.transaction_id] = s; });

  // Build enriched orders (transaction + item + shipment)
  const orders = transactions
    .map(txn => ({ txn, item: itemMap[txn.item_id] || null, shipment: shipmentByTxn[txn.id] || null }))
    .filter(o => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        (o.item?.title || o.txn.item_title || '').toLowerCase().includes(q) ||
        (o.txn.buyer_email || '').toLowerCase().includes(q) ||
        (o.shipment?.tracking_number || '').toLowerCase().includes(q)
      );
    });

  const needsLabel   = orders.filter(o =>
    o.txn.status === 'paid' &&
    !!o.txn.item_id &&
    (
      o.txn.shipping_status === 'ready_to_ship' ||
      o.txn.shipping_status === 'pending' ||
      !o.txn.shipping_status
    )
  );
  const labelCreated = orders.filter(o => IN_PROGRESS_STATUSES.includes(o.txn.shipping_status));
  const inTransit    = orders.filter(o => IN_TRANSIT_STATUSES.includes(o.txn.shipping_status));
  const done         = orders.filter(o => DONE_STATUSES.includes(o.txn.shipping_status));

  const handleShip = (order) => {
    setSelectedOrder(order);
    setShowShippingDialog(true);
  };

  const handleRequestAddress = async (txn) => {
    if (!txn?.id) return;
    try {
      await base44.entities.Transaction.update(txn.id, {
        shipping_address_status: 'update_requested',
        shipping_address_requested_at: new Date().toISOString(),
        shipping_address_requested_by: user.email,
      });
      await base44.entities.Notification.create({
        user_email: txn.buyer_email,
        type: 'address_requested',
        title: '🚚 Shipping Address Needed',
        message: 'Your seller needs your shipping address before they can ship your item.',
        read: false,
        related_item_id: txn.item_id,
        link_url: createPageUrl("Settings?section=addresses"),
      });
      queryClient.invalidateQueries({ queryKey: ['vendor-shipping-transactions'] });
    } catch (err) {
      console.error('Failed to request address:', err);
    }
  };

  const handleRefreshAddress = async (txnId) => {
    if (!txnId) return;
    setRefreshingId(txnId);
    try {
      await queryClient.refetchQueries({ queryKey: ['vendor-shipping-transactions', user?.email] });
    } finally {
      setRefreshingId(null);
    }
  };

  const handleLabelCreated = () => {
    queryClient.invalidateQueries({ queryKey: ['vendor-shipping-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['vendor-shipments'] });
    queryClient.invalidateQueries({ queryKey: ['vendor-shipping-items'] });
  };

  if (!user) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Truck className="w-7 h-7 text-orange-600" />
              Shipping
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              All paid orders eligible for shipment. Driven by payment confirmation — not item status.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['vendor-shipping-transactions', user?.email] })}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>

        {/* Search */}
        <div className="mb-6 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, buyer, or tracking..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {txLoading && (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <Card key={i}><CardContent className="p-4 animate-pulse"><div className="h-16 bg-muted rounded" /></CardContent></Card>
            ))}
          </div>
        )}

        {!txLoading && (
          <>
            <OrderSection
              title="Needs Label"
              dotColor="bg-red-500"
              orders={needsLabel}
              emptyMsg="No orders waiting for a label"
              onShip={handleShip}
              onRequestAddress={handleRequestAddress}
              onRefreshAddress={handleRefreshAddress}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              refreshingId={refreshingId}
              user={user}
            />
            <OrderSection
              title="Label Created"
              dotColor="bg-orange-400"
              orders={labelCreated}
              emptyMsg="No labels created yet"
              onShip={handleShip}
              onRequestAddress={handleRequestAddress}
              onRefreshAddress={handleRefreshAddress}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              refreshingId={refreshingId}
              user={user}
              isHistory
            />
            <OrderSection
              title="In Transit"
              dotColor="bg-blue-500"
              orders={inTransit}
              emptyMsg="No packages currently in transit"
              onShip={handleShip}
              onRequestAddress={handleRequestAddress}
              onRefreshAddress={handleRefreshAddress}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              refreshingId={refreshingId}
              user={user}
              isHistory
            />
            <OrderSection
              title="Completed / Returned"
              dotColor="bg-green-500"
              orders={done}
              emptyMsg="No completed orders yet"
              onShip={handleShip}
              onRequestAddress={handleRequestAddress}
              onRefreshAddress={handleRefreshAddress}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              refreshingId={refreshingId}
              user={user}
              isHistory
            />
          </>
        )}

        {selectedOrder && (
          <ShippingDialog
            open={showShippingDialog}
            onClose={() => { setShowShippingDialog(false); setSelectedOrder(null); }}
            item={selectedOrder.item || { id: selectedOrder.txn.item_id, title: selectedOrder.txn.item_title, buyer_email: selectedOrder.txn.buyer_email }}
            transaction={selectedOrder.txn}
            user={user}
            onLabelCreated={handleLabelCreated}
          />
        )}
      </div>
    </div>
  );
}

function OrderSection({ title, dotColor, orders, emptyMsg, onShip, onRequestAddress, onRefreshAddress, expandedId, setExpandedId, refreshingId, user, isHistory }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        {title} ({orders.length})
      </h2>
      {orders.length === 0 ? (
        <Card className="bg-muted/20 border-dashed">
          <CardContent className="p-6 text-center text-muted-foreground text-sm">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-20" />
            {emptyMsg}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <OrderCard
              key={order.txn.id}
              order={order}
              onShip={onShip}
              onRequestAddress={onRequestAddress}
              onRefreshAddress={onRefreshAddress}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              refreshingId={refreshingId}
              user={user}
              isHistory={isHistory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, onShip, onRequestAddress, onRefreshAddress, expandedId, setExpandedId, refreshingId, user, isHistory }) {
  const { txn, item, shipment } = order;
  const shippingStatus = txn.shipping_status || 'ready_to_ship';
  const addressStatus  = txn.shipping_address_status || 'missing';
  const isExpanded = expandedId === txn.id;

  const hasAddress = txn.shipping_details?.address?.line1;
  const hasFromAddress = true; // validated inside ShippingDialog — show blocked state there

  const statusColors = {
    ready_to_ship:  'bg-red-100 text-red-700',
    label_created:  'bg-orange-100 text-orange-700',
    shipped:        'bg-blue-100 text-blue-700',
    delivered:      'bg-green-100 text-green-700',
    returned:       'bg-yellow-100 text-yellow-700',
    failed:         'bg-red-100 text-red-700',
  };
  const statusLabel = {
    ready_to_ship: 'Ready to Ship',
    label_created: 'Label Created',
    shipped:       'In Transit',
    delivered:     'Delivered',
    returned:      'Returned',
    failed:        'Failed',
  };

  const addrBadge = {
    missing:          { cls: 'bg-red-100 text-red-700', label: 'Address Missing', Icon: AlertCircle },
    captured:         { cls: 'bg-green-100 text-green-700', label: 'Address Ready', Icon: CheckCircle2 },
    update_requested: { cls: 'bg-yellow-100 text-yellow-700', label: 'Address Requested', Icon: Clock },
    buyer_updated:    { cls: 'bg-blue-100 text-blue-700', label: 'Buyer Updated', Icon: CheckCircle2 },
    seller_acknowledged: { cls: 'bg-green-100 text-green-700', label: 'Acknowledged', Icon: CheckCircle2 },
  }[addressStatus] || { cls: 'bg-red-100 text-red-700', label: 'Address Missing', Icon: AlertCircle };

  const canCreateLabel = (shippingStatus === 'ready_to_ship' || shippingStatus === 'pending' || !txn.shipping_status) && !shipment?.shippo_transaction_id;
  const hasLabelAlready = !!shipment?.label_url;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Thumbnail */}
          <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0 border">
            {item?.images?.[0] ? (
              <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Title */}
            <p className="font-semibold text-sm line-clamp-1 mb-1">
              {item?.title || txn.item_title || txn.item_id}
            </p>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <Badge className={`text-xs ${statusColors[shippingStatus] || 'bg-gray-100 text-gray-700'}`}>
                {statusLabel[shippingStatus] || shippingStatus}
              </Badge>
              <Badge className={`text-xs flex items-center gap-1 ${addrBadge.cls}`}>
                <addrBadge.Icon className="w-3 h-3" />
                {addrBadge.label}
              </Badge>
              {txn.sale_amount && (
                <Badge variant="outline" className="text-xs">${txn.sale_amount.toFixed(2)}</Badge>
              )}
              {txn.created_date && (
                <span className="text-xs text-muted-foreground self-center">
                  {format(new Date(txn.created_date), 'MMM d, yyyy')}
                </span>
              )}
            </div>

            {/* Buyer info */}
            <p className="text-xs text-muted-foreground mb-2 truncate">
              Buyer: {txn.buyer_email}
              {txn.shipping_details?.address?.city && ` · ${txn.shipping_details.address.city}, ${txn.shipping_details.address.state}`}
            </p>

            {/* Tracking info if label exists */}
            {shipment?.tracking_number && (
              <p className="text-xs text-blue-700 mb-2 font-mono">
                📦 {shipment.tracking_number}
                {shipment.tracking_url && (
                  <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer" className="ml-2 underline">Track</a>
                )}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {item?.id && (
                <Button variant="outline" size="sm" asChild className="h-8 text-xs">
                  <Link to={createPageUrl(`ItemDetails?id=${item.id}`)}>View Item</Link>
                </Button>
              )}

              {/* Create label — blocked if label already purchased */}
              {canCreateLabel && !hasLabelAlready && (
                <Button
                  size="sm"
                  className="h-8 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                  onClick={() => onShip(order)}
                >
                  <Truck className="w-3 h-3 mr-1" />
                  Create Label
                </Button>
              )}

              {/* View existing label */}
              {hasLabelAlready && (
                <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
                  <a href={shipment.label_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Label PDF
                  </a>
                </Button>
              )}

              {/* Request address if missing */}
              {!isHistory && addressStatus === 'missing' && (
                <Button
                  size="sm"
                  className="h-8 text-xs bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                  onClick={() => onRequestAddress(txn)}
                >
                  <MapPin className="w-3 h-3 mr-1" />
                  Request Address
                </Button>
              )}

              {/* Refresh after buyer updated */}
              {!isHistory && addressStatus === 'buyer_updated' && (
                <Button
                  size="sm"
                  className="h-8 text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                  onClick={() => onRefreshAddress(txn.id)}
                  disabled={refreshingId === txn.id}
                >
                  {refreshingId === txn.id ? (
                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Refreshing...</>
                  ) : (
                    <><RefreshCw className="w-3 h-3 mr-1" />Refresh</>
                  )}
                </Button>
              )}

              {/* Expand / collapse address */}
              {hasAddress && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => setExpandedId(isExpanded ? null : txn.id)}
                >
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              )}
            </div>

            {/* Expanded address */}
            {isExpanded && txn.shipping_details?.address && (
              <Card className="mt-3 bg-muted/30">
                <CardContent className="pt-3 pb-3 text-xs space-y-0.5">
                  <p className="font-semibold">{txn.shipping_details.name || ''}</p>
                  <p>{txn.shipping_details.address.line1}</p>
                  {txn.shipping_details.address.line2 && <p>{txn.shipping_details.address.line2}</p>}
                  <p>
                    {txn.shipping_details.address.city}, {txn.shipping_details.address.state}{' '}
                    {txn.shipping_details.address.postal_code}
                  </p>
                  {txn.shipping_details.phone && <p>📞 {txn.shipping_details.phone}</p>}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}