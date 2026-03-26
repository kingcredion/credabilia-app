import React, { useState, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, FileSpreadsheet, Loader2, AlertCircle, Save, 
  Trash2, Image as ImageIcon, Calculator, Settings2, GripVertical, X,
  Camera, FileCheck, Shield, Store, Image, Sparkles, Info, DollarSign
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";

export default function BulkUpload() {
  const navigate = useNavigate();
  // Steps: 'upload' -> 'processing' -> 'review'
  const [step, setStep] = useState("upload-sheet"); 
  
  const [user, setUser] = useState(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [subscription, setSubscription] = useState(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        
        if (userData?.email) {
          const subs = await base44.entities.VendorSubscription.filter({ vendor_email: userData.email });
          const activeSub = subs.find(s => 
            s.status === 'active' || 
            (s.status === 'trial' && new Date(s.trial_end_date) > new Date())
          );
          setSubscription(activeSub);
        }
      } catch (err) {
        console.error("Error loading user/subscription:", err);
      } finally {
        setIsUserLoading(false);
        setIsLoadingSubscription(false);
      }
    };
    loadData();
  }, []);

  const handleStartTrial = async () => {
    if (!user) return;
    try {
      const now = new Date();
      const trialEnd = new Date();
      trialEnd.setDate(now.getDate() + 30); // 30 days trial

      await base44.entities.VendorSubscription.create({
        vendor_id: user.id,
        vendor_email: user.email,
        plan_name: 'pro',
        status: 'trial',
        trial_start_date: now.toISOString(),
        trial_end_date: trialEnd.toISOString()
      });
      window.location.reload();
    } catch (err) {
      alert("Failed to start trial: " + err.message);
    }
  };

  const handleSubscribe = async () => {
    if (!user) return;
    try {
      await base44.entities.VendorSubscription.create({
        vendor_id: user.id,
        vendor_email: user.email,
        plan_name: 'pro',
        status: 'active',
        subscription_start_date: new Date().toISOString()
      });
      window.location.reload();
    } catch (err) {
      alert("Failed to subscribe: " + err.message);
    }
  };

  // Data
  const [spreadsheetFile, setSpreadsheetFile] = useState(null);
  const [uploadedImages, setUploadedImages] = useState([]); // Array of { file, preview, name, url }
  const [items, setItems] = useState([]); // Main items array
  const [unassignedImages, setUnassignedImages] = useState([]); // Pool of images { id, url, name }
  
  // UI State
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [pricingSettings, setPricingSettings] = useState({
    marginType: "percentage", // 'percentage' or 'fixed'
    marginValue: 0,
    rounding: "none", // 'none', '99', '50', '00'
  });
  const [showPricingDialog, setShowPricingDialog] = useState(false);
  const [enhancingIndices, setEnhancingIndices] = useState(new Set());

  // --- Mutations ---

  const processUploadsMutation = useMutation({
    mutationFn: async () => {
      // 1. Upload Images (if any)
      const processedImages = [];
      if (uploadedImages.length > 0) {
        setProgress(`Uploading ${uploadedImages.length} images...`);
        // Upload concurrently in batches of 5
        const batchSize = 5;
        for (let i = 0; i < uploadedImages.length; i += batchSize) {
          const batch = uploadedImages.slice(i, i + batchSize);
          const uploadPromises = batch.map(async (img) => {
            const { file_url } = await base44.integrations.Core.UploadFile({ file: img.file });
            return { url: file_url, name: img.name };
          });
          const results = await Promise.all(uploadPromises);
          processedImages.push(...results);
          setProgress(`Uploaded ${Math.min(i + batchSize, uploadedImages.length)}/${uploadedImages.length} images...`);
        }
      }

      // 2. AI Enrichment & Assembly
      setProgress("AI is assembling your inventory...");
      
      // Clean items for backend (remove temp_images UI state if present)
      const itemsPayload = items.map(({ temp_images, ...rest }) => rest);

      const enrichResponse = await base44.functions.invoke('enrichBulkItems', { 
        items: itemsPayload,
        availableImages: processedImages
      });
      
      return { 
        items: enrichResponse.data.processedItems,
        allImages: processedImages
      };
    },
    onSuccess: (data) => {
      // Calculate unassigned images
      const assignedUrls = new Set();
      data.items.forEach(item => {
        if (item.images) item.images.forEach(url => assignedUrls.add(url));
      });
      
      const unassigned = data.allImages
        .filter(img => !assignedUrls.has(img.url))
        .map(img => ({ id: `img-${Math.random().toString(36).substr(2, 9)}`, url: img.url, name: img.name }));

      // Add IDs to item images for DnD
      const itemsWithIds = data.items.map(item => ({
        ...item,
        temp_images: (item.images || []).map(url => ({ 
          id: `img-${Math.random().toString(36).substr(2, 9)}`, 
          url, 
          name: 'Assigned Image' 
        })),
        temp_coa_images: []
      }));

      setItems(itemsWithIds);
      setUnassignedImages(unassigned);
      setStep("review");
      setIsProcessing(false);
    },
    onError: (err) => {
      alert("Error: " + err.message);
      setIsProcessing(false);
      setStep("upload-sheet"); // Reset to start? Or keep at current step
    }
  });

  const createBulkMutation = useMutation({
    mutationFn: async ({ itemsToPublish, isBulk }) => {
      const validItems = itemsToPublish.filter(i => i.title && i.price).map(item => ({
        ...item,
        images: item.temp_images.map(img => img.url), // Extract URLs back from temp objects
        coa_certificates: item.temp_coa_images ? item.temp_coa_images.map(img => img.url) : [],
        temp_images: undefined, // Clean up
        temp_coa_images: undefined
      }));
      
      if (validItems.length === 0) throw new Error("No valid items to publish");
      
      await base44.entities.Item.bulkCreate(validItems);
      return { isBulk, count: validItems.length };
    },
    onSuccess: (data) => {
      if (data.isBulk) {
        alert("🎉 Inventory published successfully!");
        navigate(createPageUrl("VendorDashboard"));
      } else {
        // For individual items, we'll handle the UI update in the mutate callback
        // or let the user stay on the page
      }
    },
    onError: (err) => {
      alert("Failed to publish: " + err.message);
    }
  });

  const handlePublishSingle = (index) => {
    const item = items[index];
    if (!item.title || !item.price) {
      alert("Item must have a title and price");
      return;
    }

    createBulkMutation.mutate(
      { itemsToPublish: [item], isBulk: false },
      {
        onSuccess: () => {
          const newItems = [...items];
          newItems.splice(index, 1);
          setItems(newItems);
          
          if (newItems.length === 0) {
            alert("All items published! Redirecting to dashboard...");
            navigate(createPageUrl("VendorDashboard"));
          }
        }
      }
    );
  };

  // --- Handlers ---

  const handleSheetSelect = async (e) => {
    if (e.target.files[0]) {
      const file = e.target.files[0];
      setSpreadsheetFile(file);
      
      try {
        // Upload file and parse via backend
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const { data } = await base44.functions.invoke('enrichBulkItems', { 
          spreadsheet_url: file_url,
          parseOnly: true
        });
        
        const parsedItems = data.processedItems || data.items;
        if (!parsedItems || parsedItems.length === 0) {
          alert("No data found in spreadsheet");
          return;
        }

        // Helper to find value with loose matching
        const getValue = (obj, searchTerms) => {
          const keys = Object.keys(obj);
          // 1. Exact match (normalized)
          let found = keys.find(k => searchTerms.includes(k.toLowerCase().trim()));
          // 2. Partial match (e.g. "Unit Price" matches "price")
          if (!found) {
            found = keys.find(k => searchTerms.some(term => k.toLowerCase().includes(term)));
          }
          return found ? obj[found] : undefined;
        };

        // Initialize items with basic structure for UI
        const initializedItems = parsedItems.map(item => {
          // Normalize keys
          const title = getValue(item, ['title', 'name', 'product', 'item name', 'item', 'header']);
          const priceRaw = getValue(item, ['price', 'cost', 'value', 'amount', 'msrp']);
          const description = getValue(item, ['description', 'desc', 'details', 'notes', 'blurb']);
          const quantityRaw = getValue(item, ['quantity', 'qty', 'stock', 'count', 'inventory', 'units']);
          const sport = getValue(item, ['sport', 'category', 'league', 'genre']);
          
          // Clean price (remove currency symbols, commas)
          let price = priceRaw ? parseFloat(String(priceRaw).replace(/[^0-9.]/g, '')) : "";
          if (isNaN(price)) price = "";

          // Clean quantity
          let quantity = quantityRaw ? parseInt(String(quantityRaw).replace(/[^0-9]/g, '')) : 1;
          if (isNaN(quantity) || quantity < 1) quantity = 1;

          return {
            ...item,
            title: title || item.title || "",
            price: price || item.price || "",
            description: description || item.description || "",
            quantity: quantity,
            sport: sport || item.sport || "",
            temp_images: [],
            temp_coa_images: []
          };
        });

        setItems(initializedItems);
        setStep("upload-images");
      } catch (err) {
        console.error("Parse error:", err);
        alert("Failed to parse spreadsheet. Please check the file format.");
      }
    }
  };

  const handleImageSelect = (e) => {
    if (e.target.files) {
      const newImages = Array.from(e.target.files).map(file => ({
        file,
        preview: URL.createObjectURL(file),
        name: file.name
      }));
      setUploadedImages([...uploadedImages, ...newImages]);
    }
  };

  const removeUploadedImage = (index) => {
    const newImages = [...uploadedImages];
    newImages.splice(index, 1);
    setUploadedImages(newImages);
  };

  const startProcessing = () => {
    setIsProcessing(true);
    setStep("processing");
    processUploadsMutation.mutate();
  };

  // --- Drag and Drop Logic ---

  const onDragEnd = (result) => {
    const { source, destination } = result;

    // Dropped outside the list
    if (!destination) return;

    // Source and destination IDs
    const sourceId = source.droppableId;
    const destId = destination.droppableId;

    // Helper to get list based on ID
    const getList = (id) => {
      if (id === 'unassigned') return unassignedImages;
      // Item IDs are stored in items state, find index
      const itemIndex = parseInt(id.replace('item-', ''));
      return items[itemIndex].temp_images;
    };

    // Helper to update list
    const updateList = (id, newList) => {
      if (id === 'unassigned') {
        setUnassignedImages(newList);
      } else {
        const itemIndex = parseInt(id.replace('item-', ''));
        const newItems = [...items];
        newItems[itemIndex].temp_images = newList;
        setItems(newItems);
      }
    };

    // Move logic
    if (sourceId === destId) {
      // Reordering within same list
      const list = getList(sourceId);
      const newList = Array.from(list);
      const [removed] = newList.splice(source.index, 1);
      newList.splice(destination.index, 0, removed);
      updateList(sourceId, newList);
    } else {
      // Moving between lists
      const sourceList = getList(sourceId);
      const destList = getList(destId);
      
      const newSourceList = Array.from(sourceList);
      const newDestList = Array.from(destList);
      
      const [removed] = newSourceList.splice(source.index, 1);
      newDestList.splice(destination.index, 0, removed);
      
      updateList(sourceId, newSourceList);
      updateList(destId, newDestList);
    }
  };

  // --- Pricing Logic ---

  const applyPricingRules = () => {
    const newItems = items.map(item => {
      let currentPrice = parseFloat(item.price) || 0;
      
      // Apply Margin
      if (pricingSettings.marginValue !== 0) {
        if (pricingSettings.marginType === 'percentage') {
          currentPrice = currentPrice * (1 + (parseFloat(pricingSettings.marginValue) / 100));
        } else {
          currentPrice = currentPrice + parseFloat(pricingSettings.marginValue);
        }
      }

      // Apply Rounding
      if (pricingSettings.rounding !== 'none') {
        const wholePart = Math.floor(currentPrice);
        if (pricingSettings.rounding === '99') {
          currentPrice = wholePart + 0.99;
        } else if (pricingSettings.rounding === '50') {
          currentPrice = wholePart + 0.50;
        } else if (pricingSettings.rounding === '00') {
          currentPrice = Math.round(currentPrice);
        }
      }

      return { ...item, price: parseFloat(currentPrice.toFixed(2)) };
    });

    setItems(newItems);
    setShowPricingDialog(false);
  };

  const handleEnhanceDescription = async (index) => {
    const item = items[index];
    if (!item.title) return;

    setEnhancingIndices(prev => new Set(prev).add(index));

    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Rewrite and enhance this product description for a sports memorabilia marketplace. 
        Title: "${item.title}"
        Current Description: "${item.description}"
        Key Details: ${item.sport}, ${item.is_signed ? "Signed" : "Unsigned"}, ${item.price ? '$'+item.price : ''}
        
        Output ONLY the new description text. Keep it professional, engaging, and highlight key features. Max 2-3 sentences. Do not include quotes.`,
      });

      // response is the string directly when no schema is provided
      const newDescription = typeof response === 'string' ? response.trim() : JSON.stringify(response);
      
      const newItems = [...items];
      newItems[index].description = newDescription.replace(/^"|"$/g, ''); // Clean quotes if any
      setItems(newItems);

    } catch (error) {
      console.error("Enhancement failed:", error);
      alert("Failed to enhance description. Please try again.");
    } finally {
      setEnhancingIndices(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const handleIndividualUpload = async (index, file, type = 'product') => {
    if (!file) return;
    
    // Optimistic UI update with blob
    const previewUrl = URL.createObjectURL(file);
    const tempId = `new-${Math.random().toString(36).substr(2, 9)}`;
    
    // We upload immediately to get the real URL
    try {
      // Show loading state on item could be nice, but simple alert for now if fails
      const { file_url } = await base44.integrations.Core.UploadFile({ file: file });
      
      const newItems = [...items];
      const newItemImage = { 
        id: tempId, 
        url: file_url, 
        name: file.name 
      };

      if (type === 'coa') {
        newItems[index].temp_coa_images = [...(newItems[index].temp_coa_images || []), newItemImage];
      } else {
        newItems[index].temp_images = [...(newItems[index].temp_images || []), newItemImage];
      }
      setItems(newItems);
    } catch (err) {
      console.error("Single upload failed", err);
      alert("Failed to upload image");
    }
  };

  // --- Render Steps ---

  const isUnlocked = subscription && (
    subscription.status === 'active' || 
    (subscription.status === 'trial' && new Date(subscription.trial_end_date) > new Date())
  );

  if (!isUserLoading && !isLoadingSubscription && !isUnlocked) {
    return (
      <div className="max-w-4xl mx-auto mt-8 px-4">
        {/* Locked Preview */}
        <div className="relative overflow-hidden rounded-xl border border-gray-200 shadow-sm opacity-50 blur-sm pointer-events-none select-none h-[300px] bg-gray-50 mb-[-280px] z-0">
          <div className="p-8 grid grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="h-32 bg-white rounded border border-gray-200"></div>
            </div>
            <div className="space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>

        {/* Subscription Card */}
        <div className="relative z-10">
          <Card className="max-w-2xl mx-auto border-2 border-blue-100 shadow-2xl bg-white/95 backdrop-blur">
            <CardHeader className="text-center pb-2">
              <Badge className="w-fit mx-auto mb-4 bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1">
                PRO VENDOR FEATURE
              </Badge>
              <CardTitle className="text-3xl font-bold text-gray-900">
                Unlock Bulk Power Tools
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="text-center space-y-2">
                <p className="text-lg text-gray-700">
                  Upload spreadsheets, manage quantities, and automate your inventory with AI.
                </p>
                <p className="text-sm text-gray-500">
                  Join hundreds of professional vendors streamlining their business.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button 
                  size="lg" 
                  onClick={handleStartTrial}
                  className="h-auto py-4 flex flex-col items-center bg-blue-600 hover:bg-blue-700 shadow-lg group relative overflow-hidden"
                >
                  <span className="font-bold text-lg">Start 30-Day Free Trial</span>
                  <span className="text-xs font-normal opacity-90 group-hover:opacity-100 transition-opacity">
                    Then $50/month • Cancel anytime
                  </span>
                </Button>

                <Button 
                  size="lg" 
                  variant="outline"
                  onClick={handleSubscribe}
                  className="h-auto py-4 flex flex-col items-center border-2 border-gray-200 hover:border-blue-200 hover:bg-blue-50"
                >
                  <span className="font-bold text-lg text-gray-800">Subscribe Now</span>
                  <span className="text-xs text-gray-500">
                    Skip trial, start billing immediately
                  </span>
                </Button>
              </div>

              <div className="pt-6 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 text-center">
                  Included in Pro Plan
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-8">
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <div className="p-1 rounded-full bg-green-100 text-green-600">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    Bulk Spreadsheet Upload
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <div className="p-1 rounded-full bg-green-100 text-green-600">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    Reduced 6% Platform Fee
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <div className="p-1 rounded-full bg-blue-100 text-blue-600">
                      <Settings2 className="w-4 h-4" />
                    </div>
                    Smart Pricing Rules & Margins
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <div className="p-1 rounded-full bg-purple-100 text-purple-600">
                      <Calculator className="w-4 h-4" />
                    </div>
                    Advanced Quantity Management
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <div className="p-1 rounded-full bg-orange-100 text-orange-600">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    AI-Powered Inventory Analysis
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <div className="p-1 rounded-full bg-pink-100 text-pink-600">
                      <Shield className="w-4 h-4" />
                    </div>
                    Priority Support & Vetting
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-700">
                    <div className="p-1 rounded-full bg-indigo-100 text-indigo-600">
                      <Store className="w-4 h-4" />
                    </div>
                    Custom Storefront URL (Coming Soon)
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (step === "upload-sheet") {
    return (
      <div className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Title */}
          <h2 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-2">Bulk Upload with AI Intelligence</h2>
          <p className="text-center text-gray-600 mb-12">Here's what our AI does for you:</p>

          {/* Features Grid with King Credion on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-16 items-start">
            {/* Features - 3 columns */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8 border border-blue-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-4xl mb-4">🤖</div>
                <h4 className="font-bold text-gray-900 mb-3 text-lg">AI Categorization</h4>
                <p className="text-sm text-gray-600">Automatically detect and organize products from your spreadsheet with intelligent categorization</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-8 border border-green-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-4xl mb-4">✨</div>
                <h4 className="font-bold text-gray-900 mb-3 text-lg">Smart Validation</h4>
                <p className="text-sm text-gray-600">AI verifies data accuracy, detects inconsistencies, and fills missing information automatically</p>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-8 border border-purple-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="text-4xl mb-4">⚡</div>
                <h4 className="font-bold text-gray-900 mb-3 text-lg">Instant Processing</h4>
                <p className="text-sm text-gray-600">Upload bulk inventory and go live in minutes, not hours—all powered by AI</p>
              </div>
            </div>

            {/* King Credion - Visible Foreground */}
            <div className="lg:col-span-2 flex justify-center items-center">
              <img 
                src="https://media.base44.com/images/public/690badbd56a85b130b88aa42/60b8a6cfd_Photoroom_20260318_235819.png"
                alt="King Credion AI Assistant"
                className="w-full max-w-xs object-contain drop-shadow-2xl"
              />
            </div>
          </div>

          {/* Upload Section */}
          <div className="max-w-3xl mx-auto">
            <Card className="border-2 border-blue-300 shadow-2xl bg-white">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2 justify-center">
                  <span className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-2 rounded-lg">1</span>
                  Upload Your Inventory Sheet
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8 text-center space-y-6">
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-16 hover:bg-gray-50 hover:border-blue-400 transition-all relative">
                  <input 
                    type="file" 
                    accept=".csv,.xlsx,.xls" 
                    onChange={handleSheetSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <FileSpreadsheet className="w-20 h-20 text-green-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-semibold text-gray-900 mb-2">Select Spreadsheet</h3>
                  <p className="text-gray-500 text-lg">Supported formats: CSV, Excel (.xlsx, .xls)</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (step === "upload-images") {
    return (
      <Card className="max-w-4xl mx-auto mt-8">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl flex items-center gap-2">
              <span className="bg-blue-100 p-2 rounded-lg text-blue-600">2</span>
              <span className="md:hidden">Review Detected Items</span>
              <span className="hidden md:inline">Upload Images (Optional)</span>
            </CardTitle>
            <Button onClick={startProcessing} className="bg-blue-600 hover:bg-blue-700">
              Continue to Processing <Upload className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4 hidden md:block">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" /> Upload Images
              </h3>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 hover:bg-gray-50 transition-colors relative text-center h-64 flex flex-col items-center justify-center">
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple
                  onChange={handleImageSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <ImageIcon className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-900">Drag & Drop Images</h3>
                <p className="text-gray-500 text-sm">Upload all your inventory photos here</p>
              </div>
              <p className="text-xs text-gray-500 italic mt-2 text-center">
                * Uploading now is optional. You can take photos or add images for individual items in the next step.
              </p>

              {uploadedImages.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="font-semibold mb-3 flex items-center justify-between">
                    <span>Selected Images ({uploadedImages.length})</span>
                    <Button variant="ghost" size="sm" onClick={() => setUploadedImages([])} className="text-red-500">
                      Clear
                    </Button>
                  </h4>
                  <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                    {uploadedImages.map((img, idx) => (
                      <div key={idx} className="relative group aspect-square bg-white rounded-lg border border-gray-200 overflow-hidden">
                        <img src={img.preview} alt="" className="w-full h-full object-cover" />
                        <button 
                          onClick={() => removeUploadedImage(idx)}
                          className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> Detected Items ({items.length})
              </h3>
              <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden flex flex-col h-[500px]">
                <div className="overflow-y-auto p-4 space-y-3 flex-1">
                  {items.map((item, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">{item.title || "Untitled Item"}</p>
                        <p className="text-xs text-gray-500 line-clamp-1">{item.description}</p>
                        <div className="flex gap-2 mt-1">
                          {item.price && <Badge variant="secondary" className="text-[10px]">${item.price}</Badge>}
                          {item.quantity && <Badge variant="outline" className="text-[10px]">Qty: {item.quantity}</Badge>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 bg-gray-100 border-t border-gray-200 text-xs text-gray-500 text-center">
                  Verify your items match the uploaded spreadsheet
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === "processing") {
    return (
      <Card className="max-w-md mx-auto mt-16 text-center p-8">
        <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-6" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">AI Processing</h3>
        <p className="text-gray-600 mb-4">{progress}</p>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full animate-pulse w-2/3 mx-auto"></div>
        </div>
      </Card>
    );
  }

  // REVIEW STEP
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="max-w-[1600px] mx-auto mt-4 px-4 pb-12 flex flex-col" style={{ height: 'calc(100dvh - 100px)', minHeight: 'calc(100vh - 100px)' }}>
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Review Inventory</h1>
            <p className="text-sm text-gray-600">Review AI assignments and organize images</p>
          </div>
          
          <div className="flex items-center gap-3">
                    <div className="hidden md:flex items-center gap-2 text-sm text-gray-500 mr-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                      <Info className="w-4 h-4 text-blue-500" />
                      <span>You can edit details later in My Listings</span>
                    </div>
                    <Dialog open={showPricingDialog} onOpenChange={setShowPricingDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Calculator className="w-4 h-4" /> Pricing Rules
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bulk Pricing Rules</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Margin Adjustment</Label>
                    <div className="flex gap-2">
                      <Select 
                        value={pricingSettings.marginType} 
                        onValueChange={(v) => setPricingSettings({...pricingSettings, marginType: v})}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                          <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input 
                        type="number" 
                        value={pricingSettings.marginValue} 
                        onChange={(e) => setPricingSettings({...pricingSettings, marginValue: e.target.value})}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Price Rounding</Label>
                    <Select 
                      value={pricingSettings.rounding} 
                      onValueChange={(v) => setPricingSettings({...pricingSettings, rounding: v})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Rounding</SelectItem>
                        <SelectItem value="99">End in .99 (e.g., $10.99)</SelectItem>
                        <SelectItem value="50">End in .50 (e.g., $10.50)</SelectItem>
                        <SelectItem value="00">Round to Dollar (e.g., $11.00)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={applyPricingRules}>Apply Rules</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button 
              onClick={() => createBulkMutation.mutate({ itemsToPublish: items, isBulk: true })} 
              className="bg-orange-600 hover:bg-orange-700 gap-2"
              disabled={createBulkMutation.isPending || items.length === 0}
            >
              <Save className="w-4 h-4" />
              Publish All {items.length > 0 ? `(${items.length})` : ''}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 gap-6 overflow-hidden">
          {/* Main List - Items */}
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {items.map((item, index) => (
              <Card key={index} className="overflow-hidden border border-gray-200 hover:border-blue-300 transition-colors">
                <div className="flex flex-col md:flex-row p-4 gap-4">
                  {/* Image Drop Zone */}
                  <Droppable droppableId={`item-${index}`} direction="horizontal">
                    {(provided, snapshot) => (
                      <div 
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`w-full md:w-64 min-h-[140px] bg-gray-50 rounded-lg border-2 border-dashed flex items-start gap-2 p-2 overflow-x-auto ${
                          snapshot.isDraggingOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                        }`}
                      >
                        {item.temp_images.length === 0 && !snapshot.isDraggingOver && (
                          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                            <ImageIcon className="w-8 h-8 mb-1" />
                            <span className="text-xs">Drop Images Here</span>
                          </div>
                        )}
                        
                        {item.temp_images.map((img, imgIdx) => (
                          <Draggable key={img.id} draggableId={img.id} index={imgIdx}>
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className="relative flex-shrink-0 w-24 h-24 bg-white rounded border shadow-sm group"
                              >
                                <img src={img.url} alt="" className="w-full h-full object-cover rounded-sm" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                <GripVertical className="absolute top-1 right-1 w-4 h-4 text-white drop-shadow-md opacity-0 group-hover:opacity-100" />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>

                  {/* Individual Image Actions */}
                  <div className="flex flex-col gap-2 min-w-[120px]">
                    <div className="relative">
                      <Button variant="outline" size="sm" className="w-full gap-2 text-xs h-8 border-dashed">
                        <Camera className="w-3 h-3" /> Add Photo
                      </Button>
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => handleIndividualUpload(index, e.target.files[0], 'product')}
                      />
                    </div>
                  </div>

                  {/* Fields */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <Label className="text-xs text-gray-500">Title</Label>
                      <Input 
                        value={item.title} 
                        onChange={(e) => {
                          const newItems = [...items];
                          newItems[index].title = e.target.value;
                          setItems(newItems);
                        }}
                        className="font-bold" 
                      />
                    </div>
                    
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-xs text-gray-500">Price</Label>
                        <Input 
                          type="number"
                          value={item.price}
                          onChange={(e) => {
                            const newItems = [...items];
                            newItems[index].price = e.target.value;
                            setItems(newItems);
                          }}
                        />
                      </div>
                      <div className="w-24">
                        <Label className="text-xs font-semibold text-gray-700">Quantity</Label>
                        <Input 
                          type="number"
                          min="1"
                          className="font-medium"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...items];
                            newItems[index].quantity = parseInt(e.target.value) || 1;
                            setItems(newItems);
                          }}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-xs text-gray-500">Details</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="outline">{item.sport}</Badge>
                        {item.is_signed && <Badge className="bg-orange-100 text-orange-700">Signed</Badge>}
                        <span className="text-xs text-gray-500 flex items-center">{item.tags?.length || 0} Tags</span>
                      </div>
                    </div>

                    <div className="col-span-2">
                       <div className="flex justify-between items-center mb-1">
                         <Label className="text-xs text-gray-500">Description</Label>
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={() => handleEnhanceDescription(index)}
                           disabled={enhancingIndices.has(index)}
                           className="h-6 text-[10px] text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2"
                         >
                           {enhancingIndices.has(index) ? (
                             <Loader2 className="w-3 h-3 animate-spin mr-1" />
                           ) : (
                             <Sparkles className="w-3 h-3 mr-1" />
                           )}
                           Enhance with AI
                         </Button>
                       </div>
                       <textarea
                         value={item.description}
                         onChange={(e) => {
                           const newItems = [...items];
                           newItems[index].description = e.target.value;
                           setItems(newItems);
                           // Auto-expand
                           e.target.style.height = 'auto';
                           e.target.style.height = e.target.scrollHeight + 'px';
                         }}
                         rows={2}
                         className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y overflow-hidden transition-all text-gray-600"
                         style={{ height: 'auto' }}
                         placeholder="Item description..."
                       />
                    </div>

                    <div className="col-span-2">
                      <Label className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                        <Shield className="w-3 h-3 text-orange-500" /> Certificates of Authenticity (COA)
                      </Label>
                      <div className="flex gap-2 items-center flex-wrap">
                        <div className="relative">
                          <Button variant="outline" size="sm" className="gap-2 text-xs h-8 border-orange-200 hover:bg-orange-50 text-orange-700">
                             <FileCheck className="w-3 h-3" /> Upload COA
                          </Button>
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={(e) => handleIndividualUpload(index, e.target.files[0], 'coa')}
                          />
                        </div>
                        
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {item.temp_coa_images && item.temp_coa_images.map((coa, cIdx) => (
                             <div key={coa.id} className="relative w-8 h-8 flex-shrink-0 group">
                               <img src={coa.url} className="w-full h-full object-cover rounded border border-orange-200" />
                               <button 
                                 onClick={() => {
                                   const newItems = [...items];
                                   newItems[index].temp_coa_images.splice(cIdx, 1);
                                   setItems(newItems);
                                 }}
                                 className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 w-3 h-3 flex items-center justify-center opacity-0 group-hover:opacity-100"
                               >
                                 <X className="w-2 h-2" />
                               </button>
                             </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col justify-between items-end gap-2">
                     <Button 
                       variant="ghost" 
                       size="icon" 
                       className="text-red-400 hover:text-red-600"
                       onClick={() => {
                         const newItems = [...items];
                         newItems.splice(index, 1);
                         setItems(newItems);
                       }}
                     >
                       <Trash2 className="w-5 h-5" />
                     </Button>

                     <Button
                       size="sm"
                       onClick={() => handlePublishSingle(index)}
                       className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-8 px-2"
                       title="Publish this item immediately"
                     >
                       Publish
                     </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Unassigned Images Pool - Sidebar */}
          <div className="hidden md:flex w-72 flex-shrink-0 flex-col bg-gray-50 border-l border-gray-200 p-4 rounded-xl">
             <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
               <ImageIcon className="w-4 h-4" /> 
               Unassigned ({unassignedImages.length})
             </h3>
             <p className="text-xs text-gray-500 mb-4">Drag these images to items on the left</p>
             
             <Droppable droppableId="unassigned">
               {(provided, snapshot) => (
                 <div
                   ref={provided.innerRef}
                   {...provided.droppableProps}
                   className={`flex-1 overflow-y-auto space-y-2 min-h-[200px] ${
                     snapshot.isDraggingOver ? 'bg-blue-50/50' : ''
                   }`}
                 >
                   {unassignedImages.map((img, index) => (
                     <Draggable key={img.id} draggableId={img.id} index={index}>
                       {(provided) => (
                         <div
                           ref={provided.innerRef}
                           {...provided.draggableProps}
                           {...provided.dragHandleProps}
                           className="bg-white p-2 rounded border border-gray-200 shadow-sm cursor-move hover:border-blue-400 group flex gap-2 items-center"
                         >
                           <img src={img.url} alt="" className="w-12 h-12 object-cover rounded bg-gray-100" />
                           <div className="flex-1 min-w-0">
                             <p className="text-xs truncate font-medium text-gray-700">{img.name}</p>
                           </div>
                         </div>
                       )}
                     </Draggable>
                   ))}
                   {provided.placeholder}
                 </div>
               )}
             </Droppable>
          </div>
        </div>
      </div>
    </DragDropContext>
  );
}