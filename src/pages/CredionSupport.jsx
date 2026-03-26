import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  ChevronRight,
  MessageCircle,
  HelpCircle,
  ShoppingBag,
  AlertTriangle,
  History,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SUPPORT_IMAGE = "https://media.base44.com/images/public/690badbd56a85b130b88aa42/5e7cc3991_Photoroom_20260323_170124.png";

const ACTION_CARDS = [
  {
    id: "chat",
    icon: MessageCircle,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    title: "Contact Support",
    description: "Chat with King Credion AI"
  },
  {
    id: "faq",
    icon: HelpCircle,
    color: "text-purple-500",
    bg: "bg-purple-50 dark:bg-purple-950/30",
    title: "FAQs",
    description: "Browse common questions"
  },
  {
    id: "orders",
    icon: ShoppingBag,
    color: "text-green-500",
    bg: "bg-green-50 dark:bg-green-950/30",
    title: "Orders & Issues",
    description: "Track or dispute a purchase"
  },
  {
    id: "report",
    icon: AlertTriangle,
    color: "text-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    title: "Report a Problem",
    description: "Flag a bug or listing issue"
  }
];

const FAQ_ITEMS = [
  { q: "How does authenticity vetting work?", a: "Every item is reviewed by our community of vettor experts using AI analysis, signature comparisons, and COA checks. Items earn a Trust Score based on votes and authenticator input." },
  { q: "How do I sell on Credabilia?", a: "Switch to Vendor mode, then go to Create Listing. Upload photos, add details, and submit for audit. Once approved, your item goes live in the marketplace." },
  { q: "What are Credion Credits?", a: "Top 10% auditors earn Credion Credits monthly from the auditor reward pool. 100 credits = $1 off your next purchase. Referrals increase your sweepstakes entries." },
  { q: "How do I get a refund?", a: "Contact support within 7 days of delivery. Refunds are reviewed case-by-case. Items must be returned in original condition." },
  { q: "How long does shipping take?", a: "Shipping timelines vary by vendor. Most items ship within 3–5 business days. You can track packages in My Collection > Track Packages." }
];

