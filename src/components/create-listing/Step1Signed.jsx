import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PenTool, Ban, Upload, Palette } from "lucide-react";

export default function Step1Signed({ data, updateData, onNext }) {
  const handleSelect = (type) => {
    if (type === 'bulk') {
      updateData({ listingMode: 'bulk' });
      // Parent component will handle the redirection/rendering
      return;
    }

    if (type === 'fine_art') {
      updateData({
        listingMode: 'single',
        isFineArt: true,
        isSigned: false, // Default to false for flow, but we handle artist signature separately
        selectedCategories: {
          ...data.selectedCategories,
          media_category: ['fine_art']
        }
      });
      onNext();
      return;
    }

    const isSigned = type === 'signed';
    updateData({ 
      listingMode: 'single',
      isSigned,
      isFineArt: false,
      gradeStatus: isSigned ? 'raw_signed' : 'raw' 
    });
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900">What would you like to list?</h2>
        <p className="text-gray-600">Choose the best option for your inventory.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card 
          className={`cursor-pointer transition-all hover:shadow-lg hover:border-orange-400 ${
            data.isSigned === true ? 'ring-2 ring-orange-500 border-orange-500 bg-orange-50' : ''
          }`}
          onClick={() => handleSelect('signed')}
        >
          <CardContent className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4 text-blue-600">
              <PenTool className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Signed Item</h3>
            <p className="text-sm text-gray-600">
              Item features an autograph (e.g., signed jersey, ball, photo)
            </p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all hover:shadow-lg hover:border-orange-400 ${
            data.isSigned === false ? 'ring-2 ring-orange-500 border-orange-500 bg-orange-50' : ''
          }`}
          onClick={() => handleSelect('unsigned')}
        >
          <CardContent className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-gray-600">
              <Ban className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Not Signed</h3>
            <p className="text-sm text-gray-600">
              Item is not signed (e.g., card, ticket, bobblehead)
            </p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer transition-all hover:shadow-lg hover:border-green-400 hover:ring-2 hover:ring-green-500/20"
          onClick={() => handleSelect('bulk')}
        >
          <CardContent className="p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4 text-green-600">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Bulk Upload</h3>
            <p className="text-sm text-gray-600">
              Upload a spreadsheet (CSV/Excel) to create multiple listings
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card 
          className="cursor-pointer transition-all hover:shadow-lg hover:border-purple-400 hover:ring-2 hover:ring-purple-500/20"
          onClick={() => handleSelect('fine_art')}
        >
          <CardContent className="p-8 flex items-center justify-between text-left">
             <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 flex-shrink-0">
                  <Palette className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Fine Art</h3>
                  <p className="text-sm text-gray-600">
                    Paintings, sculptures, prints, and mixed media art.
                    <span className="block text-xs text-purple-600 mt-1 font-medium">Supports original artists & reselling.</span>
                  </p>
                </div>
             </div>
             <div className="hidden md:block">
                <span className="bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold">
                  List Art
                </span>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}