import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle } from "lucide-react";

export default function TermsAcceptanceCheckbox({ 
  checked = false, 
  onChange,
  variant = "default" // default, compact, checkout
}) {
  if (variant === "compact") {
    return (
      <div className="flex items-start gap-3">
        <Checkbox 
          id="terms-accept" 
          checked={checked} 
          onCheckedChange={onChange}
          className="mt-1 flex-shrink-0"
        />
        <label htmlFor="terms-accept" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          I agree to the{" "}
          <Link to={createPageUrl("Terms")} className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline">
            Terms of Service
          </Link>
          {" "}and{" "}
          <Link to={createPageUrl("Privacy")} className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline">
            Privacy Policy
          </Link>
        </label>
      </div>
    );
  }

  if (variant === "checkout") {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Checkbox 
            id="checkout-terms" 
            checked={checked} 
            onCheckedChange={onChange}
            className="mt-1 flex-shrink-0"
          />
          <div className="flex-1">
            <label htmlFor="checkout-terms" className="text-sm text-gray-900 dark:text-white font-semibold cursor-pointer mb-2 block">
              By completing this purchase, you agree:
            </label>
            <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1 ml-0">
              <li>
                • Vendor is solely responsible for item authenticity and fulfillment
              </li>
              <li>
                • Platform is not liable for transaction disputes or item quality
              </li>
              <li>
                • You have read our{" "}
                <Link to={createPageUrl("Terms")} className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline font-semibold">
                  Terms
                </Link>
                , 
                <Link to={createPageUrl("Privacy")} className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline font-semibold">
                  {" "}Privacy Policy
                </Link>
                , and{" "}
                <Link to={createPageUrl("RefundPolicy")} className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline font-semibold">
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Default variant - full info box
  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <AlertCircle className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 dark:text-white mb-2">
            Legal Agreements
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
            By using Credabilia, you agree to our Terms of Service, Privacy Policy, and other policies. Please review them carefully.
          </p>
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-3 p-2 bg-white dark:bg-white/[0.05] rounded-lg">
              <Checkbox 
                id="terms-full" 
                checked={checked} 
                onCheckedChange={onChange}
                className="flex-shrink-0"
              />
              <label htmlFor="terms-full" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer flex-1">
                I understand and agree to all terms and policies
              </label>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Link 
              to={createPageUrl("Terms")} 
              className="bg-white dark:bg-white/[0.08] hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 px-3 py-2 rounded-lg text-center font-semibold transition-colors"
            >
              Terms
            </Link>
            <Link 
              to={createPageUrl("Privacy")} 
              className="bg-white dark:bg-white/[0.08] hover:bg-purple-100 dark:hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 px-3 py-2 rounded-lg text-center font-semibold transition-colors"
            >
              Privacy
            </Link>
            <Link 
              to={createPageUrl("RefundPolicy")} 
              className="bg-white dark:bg-white/[0.08] hover:bg-orange-100 dark:hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 px-3 py-2 rounded-lg text-center font-semibold transition-colors"
            >
              Refunds
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}