import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import {
  Palette,
  CheckCircle,
  XCircle,
  ExternalLink,
  ArrowLeft,
  Instagram,
  Globe
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function AdminArtists() {
  const queryClient = useQueryClient();

  const { data: pendingArtists = [], isLoading } = useQuery({
    queryKey: ['pending-artists'],
    queryFn: async () => {
      return await base44.entities.Artist.filter({ status: 'pending_approval' });
    }
  });

  const approveMutation = useMutation({
    mutationFn: async (artist) => {
      // Idempotency guard — prevent double-approving
      const fresh = await base44.entities.Artist.filter({ id: artist.id });
      if (fresh[0]?.status === 'active') {
        throw new Error("Artist is already approved.");
      }

      // 1. Update artist record
      await base44.entities.Artist.update(artist.id, { status: 'active' });

      // 2. Update linked user record — use user_id if available, fall back to email lookup
      let linkedUser = null;
      if (artist.user_id) {
        try {
          const users = await base44.entities.User.filter({ id: artist.user_id });
          linkedUser = users[0] || null;
        } catch (_) {}
      }
      if (!linkedUser) {
        const users = await base44.entities.User.filter({ email: artist.user_email });
        linkedUser = users[0] || null;
      }
      if (linkedUser) {
        await base44.entities.User.update(linkedUser.id, {
          user_type: 'artist',
          artist_id: artist.id,
        });
      } else {
        console.warn("[AdminArtists] Could not find linked user for artist:", artist.user_email);
        toast.warning("Artist approved, but linked user record not found. User may need to refresh.");
      }

      // 3. Send notification
      await base44.entities.Notification.create({
        user_email: artist.user_email,
        type: "audit_completed",
        title: "Artist Profile Approved! 🎨",
        message: "Your artist application has been approved. You can now publish original artworks and accept commissions.",
        link_url: "ArtistDashboard"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-artists'] });
      toast.success("Artist approved successfully!");
    },
    onError: (error) => {
      console.error("[AdminArtists] Approve failed:", error);
      toast.error("Approval failed: " + (error?.message || "Unknown error"));
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (artistId) => {
      await base44.entities.Artist.update(artistId, { status: 'rejected' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-artists'] });
      toast.success("Artist rejected.");
    },
    onError: (error) => {
      toast.error("Rejection failed: " + (error?.message || "Unknown error"));
    }
  });

  if (isLoading) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-5xl mx-auto">
        <Link to={createPageUrl("AdminApprovals")} className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Approvals
        </Link>

        <div className="flex items-center gap-3 mb-8">
          <div className="bg-rose-100 text-rose-600 p-2 rounded-lg">
            <Palette className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Artist Applications</h1>
            <p className="text-gray-600">Review and approve artist portfolios</p>
          </div>
        </div>

        {pendingArtists.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">All Caught Up!</h3>
            <p className="text-gray-500">No pending artist applications.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {pendingArtists.map((artist) => (
              <Card key={artist.id}>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{artist.artist_name}</h3>
                          <p className="text-sm text-gray-500">{artist.user_email}</p>
                        </div>
                        <Badge className="bg-yellow-100 text-yellow-700">Pending Review</Badge>
                      </div>

                      <div className="space-y-4 mb-6">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Bio</p>
                          <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                            {artist.bio || "No bio provided."}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-4">
                          {artist.portfolio_url && (
                            <a 
                              href={artist.portfolio_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                            >
                              <Globe className="w-4 h-4" />
                              Portfolio Website
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {artist.instagram_handle && (
                            <div className="flex items-center gap-2 text-sm text-pink-600">
                              <Instagram className="w-4 h-4" />
                              @{artist.instagram_handle.replace('@', '')}
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Specialties</p>
                          <div className="flex flex-wrap gap-2">
                            {artist.specialties?.map(spec => (
                              <Badge key={spec} variant="outline">{spec}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 justify-center border-l pl-6 md:w-48">
                      <Button 
                        onClick={() => approveMutation.mutate(artist)}
                        disabled={approveMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 w-full"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Approve
                      </Button>
                      <Button 
                        onClick={() => rejectMutation.mutate(artist.id)}
                        disabled={rejectMutation.isPending}
                        variant="outline"
                        className="text-red-600 hover:bg-red-50 w-full border-red-200"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}