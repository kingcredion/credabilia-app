import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Brain,
  Trophy,
  Star,
  Zap,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Crown,
  Target,
  Award,
  TrendingUp,
  Film,
  Landmark,
  Palette
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";

// Category structure for Trivia
const CATEGORY_STRUCTURE = {
  all: {
    label: "All Categories",
    icon: "🎲",
    gradient: "from-gray-600 to-slate-600",
    description: "Mix of all topics"
  },
  sports: {
    label: "Sports Memorabilia",
    icon: "⚾",
    gradient: "from-blue-500 to-green-500",
    description: "History, stats & legends"
  },
  entertainment: {
    label: "Entertainment",
    icon: "🎬",
    gradient: "from-purple-500 to-pink-500",
    description: "Movies, TV & music"
  },
  historical: {
    label: "Historical",
    icon: "🏛️",
    gradient: "from-amber-500 to-orange-500",
    description: "Events & artifacts"
  },
  comics: {
    label: "Comics & Pop Culture",
    icon: "🦸",
    gradient: "from-red-500 to-yellow-500",
    description: "Comics, toys & games"
  },
  fine_art: {
    label: "Fine Art",
    icon: "🎨",
    gradient: "from-purple-500 to-indigo-500",
    description: "Art history & famous works"
  }
};

