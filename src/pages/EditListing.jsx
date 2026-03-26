import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Upload,
  X,
  ShieldCheck,
  Image as ImageIcon,
  FileCheck,
  AlertCircle,
  Sparkles,
  ArrowLeft,
  Loader2,
  Package,
  Truck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import CategorySelector from "../components/CategorySelector";
import MobileSelector from "../components/MobileSelector";

const AUTHENTICATORS = {
  "PSA/DNA": { score: 95, tier: "premium" },
  "JSA": { score: 92, tier: "premium" },
  "Beckett (BAS)": { score: 93, tier: "premium" },
  "SGC": { score: 90, tier: "premium" },
  "CGC": { score: 91, tier: "premium" },
  "Upper Deck Authenticated": { score: 88, tier: "trusted" },
  "Fanatics Authentic": { score: 87, tier: "trusted" },
  "Steiner Sports": { score: 85, tier: "trusted" },
  "TriStar Productions": { score: 84, tier: "trusted" },
  "MLB Authenticated": { score: 89, tier: "trusted" },
  "Other": { score: 50, tier: "unverified" }
};

const SPORTS = ["baseball", "basketball", "football", "hockey", "boxing", "soccer", "other"];
const GRADE_STATUS = [
  { value: "graded", label: "Graded (No Signature)" },
  { value: "graded_signed", label: "Graded & Signed" },
  { value: "raw", label: "Raw (No Signature)" },
  { value: "raw_signed", label: "Raw & Signed" }
];

