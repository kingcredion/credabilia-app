import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft,
  Users,
  Eye,
  Shield,
  Sparkles,
  TrendingUp,
  Building2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import OnboardingFlow from "../components/OnboardingFlow";
import KingCredionWelcomeModal from "../components/KingCredionWelcomeModal";

export default function AdminOnboardingPreview() {
  const [user, setUser] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch {
      // not logged in
    }
  };

  const handlePreviewComplete = (selectedRole, onboardingData) => {
    setShowOnboarding(false);
    
    alert(`✅ Onboarding Preview Complete!\n\nRole: ${selectedRole}\nUser Type: ${onboardingData.user_type}\n\nCheck console for full data.`);
  };

  const handleWelcomeModalPreview = () => {
    setShowWelcomeModal(true);
  };

  if (user && user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-6">
              This page is only accessible to administrators.
            </p>
            <Link to={createPageUrl("Marketplace")}>
              <Button>Go to Marketplace</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50">
      <div className="max-w-4xl mx-auto px-4 py-4 md:py-6">
        <div className="mb-4">
          <Link to={createPageUrl("Marketplace")} className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-900 mb-3 text-sm">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Link>
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-5 h-5 text-purple-600" />
            <h1 className="text-xl font-bold text-gray-900">Onboarding Preview</h1>
          </div>
          <p className="text-xs text-gray-500">Test the 2-step onboarding experience</p>
        </div>

        <Card className="mb-4 bg-orange-50 border border-orange-300">
          <CardContent className="p-3">
            <div className="flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-700 leading-relaxed">
                Streamlined to <strong>2 pages</strong>. Preview data is <strong>logged to console only</strong> — nothing is saved.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <Card className="tap-scale border border-blue-300 hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-gray-900">Individual</p>
                  <p className="text-xs text-gray-500">Account type → Location</p>
                </div>
              </div>
              <Button onClick={() => setShowOnboarding(true)} className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700">
                <Eye className="w-3.5 h-3.5 mr-1.5" />Preview Flow
              </Button>
            </CardContent>
          </Card>

          <Card className="tap-scale border border-green-300 hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #3C9F4E, #FF8C00)' }}>
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-gray-900">Influencer</p>
                  <p className="text-xs text-gray-500">Account type → Platforms</p>
                </div>
              </div>
              <Button onClick={() => setShowOnboarding(true)} className="w-full h-8 text-xs text-white" style={{ background: 'linear-gradient(135deg, #3C9F4E, #FF8C00)' }}>
                <Eye className="w-3.5 h-3.5 mr-1.5" />Preview Flow
              </Button>
            </CardContent>
          </Card>

          <Card className="tap-scale border border-purple-300 hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-gray-900">Frame Shop</p>
                  <p className="text-xs text-gray-500">Account type → Business info</p>
                </div>
              </div>
              <Button onClick={() => setShowOnboarding(true)} className="w-full h-8 text-xs bg-purple-600 hover:bg-purple-700">
                <Eye className="w-3.5 h-3.5 mr-1.5" />Preview Flow
              </Button>
            </CardContent>
          </Card>

          <Card className="tap-scale border border-orange-300 hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/6f55fc89c_Photoroom_20251116_214600.png" alt="Referral" className="w-8 h-8 object-contain flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm text-gray-900">Referral Welcome</p>
                  <p className="text-xs text-gray-500">Influencer referral modal</p>
                </div>
              </div>
              <Button onClick={handleWelcomeModalPreview} className="w-full h-8 text-xs bg-gradient-to-r from-orange-500 to-yellow-500 text-white">
                <Eye className="w-3.5 h-3.5 mr-1.5" />Preview Modal
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {showOnboarding && (
        <OnboardingFlow
          open={showOnboarding}
          onComplete={handlePreviewComplete}
          initialRole="collector"
        />
      )}

      {showWelcomeModal && (
        <KingCredionWelcomeModal
          open={showWelcomeModal}
          onClose={() => setShowWelcomeModal(false)}
          referredUser={user}
          referrerInfluencer={{ 
            user_email: "demo@influencer.com", 
            full_name: "Demo Influencer",
            id: "demo-id"
          }}
        />
      )}
    </div>
  );
}