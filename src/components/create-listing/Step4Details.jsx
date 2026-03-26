import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MobileSelector from "@/components/MobileSelector";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, X, ShieldCheck, FileCheck, ImageIcon, AlertCircle, Package, AlertTriangle, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AICoaAnalyzer from "../AICoaAnalyzer";
import { AUTHENTICATORS, GRADE_STATUS } from "./constants";


export default function Step4Details({ data, updateData, onNext, onBack }) {
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingCoa, setUploadingCoa] = useState(false);

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
      updateData({ images: [...(data.images || []), ...uploadedUrls] });
    } catch (error) {
      console.error("Error uploading images:", error);
      alert("Failed to upload images.");
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
      updateData({ coaCertificates: [...(data.coaCertificates || []), ...uploadedUrls] });
    } catch (error) {
      console.error("Error uploading COA:", error);
      alert("Failed to upload COA.");
    } finally {
      setUploadingCoa(false);
    }
  };

  const removeImage = (index) => {
    const newImages = data.images.filter((_, i) => i !== index);
    updateData({ images: newImages });
  };

  const removeCoa = (index) => {
    const newCoa = data.coaCertificates.filter((_, i) => i !== index);
    updateData({ coaCertificates: newCoa, aiAnalysis: null });
  };

  const handleAiAnalysisComplete = (analysis) => {
    const updates = { aiAnalysis: analysis };
    
    // Auto-populate dimensions if detected
    if (analysis.dimensions) {
      const { length, width, height, unit } = analysis.dimensions;
      if (length !== null) updates.length = length;
      if (width !== null) updates.width = width;
      if (height !== null) updates.height = height;
      if (unit !== null) updates.distance_unit = unit;
    }
    
    updateData(updates);
  };

  const isValid = () => {
    // Images are always required
    if (!data.images || data.images.length === 0) return false;

    if (!data.price) return false;
    if (!data.weight || !data.length || !data.width || !data.height) return false;
    
    if (data.isSigned || data.isFineArt) {
        if (!data.authenticator) return false;
        if (data.authenticator === "Other" && !data.customAuthenticator) return false;
        
        // COA is optional for original artists
        const isCoaOptional = data.isFineArt && data.isOriginalArtist;
        if (!isCoaOptional && (!data.coaCertificates || data.coaCertificates.length === 0)) return false;
    }
    return true;
  };

  // Auto-select Credabilia for original artists
  useEffect(() => {
    if (data.isFineArt && data.isOriginalArtist && !data.authenticator) {
      updateData({ authenticator: "Credabilia" });
    }
  }, [data.isFineArt, data.isOriginalArtist]);

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Missing Details & Proof</h2>
        <p className="text-gray-600">
            Upload images and provide authentication details.
        </p>
      </div>

      {/* Images */}
      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Item Images *
            </CardTitle>
        </CardHeader>
        <CardContent>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-orange-500 transition-colors">
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                    id="step4-image-upload"
                    disabled={uploadingImage}
                />
                <label htmlFor="step4-image-upload" className="cursor-pointer flex flex-col items-center">
                    <Upload className="w-10 h-10 text-gray-400 mb-2" />
                    <p className="text-sm font-medium text-gray-700">
                        {uploadingImage ? "Uploading..." : "Click to upload images"}
                    </p>
                </label>
            </div>
            {data.images?.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-4">
                    {data.images.map((url, index) => (
                        <div key={index} className="relative group aspect-square">
                            <img src={url} alt="Item" className="w-full h-full object-cover rounded-md" />
                            <button
                                onClick={() => removeImage(index)}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </CardContent>
      </Card>

      {/* Pricing */}
      <Card>
        <CardHeader>
            <CardTitle>Pricing</CardTitle>
        </CardHeader>
        <CardContent>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price (USD) *</label>
            <Input 
                type="number" 
                value={data.price} 
                onChange={(e) => updateData({ price: e.target.value })} 
                placeholder="0.00"
                min="0"
                step="0.01"
            />
        </CardContent>
      </Card>

      {/* Local Pickup Option */}
      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Local Pickup
            </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-base">Offer Local Pickup?</Label>
                    <p className="text-sm text-gray-500">
                        Allow buyers to pick up the item in person to save on shipping.
                    </p>
                </div>
                <Switch
                    checked={data.offersLocalPickup || false}
                    onCheckedChange={(checked) => updateData({ offersLocalPickup: checked })}
                />
            </div>

            {data.offersLocalPickup && (
                <div className="space-y-2">
                    <Label>Pickup Address / Instructions</Label>
                    <Textarea
                        placeholder="Enter the address or general area for pickup (e.g., 'Downtown Chicago, near Union Station'). Detailed instructions can be sent after purchase."
                        value={data.pickupInstructions || ""}
                        onChange={(e) => updateData({ pickupInstructions: e.target.value })}
                    />
                </div>
            )}
        </CardContent>
      </Card>

      {/* Shipping Details */}
      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Shipping Details *
            </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <Alert className="bg-yellow-50 border-yellow-200">
                <AlertTriangle className="w-4 h-4 text-yellow-600" />
                <AlertDescription className="text-yellow-700 font-medium">
                    Warning: Incorrect shipping details may cause carriers to reject your package or charge penalties. Please ensure all measurements are exact.
                </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Weight *</label>
                    <div className="flex gap-2">
                        <Input 
                            type="number" 
                            value={data.weight} 
                            onChange={(e) => updateData({ weight: e.target.value })} 
                            placeholder="0"
                            min="0"
                            step="0.1"
                        />
                        <MobileSelector
                            value={data.weight_unit || "lb"}
                            onValueChange={(val) => updateData({ weight_unit: val })}
                            title="Weight Unit"
                            trigger={<span>{data.weight_unit || "lb"}</span>}
                            items={[
                                { value: "lb", label: "Pounds (lb)" },
                                { value: "oz", label: "Ounces (oz)" },
                                { value: "kg", label: "Kilograms (kg)" },
                                { value: "g", label: "Grams (g)" },
                            ]}
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                    <MobileSelector
                        value={data.distance_unit || "in"}
                        onValueChange={(val) => updateData({ distance_unit: val })}
                        title="Distance Unit"
                        trigger={<span>{data.distance_unit === "cm" ? "Centimeters" : "Inches"}</span>}
                        items={[
                            { value: "in", label: "Inches (in)" },
                            { value: "cm", label: "Centimeters (cm)" },
                        ]}
                    />
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Length</label>
            <Input 
                type="number" 
                value={data.length} 
                onChange={(e) => updateData({ length: e.target.value })} 
                placeholder="Length"
                min="0"
                step="0.1"
            />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Width</label>
            <Input 
                type="number" 
                value={data.width} 
                onChange={(e) => updateData({ width: e.target.value })} 
                placeholder="Width"
                min="0"
                step="0.1"
            />
            </div>
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Height</label>
            <Input 
                type="number" 
                value={data.height} 
                onChange={(e) => updateData({ height: e.target.value })} 
                placeholder="Height"
                min="0"
                step="0.1"
            />
            </div>
            </div>

            <div className="pt-4 border-t border-gray-100 space-y-4">
            <div className="flex items-center justify-between">
            <div className="space-y-0.5">
                <Label className="text-base">Offer Free Shipping?</Label>
                <p className="text-sm text-gray-500">
                    You will cover the shipping cost.
                </p>
            </div>
            <Switch
                checked={data.offers_free_shipping || false}
                onCheckedChange={(checked) => updateData({ offers_free_shipping: checked })}
            />
            </div>

            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Handling Fee ($)</label>
            <Input 
                type="number" 
                value={data.handling_fee} 
                onChange={(e) => updateData({ handling_fee: e.target.value })} 
                placeholder="0.00"
                min="0"
                step="0.01"
            />
            <p className="text-xs text-gray-500 mt-1">Optional fee for packaging and handling materials.</p>
            </div>
            </div>
            </CardContent>
            </Card>

      {/* Authentication (Signed or Fine Art) */}
      {(data.isSigned || data.isFineArt) && (
        <Card className={`border-2 ${data.isFineArt ? 'border-purple-200 bg-purple-50/30' : 'border-orange-200 bg-orange-50/30'}`}>
            <CardHeader>
                <CardTitle className={`flex items-center gap-2 ${data.isFineArt ? 'text-purple-900' : 'text-orange-900'}`}>
                    <ShieldCheck className="w-5 h-5" />
                    {data.isFineArt ? 'Provenance & Authenticity *' : 'Authentication *'}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription>
                        {data.isFineArt 
                          ? "Fine art requires proof of authenticity or provenance." 
                          : "Signed items require proof of authentication."}
                    </AlertDescription>
                </Alert>

                {data.isFineArt && (
                    <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 flex items-center justify-between">
                        <div className="space-y-1">
                            <Label className="text-base font-semibold text-purple-900">Are you the original artist?</Label>
                            <p className="text-xs text-purple-700">Check this if you created this artwork yourself.</p>
                        </div>
                        <Switch 
                            checked={data.isOriginalArtist || false}
                            onCheckedChange={(checked) => {
                                updateData({ 
                                    isOriginalArtist: checked,
                                    authenticator: checked ? "Credabilia" : ""
                                });
                            }}
                        />
                    </div>
                )}

                {!data.isOriginalArtist && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Authenticator *</label>
                        <MobileSelector
                            value={data.authenticator}
                            onValueChange={(val) => updateData({ authenticator: val })}
                            title="Select Authenticator"
                            trigger={<span>{data.authenticator || "Select Authenticator"}</span>}
                            items={Object.entries(AUTHENTICATORS)
                                .filter(([name]) => name !== 'Credabilia')
                                .map(([name, d]) => ({ value: name, label: `${name}${d.tier === 'premium' ? ' ★' : ''}` }))}
                        />
                    </div>
                )}

                {data.isOriginalArtist && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                        <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                            <ShieldCheck className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                            <p className="font-semibold text-green-900">Verified Original Artist</p>
                            <p className="text-sm text-green-700">Certified by Credabilia (Direct from Artist)</p>
                        </div>
                    </div>
                )}



                {data.authenticator === "Other" && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                        <Input 
                            value={data.customAuthenticator} 
                            onChange={(e) => updateData({ customAuthenticator: e.target.value })} 
                            placeholder="Authenticator Name"
                        />
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Certificate ID</label>
                    <Input 
                        value={data.certificateId} 
                        onChange={(e) => updateData({ certificateId: e.target.value })} 
                        placeholder="e.g. PSA-12345"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Upload COA {data.isFineArt && data.isOriginalArtist ? '(Optional)' : '*'}
                    </label>
                    <div className="border-2 border-dashed border-orange-300 rounded-lg p-4 text-center bg-white cursor-pointer hover:border-orange-500">
                         <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleCoaUpload}
                            className="hidden"
                            id="coa-upload"
                            disabled={uploadingCoa}
                        />
                        <label htmlFor="coa-upload" className="cursor-pointer block">
                            <FileCheck className="w-8 h-8 text-orange-500 mx-auto mb-1" />
                            <span className="text-sm text-gray-600">
                                {uploadingCoa ? "Uploading..." : "Upload Certificate Images"}
                            </span>
                        </label>
                    </div>
                    {data.coaCertificates?.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            {data.coaCertificates.map((url, index) => (
                                <div key={index} className="relative group aspect-video">
                                    <img src={url} alt="COA" className="w-full h-full object-cover rounded-md" />
                                    <button
                                        onClick={() => removeCoa(index)}
                                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {data.coaCertificates?.length > 0 && data.authenticator && (
                    <AICoaAnalyzer 
                        coaCertificates={data.coaCertificates}
                        certificateId={data.certificateId}
                        authenticator={data.authenticator === "Other" ? data.customAuthenticator : data.authenticator}
                        onAnalysisComplete={handleAiAnalysisComplete}
                    />
                )}
            </CardContent>
        </Card>
      )}
      
      {/* Grade Status (Optional, Hide for Fine Art) */}
      {!data.isFineArt && (
        <Card>
            <CardContent className="pt-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                         <label className="block text-sm font-medium text-gray-700 mb-1">Grade Status</label>
                     <MobileSelector
                        value={data.gradeStatus}
                        onValueChange={(val) => updateData({ gradeStatus: val })}
                        title="Grade Status"
                        trigger={<span>{GRADE_STATUS.find(s => s.value === data.gradeStatus)?.label || "Select grade"}</span>}
                        items={GRADE_STATUS.map(s => ({ value: s.value, label: s.label }))}
                     />
                </div>
                {(data.gradeStatus?.includes('graded')) && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Grading Company</label>
                            <Input value={data.gradingCompany} onChange={(e) => updateData({ gradingCompany: e.target.value })} placeholder="e.g. PSA" />
                        </div>
                        <div>
                             <label className="block text-sm font-medium text-gray-700 mb-1">Grade Value</label>
                             <Input value={data.gradeValue} onChange={(e) => updateData({ gradeValue: e.target.value })} placeholder="e.g. 10" />
                        </div>
                    </>
                )}
                </div>
            </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button 
            onClick={onNext} 
            className="bg-orange-600 hover:bg-orange-700"
            disabled={!isValid()}
        >
            Continue
        </Button>
      </div>
    </div>
  );
}