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
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <Link to={createPageUrl("AdminApprovals")} className="inline-flex items-center text-gray-500 hover:text-gray-900 mb-3 text-sm">
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back to Approvals
        </Link>

        <div className="flex items-center gap-2 mb-4">
          <div className="bg-rose-100 text-rose-600 p-1.5 rounded-lg">
            <Palette className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Artist Applications</h1>
            <p className="text-xs text-gray-500">Review and approve artist portfolios</p>
          </div>
        </div>

        {pendingArtists.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-gray-900 mb-1">All Caught Up!</h3>
            <p className="text-sm text-gray-500">No pending artist applications.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingArtists.map((artist) => (
              <Card key={artist.id}>
                <CardContent className="p-3">
                  {/* Top row: identity + actions */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h3 className="text-sm font-bold text-gray-900">{artist.artist_name}</h3>
                        <Badge className="bg-yellow-100 text-yellow-700 text-[11px] h-5">Pending</Badge>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{artist.user_email}</p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Button onClick={() => approveMutation.mutate(artist)} disabled={approveMutation.isPending} size="sm" className="bg-green-600 hover:bg-green-700 h-8 text-xs px-2.5">
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve
                      </Button>
                      <Button onClick={() => rejectMutation.mutate(artist.id)} disabled={rejectMutation.isPending} variant="outline" size="sm" className="text-red-600 hover:bg-red-50 h-8 text-xs px-2.5 border-red-200">
                        <XCircle className="w-3.5 h-3.5 mr-1" />Reject
                      </Button>
                    </div>
                  </div>

                  {/* Bio — collapsed to 2 lines */}
                  {artist.bio && (
                    <p className="text-xs text-gray-600 bg-gray-50 rounded px-2.5 py-1.5 mb-2 line-clamp-2">{artist.bio}</p>
                  )}

                  {/* Links + specialties */}
                  <div className="flex flex-wrap items-center gap-2">
                    {artist.portfolio_url && (
                      <a href={artist.portfolio_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <Globe className="w-3 h-3" />Portfolio <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                    {artist.instagram_handle && (
                      <span className="flex items-center gap-1 text-xs text-pink-600">
                        <Instagram className="w-3 h-3" />@{artist.instagram_handle.replace('@', '')}
                      </span>
                    )}
                    {artist.specialties?.map(spec => (
                      <Badge key={spec} variant="outline" className="text-[11px] h-5">{spec}</Badge>
                    ))}
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