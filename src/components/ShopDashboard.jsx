import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Package, 
  DollarSign, 
  TrendingUp, 
  Eye, 
  Plus, 
  Search, 
  Filter,
  ShoppingBag,
  ListFilter
} from "lucide-react";
import ProfileItemCard from "./ProfileItemCard";

export default function ShopDashboard({ items = [], user }) {
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const stats = useMemo(() => {
    const totalItems = items.length;
    const activeItems = items.filter(i => i.status === 'active').length;
    const soldItems = items.filter(i => i.status === 'sold').length;
    const totalViews = items.reduce((acc, curr) => acc + (curr.views || 0), 0);
    const estimatedRevenue = items
      .filter(i => i.status === 'sold' && i.price)
      .reduce((acc, curr) => acc + curr.price, 0);

    return {
      totalItems,
      activeItems,
      soldItems,
      totalViews,
      estimatedRevenue
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesStatus = filterStatus === "all" || item.status === filterStatus;
      const matchesSearch = !searchQuery || 
        item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [items, filterStatus, searchQuery]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Welcome / Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-blue-600" />
            Shop Dashboard
          </h2>
          <p className="text-gray-500">Manage your store, track sales, and view analytics.</p>
        </div>
        <Link to={createPageUrl("CreateListing")}>
          <Button className="bg-blue-600 hover:bg-blue-700 w-full md:w-auto shadow-md hover:shadow-lg transition-all">
            <Plus className="w-4 h-4 mr-2" />
            Create New Listing
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100 hover:shadow-md transition-all">
          <CardContent className="p-4 flex flex-col items-center text-center justify-center h-full">
            <div className="p-2 bg-blue-100 rounded-full mb-2">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm text-gray-500 font-medium">Active Listings</p>
            <p className="text-2xl font-bold text-gray-900">{stats.activeItems}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-white border-green-100 hover:shadow-md transition-all">
          <CardContent className="p-4 flex flex-col items-center text-center justify-center h-full">
            <div className="p-2 bg-green-100 rounded-full mb-2">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-sm text-gray-500 font-medium">Items Sold</p>
            <p className="text-2xl font-bold text-gray-900">{stats.soldItems}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-100 hover:shadow-md transition-all">
          <CardContent className="p-4 flex flex-col items-center text-center justify-center h-full">
            <div className="p-2 bg-purple-100 rounded-full mb-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-sm text-gray-500 font-medium">Est. Revenue</p>
            <p className="text-2xl font-bold text-gray-900">${stats.estimatedRevenue.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-white border-orange-100 hover:shadow-md transition-all">
          <CardContent className="p-4 flex flex-col items-center text-center justify-center h-full">
            <div className="p-2 bg-orange-100 rounded-full mb-2">
              <Eye className="w-5 h-5 text-orange-600" />
            </div>
            <p className="text-sm text-gray-500 font-medium">Total Views</p>
            <p className="text-2xl font-bold text-gray-900">{stats.totalViews.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input 
            placeholder="Search your listings..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white border-gray-200"
          />
        </div>
        
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          {[
            { id: 'all', label: 'All Items' },
            { id: 'active', label: 'Active' },
            { id: 'sold', label: 'Sold' },
            { id: 'draft', label: 'Drafts' }
          ].map((status) => (
            <button
              key={status.id}
              onClick={() => setFilterStatus(status.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                filterStatus === status.id
                  ? "bg-white text-blue-600 shadow-sm ring-1 ring-gray-200"
                  : "text-gray-600 hover:bg-white/50"
              }`}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      {/* Items Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">
            {filteredItems.length} {filteredItems.length === 1 ? 'Listing' : 'Listings'}
          </h3>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <ListFilter className="w-4 h-4" />
            <span>Sorted by Newest</span>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-200">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No listings found</h3>
            <p className="text-gray-500 mb-6">
              {searchQuery || filterStatus !== 'all' 
                ? "Try adjusting your filters or search terms." 
                : "Start selling by creating your first listing!"}
            </p>
            {filterStatus === 'all' && !searchQuery && (
              <Link to={createPageUrl("CreateListing")}>
                <Button>Create Listing</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* Create New Card (only visible when showing all or active and no search) */}
            {filterStatus === 'all' && !searchQuery && (
              <Link 
                to={createPageUrl("CreateListing")}
                className="group border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all flex flex-col items-center justify-center p-6 text-center h-full min-h-[300px]"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Add New Item</h3>
                <p className="text-sm text-gray-500">List an item for sale</p>
              </Link>
            )}

            {filteredItems.map((item) => (
              <ProfileItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}