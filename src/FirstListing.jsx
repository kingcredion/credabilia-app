import React from 'react';
import { Camera, ShieldCheck } from 'lucide-react';
import { PAYOUT_INTRO_POINTS, PAYOUT_INTRO_NOTE } from './firstListing.js';
import './firstListing.css';

// Shown at the top of Discover to a signed-in member who has never listed. One clear step; payouts come later.
export function FirstListingCard({ onStart, onDismiss, payoutsReady }) {
  return <section className="first-listing-card" aria-labelledby="first-listing-title">
    <img src="/brand/king-credion-photographing-jersey-360.webp" srcSet="/brand/king-credion-photographing-jersey-360.webp 360w, /brand/king-credion-photographing-jersey-540.webp 540w" sizes="(max-width: 640px) 130px, 176px" width="176" height="178" alt="King Credion photographing a signed jersey on a gold display stand" decoding="async"/>
    <div className="first-listing-copy">
      <p className="eyebrow"><span className="small-line"/>YOUR FIRST LISTING</p>
      <h2 id="first-listing-title">Turn one piece into your first sale</h2>
      <p>Take a photo and King Credion drafts the title, description and details. You review everything before it goes live. Credabilia only takes a fee when it sells.</p>
      <div className="first-listing-actions">
        <button type="button" className="primary" onClick={onStart}><Camera size={16}/> Start your first listing</button>
        <button type="button" className="text-button" onClick={onDismiss}>Not now</button>
      </div>
      {!payoutsReady && <p className="field-note">Payouts come after your listing is up: you connect Stripe once, and your listings open to buyers.</p>}
    </div>
  </section>;
}

// The short, plain-language screen shown before the Stripe payout page opens.
export function PayoutIntro({ onContinue, onLater }) {
  return <div className="form-stack payout-intro">
    <p><ShieldCheck size={16} aria-hidden="true"/> Getting paid takes one step with Stripe.</p>
    <ul className="payout-intro-list">{PAYOUT_INTRO_POINTS.map(point => <li key={point}>{point}</li>)}</ul>
    <p className="field-note">{PAYOUT_INTRO_NOTE}</p>
    <div className="first-listing-actions">
      <button type="button" className="primary" onClick={onContinue}>Continue to Stripe</button>
      <button type="button" className="text-button" onClick={onLater}>Maybe later</button>
    </div>
  </div>;
}
