import React from 'react';
import { Brand } from './Brand.jsx';
import { VoiceAssistant, voiceAssistantAvailable } from './VoiceAssistant.jsx';

export function HelpPage() {
  return <div className="legal-page">
    <a className="legal-back" href="/"><Brand/></a>
    <h1>Help &amp; Contact</h1>
    <p className="legal-updated">We're here to help, day or night.</p>

    <section>
      <p>Credabilia is a marketplace and community for collectors — a place to buy and sell memorabilia with more context than a typical listing: certificate details, community assessments, and a credibility score to help you judge the evidence for yourself. Every purchase is protected by escrow, and sellers must confirm an item is still available before you pay.</p>
    </section>

    <h2>Talk to King Credion</h2>
    <p>Our AI assistant, King Credion, can answer questions about fees, shipping, escrow, and more — anytime, day or night.</p>
    <ul>
      <li><strong>Call:</strong> <a href="tel:+18667500255">1 (866) 750-0255</a></li>
      <li><strong>Email:</strong> <a href="mailto:kingcredion@credabilia.com">kingcredion@credabilia.com</a></li>
      <li><strong>Chat:</strong> use the chat icon in the header after signing in</li>
    </ul>
    {voiceAssistantAvailable && <div className="evidence-box"><VoiceAssistant/></div>}

    <h2>Frequently asked questions</h2>

    <h3>What does Credabilia charge?</h3>
    <p>Sellers pay a platform fee on each sale — about 13.6% of the price, plus $0.30 for orders $10 or under, or $0.40 for orders over $10. The exact fee is always shown before you publish a listing.</p>

    <h3>How does payment protection work?</h3>
    <p>When you buy an item, Credabilia holds your payment in escrow. The seller is paid once delivery is confirmed by tracking, or automatically after 10 days if tracking never confirms. Sellers are not paid instantly at purchase.</p>

    <h3>What about shipping and insurance?</h3>
    <p>Shipping cost at checkout is the real carrier quote plus a 10% markup. Shipping insurance is buyer-paid, on by default (you can opt out), and covers up to $10,000 of declared value. A seller can choose to offer free shipping, meaning they absorb the shipping cost — insurance is always paid by the buyer regardless.</p>

    <h3>Can I get a refund?</h3>
    <p>Yes. If an order isn't right, you can request a refund from your purchase in your account. The seller can accept it in full, offer a partial refund, require the item be shipped back before refunding, or contest the request — if contested, Credabilia reviews the case and decides the outcome.</p>

    <h3>Why does a seller need to confirm my purchase first?</h3>
    <p>Before you can check out, the seller has to confirm the item is still available. This prevents you from paying for something that may have already sold elsewhere. You'll be notified as soon as they respond, usually quickly.</p>

    <h3>What do community audits and credibility scores mean?</h3>
    <p>Community assessments are opinions from other members based on photos and descriptions — not professional authentication. A credibility score reflects certificate information and community assessments together; it's a starting point, not a guarantee. For valuable purchases, we recommend seeking qualified authentication.</p>

    <h3>What are Credion Coins?</h3>
    <p>Credion Coins are credit Credabilia awards for participation — like being a top auditor in a given month. At checkout, you can apply them toward the item's price, up to 50% of that price.</p>

    <p className="field-note">Didn't find your answer? Call, email, or ask King Credion above — a real question always gets a real answer.</p>
  </div>;
}
