import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X, ChevronRight, ChevronLeft, HelpCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";

const TUTORIAL_STEPS = [
  {
    targetId: null, // Center screen
    title: "Welcome to Credabilia!",
    content: "Let's take a quick tour of your new dashboard. This guide will help you navigate the platform's key features.",
    position: "center"
  },
  {
    targetId: "sidebar-role-switcher",
    title: "Switch Roles",
    content: "Easily switch between your different profiles (Collector, Vendor, Artist, etc.) here. Each role has its own unique dashboard.",
    position: "right"
  },
  {
    targetId: "sidebar-role-menu",
    title: "Role Menu",
    content: "Access features specific to your current role. This menu changes based on which role you have selected.",
    position: "right"
  },
  {
    targetId: "sidebar-quick-access",
    title: "Quick Access",
    content: "Jump to the most important pages like the Marketplace, Reward Center, and Directories.",
    position: "right"
  },
  {
    targetId: "sidebar-special-features",
    title: "Special Features",
    content: "If you have a special account (Artist, Shop, Influencer), your dedicated dashboard links will appear here.",
    position: "right"
  },
  {
    targetId: "sidebar-help",
    title: "Help & Support",
    content: "Need assistance? Contact our support team or King Credion directly from here.",
    position: "right"
  },
  {
    targetId: "sidebar-settings",
    title: "Settings",
    content: "Manage your account, billing, and security preferences here.",
    position: "right"
  },
  {
    targetId: "sidebar-tutorial-toggle",
    title: "Tutorial Control",
    content: "You can turn this tutorial mode on or off at any time using this switch.",
    position: "right"
  }
];

export default function TutorialOverlay({ user, onClose }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);

  useEffect(() => {
    // Skip steps that target missing elements
    const step = TUTORIAL_STEPS[currentStep];
    if (step.targetId) {
      const element = document.getElementById(step.targetId);
      if (!element) {
        // If element doesn't exist, skip to next
        if (currentStep < TUTORIAL_STEPS.length - 1) {
          setCurrentStep(c => c + 1);
        } else {
          // If it's the last step and missing, just close or stay (logic depending on needs)
          // For now, let's just not show highlight but show modal
          setTargetRect(null);
        }
        return;
      }
      
      const rect = element.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom
      });
    } else {
      setTargetRect(null);
    }
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(c => c + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(c => c - 1);
    }
  };

  const step = TUTORIAL_STEPS[currentStep];

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Dark Backdrop with Hole */}
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70 pointer-events-auto transition-colors duration-300">
        {targetRect && (
          <div 
            className="absolute bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] rounded-lg transition-all duration-300 ease-in-out border-2 border-white/50 animate-pulse"
            style={{
              top: targetRect.top - 8,
              left: targetRect.left - 8,
              width: targetRect.width + 16,
              height: targetRect.height + 16,
            }}
          />
        )}
      </div>

      {/* Tutorial Card */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.3 }}
          className="pointer-events-auto bg-white dark:bg-card rounded-2xl shadow-xl dark:shadow-2xl p-6 md:p-7 w-[92%] max-w-md relative z-[101] dark:border dark:border-border/50 overflow-hidden"
          style={{
            position: 'absolute',
            ...(step.position === 'center' ? {} : {
              top: targetRect ? Math.max(16, Math.min(window.innerHeight - 320, targetRect.top)) : '50%',
              left: targetRect ? targetRect.right + 16 : '50%',
              transform: step.position === 'center' ? 'translate(-50%, -50%)' : 'translate(0, 0)',
            })
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-100 dark:bg-blue-500/20 p-2.5 rounded-lg text-blue-600 dark:text-blue-400">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-base md:text-lg text-gray-900 dark:text-foreground leading-tight">{step.title}</h3>
              <p className="text-xs text-gray-500 dark:text-muted-foreground mt-0.5">Step {currentStep + 1} of {TUTORIAL_STEPS.length}</p>
            </div>
            <Button variant="ghost" size="icon" className="ml-2 flex-shrink-0 h-8 w-8 rounded-lg active:bg-gray-100 dark:active:bg-white/10" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-gray-600 dark:text-muted-foreground mb-6 md:mb-7 leading-relaxed text-sm md:text-base">
            {step.content}
          </p>

          <div className="flex justify-between items-center gap-3">
            <Button 
              variant="ghost" 
              onClick={handlePrev} 
              disabled={currentStep === 0}
              className="text-gray-500 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground active:bg-gray-100 dark:active:bg-white/10 rounded-lg disabled:opacity-40 transition-all"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div className="flex gap-2">
              <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 active:bg-blue-800 dark:active:bg-blue-800 text-white transition-colors rounded-lg font-medium">
                {currentStep === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next'}
                {currentStep !== TUTORIAL_STEPS.length - 1 && <ChevronRight className="w-4 h-4 ml-1" />}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}