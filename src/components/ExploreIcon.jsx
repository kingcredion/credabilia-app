import React from "react";

export default function ExploreIcon({ className = "w-5 h-5", ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Globe/Planet */}
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      
      {/* Two people/users on the globe */}
      {/* Person 1 - top right */}
      <circle cx="16" cy="7" r="1.5" fill="currentColor" />
      <path d="M16 8.5c-1 0-1.5 0.5-1.5 1.2v0.8h3v-0.8c0-0.7-0.5-1.2-1.5-1.2z" fill="currentColor" />
      
      {/* Person 2 - bottom left */}
      <circle cx="8" cy="15" r="1.5" fill="currentColor" />
      <path d="M8 16.5c-1 0-1.5 0.5-1.5 1.2v0.8h3v-0.8c0-0.7-0.5-1.2-1.5-1.2z" fill="currentColor" />
    </svg>
  );
}