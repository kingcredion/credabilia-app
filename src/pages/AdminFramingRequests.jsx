import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  DollarSign,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertCircle,
  Eye,
  Calendar,
  MapPin,
  FileText,
  Image as ImageIcon
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminFramingRequests() {
  const [user, setUser] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

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

  // Fetch all framing requests
  const { data: framingRequests } = useQuery({
    queryKey: ['admin-framing-requests'],
    queryFn: async () => {
      return await base44.entities.FramingRequest.list("-created_date");
    },
    initialData: [],
  });

  // Fetch all quotes
  const { data: allQuotes } = useQuery({
    queryKey: ['admin-framing-quotes'],
    queryFn: async () => {
      return await base44.entities.FramingQuote.list("-created_date");
    },
    initialData: [],
  });

  // Fetch framing transactions (revenue tracking)
  const { data: framingTransactions } = useQuery({
    queryKey: ['framing-transactions'],
    queryFn: async () => {
      return await base44.entities.FramingTransaction.list("-created_date");
    },
    initialData: [],
  });

  // Calculate statistics
  const stats = React.useMemo(() => {
    const pendingCount = framingRequests.filter(r => r.status === "pending").length;
    const activeCount = framingRequests.filter(r => r.status === "active").length;
    const completedCount = framingRequests.filter(r => r.status === "completed").length;
    
    // Revenue calculations
    const totalRevenue = framingTransactions.reduce((sum, t) => sum + (t.platform_total_revenue || 0), 0);
    const completedRevenue = framingTransactions
      .filter(t => t.status === "completed")
      .reduce((sum, t) => sum + (t.platform_total_revenue || 0), 0);
    const pendingRevenue = framingTransactions
      .filter(t => t.status === "deposit_paid" || t.status === "in_progress")
      .reduce((sum, t) => sum + (t.platform_total_revenue || 0), 0);

    return {
      total: framingRequests.length,
      pending: pendingCount,
      active: activeCount,
      completed: completedCount,
      totalRevenue,
      completedRevenue,
      pendingRevenue,
      totalQuotes: allQuotes.length
    };
  }, [framingRequests, framingTransactions, allQuotes]);

  const handleViewDetails = (request) => {
    setSelectedRequest(request);
    setShowDetailsDialog(true);
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">
              Only administrators can access framing requests management.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50">
      <div className="max-w-4xl mx-auto px-4 py-4 md:py-6">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-600" />
            Framing Requests
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Monitor requests, quotes, and revenue</p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <Package className="w-4 h-4" />
                <Badge className="bg-white/20 text-white text-[10px]">Total</Badge>
              </div>
              <p className="text-xl font-bold">{stats.total}</p>
              <p className="text-xs text-white/80">All Requests</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500 to-orange-600 text-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <Clock className="w-4 h-4" />
                <Badge className="bg-white/20 text-white text-[10px]">Pending</Badge>
              </div>
              <p className="text-xl font-bold">{stats.pending}</p>
              <p className="text-xs text-white/80">Awaiting Quotes</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-pink-600 text-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <TrendingUp className="w-4 h-4" />
                <Badge className="bg-white/20 text-white text-[10px]">Active</Badge>
              </div>
              <p className="text-xl font-bold">{stats.active}</p>
              <p className="text-xs text-white/80">In Progress</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <CheckCircle className="w-4 h-4" />
                <Badge className="bg-white/20 text-white text-[10px]">Done</Badge>
              </div>
              <p className="text-xl font-bold">{stats.completed}</p>
              <p className="text-xs text-white/80">Completed</p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Statistics */}
        <Card className="mb-4 border border-green-300 bg-green-50/60">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="flex items-center gap-2 text-green-900 text-sm">
              <DollarSign className="w-4 h-4" />
              Platform Revenue — Framing
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <p className="text-xs text-gray-500 mb-0.5">Total</p>
                <p className="text-lg font-bold text-green-600">${stats.totalRevenue.toFixed(2)}</p>
                <p className="text-[11px] text-gray-400">{framingTransactions.length} txns</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-emerald-200">
                <p className="text-xs text-gray-500 mb-0.5">Completed</p>
                <p className="text-lg font-bold text-emerald-600">${stats.completedRevenue.toFixed(2)}</p>
                <p className="text-[11px] text-gray-400">Finished jobs</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-yellow-200">
                <p className="text-xs text-gray-500 mb-0.5">Pending</p>
                <p className="text-lg font-bold text-yellow-600">${stats.pendingRevenue.toFixed(2)}</p>
                <p className="text-[11px] text-gray-400">Active jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requests Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <div className="overflow-x-auto -mx-4 px-4">
          <TabsList className="flex w-max min-w-full gap-1 h-9 mb-4">
            <TabsTrigger value="all" className="text-xs px-3 h-7 whitespace-nowrap">All ({stats.total})</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs px-3 h-7 whitespace-nowrap">Pending ({stats.pending})</TabsTrigger>
            <TabsTrigger value="active" className="text-xs px-3 h-7 whitespace-nowrap">Active ({stats.active})</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs px-3 h-7 whitespace-nowrap">Completed ({stats.completed})</TabsTrigger>
          </TabsList>
          </div>

          <TabsContent value="all">
            <RequestList 
              requests={framingRequests} 
              quotes={allQuotes}
              transactions={framingTransactions}
              onViewDetails={handleViewDetails}
            />
          </TabsContent>

          <TabsContent value="pending">
            <RequestList 
              requests={framingRequests.filter(r => r.status === "pending")} 
              quotes={allQuotes}
              transactions={framingTransactions}
              onViewDetails={handleViewDetails}
            />
          </TabsContent>

          <TabsContent value="active">
            <RequestList 
              requests={framingRequests.filter(r => r.status === "active")} 
              quotes={allQuotes}
              transactions={framingTransactions}
              onViewDetails={handleViewDetails}
            />
          </TabsContent>

          <TabsContent value="completed">
            <RequestList 
              requests={framingRequests.filter(r => r.status === "completed")} 
              quotes={allQuotes}
              transactions={framingTransactions}
              onViewDetails={handleViewDetails}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Request Details Dialog */}
      {selectedRequest && (
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">{selectedRequest.title}</DialogTitle>
              <DialogDescription>
                Request ID: {selectedRequest.id}
              </DialogDescription>
            </DialogHeader>

            <RequestDetails 
              request={selectedRequest} 
              quotes={allQuotes.filter(q => q.framing_request_id === selectedRequest.id)}
              transactions={framingTransactions.filter(t => t.framing_request_id === selectedRequest.id)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function RequestList({ requests, quotes, transactions, onViewDetails }) {
  if (requests.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-gray-400">
        <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        No requests in this category
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <RequestCard 
          key={request.id} 
          request={request} 
          quotes={quotes}
          transactions={transactions}
          onViewDetails={onViewDetails}
        />
      ))}
    </div>
  );
}

