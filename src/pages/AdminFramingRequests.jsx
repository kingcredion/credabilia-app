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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
            <Package className="w-10 h-10 text-purple-600" />
            Framing Requests Management
          </h1>
          <p className="text-gray-600">
            Monitor framing requests, quotes, and platform revenue
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Package className="w-8 h-8" />
                <Badge className="bg-white/20 text-white">Total</Badge>
              </div>
              <p className="text-3xl font-bold mb-1">{stats.total}</p>
              <p className="text-sm text-white/80">All Requests</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-yellow-500 to-orange-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Clock className="w-8 h-8" />
                <Badge className="bg-white/20 text-white">Pending</Badge>
              </div>
              <p className="text-3xl font-bold mb-1">{stats.pending}</p>
              <p className="text-sm text-white/80">Awaiting Quotes</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500 to-pink-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-8 h-8" />
                <Badge className="bg-white/20 text-white">Active</Badge>
              </div>
              <p className="text-3xl font-bold mb-1">{stats.active}</p>
              <p className="text-sm text-white/80">Jobs In Progress</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500 to-emerald-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle className="w-8 h-8" />
                <Badge className="bg-white/20 text-white">Done</Badge>
              </div>
              <p className="text-3xl font-bold mb-1">{stats.completed}</p>
              <p className="text-sm text-white/80">Completed</p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Statistics */}
        <Card className="mb-8 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <DollarSign className="w-6 h-6" />
              Platform Revenue from Framing Services
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg p-4 border-2 border-green-200">
                <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
                <p className="text-3xl font-bold text-green-600">
                  ${stats.totalRevenue.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  From {framingTransactions.length} transactions
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 border-2 border-emerald-200">
                <p className="text-sm text-gray-600 mb-1">Completed Revenue</p>
                <p className="text-3xl font-bold text-emerald-600">
                  ${stats.completedRevenue.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  From finished jobs
                </p>
              </div>

              <div className="bg-white rounded-lg p-4 border-2 border-yellow-200">
                <p className="text-sm text-gray-600 mb-1">Pending Revenue</p>
                <p className="text-3xl font-bold text-yellow-600">
                  ${stats.pendingRevenue.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  From active jobs
                </p>
              </div>
            </div>

            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-900">
                💡 <strong>Revenue Model:</strong> Platform collects a $50 deposit/fee from each accepted quote. 
                This covers the service of connecting collectors with frame shops.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Requests Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
            <TabsTrigger value="active">Active ({stats.active})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({stats.completed})</TabsTrigger>
          </TabsList>

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
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">{selectedRequest.title}</DialogTitle>
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
      <Card>
        <CardContent className="p-12 text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600">No requests in this category</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
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
    <Card className="hover:shadow-lg transition-all">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {request.title}
            </h3>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(request.created_date).toLocaleDateString()}
              </span>
              <span>By: {request.user_name}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge className={`${statusColors[request.status]} capitalize`}>
              {request.status}
            </Badge>
            {requestTransaction && (
              <Badge className="bg-green-500 text-white">
                <DollarSign className="w-3 h-3 mr-1" />
                ${requestTransaction.platform_total_revenue?.toFixed(2)}
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-600">Dimensions</p>
            <p className="font-medium text-gray-900">{request.dimensions || "Not specified"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Budget</p>
            <p className="font-medium text-gray-900">{request.budget_range || "Flexible"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Quotes Received</p>
            <p className="font-medium text-gray-900">{requestQuotes.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Deadline</p>
            <p className="font-medium text-gray-900">{request.deadline || "Flexible"}</p>
          </div>
        </div>

        <Button
          onClick={() => onViewDetails(request)}
          variant="outline"
          className="w-full"
        >
          <Eye className="w-4 h-4 mr-2" />
          View Full Details & Quotes
        </Button>
      </CardContent>
    </Card>
  );
}

function RequestDetails({ request, quotes, transactions }) {
  const acceptedQuote = quotes.find(q => q.status === "accepted");
  const transaction = transactions[0]; // Should only be one per request

  return (
    <div className="space-y-6">
      {/* Request Information */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Request Details
        </h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div>
            <p className="text-xs text-gray-600">Description</p>
            <p className="text-sm text-gray-900">{request.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-600">Dimensions</p>
              <p className="text-sm font-medium text-gray-900">{request.dimensions || "Not specified"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Frame Style</p>
              <p className="text-sm font-medium text-gray-900">{request.frame_style || "Not specified"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Matting</p>
              <p className="text-sm font-medium text-gray-900">{request.matting_preference || "Not specified"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Budget Range</p>
              <p className="text-sm font-medium text-gray-900">{request.budget_range || "Flexible"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Reference Images */}
      {request.reference_images && request.reference_images.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Reference Images
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {request.reference_images.map((img, idx) => (
              <img
                key={idx}
                src={img}
                alt={`Reference ${idx + 1}`}
                className="w-full h-32 object-cover rounded-lg border-2 border-gray-200"
              />
            ))}
          </div>
        </div>
      )}

      {/* Transaction Info (Platform Revenue) */}
      {transaction && (
        <div>
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            Platform Revenue
          </h3>
          <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-600">Platform Fee</p>
                  <p className="text-xl font-bold text-green-600">
                    ${transaction.platform_deposit?.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Total Revenue</p>
                  <p className="text-xl font-bold text-green-600">
                    ${transaction.platform_total_revenue?.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Status</p>
                  <Badge className="bg-green-500 text-white capitalize">
                    {transaction.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Date</p>
                  <p className="text-sm text-gray-900">
                    {new Date(transaction.deposit_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quotes */}
      <div>
        <h3 className="font-semibold text-gray-900 mb-3">
          Quotes Received ({quotes.length})
        </h3>
        {quotes.length === 0 ? (
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-4">
            No quotes submitted yet
          </p>
        ) : (
          <div className="space-y-3">
            {quotes.map((quote) => (
              <Card 
                key={quote.id} 
                className={`${
                  quote.status === 'accepted' 
                    ? 'bg-green-50 border-2 border-green-300' 
                    : 'bg-gray-50'
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-gray-900">
                        {quote.frame_shop_name}
                      </h4>
                      <p className="text-sm text-gray-600">
                        {quote.estimated_turnaround}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-900">
                        ${quote.quote_amount?.toFixed(2)}
                      </p>
                      <Badge 
                        className={`${
                          quote.status === 'accepted' ? 'bg-green-500' :
                          quote.status === 'rejected' ? 'bg-red-500' :
                          'bg-yellow-500'
                        } text-white capitalize`}
                      >
                        {quote.status}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700">{quote.quote_details}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}