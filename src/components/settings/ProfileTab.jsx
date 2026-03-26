import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import LanguageSelector from "@/components/LanguageSelector";

export default function ProfileTab({ user, onUpdate }) {
  const [formData, setFormData] = useState({
    full_name: user.full_name || "",
    location: user.location || "",
    preferred_language: user.preferred_language || "en",
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data) => {
      await base44.auth.updateMe(data);
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      if (onUpdate) onUpdate();
    },
    onError: () => {
      toast.error("Failed to update profile");
    }
  });

  const handleSave = () => {
    updateProfileMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      {/* Basic Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your basic profile details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input 
                value={formData.full_name}
                onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                placeholder="Your name"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                value={user.email} 
                disabled 
                className="bg-muted cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">
                Contact support to change your email address.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Input 
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
                placeholder="e.g. New York, USA"
              />
            </div>

            <div className="space-y-2">
              <Label>Language</Label>
              <LanguageSelector 
                value={formData.preferred_language}
                onSelect={(val) => setFormData({...formData, preferred_language: val})}
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button 
              onClick={handleSave} 
              disabled={updateProfileMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Avatar Notice */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-400/30">
        <CardContent className="p-4">
          <p className="text-sm text-blue-900 dark:text-blue-200">
            <strong>Tip:</strong> You can change your avatar on your public profile page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}