import React, { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * GlassIcon — premium neon-glassmorphism icon wrapper.
 *
 * Props:
 *   color   — "blue" | "orange" | "green" | "purple" | "pink" | "amber" (role-based glow)
 *   active  — boolean, stronger glow when selected/active
 *   size    — "sm" | "md" | "lg"
 *   className — additional classes
 *   onClick — optional click handler
 */
const GLOW = {
  blue:   { shadow: "0 0 10px rgba(59,130,246,0.55), 0 0 22px rgba(59,130,246,0.3)",   hover: "0 0 16px rgba(59,130,246,0.75), 0 0 32px rgba(59,130,246,0.45)" },
  orange: { shadow: "0 0 10px rgba(245,158,11,0.55),  0 0 22px rgba(245,158,11,0.3)",  hover: "0 0 16px rgba(245,158,11,0.75),  0 0 32px rgba(245,158,11,0.45)"  },
  green:  { shadow: "0 0 10px rgba(16,185,129,0.55),  0 0 22px rgba(16,185,129,0.3)",  hover: "0 0 16px rgba(16,185,129,0.75),  0 0 32px rgba(16,185,129,0.45)"  },
  purple: { shadow: "0 0 10px rgba(139,92,246,0.55),  0 0 22px rgba(139,92,246,0.3)",  hover: "0 0 16px rgba(139,92,246,0.75),  0 0 32px rgba(139,92,246,0.45)"  },
  pink:   { shadow: "0 0 10px rgba(236,72,153,0.55),  0 0 22px rgba(236,72,153,0.3)",  hover: "0 0 16px rgba(236,72,153,0.75),  0 0 32px rgba(236,72,153,0.45)"  },
  amber:  { shadow: "0 0 10px rgba(217,119,6,0.55),   0 0 22px rgba(217,119,6,0.3)",   hover: "0 0 16px rgba(217,119,6,0.75),   0 0 32px rgba(217,119,6,0.45)"   },
  white:  { shadow: "0 0 10px rgba(255,255,255,0.25), 0 0 22px rgba(255,255,255,0.12)", hover: "0 0 16px rgba(255,255,255,0.4),  0 0 32px rgba(255,255,255,0.2)"  },
};

const SIZE = {
  sm: "p-1.5 rounded-xl",
  md: "p-2.5 rounded-2xl",
  lg: "p-3.5 rounded-2xl",
};

export default function GlassIcon({
  children,
  color = "blue",
  active = false,
  size = "md",
  className,
  onClick,
  style,
  ...props
}) {
  const glow = GLOW[color] || GLOW.blue;
  const [hovered, setHovered] = useState(false);

  const boxShadow = active || hovered ? glow.hover : glow.shadow;

  return (
    <div
      className={cn(
        "glass-icon-base",
        SIZE[size],
        active && "glass-icon-active",
        onClick && "active:scale-[0.97]",
        className
      )}
      style={{
        boxShadow,
        cursor: onClick ? "pointer" : undefined,
        transition: onClick ? "transform 0.1s ease" : undefined,
        ...style,
      }}
      onTouchStart={onClick ? () => {} : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * GlassNavIcon — convenience wrapper for sidebar/nav items.
 * Accepts an icon component + label, renders a glass pill when active.
 */
export function GlassNavIcon({ icon: Icon, label, active, color = "blue", iconClassName = "w-5 h-5", onClick }) {
  return (
    <GlassIcon color={color} active={active} size="sm" onClick={onClick} className={active ? "" : "!bg-transparent !border-transparent !shadow-none hover:!bg-white/5"}>
      <Icon className={cn(iconClassName, "transition-colors")} />
      {label && <span className="sr-only">{label}</span>}
    </GlassIcon>
  );
}