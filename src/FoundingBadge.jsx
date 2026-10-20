import React from 'react';
import { FOUNDING_BADGE, FOUNDING_FEE_NOTE } from './founding.js';
import './founding.css';

// The artwork alone: two sizes (460 and 920 wide), both transparent WebP, so phones do not download the large one.
export function FoundingBadgeImage({ className = '' }) {
  return <img className={`founding-badge-img ${className}`.trim()} src={FOUNDING_BADGE.src} srcSet={FOUNDING_BADGE.srcSet} sizes="(max-width: 640px) 280px, 360px" width={FOUNDING_BADGE.width} height={FOUNDING_BADGE.height} alt={FOUNDING_BADGE.alt}/>;
}

// Replaces the "AI-Powered Marketplace" badge in the hero for a signed-in Founding seller, with the fee note under it. It is only a picture of a status the
// server already holds: no fee is ever decided from it.
export function FoundingHeroBadge() {
  return <div className="founding-hero-badge">
    <FoundingBadgeImage/>
    <p className="founding-badge-note">{FOUNDING_FEE_NOTE}</p>
  </div>;
}
