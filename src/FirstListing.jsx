import React, { useEffect, useState } from 'react';
import { Camera, Copy, Share2, ShieldCheck } from 'lucide-react';
import { Sparks } from './Giveaway.jsx';
import { PAYOUT_INTRO_POINTS, PAYOUT_INTRO_NOTE, cleanStoreName, isValidStoreName, shareLinkFor } from './firstListing.js';
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

// Shown the first time a member publishes a listing without payouts set up: King Credion on the emerald stage with drifting gold flakes (the sign-in box's look).
export function FirstListingCelebration({ service, slug, itemId, giveawayActive, onStoreNameSaved, onSetUpPayouts, onLater }) {
  const [code, setCode] = useState(null), [copied, setCopied] = useState(false);
  // The member can pick or change their store name right here; the link below switches to the store link the moment it is saved.
  const [savedSlug, setSavedSlug] = useState(slug || ''), [nameInput, setNameInput] = useState(slug || ''), [savingName, setSavingName] = useState(false), [nameError, setNameError] = useState(''), [nameSaved, setNameSaved] = useState(false);
  useEffect(() => { let alive = true; Promise.resolve().then(() => service?.myReferralInfo?.()).then(info => { if (alive && info?.code) setCode(info.code); }).catch(() => {}); return () => { alive = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const share = shareLinkFor({ slug: savedSlug, itemId, code });
  async function saveName(event) {
    event.preventDefault(); if (savingName) return;
    if (!isValidStoreName(nameInput)) { setNameError('Use 3 to 30 characters: lowercase letters, numbers and hyphens.'); setNameSaved(false); return; }
    setSavingName(true); setNameError(''); setNameSaved(false);
    try { const clean = cleanStoreName(nameInput); await service.updateStoreSlug(clean); setSavedSlug(clean); setNameInput(clean); setNameSaved(true); onStoreNameSaved?.(clean); }
    catch (err) { setNameError(err.message || 'That name could not be saved. Try another.'); } finally { setSavingName(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(share.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link is shown, so it can be copied by hand */ } }
  async function nativeShare() { try { await navigator.share({ title: 'My first listing on Credabilia', text: 'I just listed something on Credabilia, the memorabilia marketplace. Take a look:', url: share.url }); } catch { /* cancelled */ } }
  return <div className="celebrate">
    <div className="celebrate-stage">
      <Sparks/>
      <img src="/brand/king-credion-first-listing-celebration-440.webp" srcSet="/brand/king-credion-first-listing-celebration-440.webp 440w, /brand/king-credion-first-listing-celebration-660.webp 660w" sizes="(max-width: 640px) 170px, 220px" width="220" height="251" alt="King Credion celebrating with a check mark and a payout card"/>
    </div>
    <h3>Congratulations, you're a seller!</h3>
    <p>Buyers can see your listing now. One step left before they can buy it: connect payouts with Stripe so you get paid when it sells.</p>
    <p className="field-note">It takes about five minutes, and you can stop and finish later. Your listing stays saved.</p>
    {share.url && <div className="celebrate-share">
      <p className="celebrate-share-title">While you are here, share {share.label}</p>
      <div className="celebrate-link"><code>{share.url}</code><button type="button" className="text-button" onClick={copy}><Copy size={14}/> {copied ? 'Copied' : 'Copy'}</button></div>
      {typeof navigator !== 'undefined' && navigator.share && <button type="button" className="text-button celebrate-native-share" onClick={nativeShare}><Share2 size={14}/> Share</button>}
      {giveawayActive && <p className="field-note">Everyone who joins through it and finishes payout setup earns you a giveaway ticket.</p>}
      <form className="celebrate-name" onSubmit={saveName}>
        <label htmlFor="celebrate-store-name">{savedSlug ? 'Change your store name' : 'Pick a store name for a shorter link'}</label>
        <div className="celebrate-name-row"><span aria-hidden="true">credabilia.com/</span><input id="celebrate-store-name" value={nameInput} onChange={event => { setNameInput(event.target.value); setNameError(''); setNameSaved(false); }} maxLength={30} placeholder="mystore" autoCapitalize="none" autoCorrect="off" spellCheck="false"/><button type="submit" className="text-button" disabled={savingName}>{savingName ? 'Saving…' : 'Save'}</button></div>
        {nameError && <p className="error" role="alert">{nameError}</p>}
        {nameSaved && <p className="field-note" role="status">Saved. Your link is now {share.url.replace('https://', '')}.</p>}
      </form>
    </div>}
    <div className="first-listing-actions celebrate-actions">
      <button type="button" className="primary" onClick={onSetUpPayouts}>Set up payouts</button>
      <button type="button" className="text-button" onClick={onLater}>Maybe later</button>
    </div>
  </div>;
}

// The short, plain-language screen shown before the Stripe payout page opens.
export function PayoutIntro({ onContinue, onLater }) {
  return <div className="form-stack payout-intro">
    <div className="celebrate-stage payout-intro-stage">
      <Sparks/>
      <img src="/brand/king-credion-stripe-payout-setup-360.webp" srcSet="/brand/king-credion-stripe-payout-setup-360.webp 360w, /brand/king-credion-stripe-payout-setup-540.webp 540w" sizes="(max-width: 640px) 190px, 230px" width="230" height="210" alt="King Credion holding a gold coin beside the Stripe payout card and a crowned padlock"/>
    </div>
    <p><ShieldCheck size={16} aria-hidden="true"/> Getting paid takes one step with Stripe.</p>
    <ul className="payout-intro-list">{PAYOUT_INTRO_POINTS.map(point => <li key={point}>{point}</li>)}</ul>
    <p className="field-note">{PAYOUT_INTRO_NOTE}</p>
    <div className="first-listing-actions">
      <button type="button" className="primary" onClick={onContinue}>Continue to Stripe</button>
      <button type="button" className="text-button" onClick={onLater}>Maybe later</button>
    </div>
  </div>;
}
