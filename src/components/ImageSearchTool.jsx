import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Search, Loader2, AlertCircle, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

export default function ImageSearchTool() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [imageUrl, setImageUrl] = useState("");

  const handleSearch = async () => {
    if (!imageUrl.trim()) {
      toast.error("Please enter an image URL");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await base44.functions.invoke("googleVisionProductSearch", {
        imageUrl: imageUrl.trim(),
        maxResults: 8
      });

      if (response.data?.error) {
        setError(response.data.error);
        toast.error("Search failed: " + response.data.error);
      } else {
        setResults(response.data);
        toast.success("Found similar items!");
      }
    } catch (err) {
      console.error("Search error:", err);
      setError(err.message || "Search failed");
      toast.error("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Search Input */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Image URL
            </label>
            <input
              type="url"
              placeholder="https://example.com/product-image.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              disabled={isLoading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
            />
          </div>

          <Button
            onClick={handleSearch}
            disabled={isLoading || !imageUrl.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Image...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Search for Similar Products
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-900">Search Error</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {/* Detected Labels */}
          {results.detectedLabels && results.detectedLabels.length > 0 && (
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-3">Detected Tags</h3>
              <div className="flex flex-wrap gap-2">
                {results.detectedLabels.map((label, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Similar Items from Marketplace */}
          {results.similarItems && results.similarItems.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">Similar Items in Marketplace</h3>
              <div className="grid gap-3">
                {results.similarItems.map((item) => (
                  <div
                    key={item.id}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex gap-4">
                      {item.images && item.images[0] && (
                        <img
                          src={item.images[0]}
                          alt={item.title}
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <a
                          href={`/ItemDetails?id=${item.id}`}
                          className="font-semibold text-blue-600 hover:text-blue-800 block truncate"
                        >
                          {item.title}
                        </a>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {item.description}
                        </p>
                        <p className="text-lg font-bold text-gray-900 mt-2">
                          ${item.price?.toFixed(2)}
                        </p>
                        {item.vendor_email && (
                          <p className="text-xs text-gray-500 mt-1">
                            by {item.vendor_email}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {results.similarItems?.length === 0 && (
            <div className="text-center py-8 text-gray-600">
              <ImageIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No similar items found in marketplace</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}