function RequestCard({ request, quotes, transactions, onViewDetails }) {
  const requestQuotes = quotes.filter(q => q.framing_request_id === request.id);
  const requestTransaction = transactions.find(t => t.framing_request_id === request.id);
  
  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800",
    active: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800"
  };

  return (
    <Card className="tap-scale hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 mr-3">
            <h3 className="font-semibold text-gray-900 text-sm truncate">{request.title}</h3>
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(request.created_date).toLocaleDateString()}
              </span>
              {request.user_name && <span>By: {request.user_name}</span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <Badge className={`${statusColors[request.status]} capitalize text-[11px] h-5`}>
              {request.status}
            </Badge>
            {requestTransaction && (
              <Badge className="bg-green-500 text-white text-[11px] h-5">
                <DollarSign className="w-2.5 h-2.5 mr-0.5" />
                ${requestTransaction.platform_total_revenue?.toFixed(2)}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <p className="text-[11px] text-gray-500">Dimensions</p>
            <p className="text-xs font-medium">{request.dimensions || "Not specified"}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500">Budget</p>
            <p className="text-xs font-medium">{request.budget_range || "Flexible"}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500">Quotes</p>
            <p className="text-xs font-medium">{requestQuotes.length}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500">Deadline</p>
            <p className="text-xs font-medium">{request.deadline || "Flexible"}</p>
          </div>
        </div>

        <Button onClick={() => onViewDetails(request)} variant="outline" size="sm" className="w-full h-8 text-xs">
          <Eye className="w-3.5 h-3.5 mr-1.5" />
          View Details & Quotes
        </Button>
      </CardContent>
    </Card>
  );
}

function RequestDetails({ request, quotes, transactions }) {
  const acceptedQuote = quotes.find(q => q.status === "accepted");
  const transaction = transactions[0]; // Should only be one per request

  return (
    <div className="space-y-4">
      {/* Request Information */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Details</p>
        {request.description && <p className="text-xs text-gray-700">{request.description}</p>}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {[
            { label: 'Dimensions', val: request.dimensions || 'Not specified' },
            { label: 'Frame Style', val: request.frame_style || 'Not specified' },
            { label: 'Matting', val: request.matting_preference || 'Not specified' },
            { label: 'Budget', val: request.budget_range || 'Flexible' },
          ].map(({ label, val }) => (
            <div key={label}>
              <p className="text-[11px] text-gray-500">{label}</p>
              <p className="text-xs font-medium text-gray-900">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Reference Images */}
      {request.reference_images?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" />Images</p>
          <div className="grid grid-cols-3 gap-2">
            {request.reference_images.map((img, idx) => (
              <img key={idx} src={img} alt={`Ref ${idx + 1}`} className="w-full h-20 object-cover rounded-lg border border-gray-200" />
            ))}
          </div>
        </div>
      )}

      {/* Transaction Info */}
      {transaction && (
        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
          <p className="text-xs font-semibold text-green-800 mb-2 flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" />Platform Revenue</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><p className="text-gray-500">Platform Fee</p><p className="font-bold text-green-600">${transaction.platform_deposit?.toFixed(2)}</p></div>
            <div><p className="text-gray-500">Total Revenue</p><p className="font-bold text-green-600">${transaction.platform_total_revenue?.toFixed(2)}</p></div>
            <div><p className="text-gray-500">Status</p><Badge className="bg-green-500 text-white capitalize text-[10px] h-4 mt-0.5">{transaction.status.replace('_', ' ')}</Badge></div>
            {transaction.deposit_date && <div><p className="text-gray-500">Date</p><p className="text-gray-900">{new Date(transaction.deposit_date).toLocaleDateString()}</p></div>}
          </div>
        </div>
      )}

      {/* Quotes */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Quotes ({quotes.length})</p>
        {quotes.length === 0 ? (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">No quotes yet</p>
        ) : (
          <div className="space-y-2">
            {quotes.map((quote) => (
              <div key={quote.id} className={`rounded-lg p-3 border text-xs ${quote.status === 'accepted' ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <p className="font-semibold text-gray-900">{quote.frame_shop_name}</p>
                    {quote.estimated_turnaround && <p className="text-gray-500">{quote.estimated_turnaround}</p>}
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-base font-bold text-gray-900">${quote.quote_amount?.toFixed(2)}</p>
                    <Badge className={`${quote.status === 'accepted' ? 'bg-green-500' : quote.status === 'rejected' ? 'bg-red-500' : 'bg-yellow-500'} text-white capitalize text-[10px] h-4`}>{quote.status}</Badge>
                  </div>
                </div>
                {quote.quote_details && <p className="text-gray-600 mt-1">{quote.quote_details}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}