import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useReducedMotion } from "framer-motion";

/**
 * RouteProgressBar — thin top-of-shell loading indicator.
 * Appears instantly on route change, completes + fades out quickly.
 * Skips animation entirely for reduced-motion users.
 */
export default function RouteProgressBar() {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef(null);
  const completeRef = useRef(null);
  const fadeRef = useRef(null);
  const keyRef = useRef(location.key);

  const clearAll = () => {
    clearTimeout(timerRef.current);
    clearTimeout(completeRef.current);
    clearTimeout(fadeRef.current);
  };

  useEffect(() => {
    // Skip on first mount (same key) and for reduced-motion
    if (location.key === keyRef.current) return;
    keyRef.current = location.key;

    if (prefersReducedMotion) return;

    clearAll();

    // Immediately show at ~20% so it feels instant
    setVisible(true);
    setWidth(20);

    // Quickly advance to ~80% to imply progress
    timerRef.current = setTimeout(() => setWidth(80), 80);

    // Complete to 100% after a short delay
    completeRef.current = setTimeout(() => setWidth(100), 350);

    // Fade out after complete
    fadeRef.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 600);

    return clearAll;
  }, [location.key, prefersReducedMotion]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "2px",
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: "linear-gradient(90deg, #3b82f6 0%, #8b5cf6 60%, #ec4899 100%)",
          transition: width === 20
            ? "none"
            : width === 80
            ? "width 0.25s ease-out"
            : "width 0.2s ease-in-out",
          boxShadow: "0 0 8px rgba(139,92,246,0.6)",
        }}
      />
    </div>
  );
}