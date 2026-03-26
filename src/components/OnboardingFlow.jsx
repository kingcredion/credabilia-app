import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldCheck,
  Store,
  Trophy,
  ArrowRight,
  Sparkles,
  Users,
  TrendingUp,
  MapPin,
  Heart,
  Crown,
  Building2,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Target,
  Clock,
  Languages,
  Brush,
  Palette
} from "lucide-react";
import LocationAutocomplete from "./LocationAutocomplete";
import { useLanguage } from "./contexts/LanguageContext";

const MAIN_INTEREST_TAGS = {
  "Sports": ["Basketball", "Baseball", "Football", "Hockey", "Soccer", "Boxing", "Golf", "Tennis"],
  "Entertainment": ["Movies", "TV Shows", "Actors", "Directors"],
  "Music": ["Rock", "Pop", "Hip Hop", "Country", "Jazz", "R&B"],
  "Historical": ["Presidents", "Military", "Space", "Documents"],
  "Comics & Pop Culture": ["Marvel", "DC", "Anime", "Gaming"]
};

const FRAMING_SERVICES = [
  "Conservation Framing",
  "Custom Matting",
  "Shadow Boxes",
  "Sports Memorabilia",
  "Diploma & Certificate Framing",
  "Canvas Stretching",
  "Museum Quality",
  "Acrylic & Plexiglass",
  "UV Protection",
  "Restoration Services"
];

