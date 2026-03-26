import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import OnboardingFlow from "../components/OnboardingFlow";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

export default function OnboardingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const type = queryParams.get("type");
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (error) {
        console.error("Error loading user:", error);
      }
    };
    loadUser();
  }, []);

  const handleOnboardingComplete = async (selectedRole, onboardingData) => {
    try {
      const updateData = {
        onboarding_completed: true
      };

      // Submit applications for special roles — DO NOT change current_role
      if (onboardingData.user_type === "indiegogo_investor") {
        const indiegogoData = onboardingData.indiegogo_data;
        await base44.entities.IndiegogoInvestor.create({
          user_id: user.id,
          user_email: user.email,
          indiegogo_backer_id: indiegogoData.indiegogo_backer_id,
          indiegogo_profile_url: indiegogoData.indiegogo_profile_url || "",
          status: "pending_verification"
        });
      }
      else if (onboardingData.user_type === "picture_frame_shop") {
        const frameShopData = onboardingData.frame_shop_data;
        const frameShop = await base44.entities.FrameShop.create({
          user_email: user.email,
          business_name: frameShopData.business_name,
          description: frameShopData.description,
          address: frameShopData.address,
          latitude: frameShopData.latitude,
          longitude: frameShopData.longitude,
          contact_phone: frameShopData.contact_phone || "",
          website_url: frameShopData.website_url || "",
          services_offered: frameShopData.services_offered || [],
          portfolio_images: frameShopData.portfolio_images || [],
          status: "pending_approval"
        });

        updateData.frame_shop_id = frameShop.id;
      }
      else if (onboardingData.user_type === "influencer") {
        const influencerData = onboardingData.influencer_data;
        const referralCode = `INF-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

        const influencer = await base44.entities.Influencer.create({
          user_id: user.id,
          user_email: user.email,
          referral_code: referralCode,
          platforms: influencerData.platforms || [],
          application_notes: influencerData.application_notes || "",
          status: "pending_approval",
          commission_rate: 0.5
        });

        updateData.influencer_id = influencer.id;
      }
      else if (onboardingData.user_type === "artist") {
        const artistData = onboardingData.artist_data;

        const artist = await base44.entities.Artist.create({
          user_id: user.id,
          user_email: user.email,
          artist_name: artistData.artist_name,
          bio: artistData.bio || "",
          portfolio_url: artistData.portfolio_url || "",
          instagram_handle: artistData.instagram_handle || "",
          specialties: artistData.specialties || [],
          status: "pending_approval",
          commission_open: false
        });

        updateData.artist_id = artist.id;
      }
      else if (onboardingData.user_type === "individual") {
        // Standard individual completion — save location, interests, and language
        updateData.interests_tags = onboardingData.interests_tags || [];
        updateData.location = onboardingData.location || "";
        if (onboardingData.latitude !== null && onboardingData.latitude !== undefined) {
          updateData.latitude = onboardingData.latitude;
        }
        if (onboardingData.longitude !== null && onboardingData.longitude !== undefined) {
          updateData.longitude = onboardingData.longitude;
        }
        if (onboardingData.language) {
          updateData.preferred_language = onboardingData.language;
        }
      }

      // Only update collected fields; NEVER change current_role
      await base44.auth.updateMe(updateData);
      
      toast.success("✓ Onboarding complete!");

      // Always redirect to Marketplace — users remain collectors
      navigate(createPageUrl("Marketplace"));

    } catch (error) {
      console.error("Error completing onboarding:", error);
      toast.error("Failed to complete onboarding. Please try again.");
    }
  };

  if (!user) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <OnboardingFlow
        open={true}
        onComplete={handleOnboardingComplete}
        initialRole="collector"
        forcedAccountType={type}
        onClose={() => navigate(-1)}
      />
    </div>
  );
}