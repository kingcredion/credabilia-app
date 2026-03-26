import React, { useState, useRef, useCallback } from "react";
import { RefreshCw } from "lucide-react";

const PULL_THRESHOLD = 70;

// Only activate pull-to-refresh on touch/coarse pointer devices
const isTouchDevice =
  typeof window !== "undefined" &&
  (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window);

/**
 * PullToRefresh
 *
 * mode="page"      (default) — does NOT create its own scroll container.
 *                  Reads scroll position from scrollContainerRef if provided,
 *                  otherwise falls back to window.scrollY.
 *
 * mode="container" — opt-in: wraps children in h-full overflow-auto.
 *                  Only use when this component IS the scroll owner.
 *
 * scrollContainerRef — ref to an explicit scroll container element.
 *                  When provided, scrollTop is read from that element.
 */
export default function PullToRefresh({ onRefresh, children, mode = "page", scrollContainerRef }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(null);
  const pulling = useRef(false);

  // On non-touch devices, skip all pull behavior entirely
  if (!isTouchDevice) {
    return (
      <div className={mode === "container" ? "h-full overflow-auto" : "w-full"}>
        {children}
      </div>
    );
  }

  const getScrollTop = useCallback(() => {
    // Only read from explicit scroll container ref, no window fallback
    if (scrollContainerRef?.current) {
      return scrollContainerRef.current.scrollTop;
    }
    return null;
  }, [scrollContainerRef]);

  const handleTouchStart = useCallback((e) => {
    if (refreshing) return;
    const scrollTop = getScrollTop();
    // Only activate if scrollContainerRef is provided AND at scroll top
    if (scrollTop === 0 && scrollContainerRef?.current) {
      startY.current = e.touches[0].clientY;
      pulling.current = false;
    } else {
      startY.current = null;
    }
  }, [refreshing, getScrollTop, scrollContainerRef]);

  const handleTouchMove = useCallback((e) => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;

    if (delta > 0) {
      // Only lock scroll and show indicator once clearly pulling (>8px) at the top
      // Only activate if scrollContainerRef is provided AND at scroll top
      if (delta > 8 && getScrollTop() === 0 && scrollContainerRef?.current) {
        pulling.current = true;
        e.preventDefault();
      }
      if (pulling.current) {
        setPullDistance(Math.min(delta * 0.5, PULL_THRESHOLD + 20));
      }
    } else {
      // User scrolling up — allow normal scroll, reset state
      if (pullDistance > 0) setPullDistance(0);
      startY.current = null;
      pulling.current = false;
    }
  }, [refreshing, pullDistance, getScrollTop, scrollContainerRef]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      try {
        await onRefresh?.();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    startY.current = null;
    pulling.current = false;
  }, [pullDistance, refreshing, onRefresh]);

  const containerRef = scrollContainerRef || useRef(null);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const containerClass = mode === "container" ? "h-full overflow-auto" : "w-full";

  return (
    <div
      ref={containerRef}
      className={containerClass}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-busy={refreshing ? "true" : "false"}
    >
      {pullDistance > 0 && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all duration-200 bg-background dark:bg-card"
          style={{ height: pullDistance }}
        >
          <RefreshCw
            className={`w-5 h-5 text-primary ${refreshing ? "animate-spin" : ""}`}
            style={{ transform: `rotate(${progress * 360}deg)`, opacity: progress }}
            aria-hidden="true"
          />
        </div>
      )}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {refreshing ? "Refreshing content..." : ""}
      </div>
      {children}
    </div>
  );
}