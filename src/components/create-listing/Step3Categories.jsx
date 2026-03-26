import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import CategorySelector from "../CategorySelector";
import { SPORTS } from "./constants";

export default function Step3Categories({ data, updateData, onNext, onBack }) {
  
  const handleCategoryChange = (newCategories) => {
    updateData({ selectedCategories: newCategories });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Review Details</h2>
        <p className="text-gray-600">
            The AI has pre-selected these fields based on your description. Please review and edit if needed.
        </p>
      </div>

      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                Key Attributes
            </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Listing Title</label>
                <Input 
                    value={data.title} 
                    onChange={(e) => updateData({ title: e.target.value })} 
                />
            </div>
            
            {!data.isFineArt && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sport</label>
                        <Select value={data.sport} onValueChange={(val) => updateData({ sport: val })}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select Sport" />
                            </SelectTrigger>
                            <SelectContent>
                                {SPORTS.map(s => (
                                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                        <Input 
                            value={data.year} 
                            onChange={(e) => updateData({ year: e.target.value })} 
                            placeholder="e.g. 1998"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                        <Input 
                            value={data.team} 
                            onChange={(e) => updateData({ team: e.target.value })} 
                            placeholder="e.g. Chicago Bulls"
                        />
                    </div>
                    {data.isSigned && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Signer</label>
                            <Input 
                                value={data.signer} 
                                onChange={(e) => updateData({ signer: e.target.value })} 
                                placeholder="e.g. Michael Jordan"
                            />
                        </div>
                    )}
                </div>
              </>
            )}

            {data.isFineArt && (
                <div className="bg-purple-50 p-4 rounded-lg">
                    <p className="text-sm text-purple-800 font-medium">
                        Artist: {data.artistName} {data.isOriginalArtist && "(Original)"}
                    </p>
                    <p className="text-sm text-purple-700">
                        Medium: {data.medium}
                    </p>
                </div>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle>Categories & Subcategories</CardTitle>
        </CardHeader>
        <CardContent>
            <CategorySelector 
                selectedCategories={data.selectedCategories} 
                onChange={handleCategoryChange} 
            />
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>Back</Button>
        <Button onClick={onNext} className="bg-orange-600 hover:bg-orange-700">Confirm & Continue</Button>
      </div>
    </div>
  );
}