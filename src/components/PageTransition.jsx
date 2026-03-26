import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { useNavigation } from "@/lib/NavigationContext";

function getVariants(direction, prefersReducedMotion) {
  if (prefersReducedMotion) {
    // No animation if reduced motion is preferred
    return {
      initial: { opacity: 1, x: 0 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 1, x: 0 },
    };
  }

  // Tab changes and replaces: minimal/no slide
  if (direction === "tab" || direction === "replace") {
    return {
      initial: { opacity: 0.98, x: 0 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0.98, x: 0 },
    };
  }

  // Push: slide in from right
  if (direction === "push") {
    return {
      initial: { opacity: 0.98, x: 28 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0.99, x: -12 },
    };
  }

  // Pop: slide in from left
  return {
    initial: { opacity: 0.98, x: -28 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0.99, x: 12 },
  };
}

export default function PageTransition({ children }) {
  const location = useLocation();
  const nav = useNavigation();
  const direction = nav?.direction ?? "push";
  const prefersReducedMotion = useReducedMotion();
  const variants = getVariants(direction, prefersReducedMotion);

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { type: "spring", stiffness: 380, damping: 34, mass: 0.9 };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname + location.search}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={transition}
        style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}