import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Crown, X, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function KingCredionAnnouncement() {
  const [dismissed, setDismissed] = useState(() => {
    const dismissedIds = JSON.parse(localStorage.getItem('dismissedAnnouncements') || '[]');
    return dismissedIds;
  });

  const { data: announcements } = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => {
      const now = new Date().toISOString();
      const published = await base44.entities.Announcement.filter({ status: 'published' }, '-created_date');
      return published.filter(a => !a.expires_date || new Date(a.expires_date) > new Date());
    },
    initialData: [],
  });

  const activeAnnouncement = announcements.find(a => !dismissed.includes(a.id));

  const handleDismiss = (id) => {
    const newDismissed = [...dismissed, id];
    setDismissed(newDismissed);
    localStorage.setItem('dismissedAnnouncements', JSON.stringify(newDismissed));
  };

  if (!activeAnnouncement) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
      >
        <Card className="bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 border-2 border-yellow-400 relative overflow-hidden shadow-xl mb-6">
          <div className="absolute top-0 right-0 w-64 h-64 opacity-10">
            <Crown className="w-full h-full text-yellow-600" />
          </div>
          
          <CardContent className="p-6 relative">
            <div className="flex items-start gap-4">
              <motion.div
                animate={{ 
                  rotate: [0, -10, 10, -10, 0],
                  scale: [1, 1.1, 1]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  repeatDelay: 3
                }}
                className="flex-shrink-0"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                  <Crown className="w-8 h-8 text-white" />
                </div>
              </motion.div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-gray-900">
                    {activeAnnouncement.title}
                  </h3>
                  {activeAnnouncement.priority === 'urgent' && (
                    <Badge className="bg-red-600 text-white">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Urgent
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {activeAnnouncement.content}
                </p>
                <p className="text-xs text-gray-500 mt-3 flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  Royal Decree from King Credion
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDismiss(activeAnnouncement.id)}
                className="flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}