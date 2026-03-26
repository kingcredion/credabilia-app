import React, { useState, useEffect, lazy, Suspense, useRef } from "react";

// Safe idle callback helpers with mobile browser fallback
const runWhenIdle = (callback, timeoutMs = 2000) => {
  if (typeof window !== 'undefined' && window.requestIdleCallback) {
    return window.requestIdleCallback(callback, { timeout: timeoutMs });
  }
  // Fallback for browsers without requestIdleCallback (Safari, mobile)
  return setTimeout(callback, 1);
};

const cancelIdleRun = (id) => {
  if (typeof window !== 'undefined' && window.cancelIdleCallback) {
    window.cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
};
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { normalizeReferralCode, awardReferralSignupEntry } from "@/lib/referralHelpers";
import {
  LayoutDashboard,
  Store,
  ShieldCheck,
  User,
  Trophy,
  Settings,
  LogOut,
  TrendingUp,
  LogIn,
  ChevronDown,
  Brain,
  Menu,
  MessageSquare,
  Building2,
  Sparkles,
  Crown,
  Palette,
  Truck,
  ClipboardList,
  Users,
  Sun,
  Moon,
} from "lucide-react";
import { useDarkMode } from "@/hooks/useDarkMode";
import { useActiveRole } from "@/lib/ActiveRoleContext";
import {
  getUserPermissions,
  getAvailableContexts,
  getDefaultContext,
  canAccessContext,
  getDisplayContext,
  getContextColor,
  getContextGradient,
  getContextBackground,
  getContextNavigation,
  getContextHomePage,
  getSubRoleAccess,
  CONTEXT_COLORS,
  CONTEXT_GRADIENTS,
  CONTEXT_BACKGROUNDS,
} from "@/lib/permissions";
import NotificationBell from "./components/NotificationBell";
import PageTransition from "./components/PageTransition";
import { LanguageProvider, useLanguage } from "./components/contexts/LanguageContext";

// Deferred global UI — loaded after initial paint
const GlobalNavHeader = lazy(() => import("./components/GlobalNavHeader"));
const GlobalFeedbackButton = lazy(() => import("./components/GlobalFeedbackButton"));
const KingCredionWelcomeModal = lazy(() => import("./components/KingCredionWelcomeModal"));
const Footer = lazy(() => import("./components/Footer"));
const MobileBottomNav = lazy(() => import("./components/MobileBottomNav"));
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

// Link that auto-closes the mobile sidebar on click
function NavLink({ to, className, children, style }) {
  const { setOpenMobile } = useSidebar();
  const ref = React.useRef(null);
  
  const handleClick = () => {
    // Save scroll position before closing
    const sidebarContent = document.querySelector('[data-sidebar-content]');
    if (sidebarContent) {
      sessionStorage.setItem('sidebarScrollPos', sidebarContent.scrollTop);
    }
    
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setOpenMobile(false), 300);
    } else {
      setOpenMobile(false);
    }
  };
  
  return (
    <Link ref={ref} to={to} className={className} style={style} onClick={handleClick}>
      {children}
    </Link>
  );
}
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";

// Lazy load heavy components
const OnboardingFlow = lazy(() => import("./components/OnboardingFlow"));
const TutorialOverlay = lazy(() => import("./components/TutorialOverlay"));

// Alias the imported maps under the legacy names so all existing JSX below
// that references roleColors[x], roleGradients[x], roleBackgrounds[x] keeps working.
const roleColors = CONTEXT_COLORS;
const roleGradients = CONTEXT_GRADIENTS;
const roleBackgrounds = CONTEXT_BACKGROUNDS;

const roleCredionImages = {
  collector: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/c85636561_Photoroom_20251212_113249.png",
  vendor: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/384d346d2_Photoroom_20251212_113128.png",
  auditor: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/b31a878b3_Photoroom_20251212_140613.png",
  picture_frame_shop: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/6da0f949c_optimizedphotoshopowner.png",
  influencer: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/ff3301e66_influencer.png",
  artist: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/d25cfa59f_Photoroom_20251216_110752.png"
};

const NEUTRAL_PAGES = [
  "Marketplace",
  "RewardCenter",
  "ExploreFrameShops",
  "Profile",
  "Messages",
  "ItemDetails",
  "VendorProfile",
  "ExploreUsers"
];

// Thin wrapper kept for backward compat with existing references like roleHomePages[newRole]
const roleHomePages = {
  collector:          "Marketplace",
  vendor:             "VendorDashboard",
  auditor:            "VettingQueue",
  picture_frame_shop: "FrameShopDashboard",
  influencer:         "InfluencerDashboard",
  artist:             "ArtistDashboard",
};



export default function Layout(props) {
  return (
    <LanguageProvider>
      <InnerLayout {...props} />
    </LanguageProvider>
  );
}

// Separate component to use useSidebar inside SidebarProvider
function SidebarScrollRestorer() {
  const { openMobile } = useSidebar();
  
  useEffect(() => {
    if (openMobile) {
      const savedPos = sessionStorage.getItem('sidebarScrollPos');
      if (savedPos) {
        const sidebarContent = document.querySelector('[data-sidebar-content]');
        if (sidebarContent) {
          setTimeout(() => {
            sidebarContent.scrollTop = parseInt(savedPos);
          }, 50);
        }
      }
    }
  }, [openMobile]);
  
  return null;
}