export default function EditListing() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const itemId = urlParams.get("id");
  
  const [user, setUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [images, setImages] = useState([]);
  const [coaCertificates, setCoaCertificates] = useState([]);
  const [sport, setSport] = useState("");
  const [signer, setSigner] = useState("");
  const [team, setTeam] = useState("");
  const [year, setYear] = useState("");
  const [gradeStatus, setGradeStatus] = useState("raw_signed");
  const [gradingCompany, setGradingCompany] = useState("");
  const [gradeValue, setGradeValue] = useState("");
  const [authenticator, setAuthenticator] = useState("");
  const [customAuthenticator, setCustomAuthenticator] = useState("");
  const [certificateId, setCertificateId] = useState("");
  const [selectedCategories, setSelectedCategories] = useState({
    display_type: [],
    autograph_status: [],
    condition_use: [],
    certification_type: [],
    display_readiness: [],
    era_origin: [],
    media_category: []
  });

  // Shipping State
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState("lb");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [distanceUnit, setDistanceUnit] = useState("in");
  const [offersLocalPickup, setOffersLocalPickup] = useState(false);
  const [pickupInstructions, setPickupInstructions] = useState("");
  
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingCoa, setUploadingCoa] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const { data: item, isLoading: itemLoading, error: itemError } = useQuery({
    queryKey: ['item-edit', itemId],
    queryFn: async () => {
      if (!itemId) throw new Error("No item ID provided");
      try {
        const items = await base44.entities.Item.filter({ id: itemId });
        if (!items || items.length === 0) throw new Error("Item not found");
        return items[0];
      } catch (err) {
        console.error("Error fetching item:", err);
        throw err;
      }
    },
    enabled: !!itemId,
  });

  // Populate form fields when item is loaded
  useEffect(() => {
    if (item) {
      setTitle(item.title || "");
      setDescription(item.description || "");
      setPrice(item.price?.toString() || "");
      setImages(item.images || []);
      setCoaCertificates(item.coa_certificates || []);
      setSport(item.sport || "");
      setSigner(item.signer || "");
      setTeam(item.team || "");
      setYear(item.year || "");
      setGradeStatus(item.grade_status || "raw_signed");
      setGradingCompany(item.grading_company || "");
      setGradeValue(item.grade_value || "");
      setCertificateId(item.certificate_id || "");

      // Load Shipping
      setWeight(item.weight?.toString() || "");
      setWeightUnit(item.weight_unit || "lb");
      setLength(item.length?.toString() || "");
      setWidth(item.width?.toString() || "");
      setHeight(item.height?.toString() || "");
      setDistanceUnit(item.distance_unit || "in");
      setOffersLocalPickup(item.offers_local_pickup || false);
      setPickupInstructions(item.pickup_instructions || "");
      
      // Check if authenticator is custom
      if (item.authenticator && !AUTHENTICATORS[item.authenticator]) {
        setAuthenticator("Other");
        setCustomAuthenticator(item.authenticator);
      } else {
        setAuthenticator(item.authenticator || "");
      }
      
      // Load categories
      setSelectedCategories({
        display_type: item.display_type || [],
        autograph_status: item.autograph_status || [],
        condition_use: item.condition_use || [],
        certification_type: item.certification_type || [],
        display_readiness: item.display_readiness || [],
        era_origin: item.era_origin || [],
        media_category: item.media_category || []
      });
    }
  }, [item]);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setUploadingImage(true);
    try {
      const uploadPromises = files.map(async (file) => {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        return file_url;
      });
      
      const uploadedUrls = await Promise.all(uploadPromises);
      setImages([...images, ...uploadedUrls]);
    } catch (error) {
      console.error("Error uploading images:", error);
      alert("Failed to upload images. Please try again.");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCoaUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setUploadingCoa(true);
    try {
      const uploadPromises = files.map(async (file) => {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        return file_url;
      });
      
      const uploadedUrls = await Promise.all(uploadPromises);
      setCoaCertificates([...coaCertificates, ...uploadedUrls]);
    } catch (error) {
      console.error("Error uploading COA:", error);
      alert("Failed to upload certificate. Please try again.");
    } finally {
      setUploadingCoa(false);
    }
  };

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const removeCoa = (index) => {
    setCoaCertificates(coaCertificates.filter((_, i) => i !== index));
  };

  const handleAiEnhance = async () => {
    if (!description.trim()) return;

    setAnalyzing(true);
    try {
      const prompt = `Enhance this marketplace listing description to be professional, engaging, and sales-oriented.
      Maintain all factual details (condition, authenticator, year, etc.) but improve the flow and clarity.
      
      Item Title: ${title}
      Current Description: "${description}"
      
      Return JSON with a single field: "enhanced_description"
      `;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            enhanced_description: { type: "string" }
          }
        }
      });

      if (response.enhanced_description) {
        setDescription(response.enhanced_description);
      }
    } catch (error) {
      console.error("AI Enhance failed:", error);
      alert("Failed to enhance description. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const updateListingMutation = useMutation({
    mutationFn: async (listingData) => {
      await base44.entities.Item.update(itemId, listingData);
    },
    onSuccess: () => {
      navigate(createPageUrl(`ItemDetails?id=${itemId}`));
    },
    onError: (error) => {
      console.error("Error updating listing:", error);
      alert("Failed to update listing. Please try again.");
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!user) {
      alert("Please log in to edit listing");
      return;
    }
    
    if (!title || !description || images.length === 0) {
      alert("Please fill in title, description, and upload at least one image");
      return;
    }
    
    if (!authenticator) {
      alert("Please select an authenticator");
      return;
    }
    
    if (authenticator === "Other" && !customAuthenticator) {
      alert("Please enter the authenticator name");
      return;
    }
    
    setIsSubmitting(true);
    
    const finalAuthenticator = authenticator === "Other" ? customAuthenticator : authenticator;
    
    const listingData = {
      title,
      description,
      images,
      coa_certificates: coaCertificates,
      ...selectedCategories,
      sport,
      signer: signer || null,
      team: team || null,
      year: year || null,
      grade_status: gradeStatus,
      grading_company: gradingCompany || null,
      grade_value: gradeValue || null,
      authenticator: finalAuthenticator,
      certificate_id: certificateId || null,
      price: price ? parseFloat(price) : null,
      
      // Shipping
      weight: weight ? parseFloat(weight) : null,
      weight_unit: weightUnit,
      length: length ? parseFloat(length) : null,
      width: width ? parseFloat(width) : null,
      height: height ? parseFloat(height) : null,
      distance_unit: distanceUnit,
      offers_local_pickup: offersLocalPickup,
      pickup_instructions: pickupInstructions,
    };
    
    updateListingMutation.mutate(listingData);
  };

  if (itemLoading || !user) {
    return (
      <div className="min-h-screen bg-background dark:bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-muted-foreground">Loading listing...</p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-background dark:bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-2">Item not found</h2>
          <p className="text-gray-600 dark:text-muted-foreground mb-4">This listing does not exist. {itemError && `(${itemError.message})`}</p>
          <p className="text-xs text-gray-500 dark:text-muted-foreground mb-4">ID: {itemId}</p>
          <Link to={createPageUrl("MyListings")}>
            <Button>Back to My Listings</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (item.vendor_email !== user.email) {
    return (
      <div className="min-h-screen bg-background dark:bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-2">Not authorized</h2>
          <p className="text-gray-600 dark:text-muted-foreground mb-4">You can only edit your own listings.</p>
          <Link to={createPageUrl("MyListings")}>
            <Button>Back to My Listings</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background dark:bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <Link to={createPageUrl("MyListings")} className="inline-flex items-center gap-2 text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to My Listings
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-foreground mb-2">
            Edit Listing
          </h1>
          <p className="text-gray-600 dark:text-muted-foreground">
            Update your listing details
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-2">
                  Title *
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Michael Jordan Signed 1997 Upper Deck Card"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-foreground">
                    Description *
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleAiEnhance}
                    disabled={analyzing || !description.trim()}
                    className="text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30 h-8"
                  >
                    {analyzing ? (
                      <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 mr-1.5" />
                    )}
                    {analyzing ? "Enhancing..." : "Enhance with AI"}
                  </Button>
                </div>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide detailed description of the item, its condition, provenance, etc."
                  rows={5}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sport *
                  </label>
                  <MobileSelector
                    value={sport}
                    onValueChange={setSport}
                    title="Select Sport"
                    trigger={<span className="capitalize">{sport || "Select sport"}</span>}
                    items={SPORTS.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Price (USD)
                  </label>
                  <Input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Signer
                  </label>
                  <Input
                    value={signer}
                    onChange={(e) => setSigner(e.target.value)}
                    placeholder="e.g., Michael Jordan"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team
                  </label>
                  <Input
                    value={team}
                    onChange={(e) => setTeam(e.target.value)}
                    placeholder="e.g., Chicago Bulls"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Year
                  </label>
                  <Input
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="e.g., 1997"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Item Images */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Item Images *
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-orange-500 dark:hover:border-orange-500 transition-colors bg-white dark:bg-card">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                    id="image-upload"
                    disabled={uploadingImage}
                  />
                  <label
                    htmlFor="image-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <Upload className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-3" />
                    <p className="text-sm font-medium text-gray-700 dark:text-foreground mb-1">
                      {uploadingImage ? "Uploading..." : "Click to upload images"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-muted-foreground">
                      PNG, JPG up to 10MB (multiple files allowed)
                    </p>
                  </label>
                </div>

                {images.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {images.map((url, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={url}
                          alt={`Item ${index + 1}`}
                          className="w-full h-32 object-cover rounded-lg border-2 border-gray-200 dark:border-gray-700"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        {index === 0 && (
                          <Badge className="absolute bottom-2 left-2 bg-orange-600">
                            Primary
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Authentication */}
          <Card className="border-2 border-orange-200 dark:border-orange-900/50 bg-orange-50/30 dark:bg-orange-950/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-900 dark:text-orange-300">
                <ShieldCheck className="w-5 h-5" />
                Authentication & Certification *
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Authentication Company *
                </label>
                  <MobileSelector
                    value={authenticator}
                    onValueChange={setAuthenticator}
                    title="Select Authenticator"
                    trigger={<span>{authenticator || "Select authenticator"}</span>}
                    items={[
                      ...Object.entries(AUTHENTICATORS).filter(([_, d]) => d.tier === "premium").map(([name]) => ({ value: name, label: `⭐ ${name}` })),
                      ...Object.entries(AUTHENTICATORS).filter(([_, d]) => d.tier === "trusted").map(([name]) => ({ value: name, label: name })),
                      { value: "Other", label: "Other / Lesser Known" }
                    ]}
                  />
              </div>

              {authenticator === "Other" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Authenticator Name *
                  </label>
                  <Input
                    value={customAuthenticator}
                    onChange={(e) => setCustomAuthenticator(e.target.value)}
                    placeholder="Enter authenticator name"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Certificate ID / Number
                </label>
                <Input
                  value={certificateId}
                  onChange={(e) => setCertificateId(e.target.value)}
                  placeholder="e.g., PSA-12345678 or JSA-AB12345"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Certificate of Authenticity (COA) Images
                </label>
                <div className="border-2 border-dashed border-orange-300 dark:border-orange-900/50 rounded-lg p-6 text-center hover:border-orange-500 dark:hover:border-orange-500 transition-colors bg-white dark:bg-card">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleCoaUpload}
                    className="hidden"
                    id="coa-upload"
                    disabled={uploadingCoa}
                  />
                  <label
                    htmlFor="coa-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <FileCheck className="w-10 h-10 text-orange-500 dark:text-orange-400 mb-2" />
                    <p className="text-sm font-medium text-gray-700 dark:text-foreground mb-1">
                      {uploadingCoa ? "Uploading..." : "Upload COA Certificate(s)"}
                    </p>
                  </label>
                </div>

                {coaCertificates.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                    {coaCertificates.map((url, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={url}
                          alt={`COA ${index + 1}`}
                          className="w-full h-24 object-cover rounded-lg border-2 border-orange-200 dark:border-orange-900/50"
                        />
                        <button
                          type="button"
                          onClick={() => removeCoa(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Shipping Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5" />
                Shipping & Pickup
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Package Dimensions & Weight
                </h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Length
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={length}
                        onChange={(e) => setLength(e.target.value)}
                        placeholder="0"
                        min="0"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Width
                    </label>
                    <Input
                      type="number"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      placeholder="0"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Height
                    </label>
                    <Input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="0"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unit
                    </label>
                    <MobileSelector
                      value={distanceUnit}
                      onValueChange={setDistanceUnit}
                      title="Distance Unit"
                      trigger={<span>{distanceUnit === "in" ? "Inches (in)" : "Centimeters (cm)"}</span>}
                      items={[{ value: "in", label: "Inches (in)" }, { value: "cm", label: "Centimeters (cm)" }]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Weight
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        placeholder="0"
                        min="0"
                        step="0.1"
                      />
                      <MobileSelector
                        value={weightUnit}
                        onValueChange={setWeightUnit}
                        title="Weight Unit"
                        trigger={<span>{weightUnit}</span>}
                        items={[
                          { value: "lb", label: "Pounds (lb)" },
                          { value: "oz", label: "Ounces (oz)" },
                          { value: "kg", label: "Kilograms (kg)" },
                          { value: "g", label: "Grams (g)" }
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <div className="space-y-0.5">
                    <Label className="text-base dark:text-foreground">Local Pickup Available</Label>
                    <p className="text-sm text-gray-500 dark:text-muted-foreground">
                      Allow buyers to pick up this item in person
                    </p>
                  </div>
                  <Switch
                    checked={offersLocalPickup}
                    onCheckedChange={setOffersLocalPickup}
                  />
                </div>

                {offersLocalPickup && (
                  <div className="ml-1 pl-4 border-l-2 border-orange-200 dark:border-orange-900/50">
                    <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-2">
                      Pickup Instructions / Location
                    </label>
                    <Textarea
                      value={pickupInstructions}
                      onChange={(e) => setPickupInstructions(e.target.value)}
                      placeholder="e.g., Available for pickup in downtown Chicago. Weekends only."
                      rows={2}
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Grading Information */}
          <Card>
            <CardHeader>
              <CardTitle>Grading Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Grade Status
                </label>
                <MobileSelector
                  value={gradeStatus}
                  onValueChange={setGradeStatus}
                  title="Grade Status"
                  trigger={<span>{GRADE_STATUS.find(s => s.value === gradeStatus)?.label || "Select grade status"}</span>}
                  items={GRADE_STATUS.map(s => ({ value: s.value, label: s.label }))}
                />
              </div>

              {(gradeStatus === "graded" || gradeStatus === "graded_signed") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Grading Company
                    </label>
                    <Input
                      value={gradingCompany}
                      onChange={(e) => setGradingCompany(e.target.value)}
                      placeholder="e.g., PSA, BGS, SGC"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Grade Value
                    </label>
                    <Input
                      value={gradeValue}
                      onChange={(e) => setGradeValue(e.target.value)}
                      placeholder="e.g., 10, 9.5, Gem Mint"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Categories & Attributes */}
          <Card>
            <CardHeader>
              <CardTitle className="bg-gradient-to-r from-orange-600 to-amber-600 dark:from-orange-400 dark:to-amber-400 bg-clip-text text-transparent">
                Categories & Attributes
              </CardTitle>
              <p className="text-sm text-gray-600 dark:text-muted-foreground mt-1">
                Select all applicable categories to help buyers find your item
              </p>
            </CardHeader>
            <CardContent>
              <CategorySelector
                selectedCategories={selectedCategories}
                onChange={setSelectedCategories}
              />
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex gap-4">
            <Link to={createPageUrl("MyListings")} className="flex-1">
              <Button
                type="button"
                variant="outline"
                className="w-full"
              >
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={isSubmitting || uploadingImage || uploadingCoa}
              className="flex-1 bg-orange-600 hover:bg-orange-700"
            >
              {isSubmitting ? "Saving Changes..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}