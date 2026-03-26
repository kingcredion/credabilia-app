import { lazy } from 'react';
import __Layout from './Layout.jsx';

// Marketplace is eager-loaded — it's the main page and must NOT depend on dynamic import
import Marketplace from './pages/Marketplace.jsx';

// Retry wrapper for other lazy pages — guards against transient module fetch failures in preview
const lazyWithRetry = (importFn, retries = 2) =>
  lazy(async () => {
    let lastError;
    for (let i = 0; i <= retries; i++) {
      try {
        return await importFn();
      } catch (error) {
        console.error(`[lazyWithRetry] Dynamic import failed (attempt ${i + 1}):`, error);
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 400 * (i + 1)));
      }
    }
    throw lastError;
  });

const AdminAnalytics = lazyWithRetry(() => import('./pages/AdminAnalytics'));
const AdminApprovals = lazyWithRetry(() => import('./pages/AdminApprovals'));
const AdminArtists = lazyWithRetry(() => import('./pages/AdminArtists'));
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'));
const AdminFrameShops = lazyWithRetry(() => import('./pages/AdminFrameShops'));
const AdminFramingRequests = lazyWithRetry(() => import('./pages/AdminFramingRequests'));
const AdminIndiegogoInvestors = lazyWithRetry(() => import('./pages/AdminIndiegogoInvestors'));
const AdminInfluencers = lazyWithRetry(() => import('./pages/AdminInfluencers'));
const AdminOnboardingPreview = lazyWithRetry(() => import('./pages/AdminOnboardingPreview'));
const AdminReviewQueuePage = lazyWithRetry(() => import('./pages/AdminReviewQueuePage'));
const AdminTickets = lazyWithRetry(() => import('./pages/AdminTickets'));
const ArtistDashboard = lazyWithRetry(() => import('./pages/ArtistDashboard'));
const ArtistProfile = lazyWithRetry(() => import('./pages/ArtistProfile'));
const AuditorRewards = lazyWithRetry(() => import('./pages/CouncilRewards'));
const CreateListing = lazyWithRetry(() => import('./pages/CreateListing'));
const CredionSupport = lazyWithRetry(() => import('./pages/CredionSupport'));
const EditListing = lazyWithRetry(() => import('./pages/EditListing'));
const ExploreArtists = lazyWithRetry(() => import('./pages/ExploreArtists'));
const ExploreFrameShops = lazyWithRetry(() => import('./pages/ExploreFrameShops'));
const ExploreUsers = lazyWithRetry(() => import('./pages/ExploreUsers'));
const Feed = lazyWithRetry(() => import('./pages/Feed'));
const FounderCircleDashboard = lazyWithRetry(() => import('./pages/FounderCircleDashboard'));
const FrameShopDashboard = lazyWithRetry(() => import('./pages/FrameShopDashboard'));
const FrameShopProfile = lazyWithRetry(() => import('./pages/FrameShopProfile'));
const Home = lazyWithRetry(() => import('./pages/Home'));
const InfluencerDashboard = lazyWithRetry(() => import('./pages/InfluencerDashboard'));
const ItemDetails = lazyWithRetry(() => import('./pages/ItemDetails'));
const MarketingHub = lazyWithRetry(() => import('./pages/MarketingHub'));
const Messages = lazyWithRetry(() => import('./pages/Messages'));
const MyAudits = lazyWithRetry(() => import('./pages/MyAudits'));
const MyCollection = lazyWithRetry(() => import('./pages/MyCollection'));
const MyListings = lazyWithRetry(() => import('./pages/MyListings'));
const MyVets = lazyWithRetry(() => import('./pages/MyVets'));
const Onboarding = lazyWithRetry(() => import('./pages/Onboarding'));
const Privacy = lazyWithRetry(() => import('./pages/Privacy'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const RefundPolicy = lazyWithRetry(() => import('./pages/RefundPolicy'));
const RewardCenter = lazyWithRetry(() => import('./pages/RewardCenter'));
const Settings = lazyWithRetry(() => import('./pages/Settings'));
// StripeSimulation is admin-only — loaded via explicit route in App.jsx, not exposed in PAGES
const StripeSimulation = lazyWithRetry(() => import('./pages/StripeSimulation'));
const Terms = lazyWithRetry(() => import('./pages/Terms'));
const TrackPackages = lazyWithRetry(() => import('./pages/TrackPackages'));
const TriviaChallenge = lazyWithRetry(() => import('./pages/TriviaChallenge'));
const VendorDashboard = lazyWithRetry(() => import('./pages/VendorDashboard'));
const VendorProfile = lazyWithRetry(() => import('./pages/VendorProfile'));
const VendorShipping = lazyWithRetry(() => import('./pages/VendorShipping'));
const VettingQueue = lazyWithRetry(() => import('./pages/VettingQueue'));
const Watchlist = lazyWithRetry(() => import('./pages/Watchlist'));

export const PAGES = {
    "AdminAnalytics": AdminAnalytics,
    "AdminApprovals": AdminApprovals,
    "AdminArtists": AdminArtists,
    "AdminDashboard": AdminDashboard,
    "AdminFrameShops": AdminFrameShops,
    "AdminFramingRequests": AdminFramingRequests,
    "AdminIndiegogoInvestors": AdminIndiegogoInvestors,
    "AdminInfluencers": AdminInfluencers,
    "AdminOnboardingPreview": AdminOnboardingPreview,
    "AdminReviewQueuePage": AdminReviewQueuePage,
    "AdminTickets": AdminTickets,
    "ArtistDashboard": ArtistDashboard,
    "ArtistProfile": ArtistProfile,
    "AuditorRewards": AuditorRewards,
    "CouncilRewards": AuditorRewards, // legacy alias — keep so old links don't 404
    "CreateListing": CreateListing,
    "CredionSupport": CredionSupport,
    "EditListing": EditListing,
    "ExploreArtists": ExploreArtists,
    "ExploreFrameShops": ExploreFrameShops,
    "ExploreUsers": ExploreUsers,
    "Feed": Feed,
    "FounderCircleDashboard": FounderCircleDashboard,
    "FrameShopDashboard": FrameShopDashboard,
    "FrameShopProfile": FrameShopProfile,
    "Home": Home,
    "InfluencerDashboard": InfluencerDashboard,
    "ItemDetails": ItemDetails,
    "MarketingHub": MarketingHub,
    "Marketplace": Marketplace,
    "Messages": Messages,
    "MyAudits": MyAudits,
    "MyCollection": MyCollection,
    "MyListings": MyListings,
    "MyVets": MyVets,
    "Onboarding": Onboarding,
    "Privacy": Privacy,
    "Profile": Profile,
    "RefundPolicy": RefundPolicy,
    "RewardCenter": RewardCenter,
    "Settings": Settings,
    // StripeSimulation intentionally excluded — admin-only, routed directly in App.jsx
    "Terms": Terms,
    "TrackPackages": TrackPackages,
    "TriviaChallenge": TriviaChallenge,
    "VendorDashboard": VendorDashboard,
    "VendorProfile": VendorProfile,
    "VendorShipping": VendorShipping,
    "VettingQueue": VettingQueue,
    "Watchlist": Watchlist,
}

export const pagesConfig = {
    mainPage: "Marketplace",
    Pages: PAGES,
    Layout: __Layout,
};