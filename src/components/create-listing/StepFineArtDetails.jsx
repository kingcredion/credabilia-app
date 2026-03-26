import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Palette, Info, Sparkles, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function StepFineArtDetails({ data, updateData, onNext, onBack, user, artistStatus }) {
  const [aiInput, setAiInput] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const isValid = data.title && data.artistName && data.price && data.medium && data.sport;
  
  // Ensure artist name is populated if original artist is selected and user has a name
  useEffect(() => {
    if (data.isOriginalArtist && !data.artistName && user?.full_name) {
       updateData({ artistName: user.full_name });
    }
  }, [data.isOriginalArtist, user]);

  // Defensive checks for user and user_type
  const userType = user?.user_type ? user.user_type.toLowerCase() : '';
  const showArtistAccountPromo = data.isOriginalArtist && userType !== 'artist';
  // Only show pending warning if we are sure they are an artist AND status is explicitly not active (but defined)
  // or if we want to be safe, just check if they are artist and status isn't active
  const showPendingWarning = data.isOriginalArtist && userType === 'artist' && artistStatus !== 'active';

  const handleAiAutoFill = async () => {
    if (!aiInput.trim()) return;
    setIsAnalyzing(true);
    
    try {
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Extract fine art details from this description. 
        Input: "${aiInput}"
        
        Return a JSON object with these keys (use null if not found):
        - title (string)
        - artistName (string)
        - medium (string)
        - artworkCreationYear (number)
        - dimensions (string)
        - price (number, remove currency symbols)
        - description (string, a polished version of the input)
        - provenance (string)
        
        If the user says "I painted this" or implies they are the artist, set isOriginalArtist to true.`,
        response_json_schema: {
          type: "object",
          properties: {
            title: { type: ["string", "null"] },
            artistName: { type: ["string", "null"] },
            medium: { type: ["string", "null"] },
            artworkCreationYear: { type: ["integer", "null"] },
            dimensions: { type: ["string", "null"] },
            price: { type: ["number", "null"] },
            description: { type: ["string", "null"] },
            provenance: { type: ["string", "null"] },
            isOriginalArtist: { type: "boolean" }
          }
        }
      });

      // Merge results with existing data
      updateData({
        ...data,
        ...response,
        // Keep existing values if AI returned null but we had something (optional choice, but usually better to overwrite if empty)
        artistName: response.artistName || data.artistName,
        title: response.title || data.title,
        medium: response.medium || data.medium,
        price: response.price || data.price,
        description: response.description || data.description,
        provenance: response.provenance || data.provenance,
        artworkCreationYear: response.artworkCreationYear || data.artworkCreationYear,
        dimensions: response.dimensions || data.dimensions,
        isOriginalArtist: response.isOriginalArtist || data.isOriginalArtist
      });

    } catch (error) {
      console.error("AI Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
          <Palette className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Fine Art Details</h2>
          <p className="text-gray-500 text-sm">Tell us about the artwork</p>
        </div>
      </div>

      {/* AI Assist Section */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-purple-900">
            <Sparkles className="w-4 h-4 text-purple-600" />
            AI Assist: Describe to Auto-Fill
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea 
            placeholder="e.g. 'I'm selling an original oil painting titled Sunset Valley by me, painted in 2023 on a 24x36 canvas. Asking $500. It's in perfect condition.'"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            className="bg-white/80"
            rows={3}
          />
          <Button 
            onClick={handleAiAutoFill} 
            disabled={!aiInput.trim() || isAnalyzing}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700 w-full sm:w-auto"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Auto-Fill Details
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-6">
          
          <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base font-semibold text-purple-900">Are you the original artist?</Label>
              <p className="text-xs text-purple-700">Check this if you created this artwork yourself.</p>
            </div>
            <Switch 
              checked={data.isOriginalArtist || false}
              onCheckedChange={(checked) => updateData({ isOriginalArtist: checked })}
            />
          </div>

          {showArtistAccountPromo && (
            <div className="bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 rounded-xl p-6 flex flex-col md:flex-row items-center gap-6 animate-in fade-in zoom-in duration-300">
              <div className="w-24 h-24 flex-shrink-0 bg-white rounded-full shadow-md overflow-hidden border-2 border-pink-200">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/d25cfa59f_Photoroom_20251216_110752.png" 
                  alt="Artist Account" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-lg font-bold text-pink-900 mb-1">
                  Unlock Your Artist Profile
                </h3>
                <p className="text-sm text-pink-800 mb-3">
                  You're listing an original work! To publish and sell your own art on Credabilia, you need an Artist Account. 
                  This item will be saved as a draft until your artist profile is active.
                </p>
                <Button 
                  onClick={() => window.location.href = "/Settings"} 
                  size="sm"
                  className="bg-pink-600 hover:bg-pink-700 text-white border-0"
                >
                  Apply for Artist Account
                </Button>
              </div>
            </div>
          )}

          {showPendingWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-center gap-4 animate-in fade-in zoom-in duration-300">
              <div className="p-3 bg-white rounded-full shadow-sm border border-amber-100 text-amber-600">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-amber-900 mb-1">
                  Artist Profile Pending Review
                </h3>
                <p className="text-sm text-amber-800">
                  Your artist application is currently under review. 
                  You can proceed to create this listing, but it will be saved as a <strong>Draft</strong> and won't be public until your account is approved.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Artist Name *</Label>
              <Input 
                value={data.artistName || ""}
                onChange={(e) => updateData({ artistName: e.target.value })}
                placeholder="e.g. Pablo Picasso"
              />
            </div>
            <div className="space-y-2">
              <Label>Artwork Title *</Label>
              <Input 
                value={data.title || ""}
                onChange={(e) => updateData({ title: e.target.value })}
                placeholder="e.g. Starry Night"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Category *</Label>
              {/* Note: We map fine art categories to the 'sport' field in listingData as per legacy structure */}
              {/* In the future, we should probably use a separate 'category' field */}
              <Select
                value={data.sport || ""}
                onValueChange={(value) => updateData({ sport: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paintings">Paintings</SelectItem>
                  <SelectItem value="sculptures">Sculptures</SelectItem>
                  <SelectItem value="drawings">Drawings</SelectItem>
                  <SelectItem value="textile_art">Textile Art</SelectItem>
                  <SelectItem value="other_fine_art">Other Fine Art</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Medium *</Label>
              <Input 
                value={data.medium || ""}
                onChange={(e) => updateData({ medium: e.target.value })}
                placeholder="e.g. Oil on Canvas, Bronze, Acrylic"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Year Created</Label>
              <Input 
                type="number"
                value={data.artworkCreationYear || ""}
                onChange={(e) => updateData({ artworkCreationYear: e.target.value })}
                placeholder="YYYY"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Dimensions</Label>
              <Input 
                value={data.dimensions || ""}
                onChange={(e) => updateData({ dimensions: e.target.value })}
                placeholder="e.g. 24 x 36 inches"
              />
            </div>
            <div className="space-y-2">
              <Label>Price ($) *</Label>
              <Input 
                type="number"
                value={data.price || ""}
                onChange={(e) => updateData({ price: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea 
              value={data.description || ""}
              onChange={(e) => updateData({ description: e.target.value })}
              placeholder="Describe the style, inspiration, condition, and any other details..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Provenance
              <Info className="w-4 h-4 text-gray-400" />
            </Label>
            <Textarea 
              value={data.provenance || ""}
              onChange={(e) => updateData({ provenance: e.target.value })}
              placeholder="History of ownership (e.g. Purchased from Gallery X in 2010)"
              rows={3}
            />
            {data.isOriginalArtist && (
              <p className="text-xs text-green-600 mt-1">
                ✓ Since you are the artist, provenance will be listed as "Direct from Artist".
              </p>
            )}
          </div>

        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <Button 
          onClick={onNext} 
          disabled={!isValid}
          className="bg-purple-600 hover:bg-purple-700 gap-2"
        >
          Next Step <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}