import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Search,
  Send,
  User,
  MessageSquare,
  ArrowLeft,
  Package,
  ExternalLink,
  DollarSign,
  Building2,
  AlertCircle,
  Bug,
  CreditCard,
  CheckCircle2,
  Truck,
  Clock,
  Palette,
  TrendingUp
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
// PullToRefresh removed from Messages — competing scroll owners (sidebar + message thread)
import { getUserPermissions, getSubRoleAccess } from "@/lib/permissions";
import { hasLiveStripeConnect } from "@/lib/stripeStatus";
import QuoteCard from "../components/QuoteCard";
import SendQuoteDialog from "../components/SendQuoteDialog";
import QuoteMessageCard from "../components/QuoteMessageCard";
import QuotePaymentModal from "../components/QuotePaymentModal";
import ItemContextCard from "../components/ItemContextCard";
import PaymentDialog from "../components/PaymentDialog";
import SendInstructionsDialog from "../components/SendInstructionsDialog";
import InstructionCard from "../components/InstructionCard";
import RequestDeliveryDialog from "../components/RequestDeliveryDialog";
import StripeRestrictionModal from "../components/StripeRestrictionModal";

export default function Messages() {
  // Check URL params IMMEDIATELY - before state initialization
  const urlParams = new URLSearchParams(window.location.search);
  const startConversationEmail = urlParams.get('startConversation') || urlParams.get('startconversation');
  const conversationName = urlParams.get('name');
  const conversationType = urlParams.get('type') || 'general';
  const itemId = urlParams.get('itemId') || urlParams.get('itemid');
  const framingRequestId = urlParams.get('framingRequestId') || urlParams.get('framingrequestid');
  const commissionRequestId = urlParams.get('commissionRequestId') || urlParams.get('commissionrequestid');

  const [user, setUser] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(() => {
    if (startConversationEmail) {
  
      // Clean the URL params via React Router state instead of browser history manipulation
      // We do a lightweight state update via navigate after mount; for now just clear quietly
      return {
        email: startConversationEmail,
        name: decodeURIComponent(conversationName || startConversationEmail),
        messages: [],
        unreadCount: 0,
        lastMessage: null,
        conversationType: conversationType,
        itemId: itemId,
        framingRequestId: framingRequestId,
        commissionRequestId: commissionRequestId,
        isNewConversation: true
        };
    }
    return null;
  });
  
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [selectedQuoteForPayment, setSelectedQuoteForPayment] = useState(null);
  const [autoMessageSent, setAutoMessageSent] = useState(false);
  const [showInstructionsDialog, setShowInstructionsDialog] = useState(false);
  const [showRequestDeliveryDialog, setShowRequestDeliveryDialog] = useState(false);
  const [pendingDeliveryFee, setPendingDeliveryFee] = useState(null);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [showQuotePaymentModal, setShowQuotePaymentModal] = useState(false);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();
  const location = useLocation();

  const activateArtistProfileMutation = useMutation({
    mutationFn: async () => {
      await base44.auth.updateMe({ opted_into_artist_profile: true });
    },
    onSuccess: async () => {
      const updatedUser = await base44.auth.me();
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['my-artist-profile'] });
    }
  });

  const activateFrameShopProfileMutation = useMutation({
    mutationFn: async () => {
      await base44.auth.updateMe({ opted_into_frame_shop_profile: true });
    },
    onSuccess: async () => {
      const updatedUser = await base44.auth.me();
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['my-shop-settings'] });
    }
  });

  const activateInfluencerProfileMutation = useMutation({
    mutationFn: async () => {
      await base44.auth.updateMe({ opted_into_influencer_profile: true });
    },
    onSuccess: async () => {
      const updatedUser = await base44.auth.me();
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['my-influencer-profile'] });
    }
  });

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const emailParams = params.get('startConversation') || params.get('startconversation');
    
    if (emailParams && (!selectedConversation || selectedConversation.email !== emailParams)) {
      
      const convoName = params.get('name');
      const convoType = params.get('type') || 'general';
      const convoItemId = params.get('itemId') || params.get('itemid');
      const convoFramingId = params.get('framingRequestId') || params.get('framingrequestid');
      const convoCommissionId = params.get('commissionRequestId') || params.get('commissionrequestid');

      const newConvo = {
        email: emailParams,
        name: decodeURIComponent(convoName || emailParams),
        messages: [],
        unreadCount: 0,
        lastMessage: null,
        conversationType: convoType,
        itemId: convoItemId,
        framingRequestId: convoFramingId,
        commissionRequestId: convoCommissionId,
        isNewConversation: true
      };

      setSelectedConversation(newConvo);
      // URL params already consumed — no need to manipulate browser history
    }
  }, [location.search]);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const { data: allMessages } = useQuery({
    queryKey: ['user-messages', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const sent = await base44.entities.Message.filter({ sender_email: user.email }, "-created_date");
      const received = await base44.entities.Message.filter({ receiver_email: user.email }, "-created_date");
      return [...sent, ...received].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: !!user?.email,
    initialData: [],
  });

  const { data: conversationItem } = useQuery({
    queryKey: ['conversation-item', selectedConversation?.itemId],
    queryFn: async () => {
      if (!selectedConversation?.itemId) return null;
      const items = await base44.entities.Item.filter({ id: selectedConversation.itemId });
      return items[0] || null;
    },
    enabled: !!selectedConversation?.itemId,
  });

  // Resolved sub-role access (admin-aware, single source of truth)
  const subRoleAccess = user ? getSubRoleAccess(user) : {};

  const { data: shopSettings } = useQuery({
    queryKey: ['my-shop-settings', user?.email],
    queryFn: async () => {
      const shops = await base44.entities.FrameShop.filter({ user_email: user.email });
      return shops[0] || null;
    },
    enabled: !!user && subRoleAccess.canAccessFrameShopTools,
  });

  const { data: artistProfile } = useQuery({
    queryKey: ['my-artist-profile', user?.email],
    queryFn: async () => {
      const artists = await base44.entities.Artist.filter({ user_email: user.email });
      return artists[0] || null;
    },
    enabled: !!user && subRoleAccess.canAccessArtistTools,
  });

  const { data: influencerProfile } = useQuery({
    queryKey: ['my-influencer-profile', user?.email],
    queryFn: async () => {
      const influencers = await base44.entities.Influencer.filter({ user_email: user.email });
      return influencers[0] || null;
    },
    enabled: !!user && subRoleAccess.canAccessInfluencerTools,
  });

  const { data: conversationQuotes, refetch: refetchQuotes } = useQuery({
    queryKey: ['conversation-quotes-dm', selectedConversation?.email, user?.email],
    queryFn: async () => {
      if (!selectedConversation?.email || !user?.email) return [];
      const sent = await base44.asServiceRole.entities.Quote.filter({ 
        vendor_email: user.email,
        buyer_email: selectedConversation.email 
      }, "-created_date");
      const received = await base44.asServiceRole.entities.Quote.filter({ 
        vendor_email: selectedConversation.email,
        buyer_email: user.email 
      }, "-created_date");
      return [...sent, ...received].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: !!selectedConversation?.email && !!user?.email,
    initialData: [],
  });

  const conversations = React.useMemo(() => {
    if (!user?.email || !allMessages.length) return [];

    const convMap = new Map();

    allMessages.forEach(msg => {
      const otherEmail = msg.sender_email === user.email ? msg.receiver_email : msg.sender_email;
      const otherName = msg.sender_email === user.email ? msg.receiver_name : msg.sender_name;

      // Skip conversations with deleted users
      if (otherEmail === 'deleted@credabilia.com') return;

      if (!convMap.has(otherEmail)) {
        convMap.set(otherEmail, {
          email: otherEmail,
          name: otherName,
          messages: [],
          unreadCount: 0,
          lastMessage: null,
          conversationType: msg.conversation_type || 'general',
          itemId: msg.item_id,
          framingRequestId: msg.framing_request_id,
          commissionRequestId: msg.commission_request_id
          });
          }

      const conv = convMap.get(otherEmail);
      conv.messages.push(msg);

      if (!conv.lastMessage || new Date(msg.created_date) > new Date(conv.lastMessage.created_date)) {
        conv.lastMessage = msg;
      }

      if (msg.receiver_email === user.email && !msg.read) {
        conv.unreadCount++;
      }
    });

    return Array.from(convMap.values()).sort((a, b) => 
      new Date(b.lastMessage.created_date) - new Date(a.lastMessage.created_date)
    );
  }, [allMessages, user?.email]);

  useEffect(() => {
    if (selectedConversation && conversations.length > 0) {
      const existingConv = conversations.find(c => c.email === selectedConversation.email);
      if (existingConv && existingConv.messages.length > 0) {
        setSelectedConversation({
          ...existingConv,
          conversationType: selectedConversation.conversationType || existingConv.conversationType,
          itemId: selectedConversation.itemId || existingConv.itemId,
          framingRequestId: selectedConversation.framingRequestId || existingConv.framingRequestId,
          commissionRequestId: selectedConversation.commissionRequestId || existingConv.commissionRequestId,
          isNewConversation: false
          });
      }
    }
  }, [conversations]);

  // Removed auto-send emoji logic — conversations now have manual starters instead

  const filteredConversations = conversations.filter(conv =>
    conv.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    conv.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sendMessageMutation = useMutation({
    mutationFn: async (message) => {
      if (!selectedConversation) return;
      await base44.entities.Message.create({
        sender_email: user.email,
        sender_name: user.full_name || user.email,
        receiver_email: selectedConversation.email,
        receiver_name: selectedConversation.name,
        message: message,
        conversation_type: selectedConversation.conversationType || 'general',
        item_id: selectedConversation.itemId || selectedConversation.lastMessage?.item_id || null,
        item_title: selectedConversation.lastMessage?.item_title || null,
        item_image_url: selectedConversation.lastMessage?.item_image_url || null,
        item_price: selectedConversation.lastMessage?.item_price || null,
        framing_request_id: selectedConversation.framingRequestId || selectedConversation.lastMessage?.framing_request_id || null,
        commission_request_id: selectedConversation.commissionRequestId || selectedConversation.lastMessage?.commission_request_id || null
        });
        },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-messages'] });
      setMessageText("");
    },
  });

  // NOTE: Quote creation now uses backend sendQuote function via SendQuoteDialog
  // NOTE: Quote payment now uses backend createQuotePaymentIntent via QuotePaymentModal
  // No legacy quote/payment mutations in Messages.jsx — all logic delegated to backend/dialogs

  // NOTE: Quote acceptance/rejection now handled via QuoteMessageCard component
  // NOTE: Counter offers handled via backend (future: may add dedicated UI)

  const sendInstructionsMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.Message.create({
        sender_email: user.email,
        sender_name: user.full_name || user.email,
        receiver_email: selectedConversation.email,
        receiver_name: selectedConversation.name,
        message: "📍 Completion Instructions",
        instruction_data: data,
        conversation_type: selectedConversation.conversationType,
        item_id: selectedConversation.itemId,
        framing_request_id: selectedConversation.framingRequestId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-messages'] });
      setShowInstructionsDialog(false);
    },
  });

  const requestDeliveryMutation = useMutation({
    mutationFn: async ({ deliveryFee, address, instructions }) => {
      // Use backend sendQuote function for consistency
      const description = `Fee for local delivery service.\n\n📍 Delivery Address:\n${address}\n\n📝 Instructions:\n${instructions || "None"}`;

      const response = await base44.functions.invoke('sendQuote', {
        quote_type: 'framing_quote',
        vendor_email: selectedConversation.email,
        vendor_name: selectedConversation.name,
        buyer_email: user.email,
        buyer_name: user.full_name || user.email,
        amount: Math.round(deliveryFee * 100), // Convert to cents
        description: description,
        conversation_id: selectedConversation.framingRequestId,
        framing_request_id: selectedConversation.framingRequestId
      });

      if (response.data?.error) throw new Error(response.data.error);

      // Send informational messages
      await base44.entities.Message.create({
        sender_email: user.email,
        sender_name: user.full_name || user.email,
        receiver_email: selectedConversation.email,
        receiver_name: selectedConversation.name,
        message: `🚚 I requested local delivery ($${deliveryFee}).\n\n📍 Address: ${address}\n📝 Notes: ${instructions || "None"}`,
        conversation_type: selectedConversation.conversationType
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-quotes-dm'] });
      queryClient.invalidateQueries({ queryKey: ['user-messages'] });
      setShowRequestDeliveryDialog(false);
    },
    onError: (error) => {
      console.error("Delivery quote error:", error);
    }
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (messages) => {
      const unreadMessages = messages.filter(msg => 
        msg.receiver_email === user.email && !msg.read
      );
      await Promise.all(
        unreadMessages.map(msg => base44.entities.Message.update(msg.id, { read: true }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-messages'] });
    },
  });

  useEffect(() => {
    if (selectedConversation?.messages && selectedConversation.messages.length > 0) {
      markAsReadMutation.mutate(selectedConversation.messages);
    }
  }, [selectedConversation?.email]);

  useEffect(() => {
    if (selectedConversation && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedConversation?.email, selectedConversation?.messages?.length, conversationQuotes?.length]);

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    sendMessageMutation.mutate(messageText);
  };

  const handleOpenQuoteDialog = () => {
    // Service quotes (frame shop, artist) require live Stripe
    if ((subRoleAccess.canAccessFrameShopTools || subRoleAccess.canAccessArtistTools) && !hasLiveStripeConnect(user)) {
      setShowStripeModal(true);
      return;
    }
    setShowQuoteDialog(true);
  };

  const getConversationIcon = (type) => {
    switch (type) {
      case 'framing_request': return <Building2 className="w-4 h-4 text-purple-600" />;
      case 'item_inquiry': return <Package className="w-4 h-4 text-blue-600" />;
      case 'offer_negotiation': return <DollarSign className="w-4 h-4 text-green-600" />;
      default: return <MessageSquare className="w-4 h-4 text-gray-600" />;
    }
  };

  const isFrameShop = selectedConversation?.conversationType === 'framing_request';
  // Use central resolver for mode detection — works for admins too
  const isArtistMode = subRoleAccess.canAccessArtistTools;
  const isFrameShopMode = subRoleAccess.canAccessFrameShopTools;
  const isInfluencerMode = subRoleAccess.canAccessInfluencerTools;

  // Find latest unpaid accepted quote — only actionable if no paid transaction exists
  const QUOTE_PAID_STATUSES = ['paid', 'escrow', 'shipped', 'delivered', 'completed'];
  const acceptedQuote = React.useMemo(() => {
    if (!conversationQuotes.length) return null;
    // The most recently created accepted quote where the current user is the buyer and it hasn't been paid yet
    return conversationQuotes.find(
      q => q.status === 'accepted' &&
           q.buyer_email === user?.email &&
           !QUOTE_PAID_STATUSES.includes(q.payment_status) &&
           !QUOTE_PAID_STATUSES.includes(q.status)
    ) || null;
  }, [conversationQuotes, user?.email]);

  const { data: existingPaymentTransaction } = useQuery({
    queryKey: ['quote-transaction', acceptedQuote?.id],
    queryFn: async () => {
      if (!acceptedQuote?.id) return null;
      const txns = await base44.entities.Transaction.filter({ quote_id: acceptedQuote.id });
      // Any canonical paid status means payment already exists — suppress the Pay CTA
      return txns.find(t => QUOTE_PAID_STATUSES.includes(t.status)) || null;
    },
    enabled: !!acceptedQuote?.id,
  });

  const showPayCTA = acceptedQuote && !existingPaymentTransaction;

  const { data: commissionRequestData } = useQuery({
      queryKey: ['commission-request', selectedConversation?.commissionRequestId],
      queryFn: async () => {
          if (!selectedConversation?.commissionRequestId) return null;
          const requests = await base44.entities.CommissionRequest.filter({ id: selectedConversation.commissionRequestId });
          return requests[0] || null;
      },
      enabled: !!selectedConversation?.commissionRequestId
  });

  const { data: framingRequestData } = useQuery({
      queryKey: ['framing-request', selectedConversation?.framingRequestId],
      queryFn: async () => {
          if (!selectedConversation?.framingRequestId) return null;
          const requests = await base44.entities.FramingRequest.filter({ id: selectedConversation.framingRequestId });
          return requests[0] || null;
      },
      enabled: !!selectedConversation?.framingRequestId
  });

  const approveCommissionMutation = useMutation({
      mutationFn: async () => {
          if (!commissionRequestData) return;

          await base44.entities.CommissionRequest.update(commissionRequestData.id, {
              status: 'completed',
              payment_status: 'completed'
          });

          if (commissionRequestData.escrow_transaction_id) {
              await base44.entities.Transaction.update(commissionRequestData.escrow_transaction_id, {
                  status: 'completed'
              });
          }

          await base44.entities.Message.create({
            sender_email: user.email,
            sender_name: user.full_name || user.email,
            receiver_email: selectedConversation.email,
            receiver_name: selectedConversation.name,
            message: "🎉 Artwork Approved! Funds have been released from escrow. Thank you for the commission!",
            conversation_type: 'commission_request',
            commission_request_id: commissionRequestData.id
          });
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['commission-request'] });
          queryClient.invalidateQueries({ queryKey: ['user-messages'] });
      }
  });

  const approveFramingMutation = useMutation({
      mutationFn: async () => {
          if (!framingRequestData) return;

          await base44.entities.FramingRequest.update(framingRequestData.id, {
              status: 'completed',
              payment_status: 'completed'
          });

          if (framingRequestData.escrow_transaction_id) {
              await base44.entities.Transaction.update(framingRequestData.escrow_transaction_id, {
                  status: 'completed'
              });
          }

          await base44.entities.Message.create({
            sender_email: user.email,
            sender_name: user.full_name || user.email,
            receiver_email: selectedConversation.email,
            receiver_name: selectedConversation.name,
            message: "🎉 Framing Job Approved! Funds have been released from escrow. Thank you for the excellent work!",
            conversation_type: 'framing_request',
            framing_request_id: framingRequestData.id
          });
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['framing-request'] });
          queryClient.invalidateQueries({ queryKey: ['user-messages'] });
      }
  });

  const canSendQuote = selectedConversation && (
    subRoleAccess.canAccessFrameShopTools ||
    subRoleAccess.canAccessArtistTools ||
    (getUserPermissions(user).can_sell && selectedConversation.itemId)
  );

  if (!user) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading messages...</p>
        </div>
      </div>
    );
  }

  // Mobile: Conversations List Page
  if (!selectedConversation) {
    return (
        <div className="min-h-screen app-bg flex flex-col">
          <div className={`p-4 border-b border-border ${
            isArtistMode ? 'bg-pink-50 dark:bg-pink-950' : 
            isFrameShopMode ? 'bg-purple-50 dark:bg-purple-950' : 
            isInfluencerMode ? 'bg-green-50 dark:bg-green-950' : 'bg-muted dark:bg-muted'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <h1 className={`text-2xl font-bold ${
                isArtistMode ? 'text-pink-900 dark:text-pink-100' : 
                isFrameShopMode ? 'text-purple-900 dark:text-purple-100' : 
                isInfluencerMode ? 'text-green-900 dark:text-green-100' : 'text-foreground'
              }`}>
                {isArtistMode ? 'Artist Inbox' : 
                 isFrameShopMode ? 'Shop Inbox' : 
                 isInfluencerMode ? 'Influencer Inbox' : 'Messages'}
              </h1>
              {isArtistMode && <Palette className="w-6 h-6 text-pink-600" />}
              {isFrameShopMode && <Building2 className="w-6 h-6 text-purple-600" />}
              {isInfluencerMode && <TrendingUp className="w-6 h-6 text-green-600" />}
            </div>

            {/* Activation prompts — only for normal users who are approved but not yet opted in */}
            {user?.role !== 'admin' && user?.user_type === 'artist' && !user?.opted_into_artist_profile && (
              <div className="mb-4 p-3 bg-gradient-to-r from-pink-500 to-rose-500 rounded-lg text-white shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <Palette className="w-5 h-5" />
                  <span className="font-semibold">Artist Features Available</span>
                </div>
                <p className="text-xs mb-3 text-pink-100">
                  Activate your artist profile to manage commissions and send custom quotes directly from your inbox.
                </p>
                <Button 
                  size="sm" 
                  onClick={() => activateArtistProfileMutation.mutate()}
                  disabled={activateArtistProfileMutation.isPending}
                  className="w-full bg-card text-pink-600 dark:bg-muted/30 dark:text-pink-400 dark:hover:bg-muted/50 hover:bg-pink-50 border-none dark:border dark:border-pink-500/30"
                >
                  {activateArtistProfileMutation.isPending ? 'Activating...' : 'Activate Artist Mode'}
                </Button>
              </div>
            )}

            {user?.role !== 'admin' && user?.user_type === 'picture_frame_shop' && !user?.opted_into_frame_shop_profile && (
              <div className="mb-4 p-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg text-white shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-5 h-5" />
                  <span className="font-semibold">Shop Features Available</span>
                </div>
                <p className="text-xs mb-3 text-purple-100">
                  Activate your shop profile to manage custom framing requests and send detailed quotes.
                </p>
                <Button 
                  size="sm" 
                  onClick={() => activateFrameShopProfileMutation.mutate()}
                  disabled={activateFrameShopProfileMutation.isPending}
                  className="w-full bg-card text-purple-600 dark:bg-muted/30 dark:text-purple-400 dark:hover:bg-muted/50 hover:bg-purple-50 border-none dark:border dark:border-purple-500/30"
                >
                  {activateFrameShopProfileMutation.isPending ? 'Activating...' : 'Activate Shop Mode'}
                </Button>
              </div>
            )}

            {user?.role !== 'admin' && user?.user_type === 'influencer' && !user?.opted_into_influencer_profile && (
              <div className="mb-4 p-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg text-white shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5" />
                  <span className="font-semibold">Influencer Features</span>
                </div>
                <p className="text-xs mb-3 text-green-100">
                  Activate your influencer dashboard to track referrals and coordinate promotions.
                </p>
                <Button 
                  size="sm" 
                  onClick={() => activateInfluencerProfileMutation.mutate()}
                  disabled={activateInfluencerProfileMutation.isPending}
                  className="w-full bg-card text-green-600 dark:bg-muted/30 dark:text-green-400 dark:hover:bg-muted/50 hover:bg-green-50 border-none dark:border dark:border-green-500/30"
                >
                  {activateInfluencerProfileMutation.isPending ? 'Activating...' : 'Activate Influencer Mode'}
                </Button>
              </div>
            )}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="pl-10 bg-background text-foreground input-shell"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="divide-y divide-border">
              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageSquare className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">No conversations yet</p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const lastMessageIsOwn = conv.lastMessage?.sender_email === user.email;
                  
                  return (
                    <button
                      key={conv.email}
                      onClick={() => setSelectedConversation(conv)}
                      className="w-full p-4 flex items-start gap-3 hover:bg-muted transition-colors text-left"
                    >
                      <Avatar className="w-12 h-12 flex-shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                          {(conv.name || 'U')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground truncate">{conv.name}</h3>
                            {getConversationIcon(conv.conversationType)}
                          </div>
                          {conv.unreadCount > 0 && (
                            <Badge className="bg-blue-600 text-white">{conv.unreadCount}</Badge>
                          )}
                        </div>
                        <div className="flex items-start gap-1">
                          <span className="text-xs text-muted-foreground flex-shrink-0 mt-0.5">
                            {lastMessageIsOwn ? 'You:' : `${conv.name.split(' ')[0]}:`}
                          </span>
                          <p className="text-sm text-muted-foreground truncate flex-1">
                            {conv.lastMessage?.message || "No messages yet"}
                          </p>
                        </div>
                        {conv.lastMessage && (
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            {new Date(conv.lastMessage.created_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
    );
  }

  // Desktop or Selected Conversation View
  return (
    <div className="flex flex-col md:flex-row app-bg" style={{ minHeight: '100%' }}>
        {/* Desktop: Conversations Sidebar */}
        <div className="hidden md:flex md:w-96 border-r border-border app-bg flex-col overflow-hidden">
          <div className={`p-4 border-b border-border ${
            isArtistMode ? 'bg-pink-50 dark:bg-pink-950' : 
            isFrameShopMode ? 'bg-purple-50 dark:bg-purple-950' : 
            isInfluencerMode ? 'bg-green-50 dark:bg-green-950' : 'bg-muted dark:bg-muted'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <h1 className={`text-2xl font-bold ${
                isArtistMode ? 'text-pink-900 dark:text-pink-100' : 
                isFrameShopMode ? 'text-purple-900 dark:text-purple-100' : 
                isInfluencerMode ? 'text-green-900 dark:text-green-100' : 'text-foreground'
              }`}>
                {isArtistMode ? 'Artist Inbox' : 
                 isFrameShopMode ? 'Shop Inbox' : 
                 isInfluencerMode ? 'Influencer Inbox' : 'Messages'}
              </h1>
              {isArtistMode && <Palette className="w-6 h-6 text-pink-600" />}
              {isFrameShopMode && <Building2 className="w-6 h-6 text-purple-600" />}
              {isInfluencerMode && <TrendingUp className="w-6 h-6 text-green-600" />}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="pl-10 input-shell"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="divide-y divide-border">
              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageSquare className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">No conversations yet</p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const lastMessageIsOwn = conv.lastMessage?.sender_email === user.email;
                  
                  return (
                    <button
                      key={conv.email}
                      onClick={() => setSelectedConversation(conv)}
                      className={`w-full p-4 flex items-start gap-3 hover:bg-muted transition-colors text-left ${
                        selectedConversation?.email === conv.email ? 'bg-blue-50 dark:bg-blue-950' : ''
                      }`}
                    >
                      <Avatar className="w-12 h-12 flex-shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                          {(conv.name || 'U')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground truncate">{conv.name}</h3>
                            {getConversationIcon(conv.conversationType)}
                          </div>
                          {conv.unreadCount > 0 && (
                            <Badge className="bg-blue-600 text-white">{conv.unreadCount}</Badge>
                          )}
                        </div>
                        <div className="flex items-start gap-1">
                          <span className="text-xs text-muted-foreground flex-shrink-0 mt-0.5">
                            {lastMessageIsOwn ? 'You:' : `${conv.name.split(' ')[0]}:`}
                          </span>
                          <p className="text-sm text-muted-foreground truncate flex-1">
                            {conv.lastMessage?.message || "No messages yet"}
                          </p>
                        </div>
                        {conv.lastMessage && (
                          <p className="text-xs text-muted-foreground/60 mt-1">
                            {new Date(conv.lastMessage.created_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Message Thread */}
        <div className="flex-1 flex flex-col app-bg overflow-hidden">
            {/* Header */}
          <div className={`p-4 border-b border-border flex items-center gap-3 ${
           isArtistMode ? 'bg-pink-50/80 dark:bg-pink-950/40 backdrop-blur-sm' : 
           isFrameShopMode ? 'bg-purple-50/80 dark:bg-purple-950/40 backdrop-blur-sm' :
           isInfluencerMode ? 'bg-green-50/80 dark:bg-green-950/40 backdrop-blur-sm' : 'glass-panel'
          }`}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedConversation(null)}
              className="md:hidden"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <Link to={createPageUrl(`Profile?email=${selectedConversation.email}`)} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
              <Avatar className="w-10 h-10 md:w-12 md:h-12">
                <AvatarFallback className={`text-white ${
                  isFrameShop 
                    ? 'bg-gradient-to-br from-purple-500 to-purple-700'
                    : 'bg-gradient-to-br from-blue-500 to-purple-600'
                }`}>
                  {(selectedConversation.name || 'U')[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-foreground truncate">{selectedConversation.name}</h2>
                  {getConversationIcon(selectedConversation.conversationType)}
                  {isFrameShop && (
                    <Badge className="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-100 text-xs">
                      <Building2 className="w-3 h-3 mr-1" />
                      Frame Shop
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{selectedConversation.email}</p>
              </div>
            </Link>
            <Link to={createPageUrl(`Profile?email=${selectedConversation.email}`)} className="hidden md:block">
              <Button variant="outline" size="sm">
                View Profile
              </Button>
            </Link>
          </div>

          {/* Item Context Card - Pinned for item inquiries */}
          {selectedConversation?.conversationType === 'item_inquiry' && conversationItem && (
            <div className="p-4 border-b-2 border-blue-300 dark:border-blue-700 bg-gradient-to-r from-blue-50 dark:from-blue-950 to-cyan-50 dark:to-cyan-950">
              <ItemContextCard 
                item={conversationItem}
                showActions={user.email === conversationItem.vendor_email && conversationItem.status === 'active'}
                isSellerView={user.email === conversationItem.vendor_email}
                isDeclined={selectedConversation.inquiryDeclined || false}
                onSendQuote={() => setShowQuoteDialog(true)}
                onDeclineInquiry={async () => {
                  // Send decline message and mark thread as declined
                  await base44.entities.Message.create({
                    sender_email: user.email,
                    sender_name: user.full_name || user.email,
                    receiver_email: selectedConversation.email,
                    receiver_name: selectedConversation.name,
                    message: "I appreciate your interest, but I'm no longer negotiating on this item.",
                    conversation_type: selectedConversation.conversationType,
                    item_id: selectedConversation.itemId
                  });
                  // Update conversation state to reflect declined status
                  setSelectedConversation(prev => ({
                    ...prev,
                    inquiryDeclined: true
                  }));
                  queryClient.invalidateQueries({ queryKey: ['user-messages'] });
                }}
              />
            </div>
          )}

          {/* Messages */}
          <ScrollArea className="flex-1 p-3 md:p-4">
            {selectedConversation.messages.length === 0 && conversationQuotes.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  {selectedConversation.isNewConversation ? (
                    <div className="bg-gradient-to-br from-purple-50 dark:from-purple-950 to-blue-50 dark:to-blue-950 rounded-2xl p-8 border-2 border-purple-200 dark:border-purple-800">
                      {selectedConversation.conversationType === 'framing_request' && (
                        <Building2 className="w-20 h-20 text-purple-600 dark:text-purple-400 mx-auto mb-4 animate-pulse" />
                      )}
                      {selectedConversation.conversationType === 'item_inquiry' && (
                        <Package className="w-20 h-20 text-blue-600 dark:text-blue-400 mx-auto mb-4 animate-pulse" />
                      )}
                      {!selectedConversation.conversationType || selectedConversation.conversationType === 'general' ? (
                        <MessageSquare className="w-20 h-20 text-muted-foreground/40 mx-auto mb-4 animate-pulse" />
                      ) : null}
                      
                      <h3 className="text-2xl font-bold text-foreground mb-2">
                        Connecting...
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        Opening conversation with {selectedConversation.name}
                      </p>
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 dark:border-purple-400 mx-auto"></div>
                    </div>
                  ) : (
                    <>
                      <MessageSquare className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        Start the conversation
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Send a message to {selectedConversation.name}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3 md:space-y-4">
                {[
                  ...selectedConversation.messages.map(m => ({ ...m, type: 'message' })),
                  ...conversationQuotes.map(q => ({ ...q, type: 'quote-dm' }))
                ]
                  .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))
                  .map((item) => {
                    // DM-based quotes (new Quote entity)
                    if (item.type === 'quote-dm') {
                      const isSender = item.vendor_email === user.email;
                      
                      return (
                        <div key={item.id} className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}>
                          <div className="max-w-[95%] md:max-w-md">
                            <QuoteMessageCard
                              quote={item}
                              isSender={isSender}
                              currentUserEmail={user.email}
                              onPayClick={(quote) => {
                                setSelectedQuoteForPayment(quote);
                                setShowQuotePaymentModal(true);
                              }}
                            />
                            <div className={`flex items-center gap-2 mt-1 px-2 ${isSender ? 'flex-row-reverse' : 'flex-row'}`}>
                              <p className="text-xs font-medium text-foreground">
                                {isSender ? 'You' : selectedConversation.name.split(' ')[0]}
                              </p>
                              <span className="text-xs text-muted-foreground/50">•</span>
                              <p className="text-xs text-muted-foreground/70">
                                {new Date(item.created_date).toLocaleString('en-US', {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const msg = item;
                    const isOwn = msg.sender_email === user.email;
                    const senderName = isOwn ? 'You' : selectedConversation.name.split(' ')[0];

                    if (msg.instruction_data) {
                      return (
                        <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[95%] md:max-w-md ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                            <InstructionCard
                              instructions={msg.instruction_data.instructions}
                              offersDelivery={msg.instruction_data.offersDelivery}
                              deliveryFee={msg.instruction_data.deliveryFee}
                              onRequestDelivery={(fee) => {
                                setPendingDeliveryFee(fee);
                                setShowRequestDeliveryDialog(true);
                              }}
                              isSender={isOwn}
                            />
                            <div className={`flex items-center gap-2 mt-1 px-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                              <p className="text-xs font-medium text-foreground">{senderName}</p>
                              <span className="text-xs text-muted-foreground/50">•</span>
                              <p className="text-xs text-muted-foreground/70">
                                {new Date(msg.created_date).toLocaleString('en-US', {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[85%] md:max-w-md ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                          <div
                            className={`rounded-2xl px-3 py-2 md:px-4 md:py-2 shadow-sm ${
                              isOwn
                                ? (isArtistMode ? 'bg-pink-600 text-white' : 
                                   isFrameShopMode ? 'bg-purple-600 text-white' :
                                   isInfluencerMode ? 'bg-green-600 text-white' : 'bg-blue-600 text-white')
                                : isFrameShop
                                ? 'bg-purple-100 text-purple-900'
                                : 'bg-gray-100 text-gray-900'
                            }`}
                          >
                            <p className="text-sm break-words">{msg.message}</p>
                          </div>
                          <div className={`flex items-center gap-2 mt-1 px-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                            <p className="text-xs font-medium text-foreground">
                              {senderName}
                            </p>
                            <span className="text-xs text-muted-foreground/50">•</span>
                            <p className="text-xs text-muted-foreground/70">
                              {new Date(msg.created_date).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Action Bar */}
          <div className="border-t-2 border-border bg-muted/30 dark:bg-muted/20">
            {showPayCTA && (
              <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-b border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
                      💳 Quote Accepted - Payment Required
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      {selectedConversation.commissionRequestId 
                        ? "Payment will be held securely until work is completed." 
                        : "Complete payment to finalize this transaction"}
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setSelectedQuoteForPayment(acceptedQuote);
                      setShowQuotePaymentModal(true);
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    Pay ${(acceptedQuote.amount / 100).toFixed(2)}
                  </Button>
                </div>
              </div>
            )}

            {commissionRequestData?.status === 'completed_pending_approval' && user.email === commissionRequestData.collector_email && (
               <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900 mb-1">
                      🎨 Artwork Submitted for Review
                    </p>
                    <p className="text-xs text-blue-700">
                      The artist has completed the work. Approve to release funds.
                    </p>
                  </div>
                  <Button
                    onClick={() => approveCommissionMutation.mutate()}
                    disabled={approveCommissionMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
                  >
                     {approveCommissionMutation.isPending ? (
                         <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                     ) : (
                         <CheckCircle2 className="w-4 h-4" />
                     )}
                    Approve & Release Funds
                  </Button>
                </div>
              </div>
            )}

            {framingRequestData?.status === 'completed_pending_approval' && user.email === framingRequestData.collector_email && (
               <div className="p-3 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-200">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-purple-900 mb-1">
                      🖼️ Framing Job Submitted for Review
                    </p>
                    <p className="text-xs text-purple-700">
                      The shop has completed the framing. Approve to release funds.
                    </p>
                  </div>
                  <Button
                    onClick={() => approveFramingMutation.mutate()}
                    disabled={approveFramingMutation.isPending}
                    className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2"
                  >
                     {approveFramingMutation.isPending ? (
                         <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                     ) : (
                         <CheckCircle2 className="w-4 h-4" />
                     )}
                    Approve & Release Funds
                  </Button>
                </div>
              </div>
            )}

            {selectedConversation && (
              <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-border">
                {/* Quote button for frame shops and artists (central resolver) */}
                {(subRoleAccess.canAccessFrameShopTools || subRoleAccess.canAccessArtistTools || (hasLiveStripeConnect(user) && selectedConversation?.itemId)) && (
                  <Button 
                    onClick={handleOpenQuoteDialog}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/30"
                  >
                    {subRoleAccess.canAccessFrameShopTools ? <Building2 className="w-4 h-4" /> : subRoleAccess.canAccessArtistTools ? <Palette className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
                    {subRoleAccess.canAccessFrameShopTools ? 'Send Quote' : subRoleAccess.canAccessArtistTools ? 'Send Commission Quote' : 'Send Quote'}
                  </Button>
                )}

                {/* General vendor quote for item inquiries */}
                {canSendQuote && !subRoleAccess.canAccessFrameShopTools && !subRoleAccess.canAccessArtistTools && !acceptedQuote && !selectedConversation.inquiryDeclined && (
                  <Button 
                    onClick={handleOpenQuoteDialog}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-500/30"
                  >
                    <DollarSign className="w-4 h-4" />
                    {selectedConversation?.conversationType === 'item_inquiry' ? 'Send Offer' : 'Send Quote'}
                  </Button>
                )}
                
                {subRoleAccess.canAccessFrameShopTools && (
                  <Button
                    onClick={() => setShowInstructionsDialog(true)}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30 hover:bg-purple-100 dark:hover:bg-purple-500/30"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Send Instructions
                  </Button>
                )}
              </div>
            )}

            {/* Message Input */}
            <div className="p-3 md:p-4">
              <div className="flex gap-2 md:gap-3">
                <Textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type a message..."
                  rows={2}
                  className="resize-none text-sm md:text-base"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || sendMessageMutation.isPending}
                  className={`${
                    isArtistMode ? 'bg-pink-600 hover:bg-pink-700' : 
                    isFrameShopMode ? 'bg-purple-600 hover:bg-purple-700' :
                    isInfluencerMode ? 'bg-green-600 hover:bg-green-700' :
                    'bg-blue-600 hover:bg-blue-700'
                  } h-auto px-3 md:px-4`}
                >
                  <Send className="w-4 h-4 md:w-5 md:h-5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/70 mt-2">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          </div>
        </div>

      {/* Dialogs */}
      {selectedConversation && (
        <SendQuoteDialog
          open={showQuoteDialog}
          onClose={() => setShowQuoteDialog(false)}
          conversationEmail={selectedConversation?.email}
          conversationName={selectedConversation?.name}
          itemId={selectedConversation?.itemId}
          itemPrice={conversationItem?.price}
          onQuoteSent={(quote) => {
            refetchQuotes();
            setShowQuoteDialog(false);
          }}
        />
      )}

      <SendInstructionsDialog
        open={showInstructionsDialog}
        onClose={() => setShowInstructionsDialog(false)}
        onSend={(data) => sendInstructionsMutation.mutate(data)}
        shopSettings={shopSettings}
        isProcessing={sendInstructionsMutation.isPending}
      />

      <RequestDeliveryDialog
        open={showRequestDeliveryDialog}
        onClose={() => setShowRequestDeliveryDialog(false)}
        deliveryFee={pendingDeliveryFee}
        onConfirm={(data) => requestDeliveryMutation.mutate({ deliveryFee: pendingDeliveryFee, ...data })}
        isProcessing={requestDeliveryMutation.isPending}
      />

      <StripeRestrictionModal 
        open={showStripeModal} 
        onClose={() => setShowStripeModal(false)}
        user={user}
      />

      {/* Quote Payment Modal (Stripe Elements + New DM Architecture) */}
      <QuotePaymentModal
        open={showQuotePaymentModal}
        onClose={() => {
          setShowQuotePaymentModal(false);
          setSelectedQuoteForPayment(null);
        }}
        quote={selectedQuoteForPayment}
        onSuccess={(quoteId) => {
          refetchQuotes();
          queryClient.invalidateQueries({ queryKey: ['user-messages'] });
        }}
      />
    </div>
  );
}