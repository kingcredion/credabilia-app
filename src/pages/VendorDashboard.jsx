import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  DollarSign, Package, TrendingUp, ShieldCheck, Plus, Eye,
  Clock, MessageSquare, Star, BarChart3, Award, Edit,
  Archive, MoreVertical, Mail, Truck, ChevronDown, ChevronUp, RefreshCw
} from "lucide-react";
import CollapsibleKPISection from "../components/CollapsibleKPISection";
import DashboardFreshness from "../components/DashboardFreshness";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ShippingDialog from "../components/ShippingDialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import StripeFinanceSection from "@/components/StripeFinanceSection";
import { liveTransactions } from "@/lib/filterSimulated";
import { format, subDays, startOfDay } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

// Lazy load recharts — only pulled when analytics section is expanded
const LazyCharts = lazy(() => import("../components/VendorAnalyticsCharts"));

const CHART_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444'];

export default function VendorDashboard() {
  const [user, setUser] = useState(null);
  const [timeRange, setTimeRange] = useState("30");
  const [showShippingDialog, setShowShippingDialog] = useState(false);
  const [selectedItemForShipping, setSelectedItemForShipping] = useState(null);
  const [selectedTransactionForShipping, setSelectedTransactionForShipping] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showSecondaryKpis, setShowSecondaryKpis] = useState(false);

  // Freshness & refresh state
  const [coreDataLoaded, setCoreDataLoaded] = useState(false);
  const [coreLastUpdated, setCoreLastUpdated] = useState(null);
  const [isRefreshingCore, setIsRefreshingCore] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(console.error);
  }, []);

  // CORE data — always fetch, needed for primary KPIs
  const { data: myListings = [], isLoading } = useQuery({
    queryKey: ['vendor-listings', user?.email],
    queryFn: async () => {
      const items = await base44.entities.Item.filter({ vendor_email: user.email }, "-created_date");
      setCoreDataLoaded(true);
      setCoreLastUpdated(new Date().toISOString());
      return items;
    },
    enabled: !!user?.email && coreDataLoaded,
    initialData: [],
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 10 * 60 * 1000, // 10 min cache
  });

  const { data: myTransactions = [] } = useQuery({
    queryKey: ['vendor-transactions', user?.email],
    queryFn: async () => {
      const txns = await base44.entities.Transaction.filter({ vendor_email: user.email }, "-created_date");
      setCoreLastUpdated(new Date().toISOString());
      return txns;
    },
    enabled: !!user?.email && coreDataLoaded,
    initialData: [],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // CORE data — unread message COUNT (lightweight, always needed for header badge + KPI)
  const { data: unreadMessagesCount = 0 } = useQuery({
    queryKey: ['vendor-unread-count', user?.email],
    queryFn: async () => {
      const messages = await base44.entities.Message.filter({ receiver_email: user.email }, "-created_date");
      return messages.filter(m => !m.read).length;
    },
    enabled: !!user?.email && coreDataLoaded,
    initialData: 0,
    staleTime: 2 * 60 * 1000, // 2 min (more frequent, important for UX)
    gcTime: 5 * 60 * 1000,
  });

  // SECONDARY data — full message list & reviews deferred
  const { data: myMessages = [] } = useQuery({
    queryKey: ['vendor-messages', user?.email],
    queryFn: () => base44.entities.Message.filter({ receiver_email: user.email }, "-created_date", 10),
    enabled: !!user?.email && showSecondaryKpis,
    initialData: [],
    staleTime: 10 * 60 * 1000,
  });

  const { data: myReviews = [] } = useQuery({
    queryKey: ['vendor-reviews', user?.email],
    queryFn: () => base44.entities.Review.filter({ vendor_email: user.email }, "-created_date"),
    enabled: !!user?.email && showSecondaryKpis,
    initialData: [],
    staleTime: 10 * 60 * 1000,
  });

  const activeListings = myListings.filter(i => i.status === "active");
  const draftListings = myListings.filter(i => i.status === "draft");
  const soldListings = myListings.filter(i => i.status === "sold");
  const liveMyTransactions = liveTransactions(myTransactions);
  // Only count transactions that have cleared payment (exclude pending/cancelled)
  const completedTransactions = liveMyTransactions.filter(t =>
    ['paid', 'escrow', 'shipped', 'delivered', 'completed'].includes(t.status)
  );
  const totalRevenue = completedTransactions.reduce((sum, t) => sum + (t.sale_amount || 0), 0);
  const totalViews = myListings.reduce((sum, item) => sum + (item.views || 0), 0);
  const avgAuthScore = myListings.length > 0
    ? myListings.reduce((sum, item) => sum + (item.authenticity_meter || 0), 0) / myListings.length : 0;
  const avgPrice = soldListings.length > 0
    ? soldListings.reduce((sum, item) => sum + (item.price || 0), 0) / soldListings.length : 0;
  // unreadMessages now comes directly from core query (unreadMessagesCount)
  const avgReviewRating = myReviews.length > 0
    ? myReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / myReviews.length : 0;
  const canExport = user?.trust_score >= 0.75 && (user?.verified_sales || 0) >= 3;
  const exportProgress = Math.min(100, ((user?.verified_sales || 0) / 3) * 100);

  // Chart data — computed lazily (only needed when showAnalytics=true)
  const salesTrendData = useMemo(() => {
    if (!showAnalytics) return [];
    const days = parseInt(timeRange);
    const today = startOfDay(new Date());
    const dateMap = new Map();
    for (let i = days - 1; i >= 0; i--) {
      const date = startOfDay(subDays(today, i));
      const dateStr = format(date, 'MMM dd');
      dateMap.set(dateStr, { date: dateStr, sales: 0, revenue: 0 });
    }
    completedTransactions.forEach(transaction => {
      const transactionDate = startOfDay(new Date(transaction.created_date));
      const daysDiff = Math.floor((today - transactionDate) / (1000 * 60 * 60 * 24));
      if (daysDiff < days) {
        const dateStr = format(transactionDate, 'MMM dd');
        const existing = dateMap.get(dateStr);
        if (existing) { existing.sales += 1; existing.revenue += transaction.sale_amount || 0; }
      }
    });
    return Array.from(dateMap.values());
  }, [liveMyTransactions, timeRange, showAnalytics]);

  const bestSellingItems = useMemo(() => {
    const itemSales = new Map();
    completedTransactions.forEach(t => {
      if (!itemSales.has(t.item_id)) {
        itemSales.set(t.item_id, { itemId: t.item_id, title: t.item_title, revenue: 0, count: 0 });
      }
      const d = itemSales.get(t.item_id);
      d.revenue += t.sale_amount || 0;
      d.count += 1;
    });
    return Array.from(itemSales.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [liveMyTransactions]);

  const categoryData = useMemo(() => {
    if (!showAnalytics) return [];
    const catMap = new Map();
    myListings.forEach(item => {
      const cat = item.sport || 'Other';
      catMap.set(cat, (catMap.get(cat) || 0) + 1);
    });
    return Array.from(catMap.entries())
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [myListings, showAnalytics]);

  const totalItems = categoryData.reduce((s, d) => s + d.value, 0);

  // Manual refresh handler
  const handleRefreshCore = async () => {
    setIsRefreshingCore(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['vendor-listings', user?.email] });
      await queryClient.invalidateQueries({ queryKey: ['vendor-transactions', user?.email] });
      setCoreLastUpdated(new Date().toISOString());
    } finally {
      setIsRefreshingCore(false);
    }
  };

  // Auto-load core data on mount
  useEffect(() => {
    if (user?.email && !coreDataLoaded) {
      setCoreDataLoaded(true);
    }
  }, [user?.email, coreDataLoaded]);

  return (
    <div className="min-h-screen bg-background dark:bg-background/95 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header with Freshness */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground">Vendor Dashboard</h1>
              <p className="text-sm text-gray-500 dark:text-muted-foreground">Manage your listings and track performance</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Link to={createPageUrl("CreateListing")} className="flex-1 sm:flex-none">
                <Button className="bg-orange-600 hover:bg-orange-700 w-full">
                  <Plus className="w-4 h-4 mr-2" /> Create Listing
                </Button>
              </Link>
              <Link to={createPageUrl("Messages")} className="relative">
                <Button variant="outline">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Messages
                  {unreadMessagesCount > 0 && (
                    <Badge className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 h-4">{unreadMessagesCount}</Badge>
                  )}
                </Button>
              </Link>
            </div>
          </div>

          {/* Freshness Control */}
          <DashboardFreshness
            lastUpdated={coreLastUpdated}
            isRefreshing={isRefreshingCore}
            onRefresh={handleRefreshCore}
            isInitial={!coreDataLoaded}
            compact
          />
        </div>

        {/* Stripe Finance */}
        {user && <StripeFinanceSection user={user} />}

        {/* Trust Score — compact */}
        {user && (
          <Card className="bg-gradient-to-r from-orange-600 to-orange-700 text-white border-0">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Trust Score</p>
                    <p className="text-orange-100 text-xs">{((user.trust_score || 0.5) * 100).toFixed(0)}% trusted by the community</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{((user.trust_score || 0.5) * 100).toFixed(0)}%</p>
                  {canExport ? (
                    <Badge className="bg-white text-orange-600 font-semibold text-[10px]">✅ Export Eligible</Badge>
                  ) : (
                    <p className="text-orange-200 text-[10px]">{user.verified_sales || 0}/3 verified sales</p>
                  )}
                </div>
              </div>
              {!canExport && (
                <Progress value={exportProgress} className="h-1.5 mt-3 bg-orange-500" />
              )}
            </CardContent>
          </Card>
        )}

        {/* PRIMARY KPI Grid — most important metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard icon={DollarSign} iconColor="text-green-600" label="Revenue" value={`$${totalRevenue.toLocaleString()}`} sub={`${completedTransactions.length} sales`} />
          <KpiCard icon={Package} iconColor="text-green-600" label="Active" value={activeListings.length} sub="listings live" />
          <KpiCard icon={MessageSquare} iconColor="text-blue-600" label="Unread" value={unreadMessagesCount} sub="messages" />
          <KpiCard icon={ShieldCheck} iconColor="text-orange-600" label="Trust Score" value={`${((user?.trust_score || 0.5) * 100).toFixed(0)}%`} sub="community verified" />
        </div>

        {/* SECONDARY KPI Section — collapsible, loaded on demand */}
        <CollapsibleKPISection
          title="More Metrics"
          icon={BarChart3}
          defaultExpanded={false}
          onExpand={() => setShowSecondaryKpis(true)}
          isLoading={false}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard icon={TrendingUp} iconColor="text-blue-600" label="Avg. Sale Price" value={`$${avgPrice.toFixed(0)}`} sub="per sold item" />
            <KpiCard icon={Eye} iconColor="text-purple-600" label="Total Views" value={totalViews.toLocaleString()} sub="across listings" />
            <KpiCard icon={Clock} iconColor="text-gray-500" label="Drafts" value={draftListings.length} sub="unpublished" />
            <KpiCard icon={Award} iconColor="text-yellow-600" label="Rating" value={avgReviewRating > 0 ? `★ ${avgReviewRating.toFixed(1)}` : "—"} sub={`${myReviews.length} reviews`} />
          </div>
        </CollapsibleKPISection>

        {/* Top Performing Items — always visible */}
        {bestSellingItems.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-orange-600" /> Top Performing Items
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {bestSellingItems.map((item, idx) => (
                  <div key={item.itemId} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <span className="text-sm font-bold text-orange-600 w-5">#{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{item.title || 'Untitled'}</p>
                      <p className="text-xs text-muted-foreground">{item.count} {item.count === 1 ? 'sale' : 'sales'}</p>
                    </div>
                    <p className="font-bold text-green-600 text-sm">${item.revenue.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Analytics — collapsible / on-demand */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between w-full">
              <button
                className="flex items-center justify-between flex-1 text-left"
                onClick={() => setShowAnalytics(v => !v)}
              >
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-orange-600" /> Sales Analytics & Category Breakdown
                </CardTitle>
                {showAnalytics
                  ? <ChevronUp className="w-4 h-4 text-gray-400" />
                  : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
            </div>
            {showAnalytics && (
              <p className="text-xs text-muted-foreground mt-1 ml-6">
                Uses current listing and transaction data — refresh above to see latest
              </p>
            )}
          </CardHeader>

          {showAnalytics && (
            <CardContent className="pt-0 space-y-6">
              {/* Time Range Selector */}
              <div className="flex gap-2">
                {["7", "30", "90"].map(r => (
                  <Button
                    key={r}
                    variant={timeRange === r ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTimeRange(r)}
                    className={timeRange === r ? "bg-orange-600" : ""}
                  >
                    {r}D
                  </Button>
                ))}
              </div>

              {/* Lazy-loaded charts */}
              <Suspense fallback={<div className="h-64 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div></div>}>
                <LazyCharts salesTrendData={salesTrendData} />
              </Suspense>

              {/* Category breakdown as progress bars — no pie chart */}
              {categoryData.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-3">Listings by Category</p>
                  <div className="space-y-2">
                    {categoryData.map((cat, idx) => (
                      <div key={cat.name} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-20 truncate">{cat.name}</span>
                        <div className="flex-1 bg-gray-100 dark:bg-muted rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${totalItems > 0 ? (cat.value / totalItems) * 100 : 0}%`, backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                          />
                        </div>
                        <span className="text-xs font-medium text-foreground w-8 text-right">{cat.value}</span>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {totalItems > 0 ? `${Math.round((cat.value / totalItems) * 100)}%` : '0%'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Inventory Tabs */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4 dark:bg-white/[0.05] dark:border dark:border-white/10">
            <TabsTrigger value="active">Active ({activeListings.length})</TabsTrigger>
            <TabsTrigger value="drafts">Drafts ({draftListings.length})</TabsTrigger>
            <TabsTrigger value="sold">Sold ({soldListings.length})</TabsTrigger>
            <TabsTrigger value="all">All ({myListings.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active"><ItemsTable items={activeListings} isLoading={isLoading} emptyMessage="No active listings" /></TabsContent>
          <TabsContent value="drafts"><ItemsTable items={draftListings} isLoading={isLoading} emptyMessage="No draft listings" /></TabsContent>
          <TabsContent value="sold">
            <ItemsTable items={soldListings} transactions={myTransactions} isLoading={isLoading} emptyMessage="No sold items yet" showShippingAction={true}
              onShip={(item, transaction) => { setSelectedItemForShipping(item); setSelectedTransactionForShipping(transaction); setShowShippingDialog(true); }}
            />
          </TabsContent>
          <TabsContent value="all"><ItemsTable items={myListings} isLoading={isLoading} emptyMessage="No listings yet" /></TabsContent>
        </Tabs>
      </div>

      {selectedItemForShipping && (
        <ShippingDialog
          open={showShippingDialog}
          onClose={() => { setShowShippingDialog(false); setSelectedItemForShipping(null); setSelectedTransactionForShipping(null); }}
          item={selectedItemForShipping}
          transaction={selectedTransactionForShipping}
          user={user}
          onLabelCreated={() => {}}
        />
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, iconColor, label, value, sub }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <p className="text-xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ItemsTable({ items, transactions, isLoading, emptyMessage, showShippingAction, onShip }) {
  if (isLoading) {
    return (
      <Card><CardContent className="p-6">
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="animate-pulse flex gap-4">
              <div className="w-16 h-16 bg-gray-200 rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </CardContent></Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card><CardContent className="p-12 text-center">
        <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-gray-900 dark:text-foreground mb-2">{emptyMessage}</h3>
        <Link to={createPageUrl("CreateListing")}>
          <Button className="bg-orange-600 hover:bg-orange-700 mt-2">
            <Plus className="w-4 h-4 mr-2" /> Create Listing
          </Button>
        </Link>
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-white/[0.04] border-b border-gray-200 dark:border-white/10">
              <tr>
                <th className="text-left p-4 text-xs font-semibold text-gray-600 dark:text-muted-foreground uppercase">Item</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-600 dark:text-muted-foreground uppercase hidden sm:table-cell">Status</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-600 dark:text-muted-foreground uppercase">Price</th>
                <th className="text-left p-4 text-xs font-semibold text-gray-600 dark:text-muted-foreground uppercase hidden md:table-cell">Views</th>
                <th className="text-right p-4 text-xs font-semibold text-gray-600 dark:text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-border">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-muted/50 transition-colors">
                  <td className="p-4">
                    <Link to={createPageUrl(`ItemDetails?id=${item.id}`)} className="flex items-center gap-3 hover:text-orange-600 transition-colors">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        {item.images?.[0]
                          ? <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
                          : <Package className="w-5 h-5 text-gray-400 m-auto mt-2.5" />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm text-gray-900 dark:text-foreground truncate">{item.title}</h4>
                        <p className="text-[11px] text-gray-500">{format(new Date(item.created_date), 'MMM dd, yyyy')}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="p-4 hidden sm:table-cell">
                    <div className="flex flex-col gap-1">
                      <Badge className={item.status === 'active' ? 'bg-green-500 text-white' : item.status === 'sold' ? 'bg-blue-500 text-white' : item.status === 'draft' ? 'bg-gray-500 text-white' : 'bg-orange-500 text-white'}>
                        {item.status === 'active' ? 'Live' : item.status === 'sold' ? 'Sold' : item.status === 'draft' ? 'Draft' : item.status}
                      </Badge>
                      {item.status === 'active' && !item.visible_to_public && (
                        <Badge variant="outline" className="text-[10px] border-orange-400 text-orange-700">Pending Audit</Badge>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="font-semibold text-sm text-gray-900 dark:text-foreground">${item.price?.toLocaleString() || '—'}</span>
                  </td>
                  <td className="p-4 hidden md:table-cell">
                    <div className="flex items-center gap-1 text-gray-600 dark:text-muted-foreground">
                      <Eye className="w-3.5 h-3.5" /><span className="text-sm">{item.views || 0}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={createPageUrl(`EditListing?id=${item.id}`)}><Button variant="ghost" size="sm"><Edit className="w-4 h-4" /></Button></Link>
                      <Link to={createPageUrl(`ItemDetails?id=${item.id}`)}><Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button></Link>
                      {showShippingAction && item.status === 'sold' && (() => {
                        const t = transactions?.find(tx => tx.item_id === item.id);
                        // Only show Ship when payment confirmed and label not yet created
                        const paymentConfirmed = t && ['paid', 'escrow', 'shipped', 'delivered', 'completed'].includes(t.status);
                        const needsLabel = !t?.shipping_status || t?.shipping_status === 'pending';
                        return (paymentConfirmed && needsLabel) ? (
                          <Button variant="default" size="sm" className="bg-green-600 hover:bg-green-700 ml-1"
                            onClick={() => onShip(item, t)}>
                            <Truck className="w-4 h-4 mr-1" /> Ready to Ship
                          </Button>
                        ) : null;
                      })()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}