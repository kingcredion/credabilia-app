import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Settings as SettingsIcon, LogOut, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Check } from "lucide-react";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

// Import sections
import AccountSummary from "../components/settings/AccountSummary";
import ProfileTab from "../components/settings/ProfileTab";
import RolesTab from "../components/settings/RolesTab";
import BillingTab from "../components/settings/BillingTab";
import SecurityTab from "../components/settings/SecurityTab";
import EarningsTab from "../components/settings/EarningsTab";
import PreferencesTab from "../components/settings/PreferencesTab";
import AddressBook from "../components/AddressBook";

const sections = [
  { id: "profile", label: "Profile", icon: "👤" },
  { id: "roles", label: "Roles", icon: "⭐" },
  { id: "addresses", label: "Addresses", icon: "📍" },
  { id: "payments", label: "Payments", icon: "💳" },
  { id: "earnings", label: "Earnings", icon: "💰" },
  { id: "security", label: "Security", icon: "🔒" },
  { id: "preferences", label: "Preferences", icon: "⚙️" },
];

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState("profile");
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  // Deep-link support: ?section=addresses opens the correct tab
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sectionParam = params.get("section");
    if (sectionParam && sections.some(s => s.id === sectionParam)) {
      setActiveSection(sectionParam);
    }
  }, [location.search]);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  const handleAdminAccessSpecialRole = (roleId) => {
    if (user?.role !== "admin") {
      toast.error("Only admins can use this feature.");
      return;
    }

    // Map special role IDs to their dashboard pages
    const dashboards = {
      picture_frame_shop: "FrameShopDashboard",
      influencer: "InfluencerDashboard",
      artist: "ArtistDashboard",
      founder: "FounderCircleDashboard",
    };

    const dashboardPage = dashboards[roleId];
    if (!dashboardPage) {
      toast.error("Unable to access this tool.");
      return;
    }

    toast.success(`Accessing ${roleId} tools...`);
    
    // Direct navigate to the special role dashboard — no context switch
    setTimeout(() => {
      navigate(createPageUrl(dashboardPage));
    }, 500);
  };

  const getSectionLabel = (id) => sections.find(s => s.id === id)?.label || id;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center app-bg">
        <div className="glass-card rounded-xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center app-bg">
        <div className="glass-card rounded-xl p-8 text-center max-w-sm">
          <h2 className="text-xl font-bold text-foreground mb-4">Please sign in to view settings</h2>
          <Button onClick={() => navigate('/SignIn?returnUrl=/Settings')}>Sign In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg pb-12">
      {/* Header */}
       <div className="glass-card border-b border-border/30 dark:border-border/50 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between safe-top">
          <div className="flex items-center gap-3">
            <div className="glass-panel p-2 rounded-lg border-border/30">
              <SettingsIcon className="w-6 h-6 text-gray-600 dark:text-muted-foreground" />
            </div>
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-foreground">Settings</h1>
          </div>
          <Button 
            variant="ghost" 
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20" 
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="space-y-6">
          {/* Account Summary */}
          <AccountSummary user={user} />

          {/* Navigation & Tabs */}
          <Tabs value={activeSection} onValueChange={setActiveSection} className="space-y-6">
            {/* Desktop Tab Navigation */}
            <div className="hidden md:block">
              <TabsList className="glass-card border-border/50 rounded-xl p-1 grid grid-cols-4 lg:grid-cols-7 gap-1 w-full">
                {sections.map((section) => (
                  <TabsTrigger 
                    key={section.id}
                    value={section.id}
                    className="text-xs lg:text-sm data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950/30 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-400"
                  >
                    <span className="hidden lg:inline">{section.label}</span>
                    <span className="lg:hidden">{section.icon}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Mobile Navigation Button */}
            <div className="md:hidden">
              <Drawer open={navDrawerOpen} onOpenChange={setNavDrawerOpen}>
                <button
                  onClick={() => setNavDrawerOpen(true)}
                  className="w-full px-4 py-2.5 text-sm rounded-lg glass-panel border-border/50 text-left flex items-center justify-between hover:bg-white/40 dark:hover:bg-white/10 transition-colors"
                  style={{ minHeight: "44px" }}
                >
                  <span className="font-medium text-gray-900 dark:text-foreground">
                    {getSectionLabel(activeSection)}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </button>
                <DrawerContent className="px-4 pb-6">
                  <DrawerHeader className="px-0 pt-2 pb-4">
                    <DrawerTitle>Settings Sections</DrawerTitle>
                  </DrawerHeader>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto py-2">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => {
                          setActiveSection(section.id);
                          setNavDrawerOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                          section.id === activeSection
                            ? "bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-600"
                            : "border-l-4 border-transparent hover:bg-gray-50 dark:hover:bg-gray-900/20"
                        }`}
                        style={{ minHeight: "48px" }}
                      >
                        <span className="text-lg">{section.icon}</span>
                        <span className="flex-1 font-medium">{section.label}</span>
                        {section.id === activeSection && (
                          <Check className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </DrawerContent>
              </Drawer>
            </div>

            {/* Tab Content */}
            <TabsContent value="profile" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <ProfileTab user={user} onUpdate={loadUser} />
            </TabsContent>

            <TabsContent value="roles" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <RolesTab user={user} onAdminSwitchRole={handleAdminAccessSpecialRole} />
            </TabsContent>

            <TabsContent value="addresses" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="glass-card rounded-xl border-border/50 p-6">
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-foreground">Shipping Addresses</h3>
                  <p className="text-sm text-gray-500 dark:text-muted-foreground mt-1">Save addresses for faster checkout and shipping label creation.</p>
                </div>
                <AddressBook userEmail={user.email} />
              </div>
            </TabsContent>

            <TabsContent value="payments" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <BillingTab user={user} />
            </TabsContent>

            <TabsContent value="earnings" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <EarningsTab user={user} />
            </TabsContent>

            <TabsContent value="security" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <SecurityTab user={user} />
            </TabsContent>

            <TabsContent value="preferences" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <PreferencesTab user={user} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}