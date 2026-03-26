import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { AUTHENTICATORS, SPORTS } from "./constants";

export default function Step2Description({ data, updateData, onNext, onBack }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [internalDesc, setInternalDesc] = useState(data.internalDescription || "");

  const handleAnalyze = async () => {
    if (!internalDesc.trim()) return;
    
    setAnalyzing(true);
    try {
      // Prompt logic
      const prompt = `Analyze this item description for a ${data.isSigned ? 'signed' : 'unsigned'} sports memorabilia item:
"${internalDesc}"

Extract the following details in JSON format:
{
  "title": "A professional listing title for this item",
  "sport": "one of: baseball, basketball, football, hockey, boxing, soccer, other",
  "team": "Team name if mentioned",
  "signer": "Signer name if mentioned (only if signed)",
  "year": "Year if mentioned",
  "authenticator": "Authenticator company if mentioned (e.g. PSA, JSA, Beckett)",
  "display_type": ["framed", "unframed", "shadow_box", "encased_slabbed", "mounted"],
  "autograph_status": ["signed", "inscribed", "signed_certified", "raw_signed"],
  "condition_use": ["new_unused", "game_used", "practice_used", "vintage", "replica"],
  "certification_type": ["graded", "hologram_qr", "authentication_pending", "none"],
  "display_readiness": ["wall_ready", "table_display", "protective_case", "custom_plaque"],
  "era_origin": ["modern", "vintage", "classic", "limited_edition", "event_issued"],
  "media_category": ["sports", "entertainment", "music", "historical", "comic_pop_culture"]
}

Use empty strings/arrays if information is missing.
`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
            type: "object",
            properties: {
                title: { type: "string" },
                sport: { type: "string" },
                team: { type: "string" },
                signer: { type: "string" },
                year: { type: "string" },
                authenticator: { type: "string" },
                display_type: { type: "array", items: { type: "string" } },
                autograph_status: { type: "array", items: { type: "string" } },
                condition_use: { type: "array", items: { type: "string" } },
                certification_type: { type: "array", items: { type: "string" } },
                display_readiness: { type: "array", items: { type: "string" } },
                era_origin: { type: "array", items: { type: "string" } },
                media_category: { type: "array", items: { type: "string" } }
            }
        }
      });

      // Process response
      const updates = {
        internalDescription: internalDesc,
        title: response.title || data.title,
        sport: response.sport && SPORTS.includes(response.sport.toLowerCase()) ? response.sport.toLowerCase() : data.sport,
        team: response.team || data.team,
        year: response.year || data.year,
        signer: response.signer || data.signer,
        // Categories
        selectedCategories: {
          display_type: response.display_type || [],
          autograph_status: response.autograph_status || [],
          condition_use: response.condition_use || [],
          certification_type: response.certification_type || [],
          display_readiness: response.display_readiness || [],
          era_origin: response.era_origin || [],
          media_category: response.media_category || []
        }
      };

      // Handle authenticator mapping
      if (response.authenticator) {
        const detectedAuth = response.authenticator.trim();
        const matchedAuthenticator = Object.keys(AUTHENTICATORS).find(
          auth => auth.toLowerCase() === detectedAuth.toLowerCase() ||
                  auth.replace(/\s*\(BAS\)\s*/g, '').toLowerCase() === detectedAuth.toLowerCase()
        );
        
        if (matchedAuthenticator) {
          updates.authenticator = matchedAuthenticator;
        } else if (detectedAuth.length > 2) {
            updates.authenticator = "Other";
            updates.customAuthenticator = detectedAuth;
        }
      }

      updateData(updates);
      onNext();
    } catch (error) {
      console.error("AI Analysis failed:", error);
      alert("AI analysis failed, but you can proceed manually.");
      updateData({ internalDescription: internalDesc });
      onNext();
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Describe your Item</h2>
        <p className="text-gray-600">
            Tell us about it, and our AI will auto-fill the listing details for you.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Internal Description (What are you selling?)
          </label>
          <Textarea
            value={internalDesc}
            onChange={(e) => setInternalDesc(e.target.value)}
            placeholder="e.g. Framed Michael Jordan signed 1997 Chicago Bulls jersey with PSA/DNA COA..."
            rows={5}
            className="text-lg"
          />
          <p className="text-xs text-gray-500 mt-2">
            Include details like year, team, brand, condition, and any authentication.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button 
            onClick={handleAnalyze} 
            disabled={!internalDesc.trim() || analyzing}
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white"
        >
          {analyzing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Analyze & Continue
            </>
          )}
        </Button>
      </div>
    </div>
  );
}