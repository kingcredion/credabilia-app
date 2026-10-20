import React, { useState } from 'react';
import { Crown } from 'lucide-react';
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

// A small, quiet marker next to a Founding seller's name. Buyers see it on cards, item pages and the storefront.
export function FoundingChip() {
  return <span className="founding-chip" title="Founding 100 seller"><Crown size={11} aria-hidden="true"/> Founding seller</span>;
}

// Shown once to a Founding seller after they claim, on the home page. Remembered in this browser; if the browser cannot remember, it stays hidden rather than nagging.
export const foundingWelcomeKey = userId => 'credabilia:founding-welcome-seen:' + userId;
export function FoundingWelcome({ userId }) {
  const key = foundingWelcomeKey(userId);
  const [open, setOpen] = useState(() => { try { return !window.localStorage.getItem(key); } catch { return false; } });
  if (!open) return null;
  function close() { try { window.localStorage.setItem(key, '1'); } catch { /* fine */ } setOpen(false); }
  return <section className="founding-welcome" aria-label="Welcome, Founding seller">
    <Crown size={22} aria-hidden="true"/>
    <div>
      <strong>Welcome, Founding seller.</strong>
      <p>You're one of 100 Founding sellers. Credabilia charges you no selling fee for as long as your account stays open and in good standing. Payment-processing fees still apply and show as their own line on each sale.</p>
      <p><a href="/founding">How it works</a> <button type="button" className="text-button" onClick={close}>Got it</button></p>
    </div>
  </section>;
}
