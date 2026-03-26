import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, Palette } from "lucide-react";

export default function RequestCommissionDialog({ open, onOpenChange, artist, user }) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    medium: "",
    dimensions: "",
    budget_range: "",
    deadline: ""
  });

  const queryClient = useQueryClient();

  const createCommissionMutation = useMutation({
    mutationFn: async (data) => {
      if (!user) throw new Error("You must be logged in to request a commission.");
      
      return await base44.entities.CommissionRequest.create({
        ...data,
        collector_email: user.email,
        collector_name: user.full_name || user.email,
        artist_id: artist.user_id, // assuming artist entity has user_id
        artist_email: artist.user_email,
        status: "pending_review"
      });
    },
    onSuccess: (newCommission) => {
      onOpenChange(false);
      // Create initial message
      base44.entities.Message.create({
        sender_email: user.email,
        sender_name: user.full_name || user.email,
        receiver_email: artist.user_email,
        receiver_name: artist.artist_name,
        message: `🎨 New Commission Request: ${formData.title}\n\n${formData.description}\n\nBudget: ${formData.budget_range}\nDeadline: ${formData.deadline}`,
        conversation_type: "commission_request",
        commission_request_id: newCommission.id
      });
      setFormData({
        title: "",
        description: "",
        medium: "",
        dimensions: "",
        budget_range: "",
        deadline: ""
      });
      alert("Commission request sent successfully!");
      // Invalidate relevant queries if needed
    },
    onError: (error) => {
      console.error("Failed to send request:", error);
      alert("Failed to send commission request. Please try again.");
    }
  });

  const handleSubmit = () => {
    if (!formData.title || !formData.description) return;
    createCommissionMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-pink-600" />
            Request Commission
          </DialogTitle>
          <DialogDescription>
            Send a custom artwork request to {artist.artist_name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Project Title *</Label>
            <Input 
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
              placeholder="e.g. Portrait of my dog"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea 
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Describe your vision, style preferences, and any specific details..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Preferred Medium</Label>
              <Input 
                value={formData.medium}
                onChange={(e) => setFormData({...formData, medium: e.target.value})}
                placeholder="e.g. Oil on Canvas"
              />
            </div>
            <div className="space-y-2">
              <Label>Dimensions</Label>
              <Input 
                value={formData.dimensions}
                onChange={(e) => setFormData({...formData, dimensions: e.target.value})}
                placeholder="e.g. 24x36 inches"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Budget Range</Label>
              <Input 
                value={formData.budget_range}
                onChange={(e) => setFormData({...formData, budget_range: e.target.value})}
                placeholder="e.g. $200 - $400"
              />
            </div>
            <div className="space-y-2">
              <Label>Desired Deadline</Label>
              <Input 
                type="date"
                value={formData.deadline}
                onChange={(e) => setFormData({...formData, deadline: e.target.value})}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!formData.title || !formData.description || createCommissionMutation.isPending}
            className="bg-pink-600 hover:bg-pink-700"
          >
            {createCommissionMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              "Send Request"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}