import React from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigation } from "@/lib/NavigationContext";

/**
 * Global mobile navigation header bar.
 * - Shows a back button when there's a page to go back to (child screen).
 * - Shows nothing on root screens (back button is absent).
 * Only visible on mobile (md:hidden).
 * Provides native iPhone-like experience with proper accessibility.
 */
export default function GlobalNavHeader({ title }) {
  const nav = useNavigation();

  if (!nav?.canGoBack) return null;

  return (
    <div 
      className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-gray-200/50 dark:border-white/5 bg-white/98 dark:bg-card/95 backdrop-blur-xl sticky top-0 z-40 safe-top"
      style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
    >
      <button
        onClick={nav.goBack}
        className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold py-2 px-1 active:opacity-50 transition-opacity rounded-lg min-h-[44px] min-w-[44px] flex-shrink-0 -ml-1"
        style={{ WebkitTapHighlightColor: "transparent" }}
        aria-label="Go back"
      >
        <ChevronLeft className="w-6 h-6" />
        <span className="text-base">Back</span>
      </button>
      {title && (
        <span className="text-base font-semibold text-gray-900 dark:text-foreground truncate flex-1 text-center">
          {title}
        </span>
      )}
    </div>
  );
}