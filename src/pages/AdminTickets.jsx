import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  User,
  Calendar,
  Sparkles,
  Trophy,
  Award
} from "lucide-react";

export default function AdminTickets() {
  const [user, setUser] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [adminResponse, setAdminResponse] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("resolved");
  
  // Technical Feedback state
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [feedbackAdminNotes, setFeedbackAdminNotes] = useState("");
  const [xpToAward, setXpToAward] = useState(50);
  const [showXpConfirmation, setShowXpConfirmation] = useState(false);
  
  // Search/Filter state
  const [ticketSearchQuery, setTicketSearchQuery] = useState("");
  const [feedbackSearchQuery, setFeedbackSearchQuery] = useState("");
  
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
    } catch (error) {
      console.error("Error loading user:", error);
    }
  };

  // Fetch all tickets
  const { data: allTickets } = useQuery({
    queryKey: ['admin-tickets'],
    queryFn: async () => {
      return await base44.entities.SupportTicket.list("-created_date");
    },
    initialData: [],
  });

  // Fetch all technical feedback
  const { data: allFeedback } = useQuery({
    queryKey: ['technical-feedback'],
    queryFn: async () => {
      return await base44.entities.TechnicalFeedback.list("-created_date");
    },
    initialData: [],
  });

  const pendingTickets = allTickets.filter(t => 
    t.status === 'awaiting_admin' || t.status === 'in_progress'
  );
  const resolvedTickets = allTickets.filter(t => 
    t.status === 'resolved' || t.status === 'closed'
  );
  const aiProcessedTickets = allTickets.filter(t => 
    t.status === 'ai_processed' || t.status === 'open'
  );

  const bugReports = allFeedback.filter(f => f.feedback_type === "bug_report" || f.feedback_type === "technical_issue");
  const improvements = allFeedback.filter(f => f.feedback_type === "improvement_suggestion" || f.feedback_type === "feature_request");
  const newFeedback = allFeedback.filter(f => f.status === "new");
  const implementedFeedback = allFeedback.filter(f => f.status === "implemented");

  const filteredTickets = (tickets) => {
    if (!ticketSearchQuery.trim()) return tickets;
    const query = ticketSearchQuery.toLowerCase();
    return tickets.filter(t => 
      t.subject?.toLowerCase().includes(query) ||
      t.user_name?.toLowerCase().includes(query) ||
      t.user_email?.toLowerCase().includes(query) ||
      t.ai_summary?.toLowerCase().includes(query)
    );
  };

  const filteredFeedback = (feedback) => {
    if (!feedbackSearchQuery.trim()) return feedback;
    const query = feedbackSearchQuery.toLowerCase();
    return feedback.filter(f => 
      f.subject?.toLowerCase().includes(query) ||
      f.user_name?.toLowerCase().includes(query) ||
      f.user_email?.toLowerCase().includes(query) ||
      f.description?.toLowerCase().includes(query)
    );
  };

  const resolveTicketMutation = useMutation({
    mutationFn: async ({ ticketId, response, notes, status }) => {
      const ticket = allTickets.find(t => t.id === ticketId);
      if (!ticket) throw new Error("Ticket not found");

      const updatedHistory = [
        ...(ticket.conversation_history || []),
        {
          role: "admin",
          message: response,
          timestamp: new Date().toISOString()
        }
      ];

      await base44.entities.SupportTicket.update(ticketId, {
        conversation_history: updatedHistory,
        admin_response: response,
        admin_notes: notes,
        status: status,
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
    mutationFn: async ({ ticketId, status }) => {
      await base44.entities.SupportTicket.update(ticketId, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
    },
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
      
      // Award XP to user if implementing
      if (status === "implemented" && xpAwarded > 0) {
        const feedback = allFeedback.find(f => f.id === id);
        if (feedback) {
          const users = await base44.entities.User.filter({ email: feedback.user_email });
          if (users[0]) {
            const currentXP = users[0].xp || 0;
            await base44.entities.User.update(users[0].id, {
              xp: currentXP + xpAwarded
            });
            
            // Create XP event
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

  const handleSubmitResolution = () => {
    if (!selectedTicket || !adminResponse.trim()) return;
    
    resolveTicketMutation.mutate({
      ticketId: selectedTicket.id,
      response: adminResponse,
      notes: adminNotes,
      status: newStatus
    });
  };

  const handleViewFeedback = (feedback) => {
    setSelectedFeedback(feedback);
    setFeedbackAdminNotes(feedback.admin_notes || "");
    setXpToAward(feedback.xp_awarded || 50);
    setShowFeedbackDialog(true);
  };

  const handleUpdateFeedback = (status) => {
    if (!selectedFeedback) return;
    
    const isImplementationAttempt = status === "implemented" && xpToAward > 0;
    const xpAlreadyAwarded = selectedFeedback.xp_awarded > 0;

    if (isImplementationAttempt && !xpAlreadyAwarded) {
      setShowXpConfirmation(true);
      return;
    }
    
    updateFeedbackMutation.mutate({
      id: selectedFeedback.id,
      status,
      adminNotes: feedbackAdminNotes,
      xpAwarded: 0 // XP will only be awarded via confirmXpAward
    });
  };

  const confirmXpAward = () => {
    if (!selectedFeedback) return;
    
    updateFeedbackMutation.mutate({
      id: selectedFeedback.id,
      status: "implemented",
      adminNotes: feedbackAdminNotes,
      xpAwarded: xpToAward
    });
    setShowXpConfirmation(false);
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      open: { color: "bg-blue-500", icon: Clock, label: "Open" },
      ai_processed: { color: "bg-green-500", icon: CheckCircle2, label: "AI Responded" },
      awaiting_admin: { color: "bg-orange-500", icon: AlertCircle, label: "Needs Review" },
      in_progress: { color: "bg-purple-500", icon: Clock, label: "In Progress" },
      resolved: { color: "bg-green-600", icon: CheckCircle2, label: "Resolved" },
      closed: { color: "bg-gray-500", icon: CheckCircle2, label: "Closed" },
      // Technical feedback statuses
      new: { color: "bg-blue-500", icon: Clock, label: "New" },
      in_review: { color: "bg-yellow-500", icon: Clock, label: "In Review" },
      accepted: { color: "bg-green-500", icon: CheckCircle2, label: "Accepted" },
      implemented: { color: "bg-purple-500", icon: Trophy, label: "Implemented" },
      rejected: { color: "bg-red-500", icon: AlertCircle, label: "Rejected" },
      duplicate: { color: "bg-gray-500", icon: AlertCircle, label: "Duplicate" }
    };
    
    const config = statusConfig[status] || statusConfig.open;
    const Icon = config.icon;
    
    return (
      <Badge className={`${config.color} text-white flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const getCategoryBadge = (category) => {
    const colors = {
      account_issue: "bg-blue-100 text-blue-800",
      listing_dispute: "bg-red-100 text-red-800",
      bug_report: "bg-purple-100 text-purple-800",
      feature_request: "bg-green-100 text-green-800",
      payment_issue: "bg-orange-100 text-orange-800",
      general_query: "bg-gray-100 text-gray-800",
      other: "bg-gray-100 text-gray-800"
    };
    
    return (
      <Badge variant="outline" className={colors[category] || colors.other}>
        {category?.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const getPriorityBadge = (priority) => {
    const config = {
      low: { color: "bg-gray-400", label: "Low" },
      medium: { color: "bg-blue-500", label: "Medium" },
      high: { color: "bg-orange-500", label: "High" },
      critical: { color: "bg-red-600", label: "Critical" }
    };
    
    const { color, label } = config[priority] || config.medium;
    return <Badge className={`${color} text-white text-xs`}>{label}</Badge>;
  };

  // Check if user is admin
  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <ShieldCheck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Admin Access Required</h2>
            <p className="text-gray-600">
              This page is only accessible to administrators.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const TicketCard = ({ ticket }) => (
    <Card 
      key={ticket.id}
      className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-orange-300"
      onClick={() => setSelectedTicket(selectedTicket?.id === ticket.id ? null : ticket)}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                {(ticket.user_name || 'U')[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-gray-900">{ticket.user_name}</p>
              <p className="text-xs text-gray-500">{ticket.user_email}</p>
            </div>
          </div>
          {getStatusBadge(ticket.status)}
        </div>

        <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
          {ticket.subject || 'Support Ticket'}
        </h3>

        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {ticket.ai_summary || ticket.user_message}
        </p>

        <div className="flex items-center justify-between pt-3 border-t border-gray-200">
          <div className="flex items-center gap-2">
            {getCategoryBadge(ticket.ai_category)}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {ticket.conversation_history?.length || 0} msgs
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(ticket.created_date).toLocaleDateString()}
            </span>
          </div>
        </div>

        {selectedTicket?.id === ticket.id && (
          <div className="mt-4 pt-4 border-t-2 border-orange-300">
            <div className="space-y-3 mb-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">AI Summary:</p>
                <p className="text-sm text-gray-900">{ticket.ai_summary}</p>
              </div>

              {ticket.conversation_history && ticket.conversation_history.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">Conversation:</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {ticket.conversation_history.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg text-sm ${
                          msg.role === 'user'
                            ? 'bg-blue-50 text-blue-900'
                            : msg.role === 'admin'
                            ? 'bg-purple-50 text-purple-900'
                            : 'bg-green-50 text-green-900'
                        }`}
                      >
                        <p className="font-semibold text-xs mb-1 capitalize">{msg.role}:</p>
                        <p>{msg.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                <>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResolveClick(ticket);
                    }}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Respond & Resolve
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateStatusMutation.mutate({
                        ticketId: ticket.id,
                        status: 'in_progress'
                      });
                    }}
                    variant="outline"
                  >
                    Mark In Progress
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  const FeedbackCard = ({ feedback }) => (
    <Card
      key={feedback.id}
      onClick={() => handleViewFeedback(feedback)}
      className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-blue-400"
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              feedback.feedback_type === "bug_report" || feedback.feedback_type === "technical_issue"
                ? 'bg-red-100'
                : 'bg-blue-100'
            }`}>
              {feedback.feedback_type === "bug_report" || feedback.feedback_type === "technical_issue" ? (
                <AlertCircle className="w-5 h-5 text-red-600" />
              ) : (
                <Sparkles className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{feedback.user_name}</p>
              <p className="text-xs text-gray-500">{feedback.user_email}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end">
            {getStatusBadge(feedback.status)}
            {getPriorityBadge(feedback.priority)}
          </div>
        </div>

        <h3 className="font-bold text-gray-900 mb-2">
          {feedback.subject}
        </h3>

        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {feedback.description}
        </p>

        <div className="flex items-center justify-between pt-3 border-t border-gray-200">
          <Badge variant="outline" className="capitalize text-xs">
            {feedback.feedback_type.replace(/_/g, ' ')}
          </Badge>
          <div className="flex items-center gap-3">
            {feedback.xp_awarded > 0 && (
              <Badge className="bg-green-500 text-white text-xs">
                <Trophy className="w-3 h-3 mr-1" />
                +{feedback.xp_awarded} XP
              </Badge>
            )}
            <span className="text-xs text-gray-500">
              {new Date(feedback.created_date).toLocaleDateString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-green-50">
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Support Center
          </h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            Review support tickets and technical feedback
          </p>
        </div>

        {/* Combined Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
          <Card>
            <CardContent className="p-3 md:p-6 text-center">
              <AlertCircle className="w-6 md:w-8 h-6 md:h-8 text-orange-500 mx-auto mb-1 md:mb-2" />
              <p className="text-2xl md:text-3xl font-bold text-gray-900">{pendingTickets.length}</p>
              <p className="text-xs md:text-sm text-gray-600">Support Tickets</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-red-50 to-orange-50">
            <CardContent className="p-3 md:p-6 text-center">
              <AlertCircle className="w-6 md:w-8 h-6 md:h-8 text-red-600 mx-auto mb-1 md:mb-2" />
              <p className="text-2xl md:text-3xl font-bold text-gray-900">{bugReports.length}</p>
              <p className="text-xs md:text-sm text-gray-600">Bug Reports</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-purple-50">
            <CardContent className="p-3 md:p-6 text-center">
              <Sparkles className="w-6 md:w-8 h-6 md:h-8 text-blue-600 mx-auto mb-1 md:mb-2" />
              <p className="text-2xl md:text-3xl font-bold text-gray-900">{improvements.length}</p>
              <p className="text-xs md:text-sm text-gray-600">Ideas</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50">
            <CardContent className="p-3 md:p-6 text-center">
              <Trophy className="w-6 md:w-8 h-6 md:h-8 text-green-600 mx-auto mb-1 md:mb-2" />
              <p className="text-2xl md:text-3xl font-bold text-gray-900">{implementedFeedback.length}</p>
              <p className="text-xs md:text-sm text-gray-600">Implemented</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 mb-6 gap-1 md:gap-0 overflow-x-auto">
            <TabsTrigger value="pending" className="text-xs md:text-sm whitespace-nowrap">
              <span className="hidden sm:inline">Support</span>
              <span className="sm:hidden">Tickets</span> ({pendingTickets.length})
            </TabsTrigger>
            <TabsTrigger value="ai_handled" className="text-xs md:text-sm whitespace-nowrap">
              <span className="hidden sm:inline">AI</span> ({aiProcessedTickets.length})
            </TabsTrigger>
            <TabsTrigger value="bugs" className="text-xs md:text-sm whitespace-nowrap">
              Bugs ({bugReports.length})
            </TabsTrigger>
            <TabsTrigger value="ideas" className="text-xs md:text-sm whitespace-nowrap">
              Ideas ({improvements.length})
            </TabsTrigger>
            <TabsTrigger value="resolved" className="text-xs md:text-sm col-span-2 md:col-span-1 whitespace-nowrap">
              <span className="hidden sm:inline">Resolved</span>
              <span className="sm:hidden">Done</span> ({resolvedTickets.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <div className="mb-4">
              <Input
                value={ticketSearchQuery}
                onChange={(e) => setTicketSearchQuery(e.target.value)}
                placeholder="Search tickets by user, subject, or summary..."
                className="max-w-md"
              />
            </div>
            <div className="grid grid-cols-1 gap-4">
              {filteredTickets(pendingTickets).length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    {ticketSearchQuery ? (
                      <>
                        <ShieldCheck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">No tickets match your search</p>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                          All Caught Up!
                        </h3>
                        <p className="text-gray-600">
                          No tickets awaiting admin review at this time.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : (
                filteredTickets(pendingTickets).map(ticket => <TicketCard key={ticket.id} ticket={ticket} />)
              )}
            </div>
          </TabsContent>

          <TabsContent value="ai_handled">
            <div className="mb-4">
              <Input
                value={ticketSearchQuery}
                onChange={(e) => setTicketSearchQuery(e.target.value)}
                placeholder="Search tickets by user, subject, or summary..."
                className="max-w-md"
              />
            </div>
            <div className="grid grid-cols-1 gap-4">
              {filteredTickets(aiProcessedTickets).length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <ShieldCheck className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">{ticketSearchQuery ? "No tickets match your search" : "No AI-handled tickets"}</p>
                  </CardContent>
                </Card>
              ) : (
                filteredTickets(aiProcessedTickets).map(ticket => <TicketCard key={ticket.id} ticket={ticket} />)
              )}
            </div>
          </TabsContent>

          <TabsContent value="bugs">
            <div className="mb-4">
              <Input
                value={feedbackSearchQuery}
                onChange={(e) => setFeedbackSearchQuery(e.target.value)}
                placeholder="Search by user, subject, or description..."
                className="max-w-md"
              />
            </div>
            <div className="grid grid-cols-1 gap-4">
              {filteredFeedback(bugReports).length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <CheckCircle2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {feedbackSearchQuery ? "No bugs match your search" : "No Bug Reports"}
                    </h3>
                    <p className="text-gray-600">
                      {feedbackSearchQuery ? "Try a different search term" : "No technical issues have been reported yet."}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredFeedback(bugReports).map(feedback => <FeedbackCard key={feedback.id} feedback={feedback} />)
              )}
            </div>
          </TabsContent>

          <TabsContent value="ideas">
            <div className="mb-4">
              <Input
                value={feedbackSearchQuery}
                onChange={(e) => setFeedbackSearchQuery(e.target.value)}
                placeholder="Search by user, subject, or description..."
                className="max-w-md"
              />
            </div>
            <div className="grid grid-cols-1 gap-4">
              {filteredFeedback(improvements).length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Sparkles className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {feedbackSearchQuery ? "No ideas match your search" : "No Improvement Ideas"}
                    </h3>
                    <p className="text-gray-600">
                      {feedbackSearchQuery ? "Try a different search term" : "No suggestions have been submitted yet."}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredFeedback(improvements).map(feedback => <FeedbackCard key={feedback.id} feedback={feedback} />)
              )}
            </div>
          </TabsContent>

          <TabsContent value="resolved">
            <div className="mb-4">
              <Input
                value={ticketSearchQuery}
                onChange={(e) => setTicketSearchQuery(e.target.value)}
                placeholder="Search by user, subject, or summary..."
                className="max-w-md"
              />
            </div>
            <div className="grid grid-cols-1 gap-4">
              {filteredTickets(resolvedTickets).length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <CheckCircle2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">{ticketSearchQuery ? "No tickets match your search" : "No resolved tickets yet"}</p>
                  </CardContent>
                </Card>
              ) : (
                filteredTickets(resolvedTickets).map(ticket => <TicketCard key={ticket.id} ticket={ticket} />)
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Support Ticket Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Respond as Admin
            </DialogTitle>
            <DialogDescription>
              Your response will be added to the conversation as an administrator
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Response to User
              </label>
              <Textarea
                value={adminResponse}
                onChange={(e) => setAdminResponse(e.target.value)}
                placeholder="Write your response to the user..."
                rows={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Internal Notes (Private)
              </label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Add internal notes about this ticket..."
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Status
              </label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResolveDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitResolution}
              disabled={!adminResponse.trim() || resolveTicketMutation.isPending}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
            >
              {resolveTicketMutation.isPending ? "Submitting..." : "Submit Response"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Technical Feedback Dialog */}
      {selectedFeedback && (
        <Dialog open={showFeedbackDialog} onOpenChange={setShowFeedbackDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedFeedback.feedback_type === "bug_report" || selectedFeedback.feedback_type === "technical_issue" ? (
                  <AlertCircle className="w-6 h-6 text-red-600" />
                ) : (
                  <Sparkles className="w-6 h-6 text-blue-600" />
                )}
                {selectedFeedback.subject}
              </DialogTitle>
              <DialogDescription>
                Submitted by {selectedFeedback.user_name} ({selectedFeedback.user_email})
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Metadata */}
              <div className="flex flex-wrap gap-3">
                {getStatusBadge(selectedFeedback.status)}
                {getPriorityBadge(selectedFeedback.priority)}
                <Badge variant="outline" className="capitalize">
                  {selectedFeedback.feedback_type.replace(/_/g, ' ')}
                </Badge>
                <Badge variant="outline">
                  {new Date(selectedFeedback.created_date).toLocaleDateString()}
                </Badge>
              </div>

              {/* Description */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">Description</h4>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedFeedback.description}</p>
              </div>

              {/* Screenshot */}
              {selectedFeedback.screenshot_url && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-3">Screenshot</h4>
                  <img 
                    src={selectedFeedback.screenshot_url} 
                    alt="User-provided screenshot"
                    className="max-w-full rounded-lg border-2 border-gray-200 cursor-pointer hover:shadow-xl transition-shadow"
                    onClick={() => window.open(selectedFeedback.screenshot_url, '_blank')}
                  />
                  <p className="text-xs text-gray-500 mt-2">Click to view full size</p>
                </div>
              )}

              {/* Page Context */}
              {selectedFeedback.page_url && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Page Context</h4>
                  <a 
                    href={selectedFeedback.page_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline break-all"
                  >
                    {selectedFeedback.page_url}
                  </a>
                </div>
              )}

              {/* Admin Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Notes
                </label>
                <Textarea
                  value={feedbackAdminNotes}
                  onChange={(e) => setFeedbackAdminNotes(e.target.value)}
                  placeholder="Add internal notes about this feedback..."
                  rows={4}
                />
              </div>

              {/* XP Award (only for improvements) */}
              {(selectedFeedback.feedback_type === "improvement_suggestion" || selectedFeedback.feedback_type === "feature_request") && (
                <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-green-600" />
                    XP to Award (if implementing)
                  </label>
                  <Input
                    type="number"
                    value={xpToAward}
                    onChange={(e) => setXpToAward(parseInt(e.target.value) || 0)}
                    min={0}
                    step={5}
                    className="max-w-xs"
                  />
                  <p className="text-xs text-gray-600 mt-2">
                    User will receive this XP when you mark the suggestion as "Implemented"
                  </p>
                </div>
              )}

              {/* XP Awarded Display */}
              {selectedFeedback.xp_awarded > 0 && (
                <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-green-600" />
                    <p className="font-semibold text-green-900">
                      ✅ {selectedFeedback.xp_awarded} XP awarded to {selectedFeedback.user_name}
                    </p>
                  </div>
                  {selectedFeedback.implementation_date && (
                    <p className="text-xs text-green-700 mt-1">
                      Implemented on {new Date(selectedFeedback.implementation_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="flex flex-wrap gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowFeedbackDialog(false)}
              >
                Close
              </Button>
              
              <Select 
                value={selectedFeedback.status} 
                onValueChange={(value) => handleUpdateFeedback(value)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Update Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="implemented">Implemented</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="duplicate">Duplicate</SelectItem>
                </SelectContent>
              </Select>

              <Button
                onClick={() => handleUpdateFeedback(selectedFeedback.status)}
                disabled={updateFeedbackMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updateFeedbackMutation.isPending ? "Saving..." : "Save Notes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* XP Award Confirmation Dialog */}
      <Dialog open={showXpConfirmation} onOpenChange={setShowXpConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-6 h-6 text-green-600" />
              Confirm XP Award
            </DialogTitle>
            <DialogDescription>
              You're about to award XP to a user for their implemented suggestion
            </DialogDescription>
          </DialogHeader>

          <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-300 rounded-lg p-6">
            <div className="text-center mb-4">
              <p className="text-4xl font-bold text-green-600 mb-2">+{xpToAward} XP</p>
              <p className="text-sm text-gray-700">
                will be awarded to <strong>{selectedFeedback?.user_name}</strong>
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200">
              <p className="text-xs text-gray-600 mb-2">For implementing:</p>
              <p className="text-sm font-semibold text-gray-900">{selectedFeedback?.subject}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowXpConfirmation(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmXpAward}
              disabled={updateFeedbackMutation.isPending}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
            >
              {updateFeedbackMutation.isPending ? "Awarding..." : "Confirm & Award XP"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}