export default function TriviaChallenge() {
  const [user, setUser] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [generatingQuestion, setGeneratingQuestion] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
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

  const generateQuestion = async () => {
    setGeneratingQuestion(true);
    setShowResult(false);
    setSelectedAnswer(null);

    try {
      let categoryPrompt = "";
      
      switch(selectedCategory) {
        case 'sports':
          categoryPrompt = "Focus EXCLUSIVELY on sports history, iconic moments, legendary athletes, and sports memorabilia (NBA, NFL, MLB, NHL, boxing, Olympics, Soccer).";
          break;
        case 'entertainment':
          categoryPrompt = "Focus EXCLUSIVELY on entertainment history, cult classic movies, TV shows, music legends, and Hollywood memorabilia.";
          break;
        case 'historical':
          categoryPrompt = "Focus EXCLUSIVELY on historical events, political history, space exploration, aviation, and historical artifacts/memorabilia.";
          break;
        case 'comics':
          categoryPrompt = "Focus EXCLUSIVELY on comic books, super heroes, vintage toys, video game history, and pop culture collectibles.";
          break;
        case 'fine_art':
          categoryPrompt = "Focus EXCLUSIVELY on art history, famous painters, sculptures, art movements, and legendary art sales.";
          break;
        default:
          categoryPrompt = "Create a question about sports history, pop culture, cult classic movies, historic music events, or general memorabilia history.";
      }

      const prompt = `Create a challenging trivia question.
${categoryPrompt}

Generate a challenging but fair trivia question with 4 answer options where only one is correct.
Make it educational, interesting, and related to memorabilia/collectible culture if possible!`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: prompt,
        response_json_schema: {
          type: "object",
          properties: {
            question: { type: "string" },
            options: { 
              type: "array", 
              items: { type: "string" },
              minItems: 4,
              maxItems: 4
            },
            correct_answer_index: { type: "number" },
            explanation: { type: "string" }
          },
          required: ["question", "options", "correct_answer_index", "explanation"]
        }
      });

      setCurrentQuestion(response);
    } catch (error) {
      console.error("Error generating question:", error);
    } finally {
      setGeneratingQuestion(false);
    }
  };

  const awardXPMutation = useMutation({
    mutationFn: async (xpAmount) => {
      await base44.entities.XPEvent.create({
        user_id: user.id,
        user_email: user.email,
        action_type: "win_sweepstake",
        xp_amount: xpAmount,
        description: `Answered trivia question correctly (+${xpAmount} XP)`
      });
      
      await base44.auth.updateMe({
        xp: (user.xp || 0) + xpAmount
      });
    },
    onSuccess: () => {
      loadUser();
    },
  });

  const handleAnswerSelect = (answerIndex) => {
    if (showResult || !currentQuestion) return;

    setSelectedAnswer(answerIndex);
    const correct = answerIndex === currentQuestion.correct_answer_index;
    setIsCorrect(correct);
    setShowResult(true);

    if (correct) {
      const baseXP = 10;
      const streakBonus = Math.min(streak * 2, 20);
      const totalXP = baseXP + streakBonus;
      
      setScore(score + totalXP);
      setStreak(streak + 1);
      awardXPMutation.mutate(totalXP);
    } else {
      setStreak(0);
    }

    setQuestionsAnswered(questionsAnswered + 1);
  };

  const handleNextQuestion = () => {
    generateQuestion();
  };

  // Animated background rings
  const BackgroundRings = () => (
    <>
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border-2"
          style={{
            width: `${300 + i * 100}px`,
            height: `${300 + i * 100}px`,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            borderColor: i % 2 === 0 ? 'rgba(0, 255, 255, 0.3)' : 'rgba(255, 165, 0, 0.3)',
            boxShadow: i % 2 === 0 
              ? '0 0 20px rgba(0, 255, 255, 0.5)' 
              : '0 0 20px rgba(255, 165, 0, 0.5)',
          }}
          animate={{
            scale: [1, 1.05, 1],
            opacity: [0.5, 0.8, 0.5],
            rotate: i % 2 === 0 ? 360 : -360,
          }}
          transition={{
            duration: 8 + i * 2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.5,
          }}
        />
      ))}
    </>
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#0d1a29] to-[#00081a] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
          <p className="text-cyan-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0d1a29] to-[#00081a] relative overflow-hidden">
      {/* Animated Background Rings */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <BackgroundRings />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        {/* Hero Section with King Credion */}
        {!currentQuestion && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-12"
          >
            {/* King Credion Trivia Image */}
            <motion.div
              animate={{
                scale: [1, 1.01, 1],
                filter: [
                  "drop-shadow(0 0 10px rgba(0, 255, 255, 0.4))",
                  "drop-shadow(0 0 20px rgba(0, 255, 255, 0.7))",
                  "drop-shadow(0 0 10px rgba(0, 255, 255, 0.4))"
                ],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="mb-6"
            >
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/c02dba8cb_kingcredionTrivia.png"
                alt="King Credion Trivia"
                className="w-full max-w-2xl mx-auto"
              />
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 1 }}
              className="text-xl text-cyan-400 mb-8 font-light tracking-wide"
            >
              Test your sports, pop culture, and memorabilia knowledge
            </motion.p>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
              <StatCard 
                icon={Trophy} 
                value={user.xp || 0} 
                label="Total XP" 
                color="from-yellow-500 to-orange-500"
              />
              <StatCard 
                icon={Target} 
                value={score} 
                label="Session Score" 
                color="from-cyan-500 to-blue-500"
              />
              <StatCard 
                icon={Zap} 
                value={streak} 
                label="Streak" 
                color="from-purple-500 to-pink-500"
              />
              <StatCard 
                icon={Star} 
                value={questionsAnswered} 
                label="Answered" 
                color="from-green-500 to-emerald-500"
              />
            </div>

            {/* Category Selection */}
            <div className="mb-10 text-left">
              <h3 className="text-cyan-400 font-bold text-lg mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Select Category
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {Object.entries(CATEGORY_STRUCTURE).map(([key, category]) => (
                  <motion.button
                    key={key}
                    onClick={() => setSelectedCategory(key)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`relative overflow-hidden rounded-xl p-3 text-left transition-all duration-300 h-full ${
                      selectedCategory === key
                        ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0d1a29] shadow-[0_0_15px_rgba(34,211,238,0.5)]'
                        : 'opacity-70 hover:opacity-100 hover:shadow-lg'
                    }`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${category.gradient} opacity-20`} />
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="text-2xl mb-2">{category.icon}</div>
                      <h3 className="text-white font-bold text-sm leading-tight mb-1">{category.label}</h3>
                      <p className="text-cyan-200/70 text-[10px] leading-tight">
                        {category.description}
                      </p>
                    </div>
                    {selectedCategory === key && (
                      <div className="absolute inset-0 border-2 border-cyan-400/50 rounded-xl pointer-events-none" />
                    )}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Start Button */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                onClick={generateQuestion}
                disabled={generatingQuestion}
                className="bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 hover:from-cyan-600 hover:via-blue-700 hover:to-purple-700 text-white text-xl px-12 py-6 rounded-full shadow-2xl relative overflow-hidden group"
              >
                <span className="relative z-10 flex items-center gap-3">
                  {generatingQuestion ? (
                    <>
                      <RefreshCw className="w-6 h-6 animate-spin" />
                      Generating Question...
                    </>
                  ) : (
                    <>
                      <Brain className="w-6 h-6" />
                      Start Trivia Challenge
                      <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-purple-500 opacity-0 group-hover:opacity-30"
                  animate={{
                    x: ['-100%', '100%'],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                />
              </Button>
            </motion.div>

            {/* How It Works */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="mt-12 bg-gray-900/40 backdrop-blur-md border border-cyan-500/20 rounded-2xl p-6"
            >
              <h3 className="text-cyan-400 font-bold text-lg mb-4 flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5" />
                How It Works
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-300">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-cyan-400 font-bold">1</span>
                  </div>
                  <div>
                    <p className="font-semibold text-white mb-1">Answer Questions</p>
                    <p className="text-xs">Test your knowledge about sports history, cult movies, and pop culture collectibles</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-purple-400 font-bold">2</span>
                  </div>
                  <div>
                    <p className="font-semibold text-white mb-1">Build Streaks</p>
                    <p className="text-xs">Earn bonus XP for consecutive correct answers (up to +20 XP per question)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-orange-400 font-bold">3</span>
                  </div>
                  <div>
                    <p className="font-semibold text-white mb-1">Climb Ranks</p>
                    <p className="text-xs">XP helps you level up your auditor rank and unlock rewards</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Question Display */}
        <AnimatePresence mode="wait">
          {currentQuestion && (
            <motion.div
              key={currentQuestion.question}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="bg-gray-900/80 backdrop-blur-xl border-2 border-cyan-500/30 shadow-2xl relative overflow-hidden">
                {/* Glowing border effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/20 to-cyan-500/0 animate-pulse pointer-events-none" />
                
                <CardHeader className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <Badge className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                      Question #{questionsAnswered + 1}
                    </Badge>
                    {streak > 0 && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-2 bg-purple-500/20 text-purple-400 border border-purple-500/30 px-3 py-1 rounded-full"
                      >
                        <Zap className="w-4 h-4" />
                        {streak} Streak
                      </motion.div>
                    )}
                  </div>
                  
                  <CardTitle className="text-2xl text-white mb-4 leading-relaxed">
                    {currentQuestion.question}
                  </CardTitle>

                  {showResult && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className={`mt-4 p-4 rounded-lg border-2 ${
                        isCorrect 
                          ? 'bg-green-500/10 border-green-500/50 text-green-400' 
                          : 'bg-red-500/10 border-red-500/50 text-red-400'
                      }`}
                    >
                      <p className="font-semibold mb-2 flex items-center gap-2">
                        {isCorrect ? (
                          <>
                            <Trophy className="w-5 h-5" />
                            Correct! {streak > 1 ? `${streak} in a row!` : ''}
                          </>
                        ) : (
                          <>
                            <Target className="w-5 h-5" />
                            Not quite...
                          </>
                        )}
                      </p>
                      <p className="text-sm text-gray-300">{currentQuestion.explanation}</p>
                      {isCorrect && (
                        <p className="text-sm mt-2 text-cyan-400 font-semibold">
                          +{10 + Math.min(streak - 1, 10) * 2} XP earned!
                        </p>
                      )}
                    </motion.div>
                  )}
                </CardHeader>

                <CardContent className="space-y-3 relative">
                  {currentQuestion.options.map((option, index) => {
                    const isSelected = selectedAnswer === index;
                    const isCorrectAnswer = index === currentQuestion.correct_answer_index;
                    const showCorrect = showResult && isCorrectAnswer;
                    const showIncorrect = showResult && isSelected && !isCorrectAnswer;

                    return (
                      <motion.button
                        key={index}
                        onClick={() => handleAnswerSelect(index)}
                        disabled={showResult}
                        whileHover={{ scale: showResult ? 1 : 1.02 }}
                        whileTap={{ scale: showResult ? 1 : 0.98 }}
                        className={`w-full p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden group ${
                          showCorrect
                            ? 'bg-green-500/20 border-green-500 text-green-400'
                            : showIncorrect
                            ? 'bg-red-500/20 border-red-500 text-red-400'
                            : isSelected
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                            : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-cyan-500/50 hover:bg-gray-800/80'
                        }`}
                      >
                        <span className="relative z-10 flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            showCorrect
                              ? 'bg-green-500 text-white'
                              : showIncorrect
                              ? 'bg-red-500 text-white'
                              : isSelected
                              ? 'bg-cyan-500 text-white'
                              : 'bg-gray-700 text-gray-400 group-hover:bg-cyan-500/30 group-hover:text-cyan-400'
                          }`}>
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span className="flex-1">{option}</span>
                          {showCorrect && <Trophy className="w-5 h-5" />}
                        </span>
                        
                        {/* Hover glow effect */}
                        {!showResult && (
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/10 to-cyan-500/0"
                            initial={{ x: '-100%' }}
                            whileHover={{ x: '100%' }}
                            transition={{ duration: 0.6 }}
                          />
                        )}
                      </motion.button>
                    );
                  })}

                  {showResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="pt-6 flex gap-3"
                    >
                      <Button
                        onClick={handleNextQuestion}
                        disabled={generatingQuestion}
                        className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white py-6"
                      >
                        {generatingQuestion ? (
                          <>
                            <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            Next Question
                            <ArrowRight className="w-5 h-5 ml-2" />
                          </>
                        )}
                      </Button>
                      
                      <Link to={createPageUrl("VettingQueue")} className="flex-1">
                        <Button
                          variant="outline"
                          className="w-full border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 py-6"
                        >
                          Back to Auditing
                        </Button>
                      </Link>
                    </motion.div>
                  )}
                </CardContent>
              </Card>

              {/* Progress Stats */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6"
              >
                <StatCard 
                  icon={Trophy} 
                  value={score} 
                  label="Session Score" 
                  color="from-cyan-500 to-blue-500"
                  small
                />
                <StatCard 
                  icon={Zap} 
                  value={streak} 
                  label="Current Streak" 
                  color="from-purple-500 to-pink-500"
                  small
                />
                <StatCard 
                  icon={Star} 
                  value={questionsAnswered} 
                  label="Answered" 
                  color="from-green-500 to-emerald-500"
                  small
                />
                <StatCard 
                  icon={TrendingUp} 
                  value={user.xp || 0} 
                  label="Total XP" 
                  color="from-yellow-500 to-orange-500"
                  small
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating particles effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-cyan-400 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ icon: Icon, value, label, color, small = false }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05, y: -5 }}
      className={`bg-gray-900/60 backdrop-blur-md border border-cyan-500/20 rounded-xl ${small ? 'p-3' : 'p-4'} relative overflow-hidden group`}
    >
      <div className={`absolute inset-0 bg-gradient-to-r ${color} opacity-10 group-hover:opacity-20 transition-opacity`} />
      <div className="relative flex items-center justify-between">
        <div>
          <p className={`${small ? 'text-2xl' : 'text-3xl'} font-bold text-white mb-1`}>{value}</p>
          <p className={`${small ? 'text-xs' : 'text-sm'} text-gray-400`}>{label}</p>
        </div>
        <Icon className={`${small ? 'w-8 h-8' : 'w-10 h-10'} text-cyan-400 opacity-50`} />
      </div>
    </motion.div>
  );
}