export default function OnboardingFlow({ 
  open, 
  onComplete, 
  initialRole = "collector",
  forcedAccountType = null,
  onClose
}) {
  const { t, setLanguage } = useLanguage();
  const [currentStep, setCurrentStep] = useState(forcedAccountType ? 2 : 0);
  const [accountType, setAccountType] = useState(forcedAccountType);
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [location, setLocation] = useState("");
  const [geolocating, setGeolocating] = useState(false);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successType, setSuccessType] = useState(null);
  
  // Picture Frame Shop specific
  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessWebsite, setBusinessWebsite] = useState("");
  const [selectedServices, setSelectedServices] = useState([]);

  // Influencer specific
  const [influencerPlatforms, setInfluencerPlatforms] = useState([]);
  const [influencerNotes, setInfluencerNotes] = useState("");

  // Indiegogo investor specific
  const [indiegogoBackerId, setIndiegogoBackerId] = useState("");
  const [indiegogoProfileUrl, setIndiegogoProfileUrl] = useState("");

  // Artist specific
  const [artistName, setArtistName] = useState("");
  const [artistBio, setArtistBio] = useState("");
  const [artistPortfolio, setArtistPortfolio] = useState("");
  const [artistInstagram, setArtistInstagram] = useState("");
  const [artistSpecialties, setArtistSpecialties] = useState([]);

  // Build steps based on account type
  const steps = [
    'language',
    'account_type',
    ...(accountType === "individual" 
      ? ['individual_details'] 
      : accountType === "picture_frame_shop" 
        ? ['frame_shop_details'] 
        : accountType === "indiegogo_investor" 
          ? ['indiegogo_details'] 
          : accountType === "influencer" 
            ? ['influencer_details'] 
            : accountType === "artist"
              ? ['details_artist']
              : []
    )
  ];

  const handleNext = async () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Complete onboarding
      setIsSubmitting(true);
      try {
        if (accountType === "picture_frame_shop") {
          setSuccessType("picture_frame_shop");
          setShowSuccess(true);
          onComplete("picture_frame_shop", {
            user_type: "picture_frame_shop",
            latitude,
            longitude,
            interests_tags: [],
            language: selectedLanguage,
            frame_shop_data: {
              business_name: businessName,
              description: businessDescription,
              address: businessAddress,
              latitude,
              longitude,
              contact_phone: businessPhone,
              website_url: businessWebsite,
              services_offered: selectedServices,
              portfolio_images: []
            }
          });
        } else if (accountType === "influencer") {
          setSuccessType("influencer");
          setShowSuccess(true);
          onComplete("influencer", {
            user_type: "influencer",
            latitude: null,
            longitude: null,
            interests_tags: [],
            language: selectedLanguage,
            influencer_data: {
              platforms: influencerPlatforms,
              application_notes: influencerNotes,
              status: "pending_approval"
            }
          });
        } else if (accountType === "artist") {
          setSuccessType("artist");
          setShowSuccess(true);
          onComplete("artist", {
            user_type: "artist",
            latitude: null,
            longitude: null,
            interests_tags: [],
            language: selectedLanguage,
            artist_data: {
              artist_name: artistName,
              bio: artistBio,
              portfolio_url: artistPortfolio,
              instagram_handle: artistInstagram,
              specialties: artistSpecialties
            }
          });
        } else if (accountType === "indiegogo_investor") {
          setSuccessType("indiegogo");
          setShowSuccess(true);
          onComplete("collector", {
            user_type: "indiegogo_investor",
            latitude: null,
            longitude: null,
            interests_tags: [],
            language: selectedLanguage,
            indiegogo_data: {
              indiegogo_backer_id: indiegogoBackerId,
              indiegogo_profile_url: indiegogoProfileUrl,
              status: "pending_verification"
            }
          });
        } else {
          setSuccessType("individual");
          setShowSuccess(true);
          onComplete("collector", {
            user_type: "individual",
            location,
            latitude,
            longitude,
            interests_tags: selectedInterests,
            language: selectedLanguage
          });
        }
      } catch (error) {
        console.error("Submission error:", error);
        toast.error("Failed to complete onboarding. Please try again.");
        setIsSubmitting(false);
      }
    }
  };

  const handleBack = () => {
    if (forcedAccountType && currentStep === 2) {
      // If we started at step 2 (details) and try to go back, we can't.
      // Maybe we should allow it but it's weird to go back to selection if forced.
      // For now let's just do nothing or maybe call onComplete with null?
      return; 
    }
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    const currentStepName = steps[currentStep];
    
    if (currentStepName === 'language') {
      return true; // Always can proceed from language
    }

    if (currentStepName === 'account_type') {
      return !!accountType;
    }
    
    if (currentStepName === 'individual_details') {
      return selectedInterests.length > 0 && latitude !== null && longitude !== null;
    }
    
    if (currentStepName === 'frame_shop_details') {
      return businessName.trim() && businessDescription.trim() && 
             businessAddress.trim() && selectedServices.length > 0 &&
             latitude !== null && longitude !== null;
    }
    
    if (currentStepName === 'influencer_details') {
      return influencerPlatforms.length > 0 && influencerNotes.trim();
    }
    
    if (currentStepName === 'indiegogo_details') {
      return indiegogoBackerId.trim();
    }

    if (currentStepName === 'details_artist') {
      return artistName.trim();
    }
    
    return true;
  };

  const renderStep = () => {
    if (showSuccess) {
      return <SuccessStep successType={successType} />;
    }

    const currentStepName = steps[currentStep];
    
    // If forced type, we shouldn't even render these if we start at step 2, but just in case
    if (currentStepName === 'language') {
      return <LanguageStep setLanguage={setLanguage} setSelectedLanguage={setSelectedLanguage} t={t} />;
    }

    if (currentStepName === 'account_type') {
      return <AccountTypeStep accountType={accountType} setAccountType={setAccountType} />;
    }
    
    if (currentStepName === 'individual_details') {
      return (
        <IndividualDetailsStep
          location={location}
          setLocation={setLocation}
          geolocating={geolocating}
          setGeolocating={setGeolocating}
          setLatitude={setLatitude}
          setLongitude={setLongitude}
          selectedInterests={selectedInterests}
          setSelectedInterests={setSelectedInterests}
        />
      );
    }
    
    if (currentStepName === 'frame_shop_details') {
      return (
        <FrameShopDetailsStep
          businessName={businessName}
          setBusinessName={setBusinessName}
          businessDescription={businessDescription}
          setBusinessDescription={setBusinessDescription}
          businessAddress={businessAddress}
          setBusinessAddress={setBusinessAddress}
          businessPhone={businessPhone}
          setBusinessPhone={setBusinessPhone}
          businessWebsite={businessWebsite}
          setBusinessWebsite={setBusinessWebsite}
          selectedServices={selectedServices}
          setSelectedServices={setSelectedServices}
          geolocating={geolocating}
          setGeolocating={setGeolocating}
          setLatitude={setLatitude}
          setLongitude={setLongitude}
        />
      );
    }
    
    if (currentStepName === 'influencer_details') {
      return (
        <InfluencerDetailsStep
          influencerPlatforms={influencerPlatforms}
          setInfluencerPlatforms={setInfluencerPlatforms}
          influencerNotes={influencerNotes}
          setInfluencerNotes={setInfluencerNotes}
        />
      );
    }
    
    if (currentStepName === 'indiegogo_details') {
      return (
        <IndiegogoDetailsStep
          indiegogoBackerId={indiegogoBackerId}
          setIndiegogoBackerId={setIndiegogoBackerId}
          indiegogoProfileUrl={indiegogoProfileUrl}
          setIndiegogoProfileUrl={setIndiegogoProfileUrl}
        />
      );
    }

    if (currentStepName === 'details_artist') {
      return (
        <ArtistDetailsStep
          artistName={artistName}
          setArtistName={setArtistName}
          artistBio={artistBio}
          setArtistBio={setArtistBio}
          artistPortfolio={artistPortfolio}
          setArtistPortfolio={setArtistPortfolio}
          artistInstagram={artistInstagram}
          setArtistInstagram={setArtistInstagram}
          artistSpecialties={artistSpecialties}
          setArtistSpecialties={setArtistSpecialties}
        />
      );
    }
    
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={(openState) => !openState && onClose && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl md:rounded-xl border-0 md:border dark:border-border/50 shadow-2xl dark:shadow-2xl p-6 md:p-6">
        <DialogHeader className="px-0 md:px-0">
          <div className="flex items-center justify-between mb-3">
            <DialogTitle className="text-2xl">
              {currentStep === 0 ? t("onboarding.welcome") : 
               currentStep === 1 ? "Select your account type" :
               accountType === "individual" ? "Your Preferences" :
               accountType === "picture_frame_shop" ? "Business Details" :
               accountType === "artist" ? "Artist Profile" :
               "Influencer Application"}
            </DialogTitle>
            <Badge variant="outline" className="text-xs">
              Step {currentStep + 1} of {steps.length}
            </Badge>
          </div>
          <p className="text-sm text-gray-600">
            {currentStep === 0 ? t("onboarding.select_language_desc") : 
             currentStep === 1 ? "Select your account type" : 
             accountType === "indiegogo_investor" ? "Founder Circle Member" :
             accountType === "individual" ? "Your Preferences" :
             accountType === "picture_frame_shop" ? "Business Details" :
             accountType === "artist" ? "Artist Profile" :
             "Influencer Application"}
          </p>
        </DialogHeader>



        <div className="my-5 md:my-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-3 pt-5 md:pt-6 border-t dark:border-border/50 mt-6 md:mt-8">
          {!showSuccess && currentStep > 0 ? (
            <Button variant="outline" onClick={handleBack} className="rounded-lg md:rounded-lg active:bg-gray-100 dark:active:bg-white/10 transition-colors">
              {t("onboarding.back")}
            </Button>
          ) : (
            <div />
          )}

          {showSuccess ? (
            <Button
              onClick={() => onClose && onClose()}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg md:rounded-lg font-medium"
            >
              Continue to Marketplace
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={!canProceed() || isSubmitting}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 active:from-blue-800 active:to-purple-800 dark:active:from-blue-700 dark:active:to-purple-700 transition-all rounded-lg md:rounded-lg font-medium"
            >
              {currentStep < steps.length - 1 ? (
                <>
                  {t("onboarding.next")}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              ) : (
                <>
                  {isSubmitting ? "Submitting..." : (accountType === "individual" ? t("onboarding.get_started") : "Submit Application")}
                  <Sparkles className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// STEP 0: Language Selection
function LanguageStep({ setLanguage, setSelectedLanguage, t }) {
  const handleLanguageSelect = (langCode) => {
    setLanguage(langCode);
    setSelectedLanguage(langCode);
  };

  return (
    <div className="py-8 text-center">
      <div className="mb-8">
        <Languages className="w-16 h-16 text-blue-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-2">
          {t("onboarding.select_language")}
        </h2>
        <p className="text-gray-600 dark:text-muted-foreground">
          {t("onboarding.select_language_desc")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
        <button
          onClick={() => handleLanguageSelect('en')}
          className="p-6 rounded-xl border-2 border-gray-200 dark:border-white/10 dark:bg-white/[0.04] hover:border-blue-500 hover:shadow-lg transition-all text-center group"
        >
          <span className="text-4xl mb-3 block">🇺🇸</span>
          <span className="text-lg font-bold text-gray-900 dark:text-foreground group-hover:text-blue-600">English</span>
        </button>

        <button
          onClick={() => handleLanguageSelect('es')}
          className="p-6 rounded-xl border-2 border-gray-200 dark:border-white/10 dark:bg-white/[0.04] hover:border-blue-500 hover:shadow-lg transition-all text-center group"
        >
          <span className="text-4xl mb-3 block">🇪🇸</span>
          <span className="text-lg font-bold text-gray-900 dark:text-foreground group-hover:text-blue-600">Español</span>
        </button>

        <button
          onClick={() => handleLanguageSelect('fr')}
          className="p-6 rounded-xl border-2 border-gray-200 dark:border-white/10 dark:bg-white/[0.04] hover:border-blue-500 hover:shadow-lg transition-all text-center group"
        >
          <span className="text-4xl mb-3 block">🇫🇷</span>
          <span className="text-lg font-bold text-gray-900 dark:text-foreground group-hover:text-blue-600">Français</span>
        </button>
      </div>
    </div>
  );
}

// STEP 1: Account Type Selection
function AccountTypeStep({ accountType, setAccountType }) {
  return (
    <div className="py-4 space-y-8">
      {/* Hero Image Section */}
      <div className="flex justify-center">
        <img
          src="https://media.base44.com/images/public/690badbd56a85b130b88aa42/508692efe_Photoroom_20260323_134641.png"
          alt="Credabilia Characters"
          className="max-w-full h-auto object-contain"
          style={{ maxHeight: '200px' }}
        />
      </div>

      {/* Header Copy */}
       <div className="text-center space-y-2">
         <h2 className="text-3xl font-bold text-gray-900 dark:text-foreground">
           Choose How You Want to Use Credabilia
         </h2>
         <p className="text-gray-600 dark:text-muted-foreground text-base">
          Buy, sell, collect, create, promote, or grow your business — all in one place.
        </p>
      </div>

      {/* Primary Option: Individual Account */}
      <div>
        <button
          onClick={() => setAccountType("individual")}
          className={`w-full p-6 rounded-xl border-2 transition-all duration-300 text-left relative overflow-hidden group ${
            accountType === "individual"
              ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 shadow-lg ring-4 ring-blue-100 dark:ring-blue-900/30'
              : 'border-gray-200 dark:border-white/10 hover:border-blue-300 hover:shadow-md bg-white dark:bg-white/[0.04]'
          }`}
        >
          {accountType === "individual" && (
            <div className="absolute top-4 right-4">
              <div className="bg-blue-600 rounded-full p-1 text-white shadow-sm">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>
          )}
          
          <div className="space-y-3">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-foreground mb-1">Individual Account</h3>
              <p className="text-sm text-gray-600 dark:text-muted-foreground leading-relaxed">
                The standard account for collectors, buyers, sellers, and community participation.
              </p>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs">
                Buy verified items
              </Badge>
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs">
                Sell and relist items
              </Badge>
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs">
                Track your collection
              </Badge>
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs">
                Participate in auditing
              </Badge>
            </div>
          </div>
        </button>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-gray-200 dark:border-white/10" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white dark:bg-background px-4 text-sm font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wide">
            Special Accounts
          </span>
        </div>
      </div>

      {/* Special Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Founder Circle Card */}
        <button
          onClick={() => setAccountType("indiegogo_investor")}
          className={`p-4 rounded-xl border-2 transition-all duration-300 text-left flex flex-col ${
            accountType === "indiegogo_investor"
              ? 'border-pink-600 bg-pink-50 dark:bg-pink-900/10 shadow-lg'
              : 'border-gray-200 dark:border-white/10 hover:border-pink-300 dark:hover:border-pink-500/30 hover:shadow-md bg-white dark:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/e1bb7b419_IMG_0622.png"
                alt="Founder Circle"
                className="w-full h-full object-contain"
              />
            </div>
            {accountType === "indiegogo_investor" && (
              <CheckCircle className="w-5 h-5 text-pink-600 flex-shrink-0" />
            )}
          </div>
          
          <h3 className="text-base font-bold text-gray-900 dark:text-foreground mb-1">Founder Circle</h3>
           <p className="text-xs text-gray-600 dark:text-muted-foreground mb-3 flex-grow">
            For verified early backers and founder-tier members
          </p>
          
          <div className="space-y-1 text-xs text-gray-700 dark:text-muted-foreground">
            <div>• Founder perks</div>
            <div>• Special badge</div>
            <div>• Reward eligibility</div>
          </div>
        </button>

        {/* Influencer Card */}
        <button
          onClick={() => setAccountType("influencer")}
          className={`p-4 rounded-xl border-2 transition-all duration-300 text-left flex flex-col ${
            accountType === "influencer"
              ? 'border-green-600 bg-green-50 dark:bg-green-900/10 shadow-lg'
              : 'border-gray-200 dark:border-white/10 hover:border-green-300 dark:hover:border-green-500/30 hover:shadow-md bg-white dark:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <img 
                src="https://media.base44.com/images/public/690badbd56a85b130b88aa42/d4bc2061a_Photoroom_20260323_140617.png"
                alt="Influencer"
                className="w-full h-full object-contain"
              />
            </div>
            {accountType === "influencer" && (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            )}
          </div>
          
          <h3 className="text-base font-bold text-gray-900 dark:text-foreground mb-1">Influencer</h3>
           <p className="text-xs text-gray-600 dark:text-muted-foreground mb-3 flex-grow">
            Promote Credabilia and earn through referrals
          </p>
          
          <div className="space-y-1 text-xs text-gray-700 dark:text-muted-foreground">
            <div>• Referral links</div>
            <div>• Conversion tracking</div>
            <div>• Commission earnings</div>
          </div>
        </button>

        {/* Artist Card */}
        <button
          onClick={() => setAccountType("artist")}
          className={`p-4 rounded-xl border-2 transition-all duration-300 text-left flex flex-col ${
            accountType === "artist"
              ? 'border-pink-600 bg-pink-50 dark:bg-pink-900/10 shadow-lg'
              : 'border-gray-200 dark:border-white/10 hover:border-pink-300 dark:hover:border-pink-500/30 hover:shadow-md bg-white dark:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/d25cfa59f_Photoroom_20251216_110752.png"
                alt="Artist"
                className="w-full h-full object-contain"
              />
            </div>
            {accountType === "artist" && (
              <CheckCircle className="w-5 h-5 text-pink-600 flex-shrink-0" />
            )}
          </div>
          
          <h3 className="text-base font-bold text-gray-900 dark:text-foreground mb-1">Artist</h3>
           <p className="text-xs text-gray-600 dark:text-muted-foreground mb-3 flex-grow">
            Showcase and sell original memorabilia-inspired artwork
          </p>
          
          <div className="space-y-1 text-xs text-gray-700 dark:text-muted-foreground">
            <div>• Portfolio visibility</div>
            <div>• Sell original pieces</div>
            <div>• Accept commissions</div>
          </div>
        </button>

        {/* Frame Shop Card */}
        <button
          onClick={() => setAccountType("picture_frame_shop")}
          className={`p-4 rounded-xl border-2 transition-all duration-300 text-left flex flex-col ${
            accountType === "picture_frame_shop"
              ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/10 shadow-lg'
              : 'border-gray-200 dark:border-white/10 hover:border-purple-300 dark:hover:border-purple-500/30 hover:shadow-md bg-white dark:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/37551ac5d_Photoroom_20251109_200739.png"
                alt="Frame Shop"
                className="w-full h-full object-contain"
              />
            </div>
            {accountType === "picture_frame_shop" && (
              <CheckCircle className="w-5 h-5 text-purple-600 flex-shrink-0" />
            )}
          </div>
          
          <h3 className="text-base font-bold text-gray-900 dark:text-foreground mb-1">Frame Shop</h3>
           <p className="text-xs text-gray-600 dark:text-muted-foreground mb-3 flex-grow">
            Offer custom framing and presentation services
          </p>
          
          <div className="space-y-1 text-xs text-gray-700 dark:text-muted-foreground">
            <div>• Receive quote requests</div>
            <div>• Showcase work</div>
            <div>• Reach collectors directly</div>
          </div>
        </button>
      </div>
    </div>
  );
}

// STEP 2: Individual User Details (Location + Interests)
function IndividualDetailsStep({
  location,
  setLocation,
  geolocating,
  setGeolocating,
  setLatitude,
  setLongitude,
  selectedInterests,
  setSelectedInterests
}) {
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setLocation(`${position.coords.latitude.toFixed(2)}, ${position.coords.longitude.toFixed(2)}`);
        setGeolocating(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Unable to get your location. Please enter it manually.");
        setGeolocating(false);
      }
    );
  };

  const handleLocationSelect = (locationData) => {
    setLocation(locationData.address);
    setLatitude(locationData.latitude);
    setLongitude(locationData.longitude);
  };

  const toggleInterest = (interest) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(selectedInterests.filter(i => i !== interest));
    } else {
      setSelectedInterests([...selectedInterests, interest]);
    }
  };

  return (
    <div className="py-4 space-y-6">
      {/* Location Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
           <MapPin className="w-5 h-5 text-green-600" />
           <h3 className="font-bold text-gray-900 dark:text-foreground">Your Location</h3>
         </div>
         <p className="text-sm text-gray-600 dark:text-muted-foreground mb-3">
          Find items for sale near you and connect with local collectors
         </p>
         <div className="flex gap-2 mb-3">
           <LocationAutocomplete
             value={location}
             onChange={setLocation}
             onLocationSelect={handleLocationSelect}
             placeholder="e.g., New York, NY"
           />
           <Button
             type="button"
             onClick={handleGetLocation}
             disabled={geolocating}
             variant="outline"
             size="sm"
           >
             <MapPin className="w-4 h-4 mr-1" />
             {geolocating ? "..." : "Auto"}
           </Button>
         </div>
         {latitude === null || longitude === null ? (
           <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3">
             <p className="text-xs text-amber-900 dark:text-amber-300">
               <strong>⚠️ Select address required:</strong> Choose from suggestions or tap "Auto" to enable location
             </p>
           </div>
         ) : (
           <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500/30 rounded-lg p-3">
             <p className="text-xs text-green-900 dark:text-green-300">
               ✓ Location confirmed: {location}
             </p>
           </div>
         )}
       </div>

      {/* Interests Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
           <Heart className="w-5 h-5 text-blue-600" />
           <h3 className="font-bold text-gray-900 dark:text-foreground">Your Interests</h3>
         </div>
         <p className="text-sm text-gray-600 dark:text-muted-foreground mb-4">
          Select what you're passionate about - we'll personalize your feed!
        </p>
        
        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
          {Object.entries(MAIN_INTEREST_TAGS).map(([category, tags]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold text-gray-700 dark:text-muted-foreground mb-2">{category}</h4>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const isSelected = selectedInterests.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleInterest(tag)}
                      className="transition-all hover:scale-105"
                    >
                      <Badge
                        className="text-xs px-3 py-1.5 cursor-pointer"
                        style={{
                          backgroundColor: isSelected ? '#3b82f6' : '#f3f4f6',
                          color: isSelected ? 'white' : '#374151',
                          border: isSelected ? '2px solid #2563eb' : '1px solid #e5e7eb'
                        }}
                      >
                        {tag}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {selectedInterests.length > 0 && (
          <div className="mt-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500/30 rounded-lg p-3">
            <p className="text-xs text-green-900 dark:text-green-300 font-medium">
              ✓ {selectedInterests.length} interests selected
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// STEP 2: Frame Shop Details (All in one)
function FrameShopDetailsStep({
  businessName,
  setBusinessName,
  businessDescription,
  setBusinessDescription,
  businessAddress,
  setBusinessAddress,
  businessPhone,
  setBusinessPhone,
  businessWebsite,
  setBusinessWebsite,
  selectedServices,
  setSelectedServices,
  geolocating,
  setGeolocating,
  setLatitude,
  setLongitude
}) {
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setGeolocating(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Unable to get your location. Please enter your address manually.");
        setGeolocating(false);
      }
    );
  };

  const handleLocationSelect = (locationData) => {
    setBusinessAddress(locationData.address);
    setLatitude(locationData.latitude);
    setLongitude(locationData.longitude);
  };

  const toggleService = (service) => {
    if (selectedServices.includes(service)) {
      setSelectedServices(selectedServices.filter(s => s !== service));
    } else {
      setSelectedServices([...selectedServices, service]);
    }
  };

  return (
    <div className="py-4 space-y-5 max-h-[500px] overflow-y-auto pr-2">
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-500/30">
         <div className="flex items-start gap-3">
           <img
             src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/6da0f949c_optimizedphotoshopowner.png"
             alt="King Credion"
             className="h-16 w-auto object-contain flex-shrink-0"
           />
           <div>
             <p className="text-sm text-gray-700 dark:text-muted-foreground">
              Tell us about your business. You'll appear on our map and collectors can request custom framing jobs!
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-1.5 block">
          Business Name *
        </label>
        <Input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Classic Picture Frames"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-1.5 block">
          Description *
        </label>
        <Textarea
          value={businessDescription}
          onChange={(e) => setBusinessDescription(e.target.value)}
          placeholder="Professional framing services for sports memorabilia..."
          rows={3}
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-1.5 block">
          Address *
        </label>
        <div className="space-y-2">
          <LocationAutocomplete
            value={businessAddress}
            onChange={setBusinessAddress}
            onLocationSelect={handleLocationSelect}
            placeholder="123 Main St, City, State, ZIP"
          />
          <Button
            type="button"
            onClick={handleGetLocation}
            disabled={geolocating}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <MapPin className="w-4 h-4 mr-2" />
            {geolocating ? "Getting..." : "Use My Location"}
          </Button>
          {latitude === null || longitude === null ? (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 rounded-lg p-2">
              <p className="text-xs text-amber-900 dark:text-amber-300">
                <strong>⚠️ Select address required:</strong> Choose from suggestions or tap "Use My Location"
              </p>
            </div>
          ) : (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-500/30 rounded-lg p-2">
              <p className="text-xs text-green-900 dark:text-green-300">
                ✓ Location confirmed: {businessAddress}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-1.5 block">
            Phone
          </label>
          <Input
            value={businessPhone}
            onChange={(e) => setBusinessPhone(e.target.value)}
            placeholder="(555) 123-4567"
            type="tel"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-1.5 block">
            Website
          </label>
          <Input
            value={businessWebsite}
            onChange={(e) => setBusinessWebsite(e.target.value)}
            placeholder="yoursite.com"
            type="url"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-2 block">
          Services Offered * (select at least one)
        </label>
        <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
          {FRAMING_SERVICES.map((service) => {
            const isSelected = selectedServices.includes(service);
            return (
              <button
                key={service}
                onClick={() => toggleService(service)}
                className="transition-all"
              >
                <Badge
                  className="w-full text-xs px-2 py-1.5 cursor-pointer justify-center"
                  style={{
                    backgroundColor: isSelected ? '#9333ea' : '#f3f4f6',
                    color: isSelected ? 'white' : '#374151',
                    border: isSelected ? '2px solid #7e22ce' : '1px solid #e5e7eb'
                  }}
                >
                  {service}
                </Badge>
              </button>
            );
          })}
        </div>
        {selectedServices.length > 0 && (
          <p className="text-xs text-green-700 dark:text-green-300 mt-2">
            ✓ {selectedServices.length} services selected
          </p>
        )}
      </div>
    </div>
  );
}

// STEP 2: Influencer Details
function InfluencerDetailsStep({
  influencerPlatforms,
  setInfluencerPlatforms,
  influencerNotes,
  setInfluencerNotes
}) {
  const platforms = ["Instagram", "TikTok", "YouTube", "Twitter/X", "Facebook", "LinkedIn", "Blog/Website", "Other"];

  const togglePlatform = (platform) => {
    if (influencerPlatforms.includes(platform)) {
      setInfluencerPlatforms(influencerPlatforms.filter(p => p !== platform));
    } else {
      setInfluencerPlatforms([...influencerPlatforms, platform]);
    }
  };

  return (
    <div className="py-4 space-y-5">
      <div className="bg-gradient-to-br from-green-50 to-orange-50 dark:from-green-900/20 dark:to-orange-900/20 rounded-lg p-4 border border-green-300 dark:border-green-500/30">
         <div className="flex items-start gap-3">
           <img
             src="https://media.base44.com/images/public/690badbd56a85b130b88aa42/d4bc2061a_Photoroom_20260323_140617.png"
             alt="Influencer"
             className="h-16 w-auto object-contain flex-shrink-0"
           />
           <div>
             <h3 className="font-bold text-gray-900 dark:text-foreground mb-1 text-sm">Earn 6% commission on every sale!</h3>
             <p className="text-xs text-gray-700 dark:text-muted-foreground">
              Share your unique link, drive traffic, and earn passive income. We review all applications within 24-48 hours.
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-2 block">
          Your Platforms * (select all that apply)
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {platforms.map(platform => {
            const isSelected = influencerPlatforms.includes(platform);
            return (
              <button
                key={platform}
                onClick={() => togglePlatform(platform)}
                className="transition-all"
              >
                <Badge
                  className="w-full text-xs px-2 py-2 cursor-pointer justify-center"
                  style={{
                    background: isSelected 
                      ? 'linear-gradient(135deg, #3C9F4E, #FF8C00)'
                      : '#f3f4f6',
                    color: isSelected ? 'white' : '#374151',
                    border: isSelected ? '2px solid #2d7a3b' : '1px solid #e5e7eb'
                  }}
                >
                  {platform}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-2 block">
          Tell us about your reach and audience *
        </label>
        <Textarea
          value={influencerNotes}
          onChange={(e) => setInfluencerNotes(e.target.value)}
          placeholder="Share your follower count, engagement rate, content niche, and why you'd be a great partner..."
          rows={5}
        />
        <p className="text-xs text-gray-500 mt-2">
          💡 Include links to your profiles and examples of past brand partnerships
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30 rounded-lg p-3">
        <p className="text-xs text-blue-900 dark:text-blue-300">
          <strong>⏱️ Review Time:</strong> We'll review your application within 24-48 hours and notify you via email!
        </p>
      </div>
    </div>
  );
}

// STEP 2: Artist Details
function ArtistDetailsStep({
  artistName,
  setArtistName,
  artistBio,
  setArtistBio,
  artistPortfolio,
  setArtistPortfolio,
  artistInstagram,
  setArtistInstagram,
  artistSpecialties,
  setArtistSpecialties
}) {
  const ART_SPECIALTIES = [
    "Painting", "Sculpture", "Photography", "Illustration", "Mixed Media", "Textile Art", "Printmaking"
  ];

  const toggleSpecialty = (specialty) => {
    if (artistSpecialties.includes(specialty)) {
      setArtistSpecialties(artistSpecialties.filter(s => s !== specialty));
    } else {
      setArtistSpecialties([...artistSpecialties, specialty]);
    }
  };

  return (
    <div className="py-4 space-y-5">
      <div className="bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 rounded-lg p-4 border border-pink-300 dark:border-pink-500/30">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 flex items-center justify-center flex-shrink-0 bg-white dark:bg-white/[0.08] dark:border-white/10 rounded-full border border-pink-200 dark:border-pink-500/30">
            <Palette className="w-6 h-6 text-pink-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-foreground mb-1 text-sm">Join the Artist Directory</h3>
            <p className="text-xs text-gray-700 dark:text-muted-foreground">
              Create your professional profile, showcase your portfolio, and connect with collectors looking for original pieces.
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-1.5 block">
          Artist / Brand Name *
        </label>
        <Input
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
          placeholder="How should we display your name?"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-1.5 block">
          Bio
        </label>
        <Textarea
          value={artistBio}
          onChange={(e) => setArtistBio(e.target.value)}
          placeholder="Tell us about your style, inspiration, and background..."
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-1.5 block">
            Portfolio Website
          </label>
          <Input
            value={artistPortfolio}
            onChange={(e) => setArtistPortfolio(e.target.value)}
            placeholder="your-portfolio.com"
            type="url"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-1.5 block">
            Instagram Handle
          </label>
          <Input
            value={artistInstagram}
            onChange={(e) => setArtistInstagram(e.target.value)}
            placeholder="@yourart"
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-2 block">
          Specialties
        </label>
        <div className="grid grid-cols-2 gap-2">
          {ART_SPECIALTIES.map((spec) => {
            const isSelected = artistSpecialties.includes(spec);
            return (
              <button
                key={spec}
                onClick={() => toggleSpecialty(spec)}
                className="transition-all"
              >
                <Badge
                  className="w-full text-xs px-2 py-1.5 cursor-pointer justify-center"
                  style={{
                    backgroundColor: isSelected ? '#db2777' : '#f3f4f6',
                    color: isSelected ? 'white' : '#374151',
                    border: isSelected ? '2px solid #be185d' : '1px solid #e5e7eb'
                  }}
                >
                  {spec}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// SUCCESS SCREEN
function SuccessStep({ successType }) {
  const messages = {
    individual: {
      title: "Welcome to Credabilia!",
      subtitle: "Your profile is all set",
      icon: <CheckCircle className="w-16 h-16 text-green-600" />,
      details: "Start exploring the marketplace and building your collection"
    },
    artist: {
      title: "Artist Application Submitted! 🎨",
      subtitle: "Status: Pending Review",
      icon: <CheckCircle className="w-16 h-16 text-pink-600" />,
      details: "We'll review your portfolio and notify you via email within 24-48 hours"
    },
    influencer: {
      title: "Influencer Application Submitted! 🚀",
      subtitle: "Status: Pending Review",
      icon: <CheckCircle className="w-16 h-16 text-green-600" />,
      details: "We'll review your application and notify you within 24-48 hours. You'll earn 6% commission on every referral once approved!"
    },
    picture_frame_shop: {
      title: "Frame Shop Application Submitted! 🖼️",
      subtitle: "Status: Pending Review",
      icon: <CheckCircle className="w-16 h-16 text-purple-600" />,
      details: "We'll review your business details and notify you within 24-48 hours. You'll appear on our map and start receiving custom framing requests!"
    },
    indiegogo: {
      title: "Founder Circle Registration Submitted! 👑",
      subtitle: "Status: Verifying",
      icon: <CheckCircle className="w-16 h-16 text-amber-600" />,
      details: "We're verifying your Indiegogo backer status. Once confirmed, your Founder Circle perks will activate immediately!"
    }
  };

  const msg = messages[successType] || messages.individual;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="py-8 text-center space-y-6"
    >
      <div className="flex justify-center">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {msg.icon}
        </motion.div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground mb-2">
          {msg.title}
        </h2>
        <p className="text-sm font-medium text-gray-600 dark:text-muted-foreground mb-4">
          {msg.subtitle}
        </p>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-500/30">
        <p className="text-sm text-gray-700 dark:text-muted-foreground leading-relaxed">
          {msg.details}
        </p>
      </div>

      {successType !== "individual" && (
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-500/30">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-300 mb-2">
            💡 What happens next?
          </p>
          <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
            <li>✓ Check your email for updates</li>
            <li>✓ Visit Settings → Special Accounts to see your application status</li>
            <li>✓ Once approved, you'll unlock new features and dashboards</li>
          </ul>
        </div>
      )}
    </motion.div>
  );
}

// STEP 2: Indiegogo Investor Details
function IndiegogoDetailsStep({
  indiegogoBackerId,
  setIndiegogoBackerId,
  indiegogoProfileUrl,
  setIndiegogoProfileUrl
}) {
  return (
    <div className="py-4 space-y-5">
      <div className="bg-gradient-to-br from-pink-50 to-white dark:from-pink-900/20 dark:to-background rounded-lg p-6 border-2 border-pink-300 dark:border-pink-500/30 text-center">
         <img
           src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/e1bb7b419_IMG_0622.png"
           alt="Founder Circle"
           className="h-24 w-auto object-contain mx-auto mb-4"
         />
         <h3 className="text-xl font-bold bg-gradient-to-r from-pink-600 to-green-600 bg-clip-text text-transparent mb-2">
           Welcome to the Founder Circle!
         </h3>
         <p className="text-sm text-gray-700 dark:text-muted-foreground mb-4">
          As an Indiegogo backer, you're part of an exclusive elite-tier membership with lifetime benefits.
        </p>
        
        <div className="grid grid-cols-2 gap-3 text-left bg-white dark:bg-white/[0.05] dark:border-white/10 rounded-lg p-4 border border-pink-200 dark:border-pink-500/20">
          <div className="flex items-start gap-2">
            <Crown className="w-4 h-4 text-pink-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-foreground">Lifetime Perks</p>
              <p className="text-[10px] text-gray-600 dark:text-muted-foreground">Platform priority access</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <DollarSign className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-foreground">Store Credits</p>
              <p className="text-[10px] text-gray-600 dark:text-muted-foreground">Special distributions</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-pink-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-foreground">Founder Badge</p>
              <p className="text-[10px] text-gray-600 dark:text-muted-foreground">On your profile</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Users className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-foreground">Direct Access</p>
              <p className="text-[10px] text-gray-600 dark:text-muted-foreground">To the founder</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-2 block">
          Indiegogo Backer ID *
        </label>
        <Input
          value={indiegogoBackerId}
          onChange={(e) => setIndiegogoBackerId(e.target.value)}
          placeholder="e.g., IGG123456789"
          className="text-base"
        />
        <p className="text-xs text-gray-500 mt-2">
          💡 This is your unique identifier from the Indiegogo campaign
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-gray-700 dark:text-foreground mb-2 block">
          Indiegogo Profile URL (Optional)
        </label>
        <Input
          value={indiegogoProfileUrl}
          onChange={(e) => setIndiegogoProfileUrl(e.target.value)}
          placeholder="https://www.indiegogo.com/individuals/..."
          type="url"
          className="text-base"
        />
        <p className="text-xs text-gray-500 mt-2">
          Helps us verify your backer status faster
        </p>
      </div>

      <div className="bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-pink-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-pink-900 dark:text-pink-300 mb-1">Verification Process</p>
            <p className="text-xs text-pink-800 dark:text-pink-200 leading-relaxed">
              Our admin team will verify your backer status and investment amount. Once verified, your Founder Circle perks will be activated, including your store credit balance and founder badge.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-r from-green-50 to-pink-50 dark:from-green-900/20 dark:to-pink-900/20 border border-green-300 dark:border-green-500/30 rounded-lg p-4">
        <p className="text-sm font-bold text-gray-900 dark:text-foreground mb-1 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-green-600" />
          Thank You for Believing in Us!
        </p>
        <p className="text-xs text-gray-700 dark:text-muted-foreground">
          Your early support makes all the difference. Welcome to the kingdom! 👑
        </p>
      </div>
    </div>
  );
}