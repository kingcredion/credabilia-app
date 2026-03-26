import React from "react";
import { ChevronLeft } from "lucide-react";
import { useNavigation } from "@/lib/NavigationContext";

/**
 * Drop this at the top of any page that can be pushed onto the stack.
 * It only renders on mobile when there's something to go back to.
 */
export default function MobileBackButton({ label = "Back", className = "" }) {
  const nav = useNavigation();

  if (!nav?.canGoBack) return null;

  return (
    <button
      onClick={nav.goBack}
      className={`md:hidden flex items-center gap-1 text-blue-600 font-medium py-2 px-1 active:opacity-60 transition-opacity ${className}`}
      style={{
        WebkitTapHighlightColor: "transparent",
        minHeight: 44,
        minWidth: 44,
        background: "none",
        border: "none",
      }}
      aria-label="Go back"
    >
      <ChevronLeft className="w-5 h-5 flex-shrink-0" />
      <span className="text-sm">{label}</span>
    </button>
  );
}