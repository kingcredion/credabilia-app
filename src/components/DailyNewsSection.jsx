import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Newspaper, Trophy, AlertCircle, TrendingUp, Users, Crown } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const getCategoryIcon = (category) => {
  switch (category) {
    case 'game_result': return Trophy;
    case 'player_injury': return AlertCircle;
    case 'trade': return TrendingUp;
    case 'signing': return Users;
    case 'tribute': return Crown;
    default: return Newspaper;
  }
};

const getCategoryColor = (category) => {
  switch (category) {
    case 'game_result': return 'bg-green-100 text-green-800';
    case 'player_injury': return 'bg-red-100 text-red-800';
    case 'trade': return 'bg-blue-100 text-blue-800';
    case 'signing': return 'bg-purple-100 text-purple-800';
    case 'tribute': return 'bg-yellow-100 text-yellow-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

export default function DailyNewsSection() {
  const { data: news, isLoading } = useQuery({
    queryKey: ['daily-news'],
    queryFn: async () => {
      return await base44.entities.NewsItem.list('-created_date', 5);
    },
    initialData: [],
  });

  if (isLoading || news.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="mb-6 border-2 border-blue-300 shadow-xl overflow-hidden bg-gradient-to-br from-blue-50 to-gray-50">
        <div className="relative">
          {/* King Credion News Header */}
          <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 p-6 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')]"></div>
            </div>
            
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-20 h-20 bg-white rounded-full p-1 shadow-lg flex-shrink-0">
                <img
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/21b5769c8_9F039F2A-42E2-4921-9A01-DD6D79CC82CC.png"
                  alt="King Credion News"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                  <Newspaper className="w-6 h-6" />
                  King Credion's Daily News
                </h2>
                <p className="text-blue-100 text-sm">
                  Your daily dose of sports & memorabilia updates
                </p>
              </div>
              <Badge className="bg-red-600 text-white animate-pulse">
                LIVE
              </Badge>
            </div>
          </div>

          {/* News Content */}
          <CardContent className="p-6">
            <div className="space-y-4">
              {news.map((item, index) => {
                const CategoryIcon = getCategoryIcon(item.category);
                
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="group hover:bg-gray-50 p-4 rounded-lg transition-all cursor-pointer border border-transparent hover:border-blue-200"
                  >
                    <div className="flex gap-4">
                      {/* Category Icon */}
                      <div className="flex-shrink-0">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getCategoryColor(item.category)}`}>
                          <CategoryIcon className="w-6 h-6" />
                        </div>
                      </div>

                      {/* News Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                            {item.headline}
                          </h3>
                          {item.sport && (
                            <Badge variant="outline" className="flex-shrink-0">
                              {item.sport}
                            </Badge>
                          )}
                        </div>
                        
                        <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                          {item.summary}
                        </p>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-2 mb-2">
                          <Badge className={getCategoryColor(item.category)}>
                            {item.category.replace('_', ' ')}
                          </Badge>
                          {item.player_names?.slice(0, 3).map((player, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {player}
                            </Badge>
                          ))}
                          {item.team_names?.slice(0, 2).map((team, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {team}
                            </Badge>
                          ))}
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-500">
                            {new Date(item.created_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                          {item.source_url && (
                            <a
                              href={item.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Read Full Story →
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* View All Link */}
            <div className="mt-6 text-center">
              <Link to={createPageUrl("Profile") + "?tab=news"}>
                <button className="text-blue-600 hover:text-blue-700 font-semibold text-sm flex items-center gap-2 mx-auto hover:gap-3 transition-all">
                  View All News & Updates
                  <Newspaper className="w-4 h-4" />
                </button>
              </Link>
            </div>
          </CardContent>
        </div>
      </Card>
    </motion.div>
  );
}