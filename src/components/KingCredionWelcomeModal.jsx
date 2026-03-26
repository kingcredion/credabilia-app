import React from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function KingCredionWelcomeModal({ open, onClose, referredUser, referrerInfluencer }) {
  const [isProcessing, setIsProcessing] = React.useState(false);
  const processedRef = React.useRef(false); // Prevent duplicate processing on remounts

  const handleOpenSesame = async () => {
    if (!referredUser || !referrerInfluencer || isProcessing || processedRef.current) return;

    setIsProcessing(true);
    processedRef.current = true;
    
    try {
      // Check if already following to prevent duplicates
      const existingFollows = await base44.entities.Follow.filter({
        follower_email: referredUser.email,
        following_email: referrerInfluencer.user_email
      });

      if (existingFollows.length === 0) {
        // Create the follow relationship
        await base44.entities.Follow.create({
          follower_email: referredUser.email,
          follower_name: referredUser.full_name || referredUser.email,
          following_email: referrerInfluencer.user_email,
          following_name: referrerInfluencer.full_name || referrerInfluencer.user_email.split('@')[0]
        });

        // Update counts and send notification
        await Promise.all([
          base44.entities.Influencer.update(referrerInfluencer.id, {
            total_follows: (referrerInfluencer.total_follows || 0) + 1
          }),
          base44.auth.updateMe({
            following_count: (referredUser.following_count || 0) + 1
          }),
          base44.entities.Notification.create({
            user_email: referrerInfluencer.user_email,
            type: "follow",
            title: "🎉 New Referral Sign-Up!",
            message: `${referredUser.full_name || referredUser.email.split('@')[0]} just joined Credabilia through your referral link and followed you!`,
            link_url: `/Profile?email=${referredUser.email}`,
            related_user_email: referredUser.email
          })
        ]);
      }
    } catch (error) {
      console.error("Error during automatic follow:", error);
      processedRef.current = false; // Reset on error to allow retry
    } finally {
      setIsProcessing(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-md p-8 text-center rounded-2xl shadow-2xl border-4 border-orange-400 bg-gradient-to-br from-yellow-50 via-orange-50 to-yellow-100"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <motion.img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/6f55fc89c_Photoroom_20251116_214600.png"
            alt="Referred Access Badge"
            className="w-48 h-48 mx-auto mb-6 drop-shadow-2xl"
            animate={{ 
              rotate: [0, 5, -5, 0],
              scale: [1, 1.05, 1]
            }}
            transition={{ 
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          
          <h1 className="text-3xl font-bold text-gray-900 mb-4 leading-tight">
            You've Been Granted Access to the Credabilia Kingdom!
          </h1>
          
          <div className="text-base text-gray-700 leading-relaxed space-y-2 mb-6">
            <p>Someone from our kingdom personally recommended you...</p>
            <p>That means you're special, trusted, and early!</p>
            <p>We appreciate you for stepping into the world of real collectibles and real rewards.</p>
          </div>

          <p className="text-gray-800 text-lg font-semibold mb-6">
            Tap the button below to enter and unlock your journey.
          </p>

          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <Button
              onClick={handleOpenSesame}
              disabled={isProcessing}
              className="w-full py-4 text-2xl font-bold bg-gradient-to-r from-orange-500 to-yellow-500 text-white shadow-2xl hover:from-orange-600 hover:to-yellow-600 transition-all duration-300 transform hover:scale-105 disabled:opacity-50"
            >
              <motion.span
                animate={{ rotate: [0, -15, 15, -15, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                className="mr-2"
              >
                🔥
              </motion.span>
              {isProcessing ? 'Opening...' : 'Open Sesame'}
              <motion.span
                animate={{ rotate: [0, 15, -15, 15, 0] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                className="ml-2"
              >
                🔥
              </motion.span>
            </Button>
          </motion.div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}