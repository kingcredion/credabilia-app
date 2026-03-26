import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, TrendingUp, Heart, Trophy, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function SportsNews() {
  const { data: news, isLoading } = useQuery({
    queryKey: ['sports-news'],
    queryFn: async () => {
      return await base44.entities.NewsItem.list('-created_date', 20);
    },
    initialData: [],
  });

  const getCategoryIcon = (category) => {
    switch(category) {
      case 'game_result': return <Trophy className="w-4 h-4" />;
      case 'player_injury': return <AlertCircle className="w-4 h-4" />;
      case 'tribute': return <Heart className="w-4 h-4" />;
      default: return <TrendingUp className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category) => {
    switch(category) {
      case 'game_result': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'player_injury': return 'bg-red-100 text-red-700 border-red-300';
      case 'tribute': return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'trade': return 'bg-green-100 text-green-700 border-green-300';
      case 'signing': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading news...</p>
      </div>
    );
  }

  if (news.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No news yet
          </h3>
          <p className="text-gray-600 text-sm">
            Sports news and current events will appear here daily
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {news.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <Card className={`hover:shadow-lg transition-shadow ${
            item.is_tribute ? 'border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-pink-50' : ''
          }`}>
            <CardContent className="p-6">
              <div className="flex gap-4">
                {item.image_url && (
                  <div className="w-32 h-32 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                    <img 
                      src={item.image_url} 
                      alt={item.headline}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-2">
                    <Badge className={`${getCategoryColor(item.category)} border flex items-center gap-1`}>
                      {getCategoryIcon(item.category)}
                      {item.category.replace('_', ' ')}
                    </Badge>
                    {item.sport && (
                      <Badge variant="outline" className="capitalize">
                        {item.sport}
                      </Badge>
                    )}
                    {item.is_tribute && (
                      <Badge className="bg-purple-600 text-white">
                        <Heart className="w-3 h-3 mr-1" />
                        Tribute
                      </Badge>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {item.headline}
                  </h3>

                  <p className="text-sm text-gray-700 mb-3 leading-relaxed">
                    {item.summary}
                  </p>

                  {(item.player_names?.length > 0 || item.team_names?.length > 0) && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {item.player_names?.map((player, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {player}
                        </Badge>
                      ))}
                      {item.team_names?.map((team, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs bg-blue-50">
                          {team}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.created_date).toLocaleDateString()}
                    </span>
                    {item.source_url && (
                      <a 
                        href={item.source_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Read More →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}