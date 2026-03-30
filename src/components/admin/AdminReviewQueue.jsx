import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  ShieldCheck,
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Eye, 
  Loader2, 
  Brain, 
  Search,
  Filter,
  MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function AdminReviewQueue() {
  const queryClient = useQueryClient();
  const [selectedItems, setSelectedItems] = useState([]);
  const [analyzingIds, setAnalyzingIds] = useState([]);
  const [filter, setFilter] = useState("all"); // all, flagged, pending

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['admin-review-queue'],
    queryFn: async () => {
      // Fetch both pending and flagged items
      const flagged = await base44.entities.Item.filter({ moderation_status: 'flagged' });
      const pending = await base44.entities.Item.filter({ moderation_status: 'pending' });
      return [...flagged, ...pending].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    staleTime: 30000 // 30 seconds
  });

  const { data: flags = [] } = useQuery({
    queryKey: ['item-flags'],
    queryFn: async () => {
        // Fetch all flags to map to items
        // Since we can't filter by multiple item IDs easily, we might fetch all active flags or do it per item
        // For efficiency in this demo, fetching list
        return await base44.entities.Flag.list('-created_date', 100); 
    }
  });

  const analyzeItemMutation = useMutation({
    mutationFn: async (itemId) => {
      setAnalyzingIds(prev => [...prev, itemId]);
      try {
        await base44.functions.invoke('analyzeItem', { item_id: itemId });
      } finally {
        setAnalyzingIds(prev => prev.filter(id => id !== itemId));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-review-queue']);
      toast.success("AI Analysis Completed");
    },
    onError: (error) => {
      toast.error(`Analysis failed: ${error.message}`);
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }) => {
      await base44.entities.Item.update(id, { moderation_status: status });
      // If rejecting, we might want to set main status to 'archived' or 'draft'
      if (status === 'rejected') {
        await base44.entities.Item.update(id, { status: 'archived' });
      } else if (status === 'approved') {
         // If approved, ensure it's active
         await base44.entities.Item.update(id, { status: 'active' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['admin-review-queue']);
      toast.success("Item status updated");
      setSelectedItems([]);
    }
  });

  const handleBulkAction = async (action) => {
    if (selectedItems.length === 0) return;
    
    const promises = selectedItems.map(id => 
      updateStatusMutation.mutateAsync({ id, status: action })
    );

    try {
      await Promise.all(promises);
      toast.success(`Batch ${action} completed`);
    } catch (error) {
      console.error("Bulk action error:", error);
    }
  };

  const getAIAnalysis = (item) => {
    if (!item.ai_moderation_analysis) return null;
    try {
      return JSON.parse(item.ai_moderation_analysis);
    } catch {
      return null;
    }
  };

  const getFlagsForItem = (itemId) => {
      return flags.filter(f => f.item_id === itemId);
  };

  const filteredItems = items.filter(item => {
    if (filter === 'all') return true;
    return item.moderation_status === filter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            Review Queue
          </h2>
          <p className="text-gray-500">
            {filteredItems.length} items requiring attention
          </p>
        </div>

        <div className="flex gap-2">
           {selectedItems.length > 0 && (
            <div className="flex gap-2 mr-4 animate-in fade-in slide-in-from-right-4">
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => handleBulkAction('rejected')}
              >
                Reject Selected ({selectedItems.length})
              </Button>
              <Button 
                className="bg-green-600 hover:bg-green-700 text-white"
                size="sm"
                onClick={() => handleBulkAction('approved')}
              >
                Approve Selected ({selectedItems.length})
              </Button>
            </div>
          )}
          
          <div className="flex items-center gap-2 bg-white rounded-lg border p-1">
             <Button 
                variant={filter === 'all' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setFilter('all')}
             >
                All
             </Button>
             <Button 
                variant={filter === 'flagged' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setFilter('flagged')}
                className="text-red-600"
             >
                Flagged
             </Button>
             <Button 
                variant={filter === 'pending' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setFilter('pending')}
                className="text-yellow-600"
             >
                Pending
             </Button>
          </div>
        </div>
      </div>

      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox 
                    checked={selectedItems.length === filteredItems.length && filteredItems.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedItems(filteredItems.map(i => i.id));
                      else setSelectedItems([]);
                    }}
                  />
                </TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>AI Analysis</TableHead>
                <TableHead>Community Flags</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
                  </TableCell>
                </TableRow>
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    No items in queue
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => {
                  const analysis = getAIAnalysis(item);
                  const itemFlags = getFlagsForItem(item.id);
                  const isAnalyzing = analyzingIds.includes(item.id);

                  return (
                    <TableRow key={item.id} className="transition-colors hover:bg-muted/40">
                      <TableCell>
                        <Checkbox 
                          checked={selectedItems.includes(item.id)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedItems(prev => [...prev, item.id]);
                            else setSelectedItems(prev => prev.filter(id => id !== item.id));
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded bg-gray-100 overflow-hidden shrink-0">
                            {item.images?.[0] ? (
                              <img src={item.images[0]} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-300">
                                <Eye className="w-4 h-4" />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-medium line-clamp-1">{item.title}</div>
                            <div className="text-xs text-gray-500">{item.vendor_email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.moderation_status === 'flagged' ? 'destructive' : 'secondary'}>
                          {item.moderation_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {analysis ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className={
                                    analysis.recommendation === 'approve' 
                                    ? "text-green-600 border-green-200 bg-green-50" 
                                    : "text-red-600 border-red-200 bg-red-50"
                                }>
                                    {analysis.recommendation === 'approve' ? 'Keep' : 'Remove'} 
                                    <span className="ml-1 opacity-70">({analysis.confidence_score}%)</span>
                                </Badge>
                            </div>
                            <p className="text-xs text-gray-500 max-w-[200px] truncate" title={analysis.reason}>
                                {analysis.reason}
                            </p>
                          </div>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-7 text-xs"
                            onClick={() => analyzeItemMutation.mutate(item.id)}
                            disabled={isAnalyzing}
                          >
                            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Brain className="w-3 h-3 mr-1" />}
                            Analyze
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        {itemFlags.length > 0 ? (
                           <div className="flex flex-col gap-1">
                                <Badge variant="destructive" className="w-fit">
                                    {itemFlags.length} Reports
                                </Badge>
                                <span className="text-xs text-gray-500 truncate max-w-[150px]">
                                    {itemFlags[0].reason}
                                </span>
                           </div>
                        ) : (
                            <span className="text-xs text-gray-400">None</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                            <motion.div whileTap={{ scale: 0.88 }} transition={{ type: "spring", stiffness: 700, damping: 35 }}>
                              <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => updateStatusMutation.mutate({ id: item.id, status: 'approved' })}
                                  title="Approve"
                              >
                                  <CheckCircle2 className="w-5 h-5" />
                              </Button>
                            </motion.div>
                            <motion.div whileTap={{ scale: 0.88 }} transition={{ type: "spring", stiffness: 700, damping: 35 }}>
                              <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => updateStatusMutation.mutate({ id: item.id, status: 'rejected' })}
                                  title="Reject & Remove"
                              >
                                  <XCircle className="w-5 h-5" />
                              </Button>
                            </motion.div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}