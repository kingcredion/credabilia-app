import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Package,
  Truck,
  ExternalLink,
  Calendar,
  CheckCircle2,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MapPin,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const STATUS_CONFIG = {
  delivered:     { label: "Item Delivered",  color: "bg-green-500",  Icon: CheckCircle2 },
  shipped:       { label: "Item Shipped",    color: "bg-blue-500",   Icon: Truck },
  label_created: { label: "Label Created",   color: "bg-orange-500", Icon: Package },
  returned:      { label: "Returned",        color: "bg-yellow-500", Icon: AlertTriangle },
  failed:        { label: "Failed",          color: "bg-red-500",    Icon: AlertTriangle },
  voided:        { label: "Voided",          color: "bg-gray-400",   Icon: Package },
  pending:       { label: "Awaiting Shipment", color: "bg-gray-400", Icon: Clock },
};

// Map Transaction.status → human label for collector context
const TXN_STATUS_LABELS = {
  pending:   null, // don't show — too early
  paid:      "Payment Confirmed — Awaiting Shipment",
  escrow:    "Payment Confirmed — Work in Progress",
  shipped:   "Item Shipped",
  delivered: "Item Delivered",
  completed: "Completed",
  refunded:  "Refund Issued — Payment Returned",
  cancelled: "Cancelled",
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.label_created;
  return (
    <Badge className={`${cfg.color} text-white flex items-center gap-1`}>
      <cfg.Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

function TrackingHistory({ history }) {
  if (!history || history.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      {history.map((event, idx) => (
        <div key={idx} className="flex gap-3 items-start text-sm">
          <div className={`w-2 h-2 mt-1.5 rounded-full flex-shrink-0 ${idx === 0 ? 'bg-blue-500' : 'bg-gray-300'}`} />
          <div>
            <p className="font-medium text-gray-800 capitalize">{event.status_details || event.status}</p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {event.status_date && <span>{format(new Date(event.status_date), 'MMM d, h:mm a')}</span>}
              {event.location && (
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.location}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TrackPackages() {
  const [user, setUser] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: shipments, isLoading } = useQuery({
    queryKey: ['my-shipments', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      // Fetch shipments directly linked to buyer — no guessing needed since
      // createLabel always writes buyer_email from the Transaction record
      const myShipments = await base44.entities.Shipment.filter({ buyer_email: user.email }, "-created_date");

      return await Promise.all(myShipments.map(async (shipment) => {
        try {
          const [items, txns] = await Promise.all([
            base44.entities.Item.filter({ id: shipment.item_id }),
            shipment.transaction_id
              ? base44.entities.Transaction.filter({ id: shipment.transaction_id })
              : Promise.resolve([]),
          ]);
          return { ...shipment, item: items[0] || null, transaction: txns[0] || null };
        } catch {
          return shipment;
        }
      }));
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const handleRefresh = async (shipment) => {
    if (!shipment.carrier || !shipment.tracking_number) return;
    setRefreshingId(shipment.id);
    try {
      await base44.functions.invoke("shippo", {
        action: "get_tracking",
        payload: { carrier: shipment.carrier, tracking_number: shipment.tracking_number }
      });
      // Re-fetch our updated DB record
      queryClient.invalidateQueries({ queryKey: ['my-shipments'] });
    } catch (e) {
      console.error("Refresh failed:", e);
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-blue-100 p-3 rounded-xl">
            <Truck className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Track Packages</h1>
            <p className="text-gray-600">Monitor the status of your incoming orders</p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading tracking information...</p>
          </div>
        ) : shipments.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Package className="w-16 h-16 text-gray-300 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No packages found</h3>
              <p className="text-gray-500 mb-6 text-center max-w-md">
                When you purchase items that require shipping, tracking details will appear here.
              </p>
              <Link to={createPageUrl("Marketplace")}>
                <Button>Browse Marketplace</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {shipments.map((shipment) => {
              const isExpanded = expandedId === shipment.id;
              const isRefreshing = refreshingId === shipment.id;
              const hasHistory = shipment.tracking_history?.length > 0;

              return (
                <Card key={shipment.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Item Image */}
                      <div className="w-full md:w-24 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        {shipment.item?.images?.[0] ? (
                          <img src={shipment.item.images[0]} alt={shipment.item.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-8 h-8 text-gray-400" />
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-2 mb-3">
                          <div>
                            <h3 className="font-bold text-lg text-gray-900">{shipment.item?.title || "Item"}</h3>
                            <p className="text-sm text-gray-500 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(shipment.created_date), 'MMM d, yyyy')}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <StatusBadge status={shipment.status} />
                            {shipment.transaction && TXN_STATUS_LABELS[shipment.transaction.status] && (
                              <span className="text-xs text-gray-500">{TXN_STATUS_LABELS[shipment.transaction.status]}</span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-gray-50 p-3 rounded-lg">
                            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Carrier</p>
                            <div className="flex items-center gap-2">
                              <Truck className="w-4 h-4 text-gray-400" />
                              <span className="font-medium">{shipment.carrier || "—"}</span>
                              {shipment.service_level && <span className="text-gray-400 text-sm">{shipment.service_level}</span>}
                            </div>
                          </div>

                          <div className="bg-gray-50 p-3 rounded-lg">
                            <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Tracking</p>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-sm truncate">{shipment.tracking_number || "—"}</span>
                              {(shipment.tracking_url_provider || shipment.tracking_url) && (
                                <a href={shipment.tracking_url_provider || shipment.tracking_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="w-4 h-4 text-blue-500" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        {shipment.eta && (
                          <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                            <Clock className="w-4 h-4 text-orange-500" />
                            <span>Est. delivery: <strong>{format(new Date(shipment.eta), 'MMM d, yyyy')}</strong></span>
                          </div>
                        )}

                        {shipment.last_tracking_sync_at && (
                          <p className="mt-1 text-xs text-gray-400">
                            Last updated {format(new Date(shipment.last_tracking_sync_at), 'MMM d, h:mm a')}
                          </p>
                        )}

                        {/* Actions Row */}
                        <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {/* Refresh from Shippo */}
                            {shipment.carrier && shipment.tracking_number && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRefresh(shipment)}
                                disabled={isRefreshing}
                                className="text-xs"
                              >
                                <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                                {isRefreshing ? 'Refreshing...' : 'Refresh'}
                              </Button>
                            )}

                            {/* Expand history */}
                            {hasHistory && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setExpandedId(isExpanded ? null : shipment.id)}
                                className="text-xs text-gray-600"
                              >
                                {isExpanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
                                {isExpanded ? 'Hide' : 'View'} History ({shipment.tracking_history.length})
                              </Button>
                            )}
                          </div>

                          {(shipment.tracking_url_provider || shipment.tracking_url) && (
                            <Button asChild variant="outline" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                              <a href={shipment.tracking_url_provider || shipment.tracking_url} target="_blank" rel="noopener noreferrer">
                                Track on {shipment.carrier || 'Carrier'}
                                <ExternalLink className="w-3 h-3 ml-1" />
                              </a>
                            </Button>
                          )}
                        </div>

                        {/* Tracking History (expanded) */}
                        {isExpanded && hasHistory && (
                          <TrackingHistory history={shipment.tracking_history} />
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}