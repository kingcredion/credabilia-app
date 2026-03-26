import React from "react";
import { RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

/**
 * DashboardFreshness
 * 
 * Displays data freshness info and manual refresh control.
 * 
 * Props:
 * - lastUpdated: ISO timestamp or null
 * - isRefreshing: bool
 * - onRefresh: () => void
 * - isInitial: bool — show "Load data" vs "Refresh"
 * - compact: bool — show condensed version for inline use
 */
export default function DashboardFreshness({
  lastUpdated,
  isRefreshing,
  onRefresh,
  isInitial = false,
  compact = false
}) {
  const getFreshnessText = () => {
    if (!lastUpdated) return "Data not loaded";
    try {
      const date = new Date(lastUpdated);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return "Unknown";
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {isInitial ? "Not loaded" : `Last updated ${getFreshnessText()}`}
        </span>
        <Button
          onClick={onRefresh}
          disabled={isRefreshing}
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
        >
          {isRefreshing ? (
            <>
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              Refreshing...
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </>
          )}
        </Button>
      </div>
    );
  }

  // Full version
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <div className="flex items-center gap-2 flex-1">
        <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            {isInitial ? "Dashboard data not loaded yet" : "Data freshness"}
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-300">
            {isInitial ? "Load data to see metrics" : `Last updated ${getFreshnessText()}`}
          </p>
        </div>
      </div>
      <Button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="bg-blue-600 hover:bg-blue-700 text-white"
        size="sm"
      >
        {isRefreshing ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Refreshing...
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            {isInitial ? "Load data" : "Refresh"}
          </>
        )}
      </Button>
    </div>
  );
}