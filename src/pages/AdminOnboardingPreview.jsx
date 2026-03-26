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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <Link to={createPageUrl("Marketplace")} className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Marketplace</span>
          </Link>
          
          <div className="flex items-center gap-3 mb-2">
            <Eye className="w-10 h-10 text-purple-600" />
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
              Onboarding Preview (Admin)
            </h1>
          </div>
          <p className="text-gray-600">
            Test the streamlined 2-step onboarding experience
          </p>
        </div>

        <Card className="mb-8 bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-300">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Sparkles className="w-8 h-8 text-orange-600 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-gray-900 mb-2">🎭 Simplified Onboarding</h3>
                <p className="text-sm text-gray-700 leading-relaxed">
                  The onboarding has been streamlined to just <strong>2 pages</strong> for all user types. All data entered during preview is <strong>logged to console only</strong> and <strong>not saved</strong>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Standard User Onboarding */}
          <Card className="border-2 border-blue-300 hover:shadow-xl transition-all">
            <CardHeader className="bg-gradient-to-br from-blue-50 to-blue-100 border-b-2 border-blue-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl text-gray-900">Individual</CardTitle>
                  <p className="text-sm text-gray-600">2-step flow</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <ul className="space-y-2 text-sm text-gray-700 mb-6">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">1.</span>
                  <span>Account type selection</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">2.</span>
                  <span>Location + interests</span>
                </li>
              </ul>

              <Button
                onClick={() => setShowOnboarding(true)}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview Flow
              </Button>
            </CardContent>
          </Card>

          {/* Influencer */}
          <Card className="border-2 border-green-300 hover:shadow-xl transition-all">
            <CardHeader className="bg-gradient-to-br from-green-50 to-orange-50 border-b-2 border-green-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl bg-gradient-to-r from-green-600 to-orange-600 bg-clip-text text-transparent">
                    Influencer
                  </CardTitle>
                  <p className="text-sm text-gray-600">2-step flow</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <ul className="space-y-2 text-sm text-gray-700 mb-6">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">1.</span>
                  <span>Account type selection</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">2.</span>
                  <span>Platform + audience details</span>
                </li>
              </ul>

              <Button
                onClick={() => setShowOnboarding(true)}
                className="w-full text-white"
                style={{ background: 'linear-gradient(135deg, #3C9F4E, #FF8C00)' }}
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview Flow
              </Button>
            </CardContent>
          </Card>

          {/* Frame Shop */}
          <Card className="border-2 border-purple-300 hover:shadow-xl transition-all">
            <CardHeader className="bg-gradient-to-br from-purple-50 to-blue-100 border-b-2 border-purple-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl text-gray-900">Frame Shop</CardTitle>
                  <p className="text-sm text-gray-600">2-step flow</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <ul className="space-y-2 text-sm text-gray-700 mb-6">
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 font-bold">1.</span>
                  <span>Account type selection</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-600 font-bold">2.</span>
                  <span>Business info + services</span>
                </li>
              </ul>

              <Button
                onClick={() => setShowOnboarding(true)}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview Flow
              </Button>
            </CardContent>
          </Card>

          {/* Referral Welcome Modal */}
          <Card className="border-2 border-orange-300 hover:shadow-xl transition-all">
            <CardHeader className="bg-gradient-to-br from-orange-50 to-yellow-50 border-b-2 border-orange-200">
              <div className="flex items-center gap-3">
                <img
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/6f55fc89c_Photoroom_20251116_214600.png"
                  alt="Referral Badge"
                  className="w-12 h-12 object-contain flex-shrink-0"
                />
                <div>
                  <CardTitle className="text-xl text-gray-900">Referral Welcome</CardTitle>
                  <p className="text-sm text-gray-600">Influencer referral modal</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <ul className="space-y-2 text-sm text-gray-700 mb-6">
                <li className="flex items-start gap-2">
                  <span className="text-orange-600 font-bold">•</span>
                  <span>Shows when user signs up via referral link</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-600 font-bold">•</span>
                  <span>"Open Sesame" button auto-follows influencer</span>
                </li>
              </ul>

              <Button
                onClick={handleWelcomeModalPreview}
                className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white"
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview Modal
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