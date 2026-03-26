import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileEdit, XCircle, Palette, FileSpreadsheet, Store, Crown } from "lucide-react";
import ProgressSidebar from "../components/create-listing/ProgressSidebar";
import Step1Signed from "../components/create-listing/Step1Signed";
import Step2Description from "../components/create-listing/Step2Description";
import Step3Categories from "../components/create-listing/Step3Categories";
import Step4Details from "../components/create-listing/Step4Details";
import Step5Finalize from "../components/create-listing/Step5Finalize";
import StepFineArtDetails from "../components/create-listing/StepFineArtDetails";
import BulkUpload from "../components/create-listing/BulkUpload";
import ImportCard from "../components/create-listing/ImportCard";
import { AUTHENTICATORS } from "../components/create-listing/constants";
import StripeRestrictionModal from "../components/StripeRestrictionModal";
import SubscriptionCheckoutDialog from "../components/SubscriptionCheckoutDialog";
import { getUserPermissions } from "@/lib/permissions";
import { calculateRankingScore } from "@/utils/marketplaceRanking";

const STEPS = [
  { id: 'signed', label: "Item Type", description: "Signed or Unsigned" },
  { id: 'description', label: "Description", description: "AI Auto-fill" },
  { id: 'categories', label: "Review", description: "Verify Categories" },
  { id: 'details', label: "Details & Proof", description: "Photos & Auth" },
  { id: 'finalize', label: "Finalize", description: "Generate & Publish" }
];

