import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wand2, Loader2, CheckCircle2, Palette } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function Step5Finalize({ data, updateData, onSubmit, onBack, isSubmitting, user, artistStatus }) {
  const [generating, setGenerating] = useState(false);

  const userType = user?.user_type ? user.user_type.toLowerCase() : '';
  const isPendingArtist = userType === 'artist' && artistStatus !== 'active';
  const isRestrictedNonArtist = data.isOriginalArtist && userType !== 'artist';
  
  // Combine restriction check: either restricted because not an artist, or because artist account is pending
  const isArtistRestricted = data.isFineArt && (isRestrictedNonArtist || isPendingArtist);

  const generateFinalDescription = async () => {
    setGenerating(true);
    try {
        const categoriesText = Object.entries(data.selectedCategories || {})
        .filter(([_, values]) => values && values.length > 0)
        .map(([key, values]) => `${key.replace('_', ' ')}: ${values.join(', ')}`)
        .join('\n');

        let specifics = "";
        if (data.isFineArt) {
            specifics = `
            Artist: ${data.artistName} ${data.isOriginalArtist ? "(Original Work by Vendor)" : ""}
            Medium: ${data.medium}
            Dimensions: ${data.dimensions}
            Provenance: ${data.provenance}
            Creation Year: ${data.artworkCreationYear}
            `;
        } else {
            specifics = `
            Sport: ${data.sport}
            Team: ${data.team}
            Signer: ${data.signer}
            Year: ${data.year}
            Authenticator: ${data.authenticator}
            Cert ID: ${data.certificateId}
            `;
        }

        const prompt = `Generate a final, professional sales description for this item.
        
        Title: ${data.title}
        Internal Notes: ${data.internalDescription || data.description}
        Price: $${data.price}
        ${specifics}
        
        Attributes:
        ${categoriesText}
        
        Write a persuasive, cohesive description (approx 150 words) suitable for a high-end marketplace. ${data.isFineArt ? "Focus on the artistic style, medium, and provenance." : ""}`;

        const desc = await base44.integrations.Core.InvokeLLM({ prompt });
        updateData({ description: desc });
    } catch (error) {
        console.error("Gen desc error:", error);
    } finally {
        setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Final Review</h2>
        <p className="text-gray-600">
            Generate your final description and publish your listing.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
              <span>Final Description</span>
              <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={generateFinalDescription}
                  disabled={generating}
                  className="text-purple-600 border-purple-200"
              >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                  {data.description ? "Regenerate" : "Generate Item Description"}
              </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
            <Textarea 
                value={data.description || ""} 
                onChange={(e) => updateData({ description: e.target.value })}
                rows={8}
                placeholder="Click 'Generate Item Description' to create a professional listing description..."
            />
        </CardContent>
      </Card>
      
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="font-bold text-green-800 mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Ready to Publish
        </h3>
        <ul className="list-disc list-inside text-sm text-green-700 space-y-1">
            <li>Basic info and attributes set</li>
            <li>{data.images?.length} Images uploaded</li>
            {data.isSigned && <li>Authentication provided ({data.authenticator})</li>}
            {data.isFineArt && <li>Provenance/Authenticity details provided</li>}
            <li>Price set to ${data.price}</li>
        </ul>
      </div>

      {/* Artist Account Restriction Warning */}
      {isArtistRestricted && (
        <div className={`border rounded-lg p-4 mb-6 ${isPendingArtist ? 'bg-amber-50 border-amber-200' : 'bg-pink-50 border-pink-200'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center border ${isPendingArtist ? 'border-amber-100 text-amber-600' : 'border-pink-100 text-pink-600'}`}>
              {isPendingArtist ? <Loader2 className="w-5 h-5 animate-spin" /> : <Palette className="w-5 h-5" />}
            </div>
            <div>
              <h4 className={`font-bold ${isPendingArtist ? 'text-amber-900' : 'text-pink-900'}`}>
                {isPendingArtist ? 'Artist Profile Under Review' : 'Artist Account Required'}
              </h4>
              <p className={`text-sm ${isPendingArtist ? 'text-amber-800' : 'text-pink-800'}`}>
                {isPendingArtist 
                  ? "Your artist application is pending. This item will be saved as a Draft until your profile is approved."
                  : "Because you are listing this as your own original work, this item will be saved as a Draft. It cannot be published until you upgrade to an Artist Account."}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button 
            onClick={onSubmit} 
            className={`${
              isArtistRestricted
                ? "bg-gray-600 hover:bg-gray-700" 
                : "bg-orange-600 hover:bg-orange-700"
            } text-lg px-8`}
            disabled={!data.description || isSubmitting}
        >
            {isSubmitting 
              ? "Processing..." 
              : isArtistRestricted
                ? "Save as Draft"
                : "Create Listing (+10 XP)"}
        </Button>
      </div>
    </div>
  );
}