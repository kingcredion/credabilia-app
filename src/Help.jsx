import React from 'react';
import { Brand } from './Brand.jsx';
import { LegalNav } from './Legal.jsx';

export function HelpPage() {
  return <div className="legal-page">
    <LegalNav current="help"/>
    <a className="legal-back brand" href="/"><Brand/></a>
    <h1>Help &amp; Contact</h1>
    <p className="legal-updated">We're here to help, day or night.</p>

    <section>
      <p>Credabilia is a marketplace and community for collectors — a place to buy and sell memorabilia with more context than a typical listing: certificate details, community assessments, and a credibility score to help you judge the evidence for yourself. Every purchase is protected: your payment is held until delivery is confirmed, and sellers must confirm an item is still available before you pay.</p>
    </section>

    <h2>Talk to King Credion</h2>
    <p>Our AI assistant, King Credion, can answer questions about fees, shipping, payment protection, and more — anytime, day or night.</p>
    <ul>
      <li><strong>Call:</strong> <a href="tel:+18667500255">1 (866) 750-0255</a></li>
      <li><strong>Email:</strong> <a href="mailto:support@credabilia.com">support@credabilia.com</a></li>
      <li><strong>Chat:</strong> use the chat icon in the header after signing in</li>
    </ul>

    <h2 id="delete-account">Delete your Credabilia account and data</h2>
    <p>You can delete your account yourself at any time, in the website or the Credabilia app:</p>
    <ol>
      <li>Sign in and open your profile, then choose <strong>Profile and settings</strong>.</li>
      <li>Scroll to <strong>Delete account</strong> and tap <strong>Delete my account</strong>, then confirm with <strong>Yes, delete my account</strong>.</li>
    </ol>
    <p>Before you delete, remove or sell any active listings and finish any open refund requests; we can't close an account while those are open.</p>
    <p><strong>What is deleted:</strong> your display name (replaced with "Deleted user"), your saved shipping address, and your sign-in, which stops working. <strong>What we keep:</strong> records of orders, payments, refunds, disputes, messages and reports that we are required to keep for tax, legal and fraud-prevention reasons, for up to 7 years, with your name removed from your profile.</p>
    <p>You can also ask us to delete your account and personal data by emailing <a href="mailto:support@credabilia.com">support@credabilia.com</a> from the email address on your account. Please put "Delete my account" in the subject line.</p>

    <h2>Frequently asked questions</h2>

    <h3>What does Credabilia charge?</h3>
    <p>Sellers pay a platform fee on each sale — about 13.6% of the price, plus $0.30 for orders $10 or under, or $0.40 for orders over $10. The exact fee is always shown before you publish a listing.</p>

    <h3>Do you charge sales tax?</h3>
    <p>Where the law requires it, yes. Tax is worked out from the address your order is delivered to (or the meetup spot for a local pickup) and shown as its own line at checkout before you pay. It is added on top of the item price, and sellers are not charged it. If an order is refunded, the matching tax is refunded too.</p>

    <h3>How does payment protection work?</h3>
    <p>When you buy an item, Credabilia holds your payment until delivery is confirmed. The seller is paid after delivery is confirmed by tracking, followed by a short protection period: 72 hours to 7 days for new sellers (depending on the price), 72 hours for established sellers, and as little as 48 hours for trusted sellers. If you accept your delivery sooner, an established or trusted seller can be paid sooner. An open refund request pauses the payout. If tracking never shows delivery, the payout waits up to 21 days. Sellers are not paid instantly at purchase.</p>

    <h3>How do auctions work?</h3>
    <p>To bid you need a card on file with us. It is not charged; it just shows you are a real bidder, because every bid is a binding commitment to buy. You enter the most you are willing to pay, and we bid for you only as much as needed to keep you in the lead, up to that maximum. The price goes up in steps that grow with the price. A bid in the last 5 minutes extends the auction by 5 minutes, so nobody can win with a last-second bid. If you win you have 48 hours to pay; if you don't, the item goes to the next bidder and you get a strike (two strikes pause bidding). Once an auction has a bid, the seller cannot change its price or remove it.</p>

    <h3>How does local pickup work?</h3>
    <p>If a seller offers pickup, you meet at the safe meetup spot shown on the listing. Inspect the item there, check it against the listing, and accept it only if it is right. After you accept, you get a 6-digit handoff code to give the seller, who enters it to finish the sale. Please don't hand over the code until you are happy with the item.</p>

    <h3>What about shipping and insurance?</h3>
    <p>Shipping is priced from discounted commercial carrier rates available through our shipping provider, plus a 10% service charge — so the total is often still lower than standard retail postage, though it varies by package and destination. King's Collection items are charged at the carrier rate with no service charge. Shipping insurance is buyer-paid, on by default (you can opt out), and covers up to $10,000 of declared value. At checkout you choose the shipping service (for example Ground, Priority or overnight) and see the price of each. The seller then prints the label for the service you chose. A seller can choose to offer free shipping: then the seller chooses the service and pays for the label out of their payout — insurance is always paid by the buyer regardless. Items in the King's Collection ship from Credabilia within 3 business days; items from other sellers ship from the seller.</p>

    <h3>Can I get a refund?</h3>
    <p>Yes. If an order isn't right, you can request a refund from your purchase in your account. The seller can accept it in full, offer a partial refund, require the item be shipped back before refunding, or contest the request — if contested, Credabilia reviews the case and decides the outcome. For King's Collection items you have 30 days from delivery to ask; for items from other sellers, the seller and Credabilia work it out case by case.</p>

    <h3>Why does a seller need to confirm my purchase first?</h3>
    <p>Before you can check out, the seller has to confirm the item is still available. This prevents you from paying for something that may have already sold elsewhere. You'll be notified as soon as they respond, usually quickly.</p>

    <h3>What do community audits and credibility scores mean?</h3>
    <p>Community assessments are opinions from other members based on photos and descriptions — not professional authentication. A credibility score reflects certificate information and community assessments together; it's a starting point, not a guarantee. For valuable purchases, we recommend seeking qualified authentication.</p>

    <h3>What are Credion Coins?</h3>
    <div className="coin-faq">
      <img src="/brand/screen-face-v1/coin-detailed.webp" alt="A gold Credion Coin featuring King Credion's crowned face" className="coin-detailed"/>
      <p>Credion Coins are credit Credabilia awards for participation — like being a top auditor in a given month. At checkout, you can apply them toward the item's price, up to 50% of that price.</p>
    </div>

    <h3>How do I check a certificate?</h3>
    <p>Use our <a href="/certificate">certificate lookup</a>: choose the issuer, enter the certificate number exactly as printed, and see whether it is recorded on a Credabilia listing and how many times. A genuine certificate belongs to one item, so a number on more than one listing is a warning sign. This confirms the number appears in our records; it does not mean the issuer has verified it, so also use the issuer's own lookup where one exists.</p>

    <h3>I found a bug or something looks wrong</h3>
    <p>We are a new site, so we want to hear about it. Open the chat with King Credion (chat icon in the header after signing in) and choose "Report a problem". It goes straight to the Credabilia team.</p>

    <p className="field-note">Didn't find your answer? Call, email, or ask King Credion above — a real question always gets a real answer.</p>
    <LegalNav current="help" footer/>
  </div>;
}
