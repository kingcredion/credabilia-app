import React, { useState, useMemo, lazy, Suspense } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, DollarSign, Users, ShoppingBag, TrendingUp, CreditCard,
  Activity, ShieldAlert, Award, Calendar as CalendarIcon, Info, HelpCircle,
  ChevronDown, ChevronUp, BarChart3, Zap
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, subDays, isAfter, startOfDay } from "date-fns";
import { liveTransactions } from "@/lib/filterSimulated";
import VendorBadge from "../components/VendorBadge";

// Lazy load recharts only when a chart section is expanded
const LazyAdminCharts = lazy(() => import("../components/AdminAnalyticsCharts"));

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState("30");
  const [showRevenueDetails, setShowRevenueDetails] = useState(false);
  const [showTrendChart, setShowTrendChart] = useState(false);
  const [showInventoryChart, setShowInventoryChart] = useState(false);
  const [showSecondaryKpis, setShowSecondaryKpis] = useState(false);

  const { data: transactions = [] } = useQuery({
    queryKey: ['admin-analytics-transactions'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 2000)
  });
  const { data: users = [] } = useQuery({
    queryKey: ['admin-analytics-users'],
    queryFn: () => base44.entities.User.list('-created_date', 2000)
  });
  const { data: items = [] } = useQuery({
    queryKey: ['admin-analytics-items'],
    queryFn: () => base44.entities.Item.list('-created_date', 2000)
  });
  const { data: votes = [] } = useQuery({
    queryKey: ['admin-analytics-votes'],
    queryFn: () => base44.entities.Vote.list('-created_date', 2000)
  });

  const analytics = useMemo(() => {
    const now = new Date();
    const startDate = subDays(startOfDay(now), parseInt(timeRange));
    const rangeTransactions = liveTransactions(transactions).filter(t => isAfter(new Date(t.created_date), startDate));
    const rangeUsers = users.filter(u => isAfter(new Date(u.created_date), startDate));
    const rangeItems = items.filter(i => isAfter(new Date(i.created_date), startDate));
    const rangeVotes = votes.filter(v => isAfter(new Date(v.created_date), startDate));

    const totalSales = rangeTransactions.reduce((sum, t) => sum + (t.sale_amount || 0), 0);
    const totalRevenue = rangeTransactions.reduce((sum, t) => sum + (t.platform_fee_amount || 0), 0);
    const avgOrderValue = rangeTransactions.length > 0 ? totalSales / rangeTransactions.length : 0;

    const revenueBreakdown = { standard: { count: 0, volume: 0, fees: 0 }, exempt: { count: 0, volume: 0, fees: 0 }, other: { count: 0, volume: 0, fees: 0 }, topExemptVendors: new Map() };
    rangeTransactions.forEach(t => {
      const sale = t.sale_amount || 0;
      const fee = t.platform_fee_amount || 0;
      const rate = Math.round((sale > 0 ? (fee / sale) * 100 : 0) * 10) / 10;
      if (rate === 12) { revenueBreakdown.standard.count++; revenueBreakdown.standard.volume += sale; revenueBreakdown.standard.fees += fee; }
      else if (rate === 0) {
        revenueBreakdown.exempt.count++; revenueBreakdown.exempt.volume += sale;
        if (t.vendor_email) revenueBreakdown.topExemptVendors.set(t.vendor_email, (revenueBreakdown.topExemptVendors.get(t.vendor_email) || 0) + sale);
      } else { revenueBreakdown.other.count++; revenueBreakdown.other.volume += sale; revenueBreakdown.other.fees += fee; }
    });
    const sortedExemptVendors = Array.from(revenueBreakdown.topExemptVendors.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([email, volume]) => ({ email, volume }));

    const soldCount = rangeItems.filter(i => i.status === 'sold').length;
    const sellThroughRate = rangeItems.length > 0 ? (soldCount / rangeItems.length) * 100 : 0;

    // Daily chart data (only computed when needed via lazy)
    const dailyDataMap = new Map();
    for (let i = 0; i <= parseInt(timeRange); i++) {
      const d = subDays(now, i);
      const dateKey = format(d, 'yyyy-MM-dd');
      dailyDataMap.set(dateKey, { date: format(d, 'MMM dd'), fullDate: dateKey, sales: 0, revenue: 0, users: 0 });
    }
    rangeTransactions.forEach(t => {
      const key = format(new Date(t.created_date), 'yyyy-MM-dd');
      if (dailyDataMap.has(key)) { const e = dailyDataMap.get(key); e.sales += (t.sale_amount || 0); e.revenue += (t.platform_fee_amount || 0); }
    });
    rangeUsers.forEach(u => {
      const key = format(new Date(u.created_date), 'yyyy-MM-dd');
      if (dailyDataMap.has(key)) dailyDataMap.get(key).users += 1;
    });
    const chartData = Array.from(dailyDataMap.values()).sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));

    // Category revenue
    const categoryRevenue = { 'Sports Memorabilia': 0, 'Fine Art': 0, 'Entertainment': 0, 'Historical': 0, 'Comics & Pop Culture': 0, 'Other': 0 };
    const getDisplayCategory = (item) => {
      if (!item) return 'Other';
      const m = item.media_category || [];
      if (m.includes('sports') || item.sport) return 'Sports Memorabilia';
      if (m.includes('fine_art')) return 'Fine Art';
      if (m.includes('entertainment') || m.includes('music')) return 'Entertainment';
      if (m.includes('historical')) return 'Historical';
      if (m.includes('comic_pop_culture')) return 'Comics & Pop Culture';
      return 'Other';
    };
    rangeTransactions.forEach(t => {
      const item = items.find(i => i.id === t.item_id);
      const cat = getDisplayCategory(item);
      categoryRevenue[cat] = (categoryRevenue[cat] || 0) + (t.sale_amount || 0);
    });
    if (categoryRevenue['Other'] === 0) delete categoryRevenue['Other'];
    const categoryData = Object.entries(categoryRevenue).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    // Status distribution
    const statusCounts = items.reduce((acc, item) => {
      const s = item.moderation_status === 'flagged' ? 'Flagged' : item.status.charAt(0).toUpperCase() + item.status.slice(1);
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    // Top vendors
    const vendorPerformance = {};
    rangeTransactions.forEach(t => { vendorPerformance[t.vendor_email] = (vendorPerformance[t.vendor_email] || 0) + (t.sale_amount || 0); });
    const topVendors = Object.entries(vendorPerformance)
      .map(([email, revenue]) => ({ email, revenue, user: users.find(u => u.email === email) }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const topItems = [...items].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
    const totalCategoryRevenue = categoryData.reduce((s, d) => s + d.value, 0);

    return { totalSales, totalRevenue, avgOrderValue, sellThroughRate, newUsersCount: rangeUsers.length, totalVotes: rangeVotes.length, chartData, categoryData, statusData, topVendors, topItems, revenueBreakdown: { ...revenueBreakdown, sortedExemptVendors }, totalCategoryRevenue };
  }, [transactions, users, items, votes, timeRange]);

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 40%, #24243e 100%)" }}>
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <button onClick={() => navigate(-1)} className="flex items-center text-gray-300 hover:text-white transition-colors text-sm mb-1">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </button>
            <h1 className="text-2xl font-bold text-white">Platform Analytics</h1>
            <p className="text-gray-400 text-sm">Marketplace performance overview</p>
          </div>
          <div className="flex items-center gap-2 bg-white/10 border border-white/20 px-3 py-2 rounded-lg">
            <CalendarIcon className="w-4 h-4 text-gray-300" />
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="border-0 bg-transparent text-sm font-medium text-white shadow-none focus:ring-0 min-w-[140px]">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 Days</SelectItem>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 3 Months</SelectItem>
                <SelectItem value="365">Last Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            color="green" icon={DollarSign} label="Platform Revenue"
            value={`$${analytics.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            sub={`${(analytics.totalSales > 0 ? (analytics.totalRevenue / analytics.totalSales * 100).toFixed(1) : 0)}% take rate`}
            onClick={() => setShowRevenueDetails(true)}
            clickable
          />
          <KpiCard
            color="blue" icon={CreditCard} label="Gross Merch Vol"
            value={`$${analytics.totalSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            sub={`$${analytics.avgOrderValue.toFixed(0)} avg order`}
          />
          <KpiCard
            color="purple" icon={Users} label="User Growth"
            value={`+${analytics.newUsersCount}`}
            sub={`${users.length} total users`}
          />
          <KpiCard
            color="orange" icon={Activity} label="Votes Cast"
            value={analytics.totalVotes.toLocaleString()}
            sub="community engagement"
          />
        </div>

        {/* SECONDARY KPIs — collapsible, on-demand */}
        {showSecondaryKpis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBadge label="Sell-through Rate" value={`${analytics.sellThroughRate.toFixed(1)}%`} color="green" />
            <StatBadge label="Total Items" value={items.length.toLocaleString()} color="blue" />
            <StatBadge label="Active Items" value={(analytics.statusData.find(s => s.name === 'Active')?.value || 0).toLocaleString()} color="purple" />
            <StatBadge label="Flagged" value={(analytics.statusData.find(s => s.name === 'Flagged')?.value || 0).toLocaleString()} color="red" />
          </div>
        )}
        {!showSecondaryKpis && (
          <Card className="bg-white/10 backdrop-blur-md border-white/20">
            <CardContent className="p-4">
              <button
                onClick={() => setShowSecondaryKpis(true)}
                className="w-full text-left text-white hover:text-gray-100 transition-colors flex items-center gap-2"
              >
                <span className="text-sm font-medium">View secondary metrics (Sell-through, Item counts, Flagged)</span>
                <ChevronDown className="w-4 h-4 ml-auto text-gray-400" />
              </button>
            </CardContent>
          </Card>
        )}

        {/* Category Revenue — ranked list with progress bars (no pie chart) */}
        <Card className="bg-white/10 backdrop-blur-md border-white/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" /> Revenue by Category
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {analytics.categoryData.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No sales data in this period</p>
            ) : (
              <div className="space-y-2">
                {analytics.categoryData.map((cat, idx) => (
                  <div key={cat.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className="text-sm text-gray-200 w-36 truncate">{cat.name}</span>
                    <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${analytics.totalCategoryRevenue > 0 ? (cat.value / analytics.totalCategoryRevenue) * 100 : 0}%`, backgroundColor: COLORS[idx % COLORS.length] }} />
                    </div>
                    <span className="text-sm font-semibold text-white w-20 text-right">${cat.value.toLocaleString()}</span>
                    <span className="text-xs text-gray-400 w-10 text-right">
                      {analytics.totalCategoryRevenue > 0 ? `${Math.round((cat.value / analytics.totalCategoryRevenue) * 100)}%` : '0%'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue & Activity Trend — collapsible */}
        <Card className="bg-white/10 backdrop-blur-md border-white/20">
          <CardHeader className="pb-2">
            <button className="flex items-center justify-between w-full text-left" onClick={() => setShowTrendChart(v => !v)}>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" /> Revenue & Activity Trend
              </CardTitle>
              {showTrendChart ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
          </CardHeader>
          {showTrendChart && (
            <CardContent className="pt-2">
              <Suspense fallback={<div className="h-64 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div></div>}>
                <LazyAdminCharts chartData={analytics.chartData} />
              </Suspense>
            </CardContent>
          )}
        </Card>

        {/* Inventory Health — collapsible */}
        <Card className="bg-white/10 backdrop-blur-md border-white/20">
          <CardHeader className="pb-2">
            <button className="flex items-center justify-between w-full text-left" onClick={() => setShowInventoryChart(v => !v)}>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-gray-400" /> Inventory Health
              </CardTitle>
              {showInventoryChart ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {/* Show compact summary in header always */}
            <div className="flex flex-wrap gap-2 mt-2">
              {analytics.statusData.slice(0, 4).map((s, i) => (
                <Badge key={s.name} className="text-[10px] px-2" style={{
                  backgroundColor: s.name === 'Flagged' ? '#ef4444' : s.name === 'Pending' ? '#f59e0b' : s.name === 'Active' ? '#10b981' : '#6b7280',
                  color: 'white'
                }}>
                  {s.name}: {s.value}
                </Badge>
              ))}
            </div>
          </CardHeader>
          {showInventoryChart && (
            <CardContent>
              <div className="space-y-2">
                {analytics.statusData.map(s => (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="text-sm text-gray-300 w-24">{s.name}</span>
                    <div className="flex-1 bg-white/10 rounded-full h-2.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${Math.max((s.value / (items.length || 1)) * 100, 2)}%`,
                        backgroundColor: s.name === 'Flagged' ? '#ef4444' : s.name === 'Pending' ? '#f59e0b' : s.name === 'Active' ? '#10b981' : '#6b7280'
                      }} />
                    </div>
                    <span className="text-sm font-bold text-white w-10 text-right">{s.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Top Vendors & Top Items — separate operational cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-white/10 backdrop-blur-md border-white/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-yellow-400" /> Top Vendors
              </CardTitle>
              <CardDescription className="text-gray-400 text-xs">By revenue in period</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.topVendors.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No sales data yet</p>
              ) : (
                <div className="space-y-3">
                  {analytics.topVendors.map((vendor, idx) => (
                    <div key={vendor.email} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 w-4">{idx + 1}</span>
                        <VendorBadge vendor={vendor.user || { email: vendor.email }} size="sm" showRating={false} clickable={false} />
                      </div>
                      <span className="font-semibold text-sm text-white">${vendor.revenue.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur-md border-white/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" /> Most Viewed Items
              </CardTitle>
              <CardDescription className="text-gray-400 text-xs">All-time popularity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analytics.topItems.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-400 w-4">#{idx + 1}</span>
                    <div className="w-8 h-8 rounded bg-white/10 overflow-hidden flex-shrink-0">
                      {item.images?.[0]
                        ? <img src={item.images[0]} className="w-full h-full object-cover" alt="" />
                        : <ShoppingBag className="w-4 h-4 text-gray-400 m-auto mt-2" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{item.title}</p>
                      <p className="text-xs text-gray-400">{item.views || 0} views</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Revenue Details Dialog */}
        <Dialog open={showRevenueDetails} onOpenChange={setShowRevenueDetails}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-600" /> Revenue Breakdown</DialogTitle>
              <DialogDescription>Detailed analysis of platform take rates and fee distribution.</DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Standard Sales</p>
                  <p className="text-xl font-bold mt-1">{analytics.revenueBreakdown.standard.count}</p>
                  <p className="text-xs text-gray-500">transactions</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg text-center">
                  <p className="text-xs text-green-600 uppercase tracking-wide">Total Fees</p>
                  <p className="text-xl font-bold text-green-700 mt-1">${analytics.revenueBreakdown.standard.fees.toLocaleString()}</p>
                  <p className="text-xs text-green-600">collected</p>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <p className="text-xs text-blue-600 uppercase tracking-wide">Effective Rate</p>
                  <p className="text-xl font-bold text-blue-700 mt-1">{analytics.totalSales > 0 ? (analytics.totalRevenue / analytics.totalSales * 100).toFixed(2) : 0}%</p>
                  <p className="text-xs text-blue-600">blended</p>
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Fee Tier</th>
                      <th className="px-4 py-3 text-right font-medium">Volume</th>
                      <th className="px-4 py-3 text-right font-medium">Count</th>
                      <th className="px-4 py-3 text-right font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500" /><span className="font-medium">Standard (12%)</span></div></td>
                      <td className="px-4 py-3 text-right text-gray-600">${analytics.revenueBreakdown.standard.volume.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{analytics.revenueBreakdown.standard.count}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">+${analytics.revenueBreakdown.standard.fees.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="font-medium">Founder / Exempt (0%)</span></div></td>
                      <td className="px-4 py-3 text-right text-gray-600">${analytics.revenueBreakdown.exempt.volume.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{analytics.revenueBreakdown.exempt.count}</td>
                      <td className="px-4 py-3 text-right text-gray-400">$0</td>
                    </tr>
                    {analytics.revenueBreakdown.other.count > 0 && (
                      <tr>
                        <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500" /><span className="font-medium">Other Rates</span></div></td>
                        <td className="px-4 py-3 text-right text-gray-600">${analytics.revenueBreakdown.other.volume.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{analytics.revenueBreakdown.other.count}</td>
                        <td className="px-4 py-3 text-right font-medium text-green-600">+${analytics.revenueBreakdown.other.fees.toLocaleString()}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {analytics.revenueBreakdown.sortedExemptVendors.length > 0 && (
                <div className="bg-blue-50/50 rounded-lg p-4 border border-blue-100">
                  <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2"><HelpCircle className="w-4 h-4" /> Top Exempt Volume Drivers</h4>
                  <div className="space-y-2">
                    {analytics.revenueBreakdown.sortedExemptVendors.map((vendor, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-blue-700">{vendor.email}</span>
                        <span className="font-medium text-blue-900">${vendor.volume.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function KpiCard({ color, icon: Icon, label, value, sub, onClick, clickable }) {
  const colorMap = { green: '#10b981', blue: '#3b82f6', purple: '#8b5cf6', orange: '#f59e0b', red: '#ef4444' };
  return (
    <Card
      className={`bg-white/10 backdrop-blur-md border-white/20 text-white shadow-lg hover:shadow-xl transition-all ${clickable ? 'cursor-pointer hover:bg-white/15' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <p className="text-xs font-medium text-gray-300">{label}</p>
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${colorMap[color]}20` }}>
            <Icon className="w-4 h-4" style={{ color: colorMap[color] }} />
          </div>
        </div>
        <h3 className="text-xl font-bold text-white">{value}</h3>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        {clickable && <p className="text-[10px] text-gray-500 mt-1">Click for details →</p>}
      </CardContent>
    </Card>
  );
}

function StatBadge({ label, value, color }) {
  const colorMap = { green: 'text-green-400 bg-green-400/10 border-green-400/30', blue: 'text-blue-400 bg-blue-400/10 border-blue-400/30', purple: 'text-purple-400 bg-purple-400/10 border-purple-400/30', red: 'text-red-400 bg-red-400/10 border-red-400/30' };
  return (
    <div className={`rounded-lg px-4 py-3 border text-center ${colorMap[color]}`}>
      <p className="text-xs opacity-70 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}