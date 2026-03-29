import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, CheckCircle2, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";

export default function StripeRestrictionModal({ open, onClose, user }) {
  const createAccountMutation = useMutation({
    mutationFn: async () => {
      const returnUrl = window.location.origin + '/Settings';
      const response = await base44.functions.invoke('stripeConnect', {
        action: 'create_account',
        returnUrl
      });
      if (response.data?.url) {
        const newWin = window.open(response.data.url, '_blank', 'noopener,noreferrer');
        if (!newWin) {
          window.location.href = response.data.url;
        }
      }
    },
    onSuccess: () => {
      onClose();
    },
    onError: (error) => {
      console.error("Failed to initiate Stripe connection:", error);
      alert(error?.message || "Failed to connect to Stripe. Please try again.");
    }
  });

  const features = [
    { text: "Accept payments instantly", highlight: "instantly" },
    { text: "Get paid automatically", highlight: "paid automatically" },
    { text: "Sell as a verified vendor", highlight: "verified vendor" },
    { text: "Access Credion Credits", highlight: "Credion Credits" },
    { text: "Higher trust & visibility score", highlight: null },
    { text: "Vendor dashboard + analytics", highlight: null }
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0 shadow-2xl">
        <div className="bg-white">
          <div className="text-center pt-5 pb-1 px-6">
            <h2 className="text-xl font-bold text-blue-900 mb-1">
              Unlock <span className="text-yellow-600">Royal Access</span>
            </h2>
            <p className="text-gray-600 text-xs">
              Connect Stripe to activate verified selling, payouts, and elite platform features.
            </p>
          </div>

          <div className="relative mt-2">
            {/* Robot Image */}
            <div className="flex justify-center -mb-6 z-10 relative">
               <img 
                 src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/690badbd56a85b130b88aa42/7b254c51c_Photoroom_20251219_154700.png" 
                 alt="Credabilia Royal Access" 
                 className="h-28 w-auto object-contain drop-shadow-xl"
               />
            </div>

            {/* Features List with Background */}
            <div className="bg-gradient-to-b from-blue-50 to-white pt-8 pb-4 px-6 rounded-t-3xl border-t border-blue-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] relative z-0 mt-[-16px]">
              <div className="space-y-2 mt-2">
                {features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="bg-blue-100 p-1 rounded-full flex-shrink-0">
                        {idx < 4 ? (
                             <Lock className="w-3 h-3 text-blue-600" />
                        ) : (
                             <CheckCircle2 className="w-3 h-3 text-green-600" />
                        )}
                    </div>
                    <span className="text-sm text-gray-700">
                      {feature.highlight ? (
                        <>
                          {feature.text.split(feature.highlight)[0]}
                          <span className="font-semibold text-blue-700">{feature.highlight}</span>
                          {feature.text.split(feature.highlight)[1]}
                        </>
                      ) : (
                        feature.text
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <Button 
                  onClick={() => createAccountMutation.mutate()}
                  disabled={createAccountMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 shadow-lg shadow-blue-200 transition-all hover:scale-[1.02]"
                >
                  {createAccountMutation.isPending ? "Opening Stripe..." : "Connect Stripe Account"}
                   {!createAccountMutation.isPending && <ArrowRight className="w-5 h-5 ml-2" />}
                </Button>
                <p className="text-center text-xs text-gray-400 mt-3">
                  Secure payments powered by Stripe
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}