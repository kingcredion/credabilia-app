import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * CollapsibleKPISection
 * 
 * Renders a collapsible section for secondary/less-critical KPI cards.
 * Defaults to collapsed state.
 * Optional: defer data loading until expansion via onExpand callback.
 * 
 * Props:
 * - title: Section title
 * - icon: Lucide icon component
 * - defaultExpanded?: boolean (default: false)
 * - onExpand?: () => void — called when section is expanded
 * - isLoading?: boolean
 * - children: KPI cards or content
 */
export default function CollapsibleKPISection({
  title,
  icon: Icon,
  defaultExpanded = false,
  onExpand,
  isLoading = false,
  children
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (isExpanded && onExpand) {
      onExpand();
    }
  }, [isExpanded, onExpand]);

  const handleToggle = () => {
    setIsExpanded(prev => !prev);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          className="flex items-center justify-between w-full text-left"
          onClick={handleToggle}
        >
          <CardTitle className="text-base flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4" />}
            {title}
          </CardTitle>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-current"></div>
            </div>
          ) : (
            children
          )}
        </CardContent>
      )}
    </Card>
  );
}