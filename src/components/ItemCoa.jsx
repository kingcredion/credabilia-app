import React, { useState } from "react";
import { FileCheck, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ItemCoa({ coaCertificates }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!coaCertificates || coaCertificates.length === 0) {
    return null;
  }

  const displayedCerts = isExpanded ? coaCertificates : coaCertificates.slice(0, 1);

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck className="w-4 h-4 text-orange-600" />
          Certificates of Authenticity {coaCertificates.length > 1 && `(${coaCertificates.length})`}
        </CardTitle>
        {coaCertificates.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-gray-600 hover:text-orange-600 h-auto p-0"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3 mr-1" /> Hide
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 mr-1" /> Show All
              </>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {displayedCerts.map((cert, idx) => (
            <a
              key={idx}
              href={cert}
              target="_blank"
              rel="noopener noreferrer"
              className="aspect-video rounded-lg overflow-hidden border-2 border-orange-200 hover:border-orange-400 transition-all group relative"
            >
              <img src={cert} alt={`COA ${idx + 1}`} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center">
                <ExternalLink className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}