export default function CredionSupport() {
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState("");
  const [currentTicket, setCurrentTicket] = useState(null);
  const [copiedPromptId, setCopiedPromptId] = useState(null);
  const [activeView, setActiveView] = useState("home"); // home | chat | faq | orders | report | history
  const [expandedFaq, setExpandedFaq] = useState(null);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentTicket]);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  const { data: userTickets = [] } = useQuery({
    queryKey: ['user-tickets', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const tickets = await base44.entities.SupportTicket.filter(
        { user_email: user.email },
        "-created_date"
      );
      return tickets.filter(t => t.status !== 'closed');
    },
    enabled: !!user?.email,
  });

  useEffect(() => {
    if (userTickets.length > 0 && !currentTicket) {
      setCurrentTicket(userTickets[0]);
    }
  }, [userTickets]);

  const sendMessageMutation = useMutation({
    mutationFn: async (messageText) => {
      if (!user) throw new Error("User not logged in");
      const timestamp = new Date().toISOString();

      if (currentTicket) {
        const updatedHistory = [
          ...(currentTicket.conversation_history || []),
          { role: "user", message: messageText, timestamp }
        ];

        const credionPrompt = `You are King Credion, the AI Overseer of Credabilia.com - a wise, kind, and authoritative AI guardian of authenticity and credibility in the sports memorabilia marketplace.

User's issue: ${messageText}

Previous conversation context:
${currentTicket.conversation_history.map(msg => `${msg.role}: ${msg.message}`).join('\n')}

Respond to the user's message in King Credion's voice:
- Speak with calm confidence and precision
- Be encouraging and fair, never emotional, always constructive
- Address their concern directly and provide helpful guidance
- If the issue requires human admin intervention, acknowledge this and assure them an admin will review it
- Use phrases like "I oversee...", "The platform ensures...", "Your concern is noted..."
- Be brief but thorough (2-3 paragraphs max)`;

        const aiResponse = await base44.integrations.Core.InvokeLLM({ prompt: credionPrompt });

        updatedHistory.push({
          role: "credion",
          message: aiResponse,
          timestamp: new Date().toISOString()
        });

        const escalationCheck = await base44.integrations.Core.InvokeLLM({
          prompt: `Based on this user message: "${messageText}", does this require human admin intervention? Answer with ONLY "yes" or "no". Say "yes" if it involves payment disputes, banning users, private user data, complex policy, or user explicitly requests human admin. Say "no" for general questions, basic feature usage, or feedback.`
        });

        const needsAdmin = escalationCheck.toLowerCase().includes('yes');

        await base44.entities.SupportTicket.update(currentTicket.id, {
          conversation_history: updatedHistory,
          status: needsAdmin ? 'awaiting_admin' : 'ai_processed',
          ai_initial_response: aiResponse
        });

        const updated = await base44.entities.SupportTicket.filter({ id: currentTicket.id });
        setCurrentTicket(updated[0]);
      } else {
        const credionPrompt = `You are King Credion, the AI Overseer of Credabilia.com. User's issue: ${messageText}. This is their first message. Greet them warmly, acknowledge their concern, provide helpful initial guidance, and if needed let them know their issue will be escalated to human administrators. Be brief but thorough (2-3 paragraphs max).`;

        const aiResponse = await base44.integrations.Core.InvokeLLM({ prompt: credionPrompt });

        const category = await base44.integrations.Core.InvokeLLM({
          prompt: `Categorize this support request into ONE of: account_issue, listing_dispute, bug_report, feature_request, payment_issue, general_query, other. User message: "${messageText}". Respond with ONLY the category name.`
        });

        const summary = await base44.integrations.Core.InvokeLLM({
          prompt: `Summarize this user's issue in one sentence (max 100 characters): "${messageText}". Just provide the summary, nothing else.`
        });

        const conversationHistory = [
          { role: "user", message: messageText, timestamp },
          { role: "credion", message: aiResponse, timestamp: new Date().toISOString() }
        ];

        const newTicket = await base44.entities.SupportTicket.create({
          user_email: user.email,
          user_name: user.full_name || user.email.split('@')[0],
          subject: summary.substring(0, 100),
          user_message: messageText,
          conversation_history: conversationHistory,
          ai_category: category.trim().toLowerCase(),
          ai_summary: summary,
          ai_initial_response: aiResponse,
          status: 'ai_processed'
        });

        setCurrentTicket(newTicket);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-tickets'] });
      setMessage("");
    },
  });

  const handleSendMessage = () => {
    if (!message.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(message);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyToClipboard = async (text) => {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return; } catch {}
    }
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(el);
    el.focus(); el.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(el);
  };

  const handleCopyPrompt = async (text) => {
    await copyToClipboard(`User Issue Report:\n${text}\n\n[This is an automated bug report generated by the user. Please review and fix accordingly.]`);
    setCopiedPromptId(text);
    setTimeout(() => setCopiedPromptId(null), 2000);
  };

  const getStatusBadge = (status) => {
    const config = {
      open: { color: "bg-blue-500", icon: Clock, label: "Open" },
      ai_processed: { color: "bg-green-500", icon: CheckCircle2, label: "Responded" },
      awaiting_admin: { color: "bg-orange-500", icon: Clock, label: "Awaiting Admin" },
      in_progress: { color: "bg-purple-500", icon: Loader2, label: "In Progress" },
      resolved: { color: "bg-green-600", icon: CheckCircle2, label: "Resolved" },
    }[status] || { color: "bg-blue-500", icon: Clock, label: "Open" };
    const Icon = config.icon;
    return (
      <Badge className={`${config.color} text-white flex items-center gap-1 text-[10px] px-1.5 py-0.5`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const handleActionCard = (id) => {
    if (id === "chat" || id === "report") {
      setActiveView("chat");
    } else if (id === "faq") {
      setActiveView("faq");
    } else if (id === "orders") {
      setActiveView("orders");
    }
  };

  // ── Subviews ──────────────────────────────────────────────

  const ChatView = () => (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 dark:bg-muted/20 min-h-[320px] max-h-[420px]">
        {!currentTicket ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-2">
            <img src={SUPPORT_IMAGE} alt="King Credion" className="w-16 h-16 object-contain" />
            <p className="text-sm font-medium text-foreground">Hi {user?.full_name?.split(' ')[0] || 'there'}!</p>
            <p className="text-xs text-muted-foreground max-w-xs">Ask King Credion anything about the platform — orders, listings, authenticity, or bugs.</p>
          </div>
        ) : (
          <AnimatePresence>
            {currentTicket.conversation_history?.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role !== 'user' && (
                  <img src={SUPPORT_IMAGE} alt="KC" className="w-8 h-8 object-contain flex-shrink-0 self-end" />
                )}
                <div className={`max-w-[78%]`}>
                  <div className={`rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : msg.role === 'admin'
                      ? 'bg-purple-600 text-white rounded-bl-sm'
                      : 'bg-white dark:bg-card border border-border text-foreground rounded-bl-sm'
                  }`}>
                    {msg.message}
                    {msg.role === 'user' && (
                      <button
                        onClick={() => handleCopyPrompt(msg.message)}
                        className="mt-1.5 flex items-center gap-1 text-[10px] bg-white/20 hover:bg-white/30 px-1.5 py-0.5 rounded transition-colors"
                      >
                        {copiedPromptId === msg.message ? <><Check className="w-2.5 h-2.5" />Copied!</> : <><Copy className="w-2.5 h-2.5" />Copy</>}
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 px-1">
                    {new Date(msg.timestamp).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </p>
                </div>
                {msg.role === 'user' && (
                  <Avatar className="w-8 h-8 flex-shrink-0 self-end">
                    <AvatarImage src={user?.avatar_url} />
                    <AvatarFallback className="bg-blue-500 text-white text-xs">
                      {(user?.full_name || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-white dark:bg-card border-t border-border">
        <div className="flex gap-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            rows={2}
            className="flex-1 resize-none text-sm"
            disabled={sendMessageMutation.isPending}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!message.trim() || sendMessageMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 self-end px-3"
            size="sm"
          >
            {sendMessageMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );

  const FaqView = () => (
    <div className="p-4 space-y-2">
      {FAQ_ITEMS.map((item, i) => (
        <div key={i} className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
          >
            <span className="text-sm font-medium text-foreground pr-3">{item.q}</span>
            <ChevronRight className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${expandedFaq === i ? 'rotate-90' : ''}`} />
          </button>
          {expandedFaq === i && (
            <div className="px-4 pb-3 text-sm text-muted-foreground border-t border-border bg-muted/10">
              <p className="pt-2">{item.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const OrdersView = () => (
    <div className="p-4 space-y-3">
      <p className="text-sm text-muted-foreground">View and manage issues with your recent orders.</p>
      {userTickets.filter(t => t.ai_category === 'payment_issue' || t.ai_category === 'listing_dispute').length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No order issues found.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setActiveView("chat")}
          >
            Contact Support
          </Button>
        </div>
      ) : (
        userTickets
          .filter(t => t.ai_category === 'payment_issue' || t.ai_category === 'listing_dispute')
          .map(ticket => (
            <button
              key={ticket.id}
              onClick={() => { setCurrentTicket(ticket); setActiveView("chat"); }}
              className="w-full text-left p-3 rounded-xl border border-border hover:border-blue-300 dark:hover:border-blue-600 hover:bg-muted/30 transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground line-clamp-1">{ticket.subject || 'Order Issue'}</p>
                {getStatusBadge(ticket.status)}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{new Date(ticket.created_date).toLocaleDateString()}</p>
            </button>
          ))
      )}
    </div>
  );

  const HistoryView = () => (
    <div className="p-4 space-y-2">
      {userTickets.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No previous tickets.</p>
        </div>
      ) : (
        userTickets.map(ticket => (
          <button
            key={ticket.id}
            onClick={() => { setCurrentTicket(ticket); setActiveView("chat"); }}
            className={`w-full text-left p-3 rounded-xl border transition-all ${
              currentTicket?.id === ticket.id
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
                : 'border-border hover:border-blue-300 dark:hover:border-blue-600 hover:bg-muted/30'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className="text-sm font-medium text-foreground line-clamp-1">{ticket.subject || 'Support Ticket'}</p>
              {getStatusBadge(ticket.status)}
            </div>
            <p className="text-xs text-muted-foreground">{new Date(ticket.created_date).toLocaleDateString()}</p>
          </button>
        ))
      )}
    </div>
  );

  const viewTitles = {
    home: null,
    chat: "Chat with Support",
    faq: "FAQs",
    orders: "Orders & Issues",
    history: "Ticket History",
    report: "Report a Problem"
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      <div className="max-w-lg mx-auto px-4 py-5">

        {/* Compact Header */}
        <div className="flex items-center gap-3 bg-white dark:bg-card rounded-2xl shadow-sm border border-border p-3 mb-4">
          <div className="w-20 h-20 flex-shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-green-100 to-blue-100 dark:from-green-950/40 dark:to-blue-950/40 flex items-center justify-center">
            <img
              src={SUPPORT_IMAGE}
              alt="King Credion Support"
              className="w-full h-full object-cover object-top"
            />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">Help & Support</h1>
            <p className="text-sm text-muted-foreground">We're here to help you with anything</p>
            {currentTicket && (
              <div className="mt-1">{getStatusBadge(currentTicket.status)}</div>
            )}
          </div>
        </div>

        {/* Sub-view header (back button + title) */}
        {activeView !== "home" && (
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setActiveView("home")}
              className="p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
            <h2 className="text-sm font-semibold text-foreground">{viewTitles[activeView]}</h2>
          </div>
        )}

        {/* Main Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {activeView === "home" && (
              <div className="space-y-2">
                {ACTION_CARDS.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      onClick={() => handleActionCard(card.id)}
                      className="w-full flex items-center gap-3 bg-white dark:bg-card border border-border rounded-2xl px-4 py-3.5 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 transition-all text-left active:scale-[0.99]"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${card.bg}`}>
                        <Icon className={`w-5 h-5 ${card.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{card.title}</p>
                        <p className="text-xs text-muted-foreground">{card.description}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  );
                })}

                {/* Ticket History shortcut */}
                {userTickets.length > 0 && (
                  <button
                    onClick={() => setActiveView("history")}
                    className="w-full flex items-center gap-3 bg-white dark:bg-card border border-border rounded-2xl px-4 py-3.5 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-700 transition-all text-left active:scale-[0.99]"
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-gray-50 dark:bg-muted">
                      <History className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">My Tickets</p>
                      <p className="text-xs text-muted-foreground">{userTickets.length} open ticket{userTickets.length !== 1 ? 's' : ''}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </button>
                )}
              </div>
            )}

            {(activeView === "chat" || activeView === "report") && (
              <div className="bg-white dark:bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <ChatView />
              </div>
            )}

            {activeView === "faq" && (
              <div className="bg-white dark:bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <FaqView />
              </div>
            )}

            {activeView === "orders" && (
              <div className="bg-white dark:bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <OrdersView />
              </div>
            )}

            {activeView === "history" && (
              <div className="bg-white dark:bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <HistoryView />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}