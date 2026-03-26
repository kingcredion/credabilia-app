import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Bell,
  MessageSquare,
  Package,
  TrendingDown,
  ShieldCheck,
  Coins,
  Star,
  UserPlus,
  DollarSign,
  Eye,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";

const notificationIcons = {
  new_message: MessageSquare,
  item_sold: Package,
  item_view: Eye,
  price_drop: TrendingDown,
  new_listing_match: Package,
  audit_completed: ShieldCheck,
  credit_payout: Coins,
  review_received: Star,
  follow: UserPlus,
  offer_received: DollarSign
};

const notificationColors = {
  new_message: "text-blue-600 bg-blue-50",
  item_sold: "text-green-600 bg-green-50",
  item_view: "text-purple-600 bg-purple-50",
  price_drop: "text-orange-600 bg-orange-50",
  new_listing_match: "text-indigo-600 bg-indigo-50",
  audit_completed: "text-green-600 bg-green-50",
  credit_payout: "text-yellow-600 bg-yellow-50",
  review_received: "text-yellow-600 bg-yellow-50",
  follow: "text-pink-600 bg-pink-50",
  offer_received: "text-emerald-600 bg-emerald-50"
};

const getNotificationTarget = (notification) => {
  const raw = notification?.link_url;

  if (raw) {
    if (raw.startsWith("/") || raw.startsWith("http://") || raw.startsWith("https://")) {
      return raw;
    }
    return createPageUrl(raw);
  }

  const title = notification?.title?.toLowerCase?.() || "";
  const message = notification?.message?.toLowerCase?.() || "";
  if (title.includes("shipping address") || message.includes("shipping address")) {
    return createPageUrl("Settings?section=addresses");
  }

  return null;
};

export default function NotificationBell({ user }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ['notifications', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return await base44.entities.Notification.filter({ user_email: user.email }, "-created_date", 50);
    },
    enabled: !!user?.email,
    initialData: [],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      await base44.entities.Notification.update(notificationId, { read: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.read);
      await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { read: true })));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId) => {
      await base44.entities.Notification.delete(notificationId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id);
    }
    setOpen(false);
  };

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center bg-red-500 text-white text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="border-b border-gray-200 p-4 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Mark all as read
            </Button>
          )}
        </div>

        <ScrollArea className="h-96">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              <AnimatePresence>
                {notifications.map((notification) => {
                  const Icon = notificationIcons[notification.type] || Bell;
                  const colorClass = notificationColors[notification.type] || "text-gray-600 bg-gray-50";

                  const targetUrl = getNotificationTarget(notification);

                  return (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div
                        className={`p-4 hover:bg-gray-50 transition-colors group ${
                          !notification.read ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                            <Icon className="w-5 h-5" />
                          </div>

                          <div className="flex-1 min-w-0">
                            {targetUrl ? (
                              <Link
                                to={targetUrl}
                                onClick={() => handleNotificationClick(notification)}
                                className="block"
                              >
                                <h4 className={`text-sm mb-1 ${!notification.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                                  {notification.title}
                                </h4>
                                <p className="text-xs text-gray-600 line-clamp-2">
                                  {notification.message}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {timeAgo(notification.created_date)}
                                </p>
                              </Link>
                            ) : (
                              <>
                                <h4 className={`text-sm mb-1 ${!notification.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                                  {notification.title}
                                </h4>
                                <p className="text-xs text-gray-600 line-clamp-2">
                                  {notification.message}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {timeAgo(notification.created_date)}
                                </p>
                              </>
                            )}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotificationMutation.mutate(notification.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          >
                            <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}