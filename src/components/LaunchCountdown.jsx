import React from "react";
import { Badge } from "@/components/ui/badge";
import { Zap, AlertCircle, MessageSquare, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function LaunchCountdown({ variant = "compact", showIcon = true }) {
  if (variant === "compact") {
    return (
      <motion.div 
        animate={{ 
          scale: [1, 1.02, 1],
          boxShadow: ["0 4px 6px -1px rgba(0, 0, 0, 0.1)", "0 0 15px rgba(16, 185, 129, 0.5)", "0 4px 6px -1px rgba(0, 0, 0, 0.1)"]
        }}
        transition={{ duration: 2, repeat: Infinity }}
        className="flex items-center gap-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-2 rounded-full border border-white/20"
      >
        {showIcon && <Zap className="w-5 h-5" />}
        <div className="flex flex-col items-center">
          <span className="text-xs font-bold uppercase tracking-widest text-green-100">Beta Phase</span>
          <span className="font-bold text-lg">Early User Access</span>
        </div>
      </motion.div>
    );
  }

  if (variant === "badge") {
    return (
      <Badge className="bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold">
        <Zap className="w-3 h-3 mr-1" />
        Beta Phase
      </Badge>
    );
  }

  if (variant === "hero") {
    return (
      <div className="text-center py-12 px-6 bg-gradient-to-br from-green-50 via-emerald-50 to-blue-50 rounded-2xl border-4 border-green-300 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-64 h-64 bg-green-500 rounded-full filter blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-500 rounded-full filter blur-3xl"></div>
        </div>

        <div className="relative">
          <Zap className="w-20 h-20 text-green-600 mx-auto mb-6" />

          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4 flex items-center justify-center gap-3">
            <Sparkles className="w-8 h-8 text-green-500 flex-shrink-0" />
            Officially Launched! You're an Early User
          </h2>
          
          <p className="text-lg md:text-xl text-gray-700 mb-6 max-w-2xl mx-auto">
            <strong className="text-green-600">We're in beta phase</strong> and evolving rapidly. This is a complex platform with multiple roles, marketplaces, and features.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto mb-8">
            <div className="bg-amber-50 rounded-xl p-6 border-2 border-amber-300">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-left">
                  <h3 className="font-bold text-amber-900 mb-2">Help Us Improve</h3>
                  <p className="text-sm text-amber-800 mb-3">
                    Found a bug? Experiencing issues? Have feedback? Please report it in the <strong>Help & Support Center</strong>
                  </p>
                  <a href="/CredionSupport" className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
                    <MessageSquare className="w-4 h-4" />
                    Report Bug
                  </a>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl p-6 bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 shadow-lg border-2 border-purple-300">
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-0 right-0 w-40 h-40 bg-white rounded-full filter blur-2xl"></div>
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-white rounded-full filter blur-2xl"></div>
              </div>
              <div className="relative z-10">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-6 h-6 text-white flex-shrink-0 mt-0.5 animate-pulse" />
                  <div className="text-left">
                    <h3 className="font-bold text-white mb-2">AI-Powered Reporting</h3>
                    <p className="text-sm text-white/90 mb-3">
                      When you report bugs, generate AI-crafted prompts and copy them instantly for quick developer fixes
                    </p>
                    <a href="/CredionSupport" className="inline-flex items-center gap-2 bg-white hover:bg-gray-100 text-blue-600 px-4 py-2 rounded-lg font-medium transition-colors text-sm font-semibold">
                      <Sparkles className="w-4 h-4" />
                      Try It Now
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-2xl mx-auto">
            <p className="text-sm text-gray-600 mb-4">
              With <strong>multiple roles</strong> (Collector, Vendor, Auditor, Frame Shop, Influencer, Artist), a <strong>full marketplace</strong>, <strong>payment processing</strong>, <strong>auctions</strong>, <strong>commissions</strong>, and more — there's a lot happening. We're continuously improving your experience.
            </p>
            <p className="text-sm text-gray-600">
              Thank you for being part of the journey!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}