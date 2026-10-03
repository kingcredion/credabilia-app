import React, { useEffect } from 'react';
import { Brand } from './Brand.jsx';

// Landing page for seller-acquisition ads (/sell). One goal -- get someone to list an item -- so there is
// deliberately no site navigation, and every button does the same thing. Every claim here has to stay true
// to the Terms and Help page (no "free to list", no "authenticated").
export const LIST_INTENT_KEY = 'credabilia-list-intent';

function startListing() {
  // The main app picks this up after sign-in (including the Google redirect round trip) and opens the form.
  try { localStorage.setItem(LIST_INTENT_KEY, String(Date.now())); } catch { /* private mode: they land on the home page instead */ }
  window.location.href = '/';
}

const STEPS = [
  ['1', 'Snap your photos', 'Take a few clear photos of your piece, plus a close-up of the signature.'],
  ['2', 'King Credion drafts it', 'Our AI writes the title and description and suggests details. You review and edit before anything is published.'],
  ['3', 'Publish and get paid', 'When it sells, ship it. Payment is held in escrow and released once delivery is confirmed.'],
];

const REASONS = [
  ['A fee only when it sells', 'Sellers pay a platform fee on completed sales. The exact amount is shown before you publish.'],
  ['Paid safely', "Buyers' payments are held in escrow until tracking confirms delivery, then released to you."],
  ['Built for collectibles', 'Signature close-ups, certificate details and community audits help buyers trust what they see.'],
  ['Made for memorabilia', 'A marketplace for sports, entertainment, art and comics collectors, not a general store.'],
];

const FAQ = [
  ['What can I sell?', 'Memorabilia and collectibles in sports, entertainment, art and comics: signed jerseys, baseballs, trading cards, framed pieces, boxing gloves, comics and more.'],
  ['What does it cost?', 'Sellers pay a platform fee on each completed sale: about 13.6% of the price, plus $0.30 for orders $10 or under or $0.40 for orders over $10. The fee is charged when an item sells, and the exact amount is shown before you publish.'],
  ['How do I get paid?', "When a buyer pays, we hold the money in escrow until tracking confirms delivery, then release it to you. You'll connect a Stripe account for payouts."],
  ['Who handles shipping?', 'You ship the item. Shipping rates and labels are available through the app.'],
  ['Is my item authenticated?', "Community audits are opinions from other members, not professional authentication. Buyers see your photos and details and judge the evidence for themselves."],
  ['Is there a mobile app?', "Apps for the Apple App Store and Google Play are coming soon. Until then, Credabilia works right in your phone's browser."],
];

export function SellPage() {
  useEffect(() => { document.title = 'Sell your memorabilia | Credabilia'; }, []);
  return <div className="sell-page">
    <header className="sell-top">
      <span className="brand" aria-label="Credabilia"><Brand/></span>
      <button className="sell-cta sell-cta-small" onClick={startListing}>List an item</button>
    </header>

    <section className="sell-hero">
      <picture>
        <source media="(max-width: 720px)" srcSet="/brand/sell-hero-mobile.webp" width="880" height="923"/>
        <img className="sell-hero-img" src="/brand/sell-hero-desktop.webp" width="1536" height="1024" fetchPriority="high"
          alt="King Credion welcoming sellers beside signed memorabilia, a shipping box and a phone showing a listing"/>
      </picture>
      <div className="sell-hero-copy">
        <p className="sell-eyebrow">THE MEMORABILIA KINGDOM</p>
        <h1>Turn your memorabilia into cash</h1>
        <p className="sell-lead">Snap a few photos and King Credion's AI drafts your listing. Sell signed jerseys, baseballs, cards and more to collectors who care.</p>
        <button className="sell-cta" onClick={startListing}>List your first item</button>
        <p className="sell-fine">Sign in with Google or an email link. It only takes a few minutes.</p>
      </div>
    </section>

    <section className="sell-section">
      <h2>How it works</h2>
      <ol className="sell-steps">
        {STEPS.map(([n, title, body]) => <li key={n}><span className="sell-step-num">{n}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}
      </ol>
    </section>

    <section className="sell-section sell-section-alt">
      <h2>Why sell on Credabilia</h2>
      <div className="sell-reasons">
        {REASONS.map(([title, body]) => <div key={title} className="sell-reason"><h3>{title}</h3><p>{body}</p></div>)}
      </div>
    </section>

    <section className="sell-section">
      <h2>Questions, answered</h2>
      <div className="sell-faq">
        {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </div>
    </section>

    <section className="sell-final">
      <h2>Ready to clear a shelf?</h2>
      <p>List your first piece in a few minutes.</p>
      <button className="sell-cta" onClick={startListing}>List your first item</button>
    </section>

    <footer className="sell-footer">
      <span>© {new Date().getFullYear()} Credabilia LLC</span>
      <span className="sell-footer-links"><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/help">Help</a></span>
    </footer>
  </div>;
}