function InnerLayout({ children, currentPageName }) {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  // activeContext is a LOCAL UI state — it no longer writes to the backend on every switch.
  // current_role on the user object is kept as a legacy fallback.
  const [activeContext, setActiveContext] = useState("collector");
  // currentRole is kept as an alias for backward compat with all existing references below
  const currentRole = activeContext;
  const setCurrentRole = setActiveContext;
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [influencerData, setInfluencerData] = useState(null);
  const [frameShopData, setFrameShopData] = useState(null);
  const [artistData, setArtistData] = useState(null);
  const [showKingCredionWelcomeModal, setShowKingCredionWelcomeModal] = useState(false);
  const [modalInfluencer, setModalInfluencer] = useState(null);
  const [modalReferredUser, setModalReferredUser] = useState(null);
  const [pendingTicketsCount, setPendingTicketsCount] = useState(0);
  const [pendingFeedbackCount, setPendingFeedbackCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [showTutorial, setShowTutorial] = useState(false);
  const [roleNotifications, setRoleNotifications] = useState({
    collector: false,
    vendor: false,
    picture_frame_shop: false,
    auditor: false,
    influencer: false,
    artist: false
  });

  const { isDark, toggle: toggleDark } = useDarkMode();
  const { setActiveRole } = useActiveRole();

  const toggleTutorial = async (value) => {
    try {
      await base44.auth.updateMe({ is_tutorial_mode_active: value });
      setUser({ ...user, is_tutorial_mode_active: value });
      setShowTutorial(value);
    } catch (error) {
      console.error("Error toggling tutorial:", error);
    }
  };

  useEffect(() => {
    if (user?.is_tutorial_mode_active) {
      setShowTutorial(true);
    }
  }, [user?.is_tutorial_mode_active]);

  // Ensure activeContext is always valid for the current user's permissions
  useEffect(() => {
    if (!user) return;
    const available = getAvailableContexts(user);
    if (!available.includes(activeContext)) {
      setActiveContext(available[0] || "collector");
    }
  }, [user, activeContext]);

  // Icon component map — resolves string keys from getContextNavigation() to Lucide components
  const iconMap = {
    LayoutDashboard, Store, ShieldCheck, Trophy, Truck, Brain, MessageSquare, User,
  };

  // Build translated nav for the active context, resolving icon strings → components
  const buildNav = (context) =>
    getContextNavigation(context).map((item) => ({
      ...item,
      // Prefer translated title where a t() key exists, fall back to the static title
      title: (() => {
        const keyMap = {
          Marketplace:      t("nav.marketplace"),
          MyCollection:     t("nav.my_collection"),
          TrackPackages:    t("nav.track_packages"),
          VendorDashboard:  t("nav.dashboard"),
          VendorShipping:   "Shipping",
          MyListings:       t("nav.my_listings"),
          CreateListing:    t("nav.create_listing"),
          VettingQueue:     t("nav.audit_queue"),
          MyAudits:         t("nav.my_audits"),
          TriviaChallenge:  t("nav.trivia"),
          Messages:         t("nav.messages"),
          ExploreUsers:     t("nav.explore_users"),
        };
        return keyMap[item.url] || item.title;
      })(),
      icon: iconMap[item.icon] || LayoutDashboard,
    }));

  // roleNavigation kept as a lazy getter so it stays compatible with navItems below
  const roleNavigation = new Proxy({}, {
    get: (_, context) => buildNav(context),
  });

  const roleDisplayNames = {
    collector: t("roles.collector"),
    vendor: t("roles.vendor"),
    auditor: t("roles.auditor"),
    picture_frame_shop: t("roles.picture_frame_shop"),
    influencer: t("roles.influencer"),
    artist: "Artist"
  };

  const helpNavItem = {
    title: t("nav.help_support"),
    url: "CredionSupport",
    icon: MessageSquare
  };

  useEffect(() => {
    // Install Klaviyo
    const klaviyoKey = "TGHX8s";
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = `//static.klaviyo.com/onsite/js/klaviyo.js?company_id=${klaviyoKey}`;
    document.head.appendChild(script);

    loadUser();

    // Listen for global user update events
    const handleUserUpdate = () => {
      loadUser();
    };

    window.addEventListener('user-data-updated', handleUserUpdate);
    return () => {
      window.removeEventListener('user-data-updated', handleUserUpdate);
    };
  }, []);



  useEffect(() => {
    if (user) {
      // Load critical data immediately
      loadUnreadMessages();
      
      // Defer role notifications to after first paint to avoid blocking UI
      const notifyTimer = runWhenIdle(() => loadRoleNotifications(), 2000);
      
      return () => cancelIdleRun(notifyTimer);
    }
  }, [user]);

  // Separate effect for admin counts (lower priority)
  useEffect(() => {
    if (user?.role === 'admin') {
      const adminTimer = runWhenIdle(() => loadPendingCounts(), 3000);
      return () => cancelIdleRun(adminTimer);
    }
  }, [user]);

  const loadRoleNotifications = async () => {
    try {
      const notifications = {
        collector: false,
        vendor: false,
        picture_frame_shop: false,
        auditor: false,
        influencer: false,
        artist: false
      };

      const perms = getUserPermissions(user);
      const now = new Date();
      const lastCheck = user.last_vendor_notification_check ? new Date(user.last_vendor_notification_check) : null;
      const hoursSinceLastCheck = lastCheck ? (now - lastCheck) / (1000 * 60 * 60) : 100;

      // Parallel fetch for visible roles only
      const fetches = [];
      const roleChecks = {};

      // collector / vendor / auditor are always available — check all three
      {
        roleChecks.collector = true;
        fetches.push(
          Promise.all([
            // In-transit packages: status is 'shipped' on the Transaction (set by Shippo webhook)
            base44.entities.Transaction.filter({ buyer_email: user.email, status: 'shipped' }),
            // Pending quotes use buyer_email (not receiver_email)
            base44.entities.Quote.filter({ buyer_email: user.email, status: 'pending' }),
            base44.entities.CommissionRequest.filter({ collector_email: user.email, status: 'completed_pending_approval' }),
            base44.entities.FramingRequest.filter({ collector_email: user.email, status: 'completed_pending_approval' })
          ]).then(([transit, quotes, commissions, framing]) => {
            if (transit.length > 0 || quotes.length > 0 || commissions.length > 0 || framing.length > 0) {
              notifications.collector = true;
            }
          })
        );
      }

      if (perms.can_sell && hoursSinceLastCheck >= 1) {
        roleChecks.vendor = true;
        fetches.push(
          Promise.all([
            // "paid" is the correct post-payment status for direct item sales that need shipping.
            // Do NOT use status='completed' — that only happens after delivery.
            base44.entities.Transaction.filter({ vendor_email: user.email, status: 'paid', shipping_status: 'pending' }),
            base44.entities.PendingSale.filter({ vendor_email: user.email, status: 'pending' })
          ]).then(([awaitingShipment, sales]) => {
            if (awaitingShipment.length > 0 || sales.length > 0) {
              notifications.vendor = true;
            }
          })
        );
      }

      if (user.user_type === 'picture_frame_shop' || user.frame_shop_id) {
        roleChecks.picture_frame_shop = true;
        fetches.push(
          Promise.all([
            base44.entities.FramingRequest.filter({ frame_shop_email: user.email, status: 'pending_quote' }),
            base44.entities.FramingRequest.filter({ frame_shop_email: user.email, status: 'in_progress' })
          ]).then(([pending, inProgress]) => {
            if (pending.length > 0 || inProgress.length > 0) {
              notifications.picture_frame_shop = true;
            }
          })
        );
      }

      if (user.user_type === 'artist' || user.artist_id) {
        roleChecks.artist = true;
        fetches.push(
          Promise.all([
            base44.entities.CommissionRequest.filter({ artist_email: user.email, status: 'pending_quote' }),
            base44.entities.CommissionRequest.filter({ artist_email: user.email, status: 'in_progress' })
          ]).then(([pending, inProgress]) => {
            if (pending.length > 0 || inProgress.length > 0) {
              notifications.artist = true;
            }
          })
        );
      }

      roleChecks.auditor = true;
      fetches.push(
        base44.entities.Item.filter({ audit_status: 'pending_audit', visible_to_public: false })
          .then(items => {
            if (items.length > 0) notifications.auditor = true;
          })
      );

      // Execute all in parallel
      await Promise.all(fetches);
      setRoleNotifications(notifications);
    } catch (error) {
      console.error("Error loading role notifications:", error);
    }
  };

  const loadUnreadMessages = async () => {
    try {
      const messages = await base44.entities.Message.filter({
        receiver_email: user.email,
        read: false
      });
      setUnreadMessageCount(messages.length);
    } catch (error) {
      console.error("Error loading unread messages:", error);
    }
  };

  const loadPendingCounts = async () => {
    try {
      const [tickets, feedback] = await Promise.all([
        base44.entities.SupportTicket.filter({ status: 'awaiting_admin' }),
        base44.entities.TechnicalFeedback.filter({ status: 'new' })
      ]);
      setPendingTicketsCount(tickets.length);
      setPendingFeedbackCount(feedback.length);
    } catch (error) {
      console.error("Error loading pending counts:", error);
    }
  };

  const loadUser = async () => {
    try {
      const isAuth = await base44.auth.isAuthenticated();
      setIsAuthenticated(isAuth);

      if (isAuth) {
        let userData = await base44.auth.me();
        setUser(userData);
        // Use permissions-aware default; falls back to current_role for legacy compat
        const defaultCtx = getDefaultContext(userData);
        setActiveContext(defaultCtx);
        setActiveRole(defaultCtx);

        // REFERRAL CAPTURE: Normalize and store the referral code on first signup
        // This code is used later at checkout to attribute purchases to the influencer
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        let showModalFlag = false;
        let tempMatchingInfluencer = null;
        
        if (refCode && !userData.referred_by) {
          // Normalize to uppercase for consistent canonical matching
          const upperRefCode = normalizeReferralCode(refCode);
          await base44.auth.updateMe({ referred_by: upperRefCode });

          const allInfluencers = await base44.entities.Influencer.list();
          const matchingInfluencer = allInfluencers.find(
            inf => normalizeReferralCode(inf.referral_code) === upperRefCode
          );

          if (matchingInfluencer) {
            // Increment signup count (not raw clicks) — this is a confirmed auth referral
            await base44.entities.Influencer.update(matchingInfluencer.id, {
              total_signups: (matchingInfluencer.total_signups || 0) + 1
            });

            // Create canonical signup attribution + award referrer one sweepstakes entry
            awardReferralSignupEntry(
              matchingInfluencer.id,
              matchingInfluencer.user_email,
              userData.email,
              upperRefCode,
              base44
            ).catch(err => console.warn("[Layout] awardReferralSignupEntry failed:", err));

            showModalFlag = true;
            tempMatchingInfluencer = matchingInfluencer;
          }

          const updatedUser = await base44.auth.me();
          setUser(updatedUser);
          userData = updatedUser;
        }

        if (showModalFlag && tempMatchingInfluencer) {
          setModalInfluencer(tempMatchingInfluencer);
          setModalReferredUser(userData);
          setShowKingCredionWelcomeModal(true);
        }

        if (!userData.onboarding_completed) {
          setShowOnboarding(true);
        }

        // Parallel load special account profiles only if needed
        const profileFetches = [];
        if (userData.user_type === "influencer" || userData.influencer_id) {
          profileFetches.push(
            base44.entities.Influencer.filter({ user_email: userData.email })
              .then(inf => inf.length > 0 && setInfluencerData(inf[0]))
          );
        }
        if (userData.user_type === "picture_frame_shop" || userData.frame_shop_id) {
          profileFetches.push(
            base44.entities.FrameShop.filter({ user_email: userData.email })
              .then(shops => shops.length > 0 && setFrameShopData(shops[0]))
          );
        }
        if (userData.user_type === "artist" || userData.artist_id) {
          profileFetches.push(
            base44.entities.Artist.filter({ user_email: userData.email })
              .then(artists => artists.length > 0 && setArtistData(artists[0]))
          );
        }
        if (profileFetches.length > 0) {
          await Promise.all(profileFetches);
        }
        }
        } catch (error) {
      console.error("Error loading user:", error);
      setIsAuthenticated(false);
    }
  };

  const handleOnboardingComplete = async (selectedRole, onboardingData) => {
    try {
      const updateData = {
        current_role: selectedRole,
        onboarding_completed: true,
      };

      if (onboardingData.user_type === "indiegogo_investor") {
        const indiegogoData = onboardingData.indiegogo_data;
        await base44.entities.IndiegogoInvestor.create({
          user_id: user.id,
          user_email: user.email,
          indiegogo_backer_id: indiegogoData.indiegogo_backer_id,
          indiegogo_profile_url: indiegogoData.indiegogo_profile_url || "",
          status: "pending_verification"
        });

        updateData.user_type = "indiegogo_investor";
        updateData.current_role = "collector";
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

        updateData.user_type = "picture_frame_shop";
        updateData.frame_shop_id = frameShop.id;
        updateData.current_role = "collector";
        updateData.interests_tags = onboardingData.interests_tags || [];
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

        updateData.user_type = "influencer";
        updateData.influencer_id = influencer.id;
          updateData.current_role = "collector";
          updateData.interests_tags = onboardingData.interests_tags || [];
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

          updateData.user_type = "artist";
          updateData.artist_id = artist.id;
          updateData.current_role = "collector";
          updateData.interests_tags = onboardingData.interests_tags || [];
        }
        else {
          updateData.user_type = "individual";
        updateData.interests_tags = onboardingData.interests_tags || [];

        if (onboardingData.language) {
          updateData.preferred_language = onboardingData.language;
        }
        if (onboardingData.location) {
          updateData.location = onboardingData.location;
        }
        if (onboardingData.latitude && onboardingData.longitude) {
          updateData.latitude = parseFloat(onboardingData.latitude);
          updateData.longitude = parseFloat(onboardingData.longitude);
        }
      }

      await base44.auth.updateMe(updateData);
      navigate(createPageUrl(roleHomePages[updateData.current_role]));
    } catch (error) {
      console.error("❌ Error completing onboarding:", error);
    }
  };

  const handleRoleSwitch = (newRole) => {
    if (!user || newRole === activeContext) return;

    // Permission gate — only allow contexts the user has earned
    if (!canAccessContext(user, newRole)) return;

    setIsTransitioning(true);

    // Clear vendor notification badge locally (no backend write)
    if (newRole === 'vendor' && roleNotifications.vendor) {
      // Persist only the lightweight timestamp flag, not a full role write
      base44.auth.updateMe({ last_vendor_notification_check: new Date().toISOString() }).catch(() => {});
      setRoleNotifications(prev => ({ ...prev, vendor: false }));
    }

    // Active context is purely local UI state — no backend mutation on switch
    setActiveContext(newRole);
    setActiveRole(newRole);

    const currentPath = location.pathname.replace(/^\//, '').split('?')[0] || 'Marketplace';
    const isNeutralPage = NEUTRAL_PAGES.some(page => page.toLowerCase() === currentPath.toLowerCase());

    if (!isNeutralPage) {
      navigate(createPageUrl(getContextHomePage(newRole)));
    }

    // Do NOT dispatch 'roleSwitch' — context changes are local UI state only.
    // Pages that need the active context should read it from a shared context/prop,
    // not listen to a global event that implies a backend identity change.

    setTimeout(() => {
      setIsTransitioning(false);
    }, 300);
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  const handleLogin = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    const nextUrl = refCode ? `/Marketplace?ref=${refCode}` : '/Marketplace';
    base44.auth.redirectToLogin(nextUrl);
  };

  if (isAuthenticated === null) {
    return (
      <div className={`min-h-screen flex items-center justify-center app-bg`}>
        <div className="glass-card rounded-xl p-8 shadow-xl text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin';

  const currentColor = getContextColor(currentRole);
  const currentGradient = getContextGradient(currentRole);
  const currentBackground = getContextBackground(currentRole);

  // Use central resolver for access; still track entity status for UI
  const isApprovedInfluencer = influencerData?.status === "active";
  const isApprovedFrameShop = frameShopData?.status === "active";
  const isApprovedArtist = artistData?.status === "active";

  // Activation prompts only for non-admins
  const canActivateArtistProfile = !isAdmin && isApprovedArtist && user?.opted_into_artist_profile !== true;
  const canActivateFrameShopProfile = !isAdmin && isApprovedFrameShop && user?.opted_into_frame_shop_profile !== true;
  const canActivateInfluencerProfile = !isAdmin && isApprovedInfluencer && user?.opted_into_influencer_profile !== true;

  const handleActivateArtistProfile = async () => {
    try {
      await base44.auth.updateMe({ opted_into_artist_profile: true });
      window.location.reload();
    } catch (error) {
      console.error("Failed to activate artist profile:", error);
    }
  };

  const handleActivateFrameShopProfile = async () => {
    try {
      await base44.auth.updateMe({ opted_into_frame_shop_profile: true });
      window.location.reload();
    } catch (error) {
      console.error("Failed to activate frame shop profile:", error);
    }
  };

  const handleActivateInfluencerProfile = async () => {
    try {
      await base44.auth.updateMe({ opted_into_influencer_profile: true });
      window.location.reload();
    } catch (error) {
      console.error("Failed to activate influencer profile:", error);
    }
  };

  const navItems = user ? (roleNavigation[currentRole] || []) : [];
  const totalPending = pendingTicketsCount + pendingFeedbackCount;

  const adminItems = user?.role === 'admin'
    ? [
        {
          title: t("nav.admin_dashboard"),
          url: "AdminDashboard",
          icon: Settings,
          badge: totalPending > 0 ? totalPending : null
        }
      ]
    : [];

  // PRIMARY roles only — always collector, vendor, auditor
  const availableRoles = ['collector', 'vendor', 'auditor'];
  // Sub-role access (includes admin override + entity presence)
  // NOTE: Founder Circle is a gated PRIVILEGE, not a primary role. It's shown alongside dashboards, not in role switcher.
  const subRoleAccess = user ? getSubRoleAccess(user) : {};

  const roleImages = {
    collector: {
      mobile: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/252a3a6e7_Photoroom_20260319_225137.png",
      desktop: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/decdd2b23_37763C79-8B46-479F-A6A8-42BF32B15E54.png"
    },
    vendor: {
      mobile: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/887d27b01_Photoroom_20260319_225203.png",
      desktop: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/5d8d8df98_00330CC9-B267-4AAE-8898-32B27ED8EA21.png"
    },
    auditor: {
      mobile: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/5211622e8_Photoroom_20260319_225112.png",
      desktop: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/b43184203_6789AD20-F6EF-49BB-9D62-D0EB8BD5EF98.png"
    },
    picture_frame_shop: {
      mobile: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/887d27b01_Photoroom_20260319_225203.png",
      desktop: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/887d27b01_Photoroom_20260319_225203.png"
    },
    influencer: {
      mobile: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/252a3a6e7_Photoroom_20260319_225137.png",
      desktop: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/252a3a6e7_Photoroom_20260319_225137.png"
    },
    artist: {
      mobile: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/5211622e8_Photoroom_20260319_225112.png",
      desktop: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/b43184203_6789AD20-F6EF-49BB-9D62-D0EB8BD5EF98.png"
    }
  };

  const artistImages = {
    mobile: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/7b45db3d9_Photoroom_20260320_002837.png",
    desktop: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/0c5ab12fb_E2F2351D-7597-4933-86BD-FBEEE459563B.png"
  };

  const influencerImages = {
    mobile: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/032b2e708_Photoroom_20260324_005657.png",
    desktop: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/032b2e708_Photoroom_20260324_005657.png"
  };

  const frameShopImages = {
    mobile: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/09fb647b3_Photoroom_20260324_010540.png",
    desktop: "https://media.base44.com/images/public/690badbd56a85b130b88aa42/09fb647b3_Photoroom_20260324_010540.png"
  };

  const getDashboardImage = () => {
    const currentPath = location.pathname.replace(/^\//, '');
    if (currentPath === "ArtistDashboard" && isApprovedArtist) return artistImages;
    if (currentPath === "FrameShopDashboard" && isApprovedFrameShop) return frameShopImages;
    if (currentPath === "InfluencerDashboard" && isApprovedInfluencer) return influencerImages;
    return roleImages[currentRole];
  };

  const currentDashboardImages = getDashboardImage();
  let currentCredionImage = user ? roleCredionImages[currentRole] : roleCredionImages.collector;

  if (user?.user_type === "indiegogo_investor" && user?.is_indiegogo_founder) {
    currentCredionImage = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/e1bb7b419_IMG_0622.png";
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <SidebarScrollRestorer />
      <div className="min-h-screen flex w-full app-bg">
        {user && (
          <Sidebar className="hidden md:flex border-r dark:border-border border-gray-200">
            <SidebarHeader className="border-b dark:border-border border-gray-200 p-0 h-40 md:h-80">
              <div className="relative flex items-center justify-center w-full h-full overflow-hidden" style={{ background: currentGradient }}>
                <img
                   key={currentDashboardImages === artistImages ? 'artist' : currentDashboardImages === frameShopImages ? 'frameshop' : currentDashboardImages === influencerImages ? 'influencer' : currentRole}
                   src={currentDashboardImages.desktop}
                   srcSet={`${currentDashboardImages.desktop} 1920w`}
                   sizes="100vw"
                   alt={currentDashboardImages === artistImages ? 'artist-studio' : currentDashboardImages === frameShopImages ? 'frame-shop' : currentDashboardImages === influencerImages ? 'influencer-hub' : currentRole}
                  className="w-full h-full object-cover object-top transition-opacity duration-300"
                  loading="lazy"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                {/* Crown SVG overlay — color changes with active role */}
                <svg
                  key={`crown-${currentRole}`}
                  viewBox="0 0 100 60"
                  className="absolute bottom-3 right-3 w-10 h-10 drop-shadow-lg transition-all duration-500"
                  style={{ filter: `drop-shadow(0 0 6px ${currentColor}cc)` }}
                  fill={currentColor}
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <polygon points="5,55 20,15 50,40 80,15 95,55" />
                  <circle cx="5" cy="13" r="6" />
                  <circle cx="50" cy="8" r="6" />
                  <circle cx="95" cy="13" r="6" />
                </svg>
              </div>
            </SidebarHeader>

            <SidebarContent className="p-3 relative" data-sidebar-content>
              {/* Large crown watermark behind menu items */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
                <svg viewBox="0 0 2000 2000" className="w-72 h-72 opacity-[0.06] transition-all duration-500" style={{ fill: currentColor }} xmlns="http://www.w3.org/2000/svg">
                  <path d="M1484.95,1280.1c15.59-51.15,33.82-101.35,54.55-150.61c11.03-26.22,22.88-52.09,34.33-78.13c1.18-2.69,3.81-5.85,1.57-8.4c-3.1-3.52-6.31,0.13-9.02,1.63c-44.27,24.48-90.85,41.49-141.64,46.33c-67.23,6.4-129.81-7.74-187.8-41.75c-82.12-48.16-139.76-118.93-183.84-201.83c-18.02-33.89-33.57-68.88-44.87-105.66c-0.67-2.17-1.36-4.38-2.38-6.39c-1.3-2.57-2-6.34-5.9-5.86c-3.14,0.39-3.39,3.82-4.24,6.17c-4.01,11.05-7.6,22.26-11.71,33.27c-31.86,85.42-77.5,162.09-144.05,225.29c-52.34,49.71-112.47,84.94-184.64,96.76c-67.32,11.03-131.34-0.73-192.62-29.5c-9.95-4.67-19.58-10.01-29.36-15.04c-2.32-1.19-4.89-3.58-7.28-1.78c-3.22,2.43-0.64,5.59,0.51,8.19c9.66,21.86,19.66,43.57,29.1,65.52c22.66,52.66,42.35,106.43,60.15,160.91c0.33,1,0.3,2.11,0.81,6.1c-11.8-22.47-22.26-42.44-32.75-62.38c-65.11-123.77-138.96-242.19-218.62-357.06c-5.21-7.51-11.29-10.02-20.04-9.93c-37.98,0.41-64.6-29.94-62.94-69.59c1.23-29.4,28.67-54.87,58.92-56.92c33.06-2.25,61.48,17.84,68.1,48.18c4.76,21.83,0.27,41.47-14.8,58.11c-4.85,5.35-5.97,9.26-1.24,15.58c48.61,64.89,103.24,123.32,174.36,164.27c14.49,8.34,29.73,15.09,45.13,21.58c9.22,3.88,13.65,1.21,17.63-7.34c22.12-47.46,36.73-97.13,44.54-148.83c4.81-31.81,6.68-63.83,7.09-96c0.13-10.49-3.76-14.64-14.2-16c-34.31-4.47-57.01-36.65-51.71-72.13c5.19-34.78,37.17-58.6,71.38-53.46c25.18,3.79,43.26,17.34,51.42,41.09c8.3,24.16,4.81,47.57-13.92,66.44c-6.59,6.64-5.05,11.14-0.46,17.44c35.71,49.02,77.11,92.71,123.11,132.09c19.31,16.53,38.99,32.63,58.61,48.78c12.11,9.97,13.6,9.66,23.87-1.61c47.21-51.83,83.59-110.67,112.67-174.2c15.64-34.17,29.1-69.17,40.8-104.9c3.21-9.81,2.06-14.7-8.51-18.85c-29.66-11.64-44.12-41.56-37.76-74.38c4.66-24.05,31.05-51.48,63.19-51.07c31.02,0.4,56.34,19.44,62.72,47.6c7.15,31.59-6.82,62.67-35.83,75.88c-11.41,5.19-13.02,10.92-9.27,21.97c28.47,83.82,64.75,163.62,118.56,234.6c12.16,16.04,25,31.48,39.3,45.71c4.57,4.55,8.28,5.38,13.58,1.13c67.96-54.47,133.31-111.51,185-182.52c6.49-8.92,6.77-14.33-1.31-22.81c-18.7-19.65-20.37-53.14-5.55-76.26c15.34-23.93,43.6-34.12,72.92-26.28c25.12,6.72,43.72,30.67,44.37,57.12c0.77,31.59-14.73,55.16-42.3,64.33c-0.72,0.24-1.42,0.55-2.15,0.76c-21.64,6.24-21.86,6.24-21.58,28.68c0.98,78.71,16.21,154.43,48.25,226.54c8.5,19.13,8.65,19.11,27.44,11.28c61.87-25.79,112.21-67.26,157.32-115.81c18.87-20.3,36.13-41.94,53.16-63.79c6.05-7.77,6.92-12.87-0.39-21.11c-23.83-26.86-18.28-71.73,10.32-91.93c31.21-22.06,75.46-13.65,93.76,17.81c19.14,32.9,6.47,75.4-27.2,91.3c-8.41,3.97-17.38,5.85-26.53,5.15c-9.1-0.7-14.64,3.09-19.72,10.35c-58.94,84.35-114.22,171.02-165.51,260.23C1540.38,1175.42,1512.32,1227.49,1484.95,1280.1z"/>
                  <path d="M1464.47,1386.21c-10.67,16.41-25.06,24.62-40.34,31.42c-35.92,15.98-73.95,24.65-112.27,32.57c-33.82,6.99-68.16,10.34-102.22,15.62c-20.15,3.12-40.77,3.2-61.17,4.81c-72.28,5.7-144.7,5.93-217.08,4.21c-41.6-0.99-83.18-4.17-124.67-8.22c-56.65-5.54-112.8-13.75-167.96-27.85c-28.32-7.24-56.22-15.92-81.34-31.55c-8.06-5.01-15.4-10.81-21.56-22.31c7.43,3.09,12.35,5.19,17.3,7.18c51.05,20.58,104.64,30.88,158.75,38.77c89.84,13.1,180.21,18.17,270.99,18.73c116.24,0.72,231.89-5.06,346.5-25.45c44.49-7.92,88.5-17.85,129.77-37.18C1460.09,1386.54,1461.26,1386.65,1464.47,1386.21z"/>
                </svg>
              </div>

              <div className="px-3 py-2 relative z-10">
                <p className={`text-xs font-medium uppercase tracking-wider mb-3 ${isDark ? 'text-muted-foreground' : 'text-gray-500'}`}>
                   {currentRole.charAt(0).toUpperCase() + currentRole.slice(1).replace('_', ' ')} Menu
                 </p>

                {/* PRIMARY role switcher — collector / vendor / auditor only */}
                <div id="sidebar-role-switcher" className="flex flex-wrap gap-2 mb-4">
                {availableRoles.map((role) => (
                  <button
                    key={role}
                    onClick={() => handleRoleSwitch(role)}
                    disabled={isTransitioning}
                    className={`relative px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-all duration-300 focus:outline-none flex-1 min-w-[70px] ${
                      currentRole === role
                        ? 'text-white shadow-lg scale-105'
                        : isDark ? 'bg-muted/40 text-foreground/80 border border-border hover:bg-muted/60 hover:border-border' : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-150'
                    } ${roleNotifications[role] && currentRole !== role ? 'ring-2 ring-offset-1' : ''}`}
                    style={{
                      ...(currentRole === role ? { backgroundColor: roleColors[role] } : {}),
                      ...(roleNotifications[role] && currentRole !== role ? { outlineColor: roleColors[role] + '80', ringColor: roleColors[role] } : {})
                    }}
                  >
                    {roleDisplayNames[role]}
                    {roleNotifications[role] && currentRole !== role && (
                      <span className="absolute -top-1 -right-1 inline-flex rounded-full h-2.5 w-2.5 border border-white" style={{ backgroundColor: roleColors[role] }}></span>
                    )}
                  </button>
                ))}
                </div>

                {canActivateArtistProfile && (
                  <div className="mb-4">
                    <Button
                      onClick={handleActivateArtistProfile}
                      className="w-full bg-pink-600 hover:bg-pink-700 text-white shadow-md dark:shadow-lg animate-pulse hover:animate-none border border-pink-600 dark:border-pink-500/50 transition-all duration-200"
                    >
                      <Palette className="w-4 h-4 mr-2" />
                      Activate Artist
                    </Button>
                  </div>
                )}

                {canActivateFrameShopProfile && (
                  <div className="mb-4">
                    <Button
                      onClick={handleActivateFrameShopProfile}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-md dark:shadow-lg animate-pulse hover:animate-none border border-purple-600 dark:border-purple-500/50 transition-all duration-200"
                    >
                      <Building2 className="w-4 h-4 mr-2" />
                      Activate Shop
                    </Button>
                  </div>
                )}

                {canActivateInfluencerProfile && (
                  <div className="mb-4">
                    <Button
                      onClick={handleActivateInfluencerProfile}
                      className="w-full bg-green-600 hover:bg-green-700 text-white shadow-md dark:shadow-lg animate-pulse hover:animate-none border border-green-600 dark:border-green-500/50 transition-all duration-200"
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Activate Influencer
                    </Button>
                  </div>
                )}

                <div id="sidebar-role-menu" className="space-y-1 mb-4">

                  {navItems
                    .filter(item => item.url !== "Marketplace" && item.url !== "ExploreFrameShops")
                    .map((item) => (
                      <NavLink
                        key={item.title}
                        to={createPageUrl(item.url)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                          location.pathname === createPageUrl(item.url)
                            ? 'font-semibold shadow-sm'
                            : isDark ? 'hover:bg-muted/50 hover:border hover:border-border' : 'hover:bg-gray-50'
                        }`}
                        style={{
                          backgroundColor: location.pathname === createPageUrl(item.url) ? `${currentColor}20` : undefined,
                          color: currentColor,
                          borderLeft: location.pathname === createPageUrl(item.url) ? `3px solid ${currentColor}` : undefined,
                        }}
                      >
                        <item.icon className="w-5 h-5" />
                        <span className="flex-1">{item.title}</span>
                        {currentRole === 'collector' && item.url === 'TrackPackages' && roleNotifications.collector && (
                          <span className="inline-flex items-center text-[10px] font-medium rounded-full px-1.5 py-0.5 flex-shrink-0" style={{ color: roleColors.collector, backgroundColor: roleColors.collector + '15', border: `1px solid ${roleColors.collector}40` }}>
                            In transit
                          </span>
                        )}
                        {currentRole === 'vendor' && item.url === 'VendorShipping' && roleNotifications.vendor && (
                          <span className="inline-flex items-center text-[10px] font-medium rounded-full px-1.5 py-0.5 flex-shrink-0" style={{ color: roleColors.vendor, backgroundColor: roleColors.vendor + '15', border: `1px solid ${roleColors.vendor}40` }}>
                            Action needed
                          </span>
                        )}
                        {currentRole === 'auditor' && item.url === 'VettingQueue' && roleNotifications.auditor && (
                          <span className="inline-flex items-center text-[10px] font-medium rounded-full px-1.5 py-0.5 flex-shrink-0" style={{ color: roleColors.auditor, backgroundColor: roleColors.auditor + '15', border: `1px solid ${roleColors.auditor}40` }}>
                            Items waiting
                          </span>
                        )}
                      </NavLink>
                    ))}
                </div>

                <div id="sidebar-quick-access" className="mb-4 space-y-2">
                  <p className={`text-xs font-medium uppercase tracking-wider mb-2 ${isDark ? 'text-muted-foreground' : 'text-gray-500'}`}>
                    Universal Menu
                  </p>

                  <Card className={`overflow-hidden shadow-md border-2 hover:shadow-lg transition-all duration-200 ${
                     isDark 
                       ? 'bg-muted/30 border-border hover:bg-muted/50 hover:border-blue-500/50' 
                       : 'bg-card border-border hover:border-blue-400'
                   }`}>
                   <NavLink to={createPageUrl("Marketplace")} className="block">
                     <CardContent className="p-3">
                       <div className={`flex items-center gap-3 ${
                         location.pathname === createPageUrl("Marketplace")
                           ? isDark ? 'text-blue-400 font-semibold' : 'text-blue-600 font-semibold'
                           : isDark ? 'text-foreground/70' : 'text-gray-700'
                       }`}>
                         <div className={`p-2 rounded-lg ${
                           location.pathname === createPageUrl("Marketplace")
                             ? isDark ? 'bg-blue-500/20' : 'bg-blue-100'
                             : isDark ? 'bg-muted' : 'bg-gray-100'
                         }`}>
                            <LayoutDashboard className="w-4 h-4" />
                          </div>
                          <span className="text-sm">{t("nav.marketplace")}</span>
                        </div>
                      </CardContent>
                    </NavLink>
                  </Card>

                  <Card className={`overflow-hidden shadow-md border-2 hover:shadow-lg transition-all duration-200 ${
                     isDark 
                       ? 'bg-muted/30 border-border hover:bg-muted/50 hover:border-green-500/50' 
                       : 'bg-card border-border hover:border-green-400'
                   }`}>
                   <NavLink to={createPageUrl("RewardCenter")} className="block">
                     <CardContent className="p-3">
                       <div className={`flex items-center gap-3 ${
                         location.pathname === createPageUrl("RewardCenter")
                           ? isDark ? 'text-green-400 font-semibold' : 'text-green-600 font-semibold'
                           : isDark ? 'text-foreground/70' : 'text-gray-700'
                       }`}>
                         <div className={`p-2 rounded-lg ${
                           location.pathname === createPageUrl("RewardCenter")
                             ? isDark ? 'bg-green-500/20' : 'bg-green-100'
                             : isDark ? 'bg-muted' : 'bg-gray-100'
                         }`}>
                            <Trophy className="w-4 h-4" />
                          </div>
                          <span className="text-sm">{t("nav.reward_center")}</span>
                        </div>
                      </CardContent>
                    </NavLink>
                  </Card>

                  <Card className={`overflow-hidden shadow-md border-2 hover:shadow-lg transition-all duration-200 ${
                     isDark 
                       ? 'bg-muted/30 border-border hover:bg-muted/50 hover:border-purple-500/50' 
                       : 'bg-card border-border hover:border-purple-400'
                   }`}>
                   <NavLink to={createPageUrl("ExploreFrameShops")} className="block">
                     <CardContent className="p-3">
                       <div className={`flex items-center gap-3 ${
                         location.pathname === createPageUrl("ExploreFrameShops")
                           ? isDark ? 'text-purple-400 font-semibold' : 'text-purple-600 font-semibold'
                           : isDark ? 'text-foreground/70' : 'text-gray-700'
                       }`}>
                         <div className={`p-2 rounded-lg ${
                           location.pathname === createPageUrl("ExploreFrameShops")
                             ? isDark ? 'bg-purple-500/20' : 'bg-purple-100'
                             : isDark ? 'bg-muted' : 'bg-gray-100'
                         }`}>
                            <Users className="w-4 h-4" />
                          </div>
                          <span className="text-sm">Creative Hub</span>
                        </div>
                      </CardContent>
                    </NavLink>
                  </Card>

                  {(subRoleAccess.canAccessFrameShopTools || subRoleAccess.canAccessInfluencerTools || subRoleAccess.canAccessArtistTools || subRoleAccess.hasFounderCircleAccess) && (
                     <div id="sidebar-special-features">
                       <p className={`text-xs font-medium uppercase tracking-wider mb-2 mt-4 ${isDark ? 'text-muted-foreground' : 'text-gray-500'}`}>
                         My Dashboards
                       </p>
                     </div>
                   )}

                  {subRoleAccess.canAccessFrameShopTools && (
                    <Card className={`overflow-hidden shadow-md border hover:shadow-lg transition-all duration-200 mb-2 ${isDark ? 'bg-purple-900/20 border-purple-500/30 hover:border-purple-500/50' : 'bg-card border-border hover:border-purple-400'}`}>
                      <NavLink to={createPageUrl("FrameShopDashboard")} className="block">
                       <CardContent className="p-3">
                         <div className={`flex items-center gap-3 ${
                           location.pathname === createPageUrl("FrameShopDashboard")
                             ? isDark ? 'text-purple-400 font-semibold' : 'text-purple-700 font-semibold'
                             : isDark ? 'text-foreground/70' : 'text-foreground'
                         }`}>
                           <div className={`p-2 rounded-lg ${
                             location.pathname === createPageUrl("FrameShopDashboard")
                               ? isDark ? 'bg-purple-500/30' : 'bg-purple-100'
                               : isDark ? 'bg-purple-500/20' : 'bg-purple-50'
                           }`}>
                             <Building2 className="w-4 h-4" />
                           </div>
                           <div className="flex-1">
                             <span className="text-sm block">{t("nav.shop_dashboard")}</span>
                           </div>
                           <Badge className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5">
                             ENABLED
                           </Badge>
                         </div>
                       </CardContent>
                     </NavLink>
                   </Card>
                  )}

                  {subRoleAccess.canAccessInfluencerTools && (
                    <Card className={`overflow-hidden shadow-md border hover:shadow-lg transition-all duration-200 mb-2 ${isDark ? 'bg-green-900/20 border-green-500/30 hover:border-green-500/50' : 'bg-card border-border hover:border-green-400'}`}>
                      <NavLink to={createPageUrl("InfluencerDashboard")} className="block">
                       <CardContent className="p-3">
                         <div className={`flex items-center gap-3 ${
                           location.pathname === createPageUrl("InfluencerDashboard")
                             ? isDark ? 'text-green-400 font-semibold' : 'text-green-700 font-semibold'
                             : isDark ? 'text-foreground/70' : 'text-foreground'
                         }`}>
                           <div className={`p-2 rounded-lg ${
                             location.pathname === createPageUrl("InfluencerDashboard")
                               ? isDark ? 'bg-green-500/30' : 'bg-green-100'
                               : isDark ? 'bg-green-500/20' : 'bg-green-50'
                           }`}>
                             <TrendingUp className="w-4 h-4" />
                           </div>
                           <div className="flex-1">
                             <span className="text-sm block">{t("nav.influencer_dashboard")}</span>
                           </div>
                           <Badge className="bg-green-600 text-white text-[10px] px-1.5 py-0.5">
                             ENABLED
                           </Badge>
                         </div>
                       </CardContent>
                     </NavLink>
                   </Card>
                  )}

                  {subRoleAccess.canAccessArtistTools && (
                    <Card className={`overflow-hidden shadow-md border hover:shadow-lg transition-all duration-200 mb-2 ${isDark ? 'bg-pink-900/20 border-pink-500/30 hover:border-pink-500/50' : 'bg-card border-border hover:border-pink-400'}`}>
                      <NavLink to={createPageUrl("ArtistDashboard")} className="block">
                       <CardContent className="p-3">
                         <div className={`flex items-center gap-3 ${
                           location.pathname === createPageUrl("ArtistDashboard")
                             ? isDark ? 'text-pink-400 font-semibold' : 'text-pink-700 font-semibold'
                             : isDark ? 'text-foreground/70' : 'text-foreground'
                         }`}>
                           <div className={`p-2 rounded-lg ${
                             location.pathname === createPageUrl("ArtistDashboard")
                               ? isDark ? 'bg-pink-500/30' : 'bg-pink-100'
                               : isDark ? 'bg-pink-500/20' : 'bg-pink-50'
                           }`}>
                             <Palette className="w-4 h-4" />
                           </div>
                           <div className="flex-1">
                             <span className="text-sm block">Artist Studio</span>
                           </div>
                           <Badge className="bg-pink-600 text-white text-[10px] px-1.5 py-0.5">
                             ENABLED
                           </Badge>
                         </div>
                       </CardContent>
                     </NavLink>
                   </Card>
                  )}

                  {(user?.user_type === "indiegogo_investor" && user?.is_indiegogo_founder || isAdmin) && (
                   <Card className={`overflow-hidden shadow-md border hover:shadow-lg transition-all duration-200 ${isDark ? 'bg-amber-900/20 border-amber-500/30 hover:border-amber-500/50' : 'bg-card border-border hover:border-amber-400'}`}>
                     <NavLink to={createPageUrl("FounderCircleDashboard")} className="block">
                       <CardContent className="p-3">
                         <div className={`flex items-center gap-3 ${
                           location.pathname === createPageUrl("FounderCircleDashboard")
                             ? isDark ? 'text-amber-400 font-semibold' : 'text-amber-700 font-semibold'
                             : isDark ? 'text-foreground/70' : 'text-foreground'
                         }`}>
                           <div className={`p-2 rounded-lg ${
                             location.pathname === createPageUrl("FounderCircleDashboard")
                               ? isDark ? 'bg-amber-500/30' : 'bg-amber-100'
                               : isDark ? 'bg-amber-500/20' : 'bg-amber-50'
                           }`}>
                             <Crown className="w-4 h-4" />
                           </div>
                           <div className="flex-1">
                             <span className="text-sm block">Founder's Circle</span>
                             <span className="text-xs text-amber-600 dark:text-amber-400">Backer Privileges</span>
                           </div>
                           <Badge className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5">
                             EXCLUSIVE
                           </Badge>
                         </div>
                       </CardContent>
                     </NavLink>
                   </Card>
                  )}
                </div>

                <div id="sidebar-help" className={`pt-3 mt-3 border-t dark:border-border ${isDark ? '' : 'border-gray-200'}`}>
                  <NavLink
                    to={createPageUrl(helpNavItem.url)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${isDark ? 'hover:bg-muted/50 text-foreground/80 hover:text-orange-400' : 'hover:bg-muted/40 text-gray-700 hover:text-orange-600'}`}
                  >
                    <helpNavItem.icon className="w-5 h-5" />
                    <span>{helpNavItem.title}</span>
                  </NavLink>
                </div>

                {adminItems.length > 0 && (
                  <div className={`pt-3 mt-3 border-t ${isDark ? 'border-border' : 'border-gray-200'}`}>
                    <p className={`text-xs font-medium uppercase tracking-wider mb-3 px-3 ${isDark ? 'text-muted-foreground' : 'text-gray-500'}`}>
                      {t("nav.admin_controls")}
                    </p>
                    {adminItems.map((item) => (
                      <NavLink
                        key={item.title}
                        to={createPageUrl(item.url)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                         location.pathname === createPageUrl(item.url)
                           ? isDark ? 'font-semibold shadow-sm bg-purple-500/20 text-purple-400' : 'font-semibold shadow-sm bg-purple-500/10 text-purple-600'
                           : isDark ? 'hover:bg-muted/50 text-foreground/80 hover:border hover:border-purple-500/50' : 'hover:bg-muted/40 text-gray-700'
                        }`}
                      >
                        <item.icon className="w-5 h-5" />
                        <span className="flex-1">{item.title}</span>
                        {item.badge && (
                           <Badge className="bg-red-500 text-white text-xs px-2 py-0.5">
                            {item.badge}
                          </Badge>
                        )}
                        </NavLink>
                        ))}
                  </div>
                )}
                
                {user && (
                  <div id="sidebar-settings" className={`pt-3 mt-3 border-t ${isDark ? 'border-border' : 'border-gray-200'} space-y-1`}>


                    <NavLink
                      to={createPageUrl("Settings")}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                        location.pathname === createPageUrl("Settings")
                          ? isDark ? 'font-semibold bg-muted/50 text-foreground' : 'font-semibold bg-muted/40 text-foreground'
                          : isDark ? 'hover:bg-muted/50 text-foreground/80' : 'hover:bg-muted/40 text-gray-700'
                      }`}
                    >
                      <Settings className="w-4 h-4" />
                      <span>{t("nav.settings")}</span>
                    </NavLink>

                    <button
                      onClick={handleLogout}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors text-left ${isDark ? 'text-muted-foreground hover:bg-muted/50 hover:text-red-400' : 'text-gray-600 hover:bg-red-50 hover:text-red-600'}`}
                    >
                      <LogOut className="w-4 h-4" />
                      {t("nav.sign_out")}
                    </button>
                  </div>
                )}
              </div>
            </SidebarContent>
          </Sidebar>
        )}

        <main className="flex-1 flex flex-col min-w-0">
          <header className={`border-b px-4 py-3 ${isDark ? 'bg-card border-border' : 'bg-background border-border'}`}>
            <div className="page-shell-wide flex items-center gap-3">
              {user && (
                <div className="md:hidden">
                  <SidebarTrigger asChild>
                    <button className={`p-2 rounded-lg transition-colors flex-shrink-0 ${isDark ? 'hover:bg-muted' : 'hover:bg-muted'}`} aria-label="Toggle menu">
                      <Menu className={`w-6 h-6 ${isDark ? 'text-foreground/70' : 'text-foreground/70'}`} />
                    </button>
                  </SidebarTrigger>
                </div>
              )}
              
              {user ? (
                <Link to={createPageUrl("Profile")} className="hidden md:flex flex-shrink-0 hover:opacity-80 transition-opacity">
                  <Avatar className="w-12 h-12 ring-2 ring-offset-2" style={{ ringColor: currentColor }}>
                    <AvatarImage src={user.avatar_url} className="object-cover" />
                    <AvatarFallback className="text-white" style={{ backgroundColor: currentColor }}>
                      {(user.full_name || user.email || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              ) : (
                <Link to={createPageUrl("Marketplace")} className="flex-shrink-0">
                  <img
                    src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/46533c917_Photoroom_20251118_202357.png"
                    alt="Credabilia"
                    className="h-16 w-auto object-contain"
                    crossOrigin="anonymous"
                    loading="eager"
                    onError={(e) => {
                      e.target.outerHTML = '<div class="text-2xl font-black" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; padding: 0.5rem 1rem;">CREDABILIA</div>';
                    }}
                  />
                </Link>
              )}

              <div className="ml-auto flex items-center gap-3">
                <button
                   onClick={toggleDark}
                   className={`p-2 rounded-lg transition-colors flex-shrink-0 ${isDark ? 'hover:bg-muted' : 'hover:bg-muted'}`}
                   aria-label="Toggle dark mode"
                 >
                   {isDark ? <Sun className="w-5 h-5 text-foreground/70" /> : <Moon className="w-5 h-5 text-foreground/70" />}
                 </button>
                {user ? (
                  <>
                    <NotificationBell user={user} />
                    <Link to={createPageUrl("Messages")} className="hidden sm:block">
                       <Button variant="ghost" size="icon" aria-label="Messages" className={`relative ${isDark ? 'hover:bg-muted' : 'hover:bg-muted'}`}>
                         <MessageSquare className={`w-5 h-5 ${isDark ? 'text-foreground/70' : 'text-foreground/70'}`} />
                        {unreadMessageCount > 0 && (
                          <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center border border-white shadow-sm">
                            {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                          </span>
                        )}
                      </Button>
                    </Link>
                    

                  </>
                ) : (
                  <div className="flex flex-col items-end sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="bg-black/80 backdrop-blur-sm text-white text-base px-6 py-3 rounded-full hidden sm:flex items-center gap-3 border border-white/10 shadow-lg cursor-default">
                      <img 
                        src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/0fd00a06d_Photoroom_20251111_173240.png" 
                        alt="MJ Jersey" 
                        className="w-8 h-8 object-contain"
                        loading="lazy"
                      />
                      <span className="font-medium text-yellow-400">Win a Signed MJ Jersey!</span>
                      <span className="text-gray-400">|</span>
                      <span>Auto-entry on signup</span>
                    </div>
                    <motion.button
                      onClick={handleLogin}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      animate={{
                        boxShadow: [
                          '0 0 20px 5px rgba(16, 185, 129, 0.5)',
                          '0 0 30px 10px rgba(16, 185, 129, 0.8)',
                          '0 0 20px 5px rgba(16, 185, 129, 0.5)'
                        ]
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                      className="px-6 py-2.5 rounded-full bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 hover:from-green-600 hover:via-emerald-600 hover:to-green-700 text-white font-bold text-base flex items-center gap-2 shadow-xl"
                    >
                      <Sparkles className="w-5 h-5" />
                      {t("nav.sign_up")}
                    </motion.button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <Suspense fallback={null}><GlobalNavHeader /></Suspense>
          <div className="flex-1 overflow-auto ios-scroll">
            <PageTransition>
              {user ? (
                <div className="mobile-page-bottom-padding md:pb-0">
                  {children}
                </div>
              ) : children}
            </PageTransition>
          </div>

          <Suspense fallback={null}><Footer /></Suspense>
        </main>
      </div>

      {/* Mobile nav: primary roles only (collector/vendor/auditor). Special roles accessed via sidebar. */}
      <Suspense fallback={null}><MobileBottomNav user={user} currentRole={currentRole} unreadMessageCount={unreadMessageCount} /></Suspense>



      {user && showOnboarding && (
        <Suspense fallback={<div />}>
          <OnboardingFlow
            open={showOnboarding}
            onComplete={handleOnboardingComplete}
            initialRole={currentRole}
          />
        </Suspense>
      )}

      {user && showTutorial && (
        <Suspense fallback={null}>
          <TutorialOverlay 
            user={user} 
            onClose={() => toggleTutorial(false)} 
          />
          <button
            onClick={() => toggleTutorial(false)}
            className={`fixed bottom-24 right-6 z-[102] flex items-center gap-2 backdrop-blur px-4 py-2 rounded-full shadow-lg font-medium text-sm transition-colors ${isDark ? 'bg-card border border-red-500/30 text-red-400 hover:bg-card/80 hover:border-red-500/50' : 'bg-card border border-border text-red-600 hover:bg-muted/50'}`}
          >
            <LogOut className="w-4 h-4" />
            Exit Tutorial
          </button>
        </Suspense>
      )}

      {showKingCredionWelcomeModal && (
        <Suspense fallback={null}>
          <KingCredionWelcomeModal
            open={showKingCredionWelcomeModal}
            onClose={() => setShowKingCredionWelcomeModal(false)}
            referredUser={modalReferredUser}
            referrerInfluencer={modalInfluencer}
          />
        </Suspense>
      )}
    </SidebarProvider>
  );
}