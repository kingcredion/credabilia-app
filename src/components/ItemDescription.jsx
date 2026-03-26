import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ItemDescription({ description }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const words = description.split(" ");
  const isLong = words.length > 50;

  const displayText = isLong && !isExpanded
    ? words.slice(0, 50).join(" ") + "..."
    : description;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Description</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
          {displayText}
        </p>
        {isLong && (
          <Button
            variant="link"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-0 mt-3 text-blue-600 hover:text-blue-700"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-1" /> Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1" /> View More
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}