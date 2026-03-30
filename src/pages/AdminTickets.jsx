import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Calendar,
  Sparkles,
  Trophy,
  Award,
  ChevronRight,
} from "lucide-react";

export default function AdminTickets() {
  const [user, setUser] = useState(null);
  const [activeSection, setActiveSection] = useState("needs_response"); // needs_response | feedback | history
  const [feedbackFilter, setFeedbackFilter] = useState("all"); // all | bugs | improvements | new

  // Ticket dialog state
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [adminResponse, setAdminResponse] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("resolved");

  // Feedback dialog state
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [feedbackAdminNotes, setFeedbackAdminNotes] = useState("");
  const [xpToAward, setXpToAward] = useState(50);
  const [showXpConfirmation, setShowXpConfirmation] = useState(false);

  // Search
  const [ticketSearch, setTicketSearch] = useState("");
  const [feedbackSearch, setFeedbackSearch] = useState("");

  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(console.error);
  }, []);

  const { data: allTickets = [] } = useQuery({
    queryKey: ['admin-tickets'],
    queryFn: () => base44.entities.SupportTicket.list("-created_date"),
    initialData: [],
  });

  const { data: allFeedback = [] } = useQuery({
    queryKey: ['technical-feedback'],
    queryFn: () => base44.entities.TechnicalFeedback.list("-created_date"),
    initialData: [],
  });

  // Derived sets
  const needsResponseTickets = allTickets.filter(t => t.status === 'awaiting_admin' || t.status === 'in_progress');
  const historyTickets = allTickets.filter(t => t.status === 'resolved' || t.status === 'closed');
  const bugReports = allFeedback.filter(f => f.feedback_type === "bug_report" || f.feedback_type === "technical_issue");
  const improvements = allFeedback.filter(f => f.feedback_type === "improvement_suggestion" || f.feedback_type === "feature_request");
  const newFeedback = allFeedback.filter(f => f.status === "new");
  const implementedFeedback = allFeedback.filter(f => f.status === "implemented");

  const applyTicketSearch = (tickets) => {
    if (!ticketSearch.trim()) return tickets;
    const q = ticketSearch.toLowerCase();
    return tickets.filter(t =>
      t.subject?.toLowerCase().includes(q) ||
      t.user_name?.toLowerCase().includes(q) ||
      t.user_email?.toLowerCase().includes(q) ||
      t.ai_summary?.toLowerCase().includes(q)
    );
  };

  const applyFeedbackSearch = (items) => {
    if (!feedbackSearch.trim()) return items;
    const q = feedbackSearch.toLowerCase();
    return items.filter(f =>
      f.subject?.toLowerCase().includes(q) ||
      f.user_name?.toLowerCase().includes(q) ||
      f.user_email?.toLowerCase().includes(q) ||
      f.description?.toLowerCase().includes(q)
    );
  };

  const visibleFeedback = () => {
    let base = allFeedback;
    if (feedbackFilter === "bugs") base = bugReports;
    else if (feedbackFilter === "improvements") base = improvements;
    else if (feedbackFilter === "new") base = newFeedback;
    return applyFeedbackSearch(base);
  };

  // Mutations — unchanged
  const resolveTicketMutation = useMutation({
    mutationFn: async ({ ticketId, response, notes, status }) => {
      const ticket = allTickets.find(t => t.id === ticketId);
      if (!ticket) throw new Error("Ticket not found");
      const updatedHistory = [
        ...(ticket.conversation_history || []),
        { role: "admin", message: response, timestamp: new Date().toISOString() }
      ];
      await base44.entities.SupportTicket.update(ticketId, {
        conversation_history: updatedHistory,
        admin_response: response,
        admin_notes: notes,
        status,
        resolution_date: status === 'resolved' ? new Date().toISOString() : undefined
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
      setShowResolveDialog(false);
      setSelectedTicket(null);
      setAdminResponse("");
      setAdminNotes("");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ ticketId, status }) => base44.entities.SupportTicket.update(ticketId, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-tickets'] }),
  });

  const updateFeedbackMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes, xpAwarded }) => {
      const updateData = { status };
      if (adminNotes) updateData.admin_notes = adminNotes;
      if (xpAwarded) {
        updateData.xp_awarded = xpAwarded;
        updateData.implementation_date = new Date().toISOString();
      }
      await base44.entities.TechnicalFeedback.update(id, updateData);
      if (status === "implemented" && xpAwarded > 0) {
        const feedback = allFeedback.find(f => f.id === id);
        if (feedback) {
          const users = await base44.entities.User.filter({ email: feedback.user_email });
          if (users[0]) {
            await base44.entities.User.update(users[0].id, { xp: (users[0].xp || 0) + xpAwarded });
            await base44.entities.XPEvent.create({
              user_id: users[0].id,
              user_email: users[0].email,
              action_type: "helpful_comment",
              xp_amount: xpAwarded,
              description: `Bonus XP for implemented suggestion: ${feedback.subject}`
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['technical-feedback'] });
      setShowFeedbackDialog(false);
      setSelectedFeedback(null);
      setFeedbackAdminNotes("");
      setXpToAward(50);
    },
  });

  const handleResolveClick = (ticket) => {
    setSelectedTicket(ticket);
    setAdminNotes(ticket.admin_notes || "");
    setShowResolveDialog(true);
  };

  const handleViewFeedback = (feedback) => {
    setSelectedFeedback(feedback);
    setFeedbackAdminNotes(feedback.admin_notes || "");
    setXpToAward(feedback.xp_awarded || 50);
    setShowFeedbackDialog(true);
  };

  const handleUpdateFeedback = (status) => {
    if (!selectedFeedback) return;
    if (status === "implemented" && xpToAward > 0 && !selectedFeedback.xp_awarded) {
      setShowXpConfirmation(true);
      return;
    }
    updateFeedbackMutation.mutate({ id: selectedFeedback.id, status, adminNotes: feedbackAdminNotes, xpAwarded: 0 });
  };

  const confirmXpAward = () => {
    if (!selectedFeedback) return;
    updateFeedbackMutation.mutate({ id: selectedFeedback.id, status: "implemented", adminNotes: feedbackAdminNotes, xpAwarded: xpToAward });
    setShowXpConfirmation(false);
  };

  // Badge helpers
  const statusColors = {
    open: "bg-blue-500", ai_processed: "bg-green-500", awaiting_admin: "bg-orange-500",
    in_progress: "bg-purple-500", resolved: "bg-green-600", closed: "bg-gray-500",
    new: "bg-blue-500", in_review: "bg-yellow-500", accepted: "bg-green-500",
    implemented: "bg-purple-500", rejected: "bg-red-500", duplicate: "bg-gray-500"
  };
  const statusLabels = {
    open: "Open", ai_processed: "AI Responded", awaiting_admin: "Needs Review",
    in_progress: "In Progress", resolved: "Resolved", closed: "Closed",
    new: "New", in_review: "In Review", accepted: "Accepted",
    implemented: "Implemented", rejected: "Rejected", duplicate: "Duplicate"
  };

  const StatusBadge = ({ status }) => (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full text-white ${statusColors[status] || 'bg-gray-400'}`}>
      {statusLabels[status] || status}
    </span>
  );

  const TypeBadge = ({ type }) => (
    <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border border-border text-muted-foreground capitalize">
      {type?.replace(/_/g, ' ')}
    </span>
  );

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center p-8">
          <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h2 className="text-lg font-bold mb-1">Admin Access Required</h2>
          <p className="text-sm text-muted-foreground">This page is only accessible to administrators.</p>
        </div>
      </div>
    );
  }

  // Ticket row component
  const TicketRow = ({ ticket }) => {
    const expanded = selectedTicket?.id === ticket.id;
    return (
      <div className={`border-b border-border last:border-0 transition-colors ${expanded ? 'bg-muted/40' : 'hover:bg-muted/30'}`}>
        <motion.button
          whileTap={{ scale: 0.985 }}
          transition={{ type: "spring", stiffness: 700, damping: 40, mass: 0.4 }}
          className="w-full text-left px-4 py-3 flex items-start gap-3"
          onClick={() => setSelectedTicket(expanded ? null : ticket)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <StatusBadge status={ticket.status} />
              <span className="text-xs text-muted-foreground">
                {new Date(ticket.created_date).toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm font-semibold truncate">{ticket.subject || 'Support Ticket'}</p>
            <p className="text-xs text-muted-foreground truncate">
              {ticket.user_name || ticket.user_email}
            </p>
            {!expanded && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {ticket.ai_summary || ticket.user_message}
              </p>
            )}
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </motion.button>

        {expanded && (
          <div className="px-4 pb-4 space-y-3">
            {ticket.ai_summary && (
              <div className="bg-muted rounded-md p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">AI Summary</p>
                <p className="text-sm">{ticket.ai_summary}</p>
              </div>
            )}
            {ticket.conversation_history?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Conversation</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {ticket.conversation_history.map((msg, idx) => (
                    <div key={idx} className={`p-2.5 rounded-md text-xs ${
                      msg.role === 'user' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100'
                      : msg.role === 'admin' ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-100'
                      : 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100'
                    }`}>
                      <span className="font-semibold capitalize">{msg.role}: </span>{msg.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
              <div className="flex gap-2">
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-xs h-8"
                  onClick={(e) => { e.stopPropagation(); handleResolveClick(ticket); }}>
                  Respond
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-8"
                  onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ ticketId: ticket.id, status: 'in_progress' }); }}>
                  Mark In Progress
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Feedback row component
  const FeedbackRow = ({ feedback }) => (
    <motion.button
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 700, damping: 40, mass: 0.4 }}
      className="w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors flex items-start gap-3"
      onClick={() => handleViewFeedback(feedback)}
    >
      <div className={`p-1.5 rounded-md flex-shrink-0 mt-0.5 ${
        feedback.feedback_type === "bug_report" || feedback.feedback_type === "technical_issue"
          ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
      }`}>
        {feedback.feedback_type === "bug_report" || feedback.feedback_type === "technical_issue"
          ? <AlertCircle className="w-3.5 h-3.5 text-red-600" />
          : <Sparkles className="w-3.5 h-3.5 text-blue-600" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <StatusBadge status={feedback.status} />
          <TypeBadge type={feedback.feedback_type} />
        </div>
        <p className="text-sm font-semibold truncate">{feedback.subject}</p>
        <p className="text-xs text-muted-foreground truncate">
          {feedback.user_name || feedback.user_email} · {new Date(feedback.created_date).toLocaleDateString()}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{feedback.description}</p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {feedback.xp_awarded > 0 && (
          <span className="text-[10px] bg-green-500 text-white font-bold px-1.5 py-0.5 rounded-full">+{feedback.xp_awarded}XP</span>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </motion.button>
  );

  const sections = [
    { id: "needs_response", label: "Needs Response", count: needsResponseTickets.length },
    { id: "feedback", label: "Feedback", count: newFeedback.length },
    { id: "history", label: "History", count: null },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-base font-bold leading-tight">Admin Inbox</h1>
          <p className="text-xs text-muted-foreground">Support tickets and technical feedback</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Stats strip */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {[
            { label: "Awaiting Admin", count: needsResponseTickets.filter(t => t.status === 'awaiting_admin').length, color: "bg-orange-500" },
            { label: "In Progress", count: needsResponseTickets.filter(t => t.status === 'in_progress').length, color: "bg-purple-500" },
            { label: "New Feedback", count: newFeedback.length, color: "bg-blue-500" },
          ].map(pill => (
            <div key={pill.label} className="flex-shrink-0 flex items-center gap-2 bg-card border border-border rounded-full px-3 py-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pill.color}`} />
              <span className="text-xs font-medium whitespace-nowrap">{pill.label}</span>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full text-white ${pill.count > 0 ? pill.color : 'bg-muted text-muted-foreground'}`}>
                {pill.count}
              </span>
            </div>
          ))}
        </div>

        {/* Section switcher */}
        <div className="flex rounded-lg border border-border overflow-hidden bg-muted/30">
          {sections.map(s => (
            <motion.button
              key={s.id}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 700, damping: 40 }}
              onClick={() => setActiveSection(s.id)}
              className={`flex-1 text-xs font-semibold py-2 px-2 transition-colors flex items-center justify-center gap-1.5 ${
                activeSection === s.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.label}
              {s.count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white bg-orange-500`}>{s.count}</span>
              )}
            </motion.button>
          ))}
        </div>

        {/* NEEDS RESPONSE */}
        {activeSection === "needs_response" && (
          <div className="space-y-3">
            <Input
              value={ticketSearch}
              onChange={e => setTicketSearch(e.target.value)}
              placeholder="Search tickets..."
              className="h-8 text-sm"
            />
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {applyTicketSearch(needsResponseTickets).length === 0 ? (
                <div className="py-10 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm font-medium">All caught up!</p>
                  <p className="text-xs text-muted-foreground">No tickets awaiting review.</p>
                </div>
              ) : (
                applyTicketSearch(needsResponseTickets).map(t => <TicketRow key={t.id} ticket={t} />)
              )}
            </div>
          </div>
        )}

        {/* FEEDBACK */}
        {activeSection === "feedback" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={feedbackSearch}
                onChange={e => setFeedbackSearch(e.target.value)}
                placeholder="Search feedback..."
                className="h-8 text-sm flex-1"
              />
              <Select value={feedbackFilter} onValueChange={setFeedbackFilter}>
                <SelectTrigger className="h-8 text-xs w-36 flex-shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ({allFeedback.length})</SelectItem>
                  <SelectItem value="bugs">Bugs ({bugReports.length})</SelectItem>
                  <SelectItem value="improvements">Ideas ({improvements.length})</SelectItem>
                  <SelectItem value="new">New Only ({newFeedback.length})</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {visibleFeedback().length === 0 ? (
                <div className="py-10 text-center">
                  <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No feedback in this filter.</p>
                </div>
              ) : (
                visibleFeedback().map(f => <FeedbackRow key={f.id} feedback={f} />)
              )}
            </div>
          </div>
        )}

        {/* HISTORY */}
        {activeSection === "history" && (
          <div className="space-y-3">
            <Input
              value={ticketSearch}
              onChange={e => setTicketSearch(e.target.value)}
              placeholder="Search history..."
              className="h-8 text-sm"
            />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resolved Tickets</p>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {applyTicketSearch(historyTickets).length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">No resolved tickets yet.</p>
                </div>
              ) : (
                applyTicketSearch(historyTickets).map(t => <TicketRow key={t.id} ticket={t} />)
              )}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2">Implemented Feedback</p>
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {implementedFeedback.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-muted-foreground">No implemented feedback yet.</p>
                </div>
              ) : (
                implementedFeedback.map(f => <FeedbackRow key={f.id} feedback={f} />)
              )}
            </div>
          </div>
        )}
      </div>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Respond as Admin</DialogTitle>
            <DialogDescription>Your response will be added to the conversation</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Response to User</label>
              <Textarea value={adminResponse} onChange={e => setAdminResponse(e.target.value)} placeholder="Write your response..." rows={5} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Internal Notes (Private)</label>
              <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Internal notes..." rows={2} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">New Status</label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>Cancel</Button>
            <Button onClick={() => resolveTicketMutation.mutate({ ticketId: selectedTicket.id, response: adminResponse, notes: adminNotes, status: newStatus })}
              disabled={!adminResponse.trim() || resolveTicketMutation.isPending}
              className="bg-green-600 hover:bg-green-700">
              {resolveTicketMutation.isPending ? "Submitting..." : "Submit Response"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback Dialog */}
      {selectedFeedback && (
        <Dialog open={showFeedbackDialog} onOpenChange={setShowFeedbackDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                {selectedFeedback.feedback_type === "bug_report" || selectedFeedback.feedback_type === "technical_issue"
                  ? <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  : <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0" />
                }
                <span className="truncate">{selectedFeedback.subject}</span>
              </DialogTitle>
              <DialogDescription>
                {selectedFeedback.user_name} · {selectedFeedback.user_email}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={selectedFeedback.status} />
                <TypeBadge type={selectedFeedback.feedback_type} />
                <span className="text-xs text-muted-foreground">{new Date(selectedFeedback.created_date).toLocaleDateString()}</span>
              </div>

              <div className="bg-muted rounded-md p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Description</p>
                <p className="text-sm whitespace-pre-wrap">{selectedFeedback.description}</p>
              </div>

              {selectedFeedback.screenshot_url && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Screenshot</p>
                  <img src={selectedFeedback.screenshot_url} alt="screenshot"
                    className="max-w-full rounded-lg border border-border cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => window.open(selectedFeedback.screenshot_url, '_blank')} />
                </div>
              )}

              {selectedFeedback.page_url && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Page</p>
                  <a href={selectedFeedback.page_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline break-all">{selectedFeedback.page_url}</a>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Admin Notes</label>
                <Textarea value={feedbackAdminNotes} onChange={e => setFeedbackAdminNotes(e.target.value)} placeholder="Internal notes..." rows={3} />
              </div>

              {(selectedFeedback.feedback_type === "improvement_suggestion" || selectedFeedback.feedback_type === "feature_request") && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-md p-3">
                  <label className="text-xs font-medium flex items-center gap-1.5 mb-2">
                    <Trophy className="w-3.5 h-3.5 text-green-600" />
                    XP to Award on Implementation
                  </label>
                  <Input type="number" value={xpToAward} onChange={e => setXpToAward(parseInt(e.target.value) || 0)}
                    min={0} step={5} className="max-w-xs h-8 text-sm" />
                </div>
              )}

              {selectedFeedback.xp_awarded > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 rounded-md p-3 flex items-center gap-2">
                  <Award className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                    {selectedFeedback.xp_awarded} XP awarded to {selectedFeedback.user_name}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowFeedbackDialog(false)}>Close</Button>
              <Select value={selectedFeedback.status} onValueChange={handleUpdateFeedback}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Update Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="implemented">Implemented</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => handleUpdateFeedback(selectedFeedback.status)}
                disabled={updateFeedbackMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                {updateFeedbackMutation.isPending ? "Saving..." : "Save Notes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* XP Confirmation Dialog */}
      <Dialog open={showXpConfirmation} onOpenChange={setShowXpConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-green-600" />
              Confirm XP Award
            </DialogTitle>
            <DialogDescription>Award XP for this implemented suggestion</DialogDescription>
          </DialogHeader>
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-green-600 mb-1">+{xpToAward} XP</p>
            <p className="text-sm text-muted-foreground">to <strong>{selectedFeedback?.user_name}</strong></p>
            <p className="text-xs text-muted-foreground mt-2">{selectedFeedback?.subject}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowXpConfirmation(false)}>Cancel</Button>
            <Button onClick={confirmXpAward} disabled={updateFeedbackMutation.isPending}
              className="bg-green-600 hover:bg-green-700">
              {updateFeedbackMutation.isPending ? "Awarding..." : "Confirm & Award XP"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}