export default function CreateListing() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [showLandingPage, setShowLandingPage] = useState(true);
  const [showSubscriptionDialog, setShowSubscriptionDialog] = useState(false);

  // Listing Data State
  const [listingData, setListingData] = useState({
    listingMode: 'single', // single or bulk
    isSigned: null,
    isFineArt: false,
    artistName: "",
    isOriginalArtist: false,
    medium: "",
    dimensions: "",
    artworkCreationYear: "",
    provenance: "",
    internalDescription: "",
    title: "",
    description: "",
    price: "",
    images: [],
    coaCertificates: [],
    sport: "",
    signer: "",
    team: "",
    year: "",
    gradeStatus: "raw",
    gradingCompany: "",
    gradeValue: "",
    authenticator: "",
    customAuthenticator: "",
    certificateId: "",
    selectedCategories: {
      display_type: [],
      autograph_status: [],
      condition_use: [],
      certification_type: [],
      display_readiness: [],
      era_origin: [],
      media_category: []
    },
    aiAnalysis: null
  });

  useEffect(() => {
    loadUser();
    
    // Check for successful subscription in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('subscription') === 'success') {
      setShowLandingPage(true);
      window.history.replaceState({}, '', window.location.pathname);
      // Reload subscription data multiple times to ensure webhook processed
      setTimeout(() => loadUser(), 1000);
      setTimeout(() => loadUser(), 3000);
      setTimeout(() => loadUser(), 5000);
    }
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      
      // Admins get full access
      if (userData?.role === 'admin') {
        setSubscription({ status: 'admin' });
      } else if (userData?.email) {
        // Check for existing subscription or trial
        const subs = await base44.entities.VendorSubscription.filter({ vendor_email: userData.email });
        let activeSub = subs.find(s => 
          s.status === 'active' || 
          (s.status === 'trial' && new Date(s.trial_end_date) > new Date())
        );

        // Create 30-day trial if user has none
        if (!activeSub) {
          const existingTrial = subs.find(s => s.status === 'trial');
          if (!existingTrial) {
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 30);
            activeSub = await base44.entities.VendorSubscription.create({
              vendor_email: userData.email,
              status: 'trial',
              trial_start_date: new Date().toISOString(),
              trial_end_date: trialEnd.toISOString(),
              plan_type: 'monthly',
              auto_renew: false
            });
          } else {
            activeSub = existingTrial;
          }
        }
        setSubscription(activeSub);
      }
      
      // Check Stripe Status — show if the user has selling permission and Stripe isn't set up
      if (!userData.stripe_charges_enabled && getUserPermissions(userData).can_sell) {
        setShowStripeModal(true);
      }
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const { data: artistRecord } = useQuery({
    queryKey: ['artist-record', user?.id],
    queryFn: async () => {
        const type = user?.user_type || '';
        if (type.toLowerCase() !== 'artist') return null;
        const artists = await base44.entities.Artist.filter({ user_id: user.id });
        return artists[0] || null;
    },
    enabled: !!user?.id && (user?.user_type || '').toLowerCase() === 'artist'
  });

  const updateData = (updates) => {
    setListingData(prev => ({ ...prev, ...updates }));
  };

  // Completion Check
  const completedSteps = {
    signed: listingData.isSigned !== null,
    description: listingData.internalDescription.length > 5,
    categories: listingData.sport && listingData.title,
    details: listingData.images.length > 0 && 
             listingData.price && 
             (!listingData.isSigned || (listingData.authenticator && listingData.coaCertificates.length > 0)) &&
             (!listingData.isFineArt || (listingData.authenticator && (listingData.isOriginalArtist || listingData.coaCertificates.length > 0))),
    finalize: listingData.description && listingData.description.length > 10
  };

  const getInitialAuthenticityScore = () => {
    const { authenticator, customAuthenticator, coaCertificates, certificateId, aiAnalysis } = listingData;
    if (!authenticator) return 30;

    const authenticatorData = AUTHENTICATORS[authenticator] || AUTHENTICATORS["Other"];
    let score = authenticatorData.score;
    
    if (coaCertificates?.length > 0) score = Math.min(100, score + 5);
    if (!certificateId) score = Math.max(30, score - 10);
    
    if (aiAnalysis?.confidence_score !== undefined) {
      const aiWeight = aiAnalysis.confidence_score;
      score = Math.round((score * 0.7) + (aiWeight * 0.3));
    }
    
    return Math.min(100, Math.max(30, score));
  };

  const createListingMutation = useMutation({
    mutationFn: async (data) => {
      const initialScore = getInitialAuthenticityScore();
      
      // Generate tags
      let aiTags = [];
      try {
        const tagPrompt = `Generate 5-8 relevant search tags for: ${data.title} ${data.description}. Return comma separated list.`;
        const tagResponse = await base44.integrations.Core.InvokeLLM({ prompt: tagPrompt });
        aiTags = tagResponse.split(',').map(t => t.trim()).filter(t => t.length > 0);
      } catch (e) { console.error(e); }

      // Use placeholder COA if none provided for original art
      let finalCoaCertificates = data.coaCertificates;
      if ((!finalCoaCertificates || finalCoaCertificates.length === 0) && data.isFineArt && data.isOriginalArtist) {
        finalCoaCertificates = ["https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/314f88b3b_Photoroom_20251214_150731.png"];
      }

      // Check if artist account is required or pending
      const type = user?.user_type || '';
      const isArtistRestricted = data.isFineArt && data.isOriginalArtist && (type.toLowerCase() !== 'artist' || artistRecord?.status !== 'active');
      
      // Calculate initial ranking score from formula (not hardcoded)
      const initialItemForRanking = {
        final_trust_score: initialScore,
        authenticity_meter: initialScore,
        total_votes: 0,
        like_count: 0,
        conversion_count: 0,
        referral_conversion_count: 0,
        created_date: new Date().toISOString(),
      };
      const initialRankingScore = calculateRankingScore(initialItemForRanking, null);

      const finalData = {
        vendor_id: user.id,
        vendor_email: user.email,
        title: data.title,
        description: data.description,
        images: data.images,
        coa_certificates: finalCoaCertificates,
        tags: aiTags,
        ...data.selectedCategories,
        sport: data.sport,
        signer: data.signer || null,
        team: data.team || null,
        year: data.year || null,
        grade_status: data.gradeStatus,
        grading_company: data.gradingCompany || null,
        grade_value: data.gradeValue || null,
        authenticator: data.authenticator === "Other" ? data.customAuthenticator : data.authenticator,
        certificate_id: data.certificateId || null,
        authenticity_meter: initialScore,
        ai_confidence: data.aiAnalysis?.confidence_score || null,
        price: parseFloat(data.price),
        status: isArtistRestricted ? "draft" : "active",
        marketplace_state: isArtistRestricted ? "suppressed" : "live_unreviewed",
        ranking_score: initialRankingScore,
        moderation_status: "pending",
        artist_name: data.artistName,
        is_original_artist: data.isOriginalArtist,
        medium: data.medium,
        dimensions: data.dimensions,
        provenance: data.provenance,
        artwork_creation_year: data.artworkCreationYear ? parseInt(data.artworkCreationYear) : null,
        artist_account_required_for_publish: isArtistRestricted
      };
      
      const newItem = await base44.entities.Item.create(finalData);

      // XP & Activity
      await base44.entities.XPEvent.create({
        user_id: user.id,
        user_email: user.email,
        action_type: "create_listing",
        xp_amount: 10,
        related_item_id: newItem.id,
        description: `Created listing: ${data.title}`
      });
      await base44.auth.updateMe({ xp: (user.xp || 0) + 10 });
      await base44.entities.ActivityEvent.create({
        user_email: user.email,
        user_name: user.full_name || user.email.split('@')[0],
        user_avatar: user.avatar_url,
        event_type: "new_listing",
        description: `listed a new item`,
        related_item_id: newItem.id,
        related_item_title: newItem.title,
        related_item_image: newItem.images?.[0],
        metadata: { price: newItem.price }
      });

      return newItem;
    },
    onSuccess: (newItem) => {
      navigate(createPageUrl(`ItemDetails?id=${newItem.id}`));
    },
    onError: () => {
        setIsSubmitting(false);
        alert("Failed to create listing.");
    }
  });

  const handleSubmit = () => {
    setIsSubmitting(true);
    createListingMutation.mutate(listingData);
  };

  const nextStep = () => setCurrentStep(prev => Math.min(5, prev + 1));
  const prevStep = () => setCurrentStep(prev => Math.max(1, prev - 1));

  const isPremiumUnlocked = subscription && (
    subscription.status === 'admin' ||
    subscription.status === 'active' || 
    (subscription.status === 'trial' && new Date(subscription.trial_end_date) > new Date())
  );

  const getTrialDaysRemaining = () => {
    if (!subscription?.trial_end_date) return 0;
    const now = new Date();
    const end = new Date(subscription.trial_end_date);
    const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  if (listingData.listingMode === 'bulk') {
    return <BulkUpload />;
  }

  // Landing Page - Choice of listing method
  if (showLandingPage) {
    return (
      <>
        <SubscriptionCheckoutDialog
          open={showSubscriptionDialog}
          onClose={() => setShowSubscriptionDialog(false)}
          onSuccess={() => {
            setShowSubscriptionDialog(false);
            loadUser();
          }}
        />
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-background dark:to-background py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-foreground mb-3">Create New Listing</h1>
            <p className="text-lg text-gray-600 dark:text-muted-foreground">Choose how you'd like to list your items</p>
          </div>

          {/* Free Options */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-foreground mb-4">Standard Options</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Signed Item */}
              <Card 
                className="hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-blue-300"
                onClick={() => {
                  updateData({ isSigned: true, isFineArt: false });
                  setShowLandingPage(false);
                }}
              >
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-orange-100 to-red-100">
                      <FileEdit className="w-6 h-6 text-orange-600" />
                    </div>
                    <CardTitle className="text-xl">Signed Item</CardTitle>
                  </div>
                  <CardDescription>Sports memorabilia with autographs</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full bg-orange-600 hover:bg-orange-700">
                    Start Listing
                  </Button>
                </CardContent>
              </Card>

              {/* Not Signed */}
              <Card 
                className="hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-blue-300"
                onClick={() => {
                  updateData({ isSigned: false, isFineArt: false });
                  setShowLandingPage(false);
                }}
              >
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100">
                      <XCircle className="w-6 h-6 text-blue-600" />
                    </div>
                    <CardTitle className="text-xl">Not Signed</CardTitle>
                  </div>
                  <CardDescription>Unsigned memorabilia & collectibles</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full bg-blue-600 hover:bg-blue-700">
                    Start Listing
                  </Button>
                </CardContent>
              </Card>

              {/* Fine Art */}
              <Card 
                className="hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-purple-300"
                onClick={() => {
                  updateData({ isFineArt: true });
                  setShowLandingPage(false);
                }}
              >
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-pink-100 to-purple-100">
                      <Palette className="w-6 h-6 text-purple-600" />
                    </div>
                    <CardTitle className="text-xl">Fine Art</CardTitle>
                  </div>
                  <CardDescription>Original artworks & commissions</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button className="w-full bg-purple-600 hover:bg-purple-700">
                    Start Listing
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Premium Options */}
           <div className="relative">
             <div className="absolute inset-0 bg-gradient-to-r from-amber-100 via-yellow-100 to-amber-100 dark:from-amber-950/30 dark:via-yellow-950/30 dark:to-amber-950/30 opacity-20 rounded-2xl blur-xl"></div>
             <div className="relative">
               <div className="flex items-center justify-center gap-2 mb-4">
                 <Crown className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                 <h2 className="text-xl font-semibold text-amber-900 dark:text-amber-300">Premium Features</h2>
                 <Crown className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Bulk Upload */}
                <Card 
                  className={`hover:shadow-2xl transition-all duration-300 border-4 ${
                    isPremiumUnlocked 
                      ? 'border-amber-400 dark:border-amber-500 cursor-pointer hover:border-amber-500 dark:hover:border-amber-400' 
                      : 'border-amber-300 dark:border-amber-700 opacity-75 cursor-not-allowed'
                  } ring-4 ring-amber-200 dark:ring-amber-900/50`}
                  onClick={() => {
                    if (isPremiumUnlocked) {
                      updateData({ listingMode: 'bulk' });
                    }
                  }}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100">
                          <FileSpreadsheet className="w-6 h-6 text-green-600" />
                        </div>
                        <CardTitle className="text-xl">Bulk Upload</CardTitle>
                      </div>
                      <Badge className="bg-amber-500">PRO</Badge>
                    </div>
                    <CardDescription>Upload spreadsheets with multiple items</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      className="w-full bg-green-600 hover:bg-green-700"
                      disabled={!isPremiumUnlocked}
                    >
                      {isPremiumUnlocked ? 'Start Bulk Upload' : '🔒 Upgrade to Unlock'}
                    </Button>
                  </CardContent>
                </Card>

                {/* Import Card */}
                <div className={`${
                  isPremiumUnlocked ? '' : 'opacity-75 pointer-events-none'
                } ring-4 ring-amber-200 dark:ring-amber-900/50 rounded-xl`}>
                  <ImportCard />
                  {!isPremiumUnlocked && (
                    <div className="absolute inset-0 bg-gray-900/10 dark:bg-black/30 backdrop-blur-[2px] rounded-xl flex items-center justify-center">
                      <Badge className="bg-amber-500 dark:bg-amber-600 text-white text-lg px-6 py-2">
                        🔒 PRO Feature
                      </Badge>
                    </div>
                  )}
                </div>
                </div>

                {!isPremiumUnlocked && subscription?.status === 'trial' && (
                <div className="mt-6 text-center">
                  <p className="text-sm text-amber-700 dark:text-amber-300 mb-3 font-medium">
                    ✨ Free trial active • {getTrialDaysRemaining()} days remaining
                  </p>
                  <Button 
                    size="lg"
                    onClick={() => setShowSubscriptionDialog(true)}
                    className="bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white shadow-xl"
                  >
                    <Crown className="w-5 h-5 mr-2" />
                    Upgrade to Pro
                  </Button>
                </div>
              )}

              {!isPremiumUnlocked && subscription?.status !== 'trial' && (
                <div className="mt-6 text-center">
                  <Button 
                    size="lg"
                    onClick={() => setShowSubscriptionDialog(true)}
                    className="bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white shadow-xl"
                  >
                    <Crown className="w-5 h-5 mr-2" />
                    Upgrade to Pro
                  </Button>
                </div>
              )}
            </div>
          </div>
          </div>
          </div>
          </>
          );
          }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background py-8 px-4 sm:px-6">
      <StripeRestrictionModal 
        open={showStripeModal} 
        onClose={() => navigate(createPageUrl("VendorDashboard"))}
        user={user}
      />
      <SubscriptionCheckoutDialog
        open={showSubscriptionDialog}
        onClose={() => setShowSubscriptionDialog(false)}
        onSuccess={() => {
          setShowSubscriptionDialog(false);
          loadUser();
        }}
      />
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <ProgressSidebar 
            currentStep={currentStep} 
            steps={STEPS} 
            completedSteps={completedSteps} 
        />

        {/* Content */}
        <div className="flex-1 max-w-3xl">
          {currentStep === 1 && (
            <Step1Signed 
                data={listingData} 
                updateData={updateData} 
                onNext={nextStep} 
            />
          )}
          {currentStep === 2 && listingData.isFineArt ? (
            <StepFineArtDetails 
                data={listingData} 
                updateData={updateData} 
                onNext={nextStep} 
                onBack={prevStep}
                user={user}
                artistStatus={artistRecord?.status}
            />
          ) : currentStep === 2 ? (
            <Step2Description 
                data={listingData} 
                updateData={updateData} 
                onNext={nextStep} 
                onBack={prevStep}
            />
          ) : null}
          {currentStep === 3 && (
            <Step3Categories 
                data={listingData} 
                updateData={updateData} 
                onNext={nextStep} 
                onBack={prevStep}
            />
          )}
          {currentStep === 4 && (
            <Step4Details 
                data={listingData} 
                updateData={updateData} 
                onNext={nextStep} 
                onBack={prevStep}
            />
          )}
          {currentStep === 5 && (
            <Step5Finalize 
                data={listingData} 
                updateData={updateData} 
                onSubmit={handleSubmit} 
                onBack={prevStep}
                isSubmitting={isSubmitting}
                user={user}
                artistStatus={artistRecord?.status}
            />
          )}
        </div>
      </div>
    </div>
  );
}