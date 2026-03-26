import React from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { BarChart3 } from "lucide-react";

export default function VendorAnalyticsCharts({ salesTrendData }) {
  const hasSales = salesTrendData.some(d => d.sales > 0);

  if (!hasSales) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">No sales data in this period</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold text-foreground mb-3">Sales Trend</p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={salesTrendData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }} />
          <Line type="monotone" dataKey="sales" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} name="Sales" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}