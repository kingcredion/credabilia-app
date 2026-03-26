import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store, ExternalLink, ShoppingBag } from "lucide-react";
import ShopifyConnect from "../integrations/ShopifyConnect";

export default function ImportCard() {
  return (
    <Card className="hover:shadow-xl transition-all duration-300 border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-100 to-blue-100">
              <Store className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <CardTitle className="text-xl">Import from Store</CardTitle>
              <CardDescription>Connect Shopify, eBay, Etsy & more</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ShopifyConnect />
        
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-orange-500" />
              <span className="font-medium text-gray-700">eBay</span>
            </div>
            <Badge variant="outline" className="text-xs">Coming Soon</Badge>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-orange-500" />
              <span className="font-medium text-gray-700">Etsy</span>
            </div>
            <Badge variant="outline" className="text-xs">Coming Soon</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}